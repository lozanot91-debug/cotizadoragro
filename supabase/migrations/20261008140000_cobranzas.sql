-- Cobros pendientes de las cotizaciones ganadas: uno por cada plazo distinto de la cotización.
CREATE TABLE IF NOT EXISTS public.cobranzas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id uuid NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  vencimiento date NOT NULL,
  plazo_dias integer NOT NULL DEFAULT 0,
  monto_usd numeric NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Cobrada')),
  cobrada_el date,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cobranzas_estado_vencimiento_idx ON public.cobranzas (estado, vencimiento);
CREATE INDEX IF NOT EXISTS cobranzas_cotizacion_idx ON public.cobranzas (cotizacion_id);

ALTER TABLE public.cobranzas ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_todo ON public.cobranzas FOR ALL TO authenticated USING (true) WITH CHECK (true);
