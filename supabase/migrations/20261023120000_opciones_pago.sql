/*
# Opciones de pago por cotización

## Problema
Una cotización solo podía tener un plazo de pago por artículo. Hay que poder ofrecerle al cliente
varias alternativas (ej. contado vs. a 150 días) sobre las MISMAS líneas, sin duplicar líneas
(duplicarían pipeline, rentabilidad, cobranzas y facturación).

## Cambios
- cotizaciones.opciones_pago (jsonb, default []): arreglo de { id, nombre, tasa_mensual, plazos[] }.
  plazos[i] = días de la línea en la posición `orden` = i. Vacío = cotización sin opciones.
- cotizaciones.opcion_elegida (text, NULL): id de la opción elegida por el cliente (NULL = todavía no eligió).
- CHECK: opciones_pago tiene que ser un arreglo JSON.
- Solo agrega columnas. guardar_cotizacion es genérico (jsonb_populate_record sobre las claves
  que llegan), así que no hace falta tocarlo.
*/

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS opciones_pago jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS opcion_elegida text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cotizaciones_opciones_pago_es_arreglo'
      AND conrelid = 'public.cotizaciones'::regclass
  ) THEN
    ALTER TABLE public.cotizaciones
      ADD CONSTRAINT cotizaciones_opciones_pago_es_arreglo
      CHECK (jsonb_typeof(opciones_pago) = 'array');
  END IF;
END $$;
