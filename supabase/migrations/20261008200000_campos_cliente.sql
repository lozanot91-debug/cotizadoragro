/*
  # Campos de los clientes

  Cada cliente puede tener varios campos: nombre, superficie (ha), localidad, km a puerto,
  planta asignada y km a la planta asignada. Si se borra el cliente se borran sus campos.
*/

CREATE TABLE IF NOT EXISTS public.campos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 120),
  superficie_ha numeric CHECK (superficie_ha IS NULL OR superficie_ha >= 0),
  localidad text CHECK (length(localidad) <= 120),
  km_puerto numeric CHECK (km_puerto IS NULL OR km_puerto >= 0),
  planta text CHECK (length(planta) <= 120),
  km_planta numeric CHECK (km_planta IS NULL OR km_planta >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campos_cliente_idx ON public.campos (cliente_id);

ALTER TABLE public.campos ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_todo ON public.campos FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.campos FROM anon;
