/*
# Carga atómica de la tarifa de flete

## Problema
La pantalla de listas borraba toda la tabla tarifa_flete y luego insertaba por tandas desde
el navegador. Si fallaba una tanda (o se cortaba la conexión) la tarifa quedaba vacía o
incompleta y las cotizaciones con flete dejaban de poder calcularse.

## Cambios
- Nueva función cargar_tarifa_flete(p_filas jsonb): valida, borra y vuelve a cargar en una
  sola transacción. Si algo falla, queda la tarifa anterior intacta.
- Devuelve la cantidad de filas cargadas.
*/

CREATE OR REPLACE FUNCTION cargar_tarifa_flete(p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_n integer;
BEGIN
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'La tarifa no tiene filas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_filas) f
     WHERE (f->>'km') IS NULL OR (f->>'tarifa') IS NULL
        OR (f->>'km')::numeric <= 0 OR (f->>'tarifa')::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'Hay filas de tarifa con km o valor inválido';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_filas) f
     GROUP BY (f->>'km')::int HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay kilómetros repetidos en la tarifa';
  END IF;

  DELETE FROM tarifa_flete WHERE true;

  INSERT INTO tarifa_flete (km, tarifa)
  SELECT (f->>'km')::int, (f->>'tarifa')::numeric
    FROM jsonb_array_elements(p_filas) f;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION cargar_tarifa_flete(jsonb) TO anon, authenticated;
