-- Parámetros por defecto del comparador de formas de pago (JSON), los edita el admin en Configuración.
INSERT INTO public.configuracion (clave, valor) VALUES (
  'formas_pago_parametros',
  '{"tasa_ref_anual_pct":8,"devaluacion_mensual_pct":2,"descuento_contado_pct":0,"tarjetas":[{"id":"t-usd","nombre":"Tarjeta en dólares","moneda":"USD","nd_pct":0,"tna_pct":0,"dias":180},{"id":"t-ars","nombre":"Tarjeta en pesos","moneda":"ARS","nd_pct":0,"tna_pct":30,"dias":180}]}'
) ON CONFLICT (clave) DO NOTHING;
