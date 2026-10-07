/*
# Función RPC get_next_numero

## Resumen
Crea una función SECURITY DEFINER que devuelve el siguiente número de cotización
usando la secuencia cotizacion_numero_seq. Esto permite obtener un número correlativo
de forma atómica.

## Cambios
- Nueva función `get_next_numero()` que llama a nextval() de la secuencia.
- Permisos: ejecutable por rol authenticated.
*/

CREATE OR REPLACE FUNCTION get_next_numero()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN nextval('cotizacion_numero_seq');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_numero() TO authenticated;
