/*
  # Financiación por línea

  En una misma cotización puede haber productos de contado y productos financiados, cada uno
  con su plazo. La tasa mensual sigue siendo una sola por cotización.

  - cotizacion_lineas.plazo_dias: plazo de la línea en días (0 = contado). NULL en cotizaciones viejas:
    la app usa el plazo de la cabecera (cotizaciones.plazo_dias).
  - cotizaciones.plazo_dias pasa a guardar el plazo más largo de sus líneas (informativo).
*/

ALTER TABLE cotizacion_lineas ADD COLUMN IF NOT EXISTS plazo_dias integer;
