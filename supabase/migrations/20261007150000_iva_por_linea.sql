/*
  # IVA por línea

  - cotizacion_lineas.iva: alícuota de IVA (%) de cada línea. Es NULL en cotizaciones viejas
    (en ese caso la app usa el IVA de la cabecera, cotizaciones.iva).
  - configuracion: IVA por tipo de producto (fertilizantes 10,5% y agroquímicos 21%).
    Son valores sugeridos: en cada línea de la cotización se pueden editar.
  - cotizaciones.iva pasa a guardar el IVA efectivo (IVA total / subtotal) para listados.
*/

ALTER TABLE cotizacion_lineas ADD COLUMN IF NOT EXISTS iva numeric;

INSERT INTO configuracion (clave, valor) VALUES
  ('iva_fertilizantes', '10.5'),
  ('iva_agroquimicos', '21')
ON CONFLICT (clave) DO NOTHING;
