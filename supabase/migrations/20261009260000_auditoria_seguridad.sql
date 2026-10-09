/*
  # Auditoría: acceso sólo para usuarios aprobados + ajustes de seguridad y rendimiento

  Antes: cualquier cuenta autenticada podía leer y modificar todo (políticas USING (true)). Como el alta de
  usuarios de Supabase Auth está abierta por defecto, alguien con la clave pública (va en la app) podía crearse
  una cuenta y ver clientes, costos y cotizaciones.

  Ahora:
  - usuarios.activo: los usuarios existentes quedan activos; los nuevos entran inactivos hasta que un admin los
    apruebe (el primero de todos queda admin y activo).
  - es_activo(): lo usan todas las políticas. es_admin() exige además estar activo.
  - auth.uid() / es_activo() envueltos en (SELECT …) para que Postgres los evalúe una vez por consulta.
  - Índices para claves foráneas sin índice; search_path fijo en clave_correlativo.
*/

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE public.usuarios ALTER COLUMN activo SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.es_activo()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND activo); $$;
REVOKE ALL ON FUNCTION public.es_activo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_activo() TO authenticated;

CREATE OR REPLACE FUNCTION public.es_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin' AND activo); $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  hay_admin boolean := EXISTS (SELECT 1 FROM usuarios WHERE rol = 'admin');
BEGIN
  INSERT INTO usuarios (id, email, nombre, rol, puede_ver_costos, activo)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NULLIF(NEW.raw_user_meta_data->>'nombre', ''), split_part(NEW.email, '@', 1)),
    CASE WHEN hay_admin THEN 'vendedor' ELSE 'admin' END,
    true,
    NOT hay_admin
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Usuarios: cada uno ve su fila (para saber si está aprobado); los activos ven a todos
ALTER POLICY auth_leer ON public.usuarios USING (id = (SELECT auth.uid()) OR (SELECT public.es_activo()));

ALTER POLICY auth_todo ON public.campos USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.campos_parcelas USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.clientes USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.cobranzas USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.contactos USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.cotizacion_lineas USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.cotizaciones USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.margenes_cliente USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.parcelas_info USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.pedidos_facturacion USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.pedidos_precio USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.pedidos_precio_lineas USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.recompras_pospuestas USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.tareas USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.visita_fotos USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_todo ON public.visitas USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.canjes USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.configuracion USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.convenios_flete USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.costos_historial USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.familias_config USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.fichas_codigos USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.fichas_comentarios USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.fichas_producto USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.futuros_granos USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.historial_cambios USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.listas_costos USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.margenes_producto USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.pizarras_granos USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.plantas USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.precios_competencia USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.precios_grano USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.productos USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.tarifa_flete USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.tarifas_convenio USING ((SELECT public.es_activo()));
ALTER POLICY auth_leer ON public.tipo_cambio_bna USING ((SELECT public.es_activo()));

ALTER POLICY auth_insertar ON public.canjes WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY autor_o_admin_borra ON public.canjes USING ((SELECT public.es_activo()) AND (autor_id = (SELECT auth.uid()) OR (SELECT public.es_admin())));
ALTER POLICY auth_comenta ON public.fichas_comentarios WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY autor_edita ON public.fichas_comentarios USING ((SELECT public.es_activo()) AND autor_id = (SELECT auth.uid())) WITH CHECK ((SELECT public.es_activo()) AND autor_id = (SELECT auth.uid()));
ALTER POLICY autor_o_admin_borra ON public.fichas_comentarios USING ((SELECT public.es_activo()) AND (autor_id = (SELECT auth.uid()) OR (SELECT public.es_admin())));
ALTER POLICY auth_agrega ON public.historial_cambios WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_cargar ON public.precios_competencia WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY autor_o_admin_borra ON public.precios_competencia USING ((SELECT public.es_activo()) AND (usuario_id = (SELECT auth.uid()) OR (SELECT public.es_admin())));
ALTER POLICY auth_cargar ON public.precios_grano WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY auth_corregir ON public.precios_grano USING ((SELECT public.es_activo())) WITH CHECK ((SELECT public.es_activo()));
ALTER POLICY propias_ver ON public.push_suscripciones USING (usuario_id = (SELECT auth.uid()));
ALTER POLICY propias_alta ON public.push_suscripciones WITH CHECK (usuario_id = (SELECT auth.uid()));
ALTER POLICY propias_cambio ON public.push_suscripciones USING (usuario_id = (SELECT auth.uid())) WITH CHECK (usuario_id = (SELECT auth.uid()));
ALTER POLICY propias_baja ON public.push_suscripciones USING (usuario_id = (SELECT auth.uid()));

-- Storage: fotos de visitas sólo para usuarios activos
ALTER POLICY auth_select_visitas_fotos ON storage.objects USING (bucket_id = 'visitas-fotos' AND (SELECT public.es_activo()));
ALTER POLICY auth_insert_visitas_fotos ON storage.objects WITH CHECK (bucket_id = 'visitas-fotos' AND (SELECT public.es_activo()));
ALTER POLICY auth_delete_visitas_fotos ON storage.objects USING (bucket_id = 'visitas-fotos' AND (SELECT public.es_activo()));
ALTER POLICY auth_select_marbetes ON storage.objects USING (bucket_id = 'marbetes' AND (SELECT public.es_activo()));

ALTER FUNCTION public.clave_correlativo(uuid, text) SET search_path = public, pg_temp;

-- Claves foráneas sin índice
CREATE INDEX IF NOT EXISTS cotizacion_lineas_producto_idx ON public.cotizacion_lineas (producto_id);
CREATE INDEX IF NOT EXISTS cotizaciones_campo_idx ON public.cotizaciones (campo_id);
CREATE INDEX IF NOT EXISTS cotizaciones_convenio_corto_idx ON public.cotizaciones (convenio_corto_id);
CREATE INDEX IF NOT EXISTS cotizaciones_convenio_flete_idx ON public.cotizaciones (convenio_flete_id);
CREATE INDEX IF NOT EXISTS cotizaciones_origen_idx ON public.cotizaciones (cotizacion_origen_id);
CREATE INDEX IF NOT EXISTS cotizaciones_lista_idx ON public.cotizaciones (lista_id);
CREATE INDEX IF NOT EXISTS listas_costos_uploaded_by_idx ON public.listas_costos (uploaded_by);
CREATE INDEX IF NOT EXISTS margenes_cliente_cliente_idx ON public.margenes_cliente (cliente_id);
CREATE INDEX IF NOT EXISTS margenes_cliente_producto_idx ON public.margenes_cliente (producto_id);
CREATE INDEX IF NOT EXISTS precios_competencia_cliente_idx ON public.precios_competencia (cliente_id);
CREATE INDEX IF NOT EXISTS precios_competencia_cotizacion_idx ON public.precios_competencia (cotizacion_id);
CREATE INDEX IF NOT EXISTS recompras_pospuestas_cliente_idx ON public.recompras_pospuestas (cliente_id);
CREATE INDEX IF NOT EXISTS tareas_cliente_idx ON public.tareas (cliente_id);
CREATE INDEX IF NOT EXISTS tareas_cotizacion_idx ON public.tareas (cotizacion_id);
CREATE INDEX IF NOT EXISTS visitas_cotizacion_idx ON public.visitas (cotizacion_id);
