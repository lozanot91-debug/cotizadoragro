/*
# Tasa mensual propia por línea (opciones de pago)

## Problema
En las opciones de pago la tasa era una sola por opción; hace falta poder fijar una tasa distinta a cada insumo.

## Cambios (todo aditivo)
- cotizacion_lineas.tasa_mensual (numeric, NULL): tasa propia de la línea. NULL = usa la tasa de la cotización, como siempre.
- aplicar_opcion_pago: además del plazo, aplica la tasa de cada línea cuando viene en la lista.
Las opciones guardadas siguen en cotizaciones.opciones_pago (jsonb); la tasa por línea va adentro (campo "tasas"), sin cambio de esquema.
*/

ALTER TABLE public.cotizacion_lineas ADD COLUMN IF NOT EXISTS tasa_mensual numeric;
ALTER TABLE public.cotizacion_lineas DROP CONSTRAINT IF EXISTS cotizacion_lineas_tasa_mensual_check;
ALTER TABLE public.cotizacion_lineas ADD CONSTRAINT cotizacion_lineas_tasa_mensual_check CHECK (tasa_mensual IS NULL OR tasa_mensual >= 0);

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
     SET plazo_dias   = CASE WHEN x ? 'plazo_dias'   THEN (x->>'plazo_dias')::integer   ELSE l.plazo_dias   END,
         tasa_mensual = CASE WHEN x ? 'tasa_mensual' THEN (x->>'tasa_mensual')::numeric ELSE l.tasa_mensual END
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
