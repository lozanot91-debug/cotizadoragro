/*
  # Financiación (pago a plazo) y canje por granos

  - plazo_dias: días de plazo de pago (0 = contado).
  - tasa_mensual: tasa mensual (%) con la que se calcula el recargo (interés simple: tasa × días / 30).
  - recargo_usd: recargo por financiación en USD, sin IVA.
  - canje_cultivo / canje_precio_usd: pago en granos. Precio 0 = la cotización no es de canje.

  subtotal_usd sigue siendo el monto a precio contado y sin IVA (es el que usan las estadísticas).
  total_usd = subtotal + recargo + IVA.
*/

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS plazo_dias integer NOT NULL DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS tasa_mensual numeric NOT NULL DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS recargo_usd numeric NOT NULL DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS canje_cultivo text;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS canje_precio_usd numeric NOT NULL DEFAULT 0;
