/*
# Correcciones de schema: margen nullable, costo editable, índice único fecha, RPC cargar_lista

## Resumen
1. Hacer nullable familias_config.margen_default (NULL = usar margen general)
2. Agregar costo_lista_usd y costo_editado a cotizacion_lineas para costo editable por cotización
3. Índice único en listas_costos(fecha) para evitar listas duplicadas
4. Crear función cargar_lista() SECURITY DEFINER para carga atómica de listas de costos
5. Índice único en familias_config(familia) para ON CONFLICT

## Cambios detallados

### 1. familias_config.margen_default
- ALTER COLUMN margen_default DROP NOT NULL
- ALTER COLUMN margen_default SET DEFAULT NULL
- NULL significa "sin margen propio, usar el general"

### 2. cotizacion_lineas (nuevas columnas)
- costo_lista_usd numeric: costo de lista al momento de cotizar (misma unidad que costo_usd)
- costo_editado boolean default false: true si el costo fue editado manualmente

### 3. listas_costos(fecha) índice único
- Previene dos listas con la misma fecha

### 4. cargar_lista() RPC
- SECURITY DEFINER, transacción atómica
- Parámetros: p_fecha date, p_nombre text, p_filas jsonb, p_reemplazar boolean
- Crea lista, upsert productos por cod, inserta costos, inserta familias nuevas
- Si p_reemplazar=true, borra lista anterior con misma fecha
- Devuelve {lista_id, productos_nuevos, productos_actualizados}

### 5. Security
- GRANT EXECUTE on cargar_lista to anon, authenticated
- No se modifican políticas RLS existentes
*/

-- 1. Hacer nullable margen_default
ALTER TABLE familias_config ALTER COLUMN margen_default DROP NOT NULL;
ALTER TABLE familias_config ALTER COLUMN margen_default SET DEFAULT NULL;

-- 2. Agregar columnas a cotizacion_lineas
ALTER TABLE cotizacion_lineas ADD COLUMN IF NOT EXISTS costo_lista_usd numeric;
ALTER TABLE cotizacion_lineas ADD COLUMN IF NOT EXISTS costo_editado boolean DEFAULT false;

-- 3. Índice único en familias_config(familia) para ON CONFLICT
CREATE UNIQUE INDEX IF NOT EXISTS idx_familias_config_familia_unique ON familias_config(familia);

-- 4. Índice único en listas_costos(fecha)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_listas_costos_fecha_unique') THEN
    IF NOT EXISTS (SELECT fecha FROM listas_costos GROUP BY fecha HAVING count(*) > 1) THEN
      CREATE UNIQUE INDEX idx_listas_costos_fecha_unique ON listas_costos(fecha);
    END IF;
  END IF;
END $$;

-- 5. Función cargar_lista
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
BEGIN
  IF EXISTS (SELECT 1 FROM listas_costos WHERE fecha = p_fecha) THEN
    IF NOT p_reemplazar THEN
      RAISE EXCEPTION 'Ya existe una lista con fecha %', p_fecha;
    END IF;
    DELETE FROM costos_historial WHERE lista_id IN (SELECT id FROM listas_costos WHERE fecha = p_fecha);
    DELETE FROM listas_costos WHERE fecha = p_fecha;
  END IF;

  INSERT INTO listas_costos (fecha, nombre_archivo, uploaded_by)
  VALUES (p_fecha, p_nombre, NULL)
  RETURNING id INTO v_lista_id;

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
    NULL
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
