/*
  # Aforo del flete por tramo

  El aforo es independiente en cada tramo del flete:
  - cotizaciones.aforo_tn = aforo del tramo principal (directo o largo).
  - cotizaciones.aforo_corto_tn = aforo del tramo corto (solo con modalidad largo_corto).
  Cada aforo solo afecta a su tramo. NULL = sin aforo en ese tramo: se cobra la carga real.
*/

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS aforo_corto_tn numeric CHECK (aforo_corto_tn IS NULL OR aforo_corto_tn > 0);
