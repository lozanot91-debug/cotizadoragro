/*
  # IVA opcional por cotización

  - cotizaciones.con_iva: la cotización incluye IVA (cotizaciones formales). Por defecto NO.
  - Cotizaciones ya guardadas con IVA calculado (iva_usd > 0) quedan marcadas con IVA para no cambiarles el total.
  - Estadísticas, pipeline y montos de la app usan subtotal_usd (sin IVA).
*/

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS con_iva boolean NOT NULL DEFAULT false;

UPDATE cotizaciones SET con_iva = true WHERE COALESCE(iva_usd, 0) > 0;
