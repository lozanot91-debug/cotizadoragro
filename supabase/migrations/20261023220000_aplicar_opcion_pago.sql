/*
# Elegir opción de pago en una sola operación atómica

## Problema
Elegir una opción de pago actualizaba las líneas una por una y después la cabecera, en llamadas separadas.
Si se cortaba en el medio, la cotización quedaba con líneas de una opción y totales de otra.

## Cambios (todo aditivo)
- public.aplicar_opcion_pago(p_id, p_lineas, p_cab): en una sola transacción actualiza el plazo de las líneas
  indicadas ([{id, plazo_dias}]) y los campos de pago de la cabecera (solo los de la lista blanca que lleguen).
  Corre con los permisos de quien llama (SECURITY INVOKER), igual que las actualizaciones directas de antes.
*/

CREATE OR REPLACE FUNCTION public.aplicar_opcion_pago(p_id uuid, p_lineas jsonb, p_cab jsonb)
RETURNS public.cotizaciones
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_res public.cotizaciones;
BEGIN
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN
    RAISE EXCEPTION 'p_lineas debe ser un arreglo JSON';
  END IF;
  IF p_cab IS NULL OR jsonb_typeof(p_cab) <> 'object' THEN
    RAISE EXCEPTION 'p_cab debe ser un objeto JSON';
  END IF;

  UPDATE public.cotizacion_lineas l
     SET plazo_dias = (x->>'plazo_dias')::integer
    FROM jsonb_array_elements(p_lineas) x
   WHERE l.id::text = x->>'id' AND l.cotizacion_id = p_id;

  UPDATE public.cotizaciones c
     SET plazo_dias      = CASE WHEN p_cab ? 'plazo_dias'      THEN r.plazo_dias      ELSE c.plazo_dias      END,
         tasa_mensual    = CASE WHEN p_cab ? 'tasa_mensual'    THEN r.tasa_mensual    ELSE c.tasa_mensual    END,
         recargo_usd     = CASE WHEN p_cab ? 'recargo_usd'     THEN r.recargo_usd     ELSE c.recargo_usd     END,
         iva_usd         = CASE WHEN p_cab ? 'iva_usd'         THEN r.iva_usd         ELSE c.iva_usd         END,
         total_usd       = CASE WHEN p_cab ? 'total_usd'       THEN r.total_usd       ELSE c.total_usd       END,
         total_ars       = CASE WHEN p_cab ? 'total_ars'       THEN r.total_ars       ELSE c.total_ars       END,
         opcion_elegida  = CASE WHEN p_cab ? 'opcion_elegida'  THEN r.opcion_elegida  ELSE c.opcion_elegida  END,
         updated_at      = now()
    FROM jsonb_populate_record(NULL::public.cotizaciones, p_cab) r
   WHERE c.id = p_id
  RETURNING c.* INTO v_res;

  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'La cotización % no existe o no se puede modificar', p_id;
  END IF;
  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_opcion_pago(uuid, jsonb, jsonb) TO authenticated;
