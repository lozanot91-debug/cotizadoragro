/*
# Guardado atómico de cotizaciones

## Resumen
Antes, guardar una cotización existente hacía: UPDATE cabecera → DELETE líneas → INSERT líneas
como tres llamadas separadas. Si fallaba la última (corte de red, error de validación), la
cotización quedaba SIN líneas. Esta función hace todo en una sola transacción: o se guarda
todo o no se guarda nada.

## Cambios
- Nueva función guardar_cotizacion(p_id, p_cotizacion, p_lineas):
  - p_id NULL  → crea la cotización con número correlativo (get_next_numero) y sus líneas.
  - p_id dado  → actualiza la cabecera (sin tocar numero ni estado) y reemplaza las líneas.
  - Devuelve la fila de cotizaciones guardada.
- SECURITY INVOKER: respeta las políticas RLS del usuario que llama.
- Solo se escriben las columnas que vienen en el JSON (el resto usa su valor por defecto),
  y solo si existen en la tabla.
*/

CREATE OR REPLACE FUNCTION guardar_cotizacion(
  p_id uuid,
  p_cotizacion jsonb,
  p_lineas jsonb
) RETURNS cotizaciones
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id uuid;
  v_cab jsonb;
  v_cols text;
  v_set text;
  v_linea jsonb;
  v_orden int := 0;
  v_resultado cotizaciones;
BEGIN
  IF p_cotizacion IS NULL OR jsonb_typeof(p_cotizacion) <> 'object' THEN
    RAISE EXCEPTION 'p_cotizacion debe ser un objeto JSON';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN
    RAISE EXCEPTION 'p_lineas debe ser un arreglo JSON';
  END IF;

  -- Columnas que nunca se aceptan desde afuera
  v_cab := p_cotizacion - 'id' - 'created_at' - 'updated_at';

  IF p_id IS NULL THEN
    v_cab := v_cab || jsonb_build_object('numero', get_next_numero());

    SELECT string_agg(quote_ident(a.attname), ', ')
      INTO v_cols
      FROM pg_attribute a
      WHERE a.attrelid = 'public.cotizaciones'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND v_cab ? a.attname;

    EXECUTE format(
      'INSERT INTO cotizaciones (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::cotizaciones, $1) RETURNING id',
      v_cols
    ) INTO v_id USING v_cab;
  ELSE
    v_id := p_id;
    -- El número no cambia nunca y el estado se cambia solo desde la pantalla de estados
    v_cab := v_cab - 'numero' - 'estado';

    SELECT string_agg(quote_ident(a.attname), ', ')
      INTO v_cols
      FROM pg_attribute a
      WHERE a.attrelid = 'public.cotizaciones'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND v_cab ? a.attname;

    IF v_cols IS NOT NULL THEN
      EXECUTE format(
        'UPDATE cotizaciones SET (%1$s, updated_at) = (SELECT %1$s, now() FROM jsonb_populate_record(NULL::cotizaciones, $1)) WHERE id = $2 RETURNING id',
        v_cols
      ) INTO v_id USING v_cab, p_id;
    ELSE
      UPDATE cotizaciones SET updated_at = now() WHERE id = p_id RETURNING id INTO v_id;
    END IF;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'La cotización % no existe o no se puede modificar', p_id;
    END IF;

    DELETE FROM cotizacion_lineas WHERE cotizacion_id = v_id;
  END IF;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_linea := (v_linea - 'id') || jsonb_build_object('cotizacion_id', v_id, 'orden', v_orden);

    SELECT string_agg(quote_ident(a.attname), ', ')
      INTO v_cols
      FROM pg_attribute a
      WHERE a.attrelid = 'public.cotizacion_lineas'::regclass AND a.attnum > 0 AND NOT a.attisdropped
        AND v_linea ? a.attname;

    EXECUTE format(
      'INSERT INTO cotizacion_lineas (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::cotizacion_lineas, $1)',
      v_cols
    ) USING v_linea;

    v_orden := v_orden + 1;
  END LOOP;

  SELECT * INTO v_resultado FROM cotizaciones WHERE id = v_id;
  RETURN v_resultado;
END;
$$;

GRANT EXECUTE ON FUNCTION guardar_cotizacion(uuid, jsonb, jsonb) TO anon, authenticated;
