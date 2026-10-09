/*
  # Aforo del flete

  Un camión que lleva, por ejemplo, 4 tn puede estar aforado a 8 tn: el transportista cobra el flete
  por 8 tn (el espacio vacío se paga). cotizaciones.aforo_tn guarda ese aforo, que se carga a mano en
  cada cotización. Nunca es menor que la carga (se factura max(carga, aforo)).
  NULL = sin aforo: se cobra la carga real.
*/

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS aforo_tn numeric CHECK (aforo_tn IS NULL OR aforo_tn > 0);
