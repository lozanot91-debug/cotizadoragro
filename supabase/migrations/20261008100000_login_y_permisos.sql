/*
  # Login obligatorio y permisos cerrados

  Hasta ahora la base era pública (rol anon): cualquiera con el link podía leer y modificar todo.
  Esta migración:
  1. Crea es_admin() y un trigger que crea la fila de `usuarios` cuando se da de alta un usuario
     en Supabase Auth (el primero queda como admin, los demás como vendedor).
  2. Reemplaza TODAS las políticas por políticas para usuarios logueados (`authenticated`).
     - Cotizaciones, líneas, clientes, márgenes de cliente, tareas, visitas, fotos: todos los logueados.
     - Configuración, familias, productos, listas, costos, tarifa de flete, márgenes de producto:
       todos pueden leer, solo el admin puede modificar.
     - Historial de cambios: se puede leer y agregar, nunca editar ni borrar.
     - Usuarios: todos pueden ver los nombres, solo el admin puede modificarlos.
  3. Le saca todo permiso al rol anon (sin login no se ve nada).
  4. cargar_lista pasa a SECURITY INVOKER: así respeta estos permisos (solo admin carga listas).

  IMPORTANTE: correr DESPUÉS de publicar la versión de la app con login y de crear tu usuario.
*/

-- 1. Helpers y alta automática de usuarios ------------------------------------------------

CREATE OR REPLACE FUNCTION es_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND rol = 'admin');
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO usuarios (id, email, nombre, rol, puede_ver_costos)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NULLIF(NEW.raw_user_meta_data->>'nombre', ''), split_part(NEW.email, '@', 1)),
    CASE WHEN EXISTS (SELECT 1 FROM usuarios WHERE rol = 'admin') THEN 'vendedor' ELSE 'admin' END,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Usuarios que ya existían en Auth antes de este trigger
INSERT INTO usuarios (id, email, nombre, rol, puede_ver_costos)
SELECT u.id, u.email,
       coalesce(NULLIF(u.raw_user_meta_data->>'nombre', ''), split_part(u.email, '@', 1)),
       'vendedor', true
  FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Si no hay ningún admin, el usuario más antiguo pasa a serlo
UPDATE usuarios SET rol = 'admin'
 WHERE id = (SELECT id FROM usuarios ORDER BY created_at, id LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM usuarios WHERE rol = 'admin');

-- 2. Políticas ------------------------------------------------------------------------------

-- Se borran todas las políticas viejas de las tablas de la app (incluidas las públicas)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('usuarios','configuracion','familias_config','productos','listas_costos','costos_historial',
                         'tarifa_flete','clientes','margenes_producto','margenes_cliente','cotizaciones',
                         'cotizacion_lineas','historial_cambios','tareas','visitas','visita_fotos')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Todos los logueados: lectura y escritura
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','margenes_cliente','cotizaciones','cotizacion_lineas','tareas','visitas','visita_fotos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "auth_todo" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Todos leen, solo el admin modifica
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['configuracion','familias_config','productos','listas_costos','costos_historial','tarifa_flete','margenes_producto']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "auth_leer" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "admin_escribe" ON public.%I FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin())', t);
  END LOOP;
END $$;

-- Historial: se lee y se agrega, no se edita ni se borra
ALTER TABLE historial_cambios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_leer" ON historial_cambios FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_agrega" ON historial_cambios FOR INSERT TO authenticated WITH CHECK (true);

-- Usuarios: todos ven los nombres, solo el admin modifica (nadie se sube el rol solo)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_leer" ON usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_modifica" ON usuarios FOR UPDATE TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- Fotos de visitas (Storage)
DROP POLICY IF EXISTS "anon_select_visitas_fotos" ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_visitas_fotos" ON storage.objects;
DROP POLICY IF EXISTS "anon_delete_visitas_fotos" ON storage.objects;
DROP POLICY IF EXISTS "auth_select_visitas_fotos" ON storage.objects;
DROP POLICY IF EXISTS "auth_insert_visitas_fotos" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_visitas_fotos" ON storage.objects;
CREATE POLICY "auth_select_visitas_fotos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'visitas-fotos');
CREATE POLICY "auth_insert_visitas_fotos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'visitas-fotos');
CREATE POLICY "auth_delete_visitas_fotos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'visitas-fotos');

-- 3. Sin login no se accede a nada ---------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

REVOKE EXECUTE ON FUNCTION get_next_numero() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cargar_lista(date, text, jsonb, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cargar_tarifa_flete(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION guardar_cotizacion(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cotizaciones_afectadas(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION es_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION get_next_numero() TO authenticated;
GRANT EXECUTE ON FUNCTION cargar_lista(date, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION cargar_tarifa_flete(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION guardar_cotizacion(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION cotizaciones_afectadas(date) TO authenticated;
GRANT EXECUTE ON FUNCTION es_admin() TO authenticated;

-- 4. cargar_lista respeta los permisos de quien la llama (solo admin carga listas) -------------

ALTER FUNCTION cargar_lista(date, text, jsonb, boolean) SECURITY INVOKER;
ALTER FUNCTION get_next_numero() SET search_path = public;
