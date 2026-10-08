/*
  # Ganada parcial

  Al ganar una cotización se puede indicar, por línea, cuánto se ganó realmente (todo, una parte o nada)
  y el motivo de lo que no se ganó. El detalle por línea queda en `cantidades_reales` (con `motivo`)
  y se guarda un resumen en la cotización para las estadísticas, sin tener que leer las líneas:

  - ganado_usd: subtotal realmente ganado (sin IVA ni financiación, misma base que subtotal_usd).
  - no_ganado: [{cod, producto, cantidad, cotizada, usd, motivo}] de lo que no se ganó.

  Ambos quedan en NULL cuando la cotización no está Ganada.
*/

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS ganado_usd numeric;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS no_ganado jsonb;

-- Las ganadas que ya existían se ganaron completas
UPDATE cotizaciones SET ganado_usd = subtotal_usd, no_ganado = '[]'::jsonb
 WHERE estado = 'Ganada' AND ganado_usd IS NULL;
