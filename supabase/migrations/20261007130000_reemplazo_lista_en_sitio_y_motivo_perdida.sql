/*
# Reemplazo de lista en el lugar + motivo de pérdida obligatorio

## Problema
1. cargar_lista(…, p_reemplazar=true) borraba la lista y la volvía a crear. Si había
   cotizaciones apuntando a esa lista (cotizaciones.lista_id sin ON DELETE), el DELETE
   fallaba por la clave foránea y no se podía reemplazar nunca.
2. Una cotización podía quedar en "Perdida" sin motivo.

## Cambios
- cargar_lista: al reemplazar, conserva la fila de listas_costos (mismo id, así las
  cotizaciones siguen apuntando a ella), borra solo sus costos y carga los nuevos.
  También valida códigos repetidos y costos inválidos con mensajes claros.
- cotizaciones_afectadas(p_fecha): cuenta las cotizaciones (y cuántas siguen abiertas)
  que usan la lista de esa fecha, para avisar antes de reemplazar.
- Las cotizaciones "Perdida" sin motivo se completan con un texto y se agrega un CHECK
  para que no vuelva a pasar.
*/

CREATE OR REPLACE FUNCTION cargar_lista(
  p_fecha date,
  p_nombre text,
  p_filas jsonb,
  p_reemplazar boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lista_id uuid;
  v_productos_nuevos int := 0;
  v_productos_actualizados int := 0;
  v_fila jsonb;
  v_producto_id uuid;
  v_repetido text;
BEGIN
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

  SELECT id INTO v_lista_id FROM listas_costos WHERE fecha = p_fecha;

  IF v_lista_id IS NOT NULL THEN
    IF NOT p_reemplazar THEN
      RAISE EXCEPTION 'Ya existe una lista con fecha %', p_fecha;
    END IF;
    -- Reemplazo en el lugar: la lista conserva su id (las cotizaciones siguen apuntando a ella)
    DELETE FROM costos_historial WHERE lista_id = v_lista_id;
    UPDATE listas_costos SET nombre_archivo = p_nombre WHERE id = v_lista_id;
  ELSE
    INSERT INTO listas_costos (fecha, nombre_archivo, uploaded_by)
    VALUES (p_fecha, p_nombre, NULL)
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

GRANT EXECUTE ON FUNCTION cargar_lista(date, text, jsonb, boolean) TO anon, authenticated;

-- Cotizaciones que usan la lista de una fecha (para avisar antes de reemplazarla)
CREATE OR REPLACE FUNCTION cotizaciones_afectadas(p_fecha date)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'abiertas', count(*) FILTER (WHERE c.estado IN ('Borrador', 'Enviada', 'En negociación'))
  )
  FROM cotizaciones c
  JOIN listas_costos l ON l.id = c.lista_id
  WHERE l.fecha = p_fecha;
$$;

GRANT EXECUTE ON FUNCTION cotizaciones_afectadas(date) TO anon, authenticated;

-- Motivo de pérdida obligatorio
UPDATE cotizaciones
   SET motivo_perdida = '(sin motivo registrado)'
 WHERE estado = 'Perdida' AND btrim(coalesce(motivo_perdida, '')) = '';

ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_perdida_requiere_motivo;
ALTER TABLE cotizaciones
  ADD CONSTRAINT cotizaciones_perdida_requiere_motivo
  CHECK (estado <> 'Perdida' OR btrim(coalesce(motivo_perdida, '')) <> '');
