/*
# Cotizaciones en pesos (alimento balanceado y premezclas)

## Resumen
El balanceado se cotiza, factura y cobra en pesos. Una cotización pasa a tener moneda ('USD' o 'ARS').
En una cotización en pesos los importes reales se guardan en columnas *_ars; las columnas *_usd de
siempre guardan el equivalente en dólares al TC de la cotización, para que Inicio, Pipeline,
estadísticas y resumen semanal sigan sumando dólares sin cambios.

## Cambios (todo aditivo)
- cotizaciones: moneda (default 'USD'), subtotal_ars, recargo_ars, iva_ars.
  `total_ars` ya existía (era informativo: total_usd × tc); en cotizaciones en pesos pasa a ser el total real.
- cotizacion_lineas: costo_ars, costo_lista_ars, precio_ars, total_ars.
- Las cotizaciones existentes quedan como 'USD' y no se tocan.
- guardar_cotizacion() no cambia: toma las columnas del JSON que existan en la tabla.
*/

ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS subtotal_ars numeric,
  ADD COLUMN IF NOT EXISTS recargo_ars numeric,
  ADD COLUMN IF NOT EXISTS iva_ars numeric;

ALTER TABLE cotizaciones
  DROP CONSTRAINT IF EXISTS cotizaciones_moneda_check;
ALTER TABLE cotizaciones
  ADD CONSTRAINT cotizaciones_moneda_check CHECK (moneda IN ('USD', 'ARS'));

ALTER TABLE cotizacion_lineas
  ADD COLUMN IF NOT EXISTS costo_ars numeric,
  ADD COLUMN IF NOT EXISTS costo_lista_ars numeric,
  ADD COLUMN IF NOT EXISTS precio_ars numeric,
  ADD COLUMN IF NOT EXISTS total_ars numeric;
