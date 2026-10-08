/*
  # TC del flete

  El flete (planilla en pesos) se pasa a dólares con el TC comprador divisa BNA, no con el vendedor
  que se usa para los precios. cotizaciones.tc_flete guarda el que se usó.
  NULL = cotización anterior a este cambio: el flete se calculó con tc (se respeta).
*/

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS tc_flete numeric CHECK (tc_flete IS NULL OR tc_flete > 0);
