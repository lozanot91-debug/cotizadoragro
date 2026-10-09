/*
# Fuentes de lista

## Problema
Había una sola lista de costos por fecha y "vigente" era la última de todas. Hace falta tener
listas independientes por fuente (ej. "Agroquímicos y fertilizantes", "Híbridos").

## Cambios (todo aditivo, compatible con el front actual)
- fuentes_lista: título fijo + descripción de cada fuente. Las lee cualquier usuario activo, las edita el admin.
- listas_costos.fuente_id (las listas existentes pasan a la primera fuente) y listas_costos.descripcion.
- Único (fuente_id, fecha). El índice viejo por fecha se saca aparte (20261009310000).
- cargar_lista_fuente / cotizaciones_afectadas_fuente: lo mismo que cargar_lista / cotizaciones_afectadas
  pero acotado a una fuente.
- cargar_lista (firma vieja) delega en la fuente principal, así el front actual sigue andando.
*/

CREATE TABLE IF NOT EXISTS public.fuentes_lista (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(trim(nombre)) > 0),
  descripcion text,
  prefijo_cod text,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fuentes_lista_nombre_unico ON public.fuentes_lista (lower(trim(nombre)));

ALTER TABLE public.fuentes_lista ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fuentes_lista' AND policyname = 'auth_leer') THEN
    CREATE POLICY auth_leer ON public.fuentes_lista FOR SELECT TO authenticated USING ((SELECT public.es_activo()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fuentes_lista' AND policyname = 'admin_escribe') THEN
    CREATE POLICY admin_escribe ON public.fuentes_lista FOR ALL TO authenticated
      USING ((SELECT public.es_admin())) WITH CHECK ((SELECT public.es_admin()));
  END IF;
END $$;

REVOKE ALL ON public.fuentes_lista FROM anon;

-- Primera fuente: solo si la tabla está vacía
INSERT INTO public.fuentes_lista (nombre, descripcion, orden)
SELECT 'Agroquímicos y fertilizantes', 'Lista de costos de la mesa de insumos', 0
WHERE NOT EXISTS (SELECT 1 FROM public.fuentes_lista);

ALTER TABLE public.listas_costos
  ADD COLUMN IF NOT EXISTS fuente_id uuid REFERENCES public.fuentes_lista(id),
  ADD COLUMN IF NOT EXISTS descripcion text;

UPDATE public.listas_costos
   SET fuente_id = (SELECT id FROM public.fuentes_lista ORDER BY orden, created_at LIMIT 1)
 WHERE fuente_id IS NULL;

ALTER TABLE public.listas_costos ALTER COLUMN fuente_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS listas_costos_fuente_idx ON public.listas_costos (fuente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_listas_costos_fuente_fecha_unique ON public.listas_costos (fuente_id, fecha);

-- Carga de lista acotada a una fuente
CREATE OR REPLACE FUNCTION public.cargar_lista_fuente(
  p_fuente_id uuid,
  p_fecha date,
  p_nombre text,
  p_filas jsonb,
  p_reemplazar boolean DEFAULT false,
  p_descripcion text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lista_id uuid;
  v_productos_nuevos int := 0;
  v_productos_actualizados int := 0;
  v_fila jsonb;
  v_producto_id uuid;
  v_repetido text;
BEGIN
  IF p_fuente_id IS NULL OR NOT EXISTS (SELECT 1 FROM fuentes_lista WHERE id = p_fuente_id) THEN
    RAISE EXCEPTION 'La fuente de lista no existe';
  END IF;

  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'La lista no tiene filas';
  END IF;

  SELECT f->>'cod' INTO v_repetido
    FROM jsonb_array_elements(p_filas) f
   GROUP BY f->>'cod'
  HAVING count(*) > 1
   LIMIT 1;
  IF v_repetido IS NOT NULL THEN
    RAISE EXCEPTION 'El código % está repetido en el archivo', v_repetido;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_filas) f
     WHERE coalesce(f->>'cod', '') = '' OR (f->>'costo') IS NULL OR (f->>'costo')::numeric < 0
  ) THEN
    RAISE EXCEPTION 'Hay filas sin código o con costo inválido';
  END IF;

  SELECT id INTO v_lista_id FROM listas_costos WHERE fuente_id = p_fuente_id AND fecha = p_fecha;

  IF v_lista_id IS NOT NULL THEN
    IF NOT p_reemplazar THEN
      RAISE EXCEPTION 'Ya existe una lista con fecha %', p_fecha;
    END IF;
    -- Reemplazo en el lugar: la lista conserva su id (las cotizaciones siguen apuntando a ella)
    DELETE FROM costos_historial WHERE lista_id = v_lista_id;
    UPDATE listas_costos
       SET nombre_archivo = p_nombre, descripcion = COALESCE(p_descripcion, descripcion)
     WHERE id = v_lista_id;
  ELSE
    INSERT INTO listas_costos (fecha, nombre_archivo, uploaded_by, fuente_id, descripcion)
    VALUES (p_fecha, p_nombre, NULL, p_fuente_id, p_descripcion)
    RETURNING id INTO v_lista_id;
  END IF;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_filas)
  LOOP
    SELECT id INTO v_producto_id FROM productos WHERE cod = v_fila->>'cod' LIMIT 1;

    IF v_producto_id IS NULL THEN
      INSERT INTO productos (cod, proveedor, familia, producto, unid)
      VALUES (v_fila->>'cod', v_fila->>'proveedor', v_fila->>'familia', v_fila->>'producto', v_fila->>'unid')
      RETURNING id INTO v_producto_id;
      v_productos_nuevos := v_productos_nuevos + 1;
    ELSE
      UPDATE productos SET
        proveedor = v_fila->>'proveedor',
        familia = v_fila->>'familia',
        producto = v_fila->>'producto',
        unid = v_fila->>'unid'
      WHERE id = v_producto_id;
      v_productos_actualizados := v_productos_actualizados + 1;
    END IF;

    INSERT INTO costos_historial (producto_id, lista_id, costo)
    VALUES (v_producto_id, v_lista_id, (v_fila->>'costo')::numeric);
  END LOOP;

  INSERT INTO familias_config (familia, moneda, margen_default)
  SELECT DISTINCT
    f->>'familia',
    CASE WHEN upper(f->>'familia') LIKE 'AB %' THEN 'ARS' ELSE 'USD' END,
    NULL::numeric
  FROM jsonb_array_elements(p_filas) AS f
  WHERE f->>'familia' IS NOT NULL AND f->>'familia' <> ''
  ON CONFLICT (familia) DO NOTHING;

  RETURN jsonb_build_object(
    'lista_id', v_lista_id,
    'productos_nuevos', v_productos_nuevos,
    'productos_actualizados', v_productos_actualizados
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cargar_lista_fuente(uuid, date, text, jsonb, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cargar_lista_fuente(uuid, date, text, jsonb, boolean, text) TO authenticated;

-- Firma vieja: delega en la fuente principal (mantiene andando el front anterior)
CREATE OR REPLACE FUNCTION public.cargar_lista(
  p_fecha date,
  p_nombre text,
  p_filas jsonb,
  p_reemplazar boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.cargar_lista_fuente(
    (SELECT id FROM public.fuentes_lista ORDER BY orden, created_at LIMIT 1),
    p_fecha, p_nombre, p_filas, p_reemplazar, NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cargar_lista(date, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cargar_lista(date, text, jsonb, boolean) TO authenticated;

-- Cotizaciones que usan la lista de una fecha en una fuente (para avisar antes de reemplazarla)
CREATE OR REPLACE FUNCTION public.cotizaciones_afectadas_fuente(p_fuente_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'abiertas', count(*) FILTER (WHERE c.estado IN ('Borrador', 'Enviada', 'En negociación'))
  )
  FROM public.cotizaciones c
  JOIN public.listas_costos l ON l.id = c.lista_id
  WHERE l.fuente_id = p_fuente_id AND l.fecha = p_fecha;
$$;

REVOKE EXECUTE ON FUNCTION public.cotizaciones_afectadas_fuente(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cotizaciones_afectadas_fuente(uuid, date) TO authenticated;
