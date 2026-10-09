/*
  # Precios de ajuste de futuros (Matba-Rofex / A3 Mercados)

  futuros_granos: ajuste diario de cada posición en dólares de Rosario (soja, maíz, trigo…) y del disponible
  (posicion = 'DIS'). Los carga la edge function `pizarra-granos` junto con las pizarras. Los lee cualquier usuario.
  Para el canje a cosecha: precio = futuro de la posición + diferencial de plaza (pizarra de la plaza − disponible Rosario).
*/

CREATE TABLE IF NOT EXISTS public.futuros_granos (
  fecha date NOT NULL,
  simbolo text NOT NULL CHECK (length(simbolo) BETWEEN 5 AND 40),
  cultivo text NOT NULL CHECK (length(cultivo) BETWEEN 1 AND 40),
  posicion text NOT NULL CHECK (posicion = 'DIS' OR posicion ~ '^\d{4}-\d{2}$'),
  ajuste numeric NOT NULL CHECK (ajuste > 0),
  obtenido_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, simbolo)
);
CREATE INDEX IF NOT EXISTS futuros_granos_cultivo_fecha ON public.futuros_granos (cultivo, fecha DESC);
ALTER TABLE public.futuros_granos ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_leer ON public.futuros_granos FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.futuros_granos FROM anon;
