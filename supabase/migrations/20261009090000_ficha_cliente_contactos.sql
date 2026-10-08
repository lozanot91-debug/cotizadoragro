/*
  # Ficha del cliente: datos nuevos y contactos

  1. clientes: razón social, domicilio fiscal, localidad, vendedor asignado (usuario de la app),
     estado (Activo / Prospecto / Inactivo) y observaciones.
  2. contactos: varias personas por cliente (nombre, cargo, teléfono, mail, notas) con un
     contacto principal. Si se borra el cliente se borran sus contactos.
     - El primer contacto de un cliente queda como principal solo.
     - Marcar uno como principal desmarca a los demás (trigger).
*/

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS razon_social text CHECK (length(razon_social) <= 160),
  ADD COLUMN IF NOT EXISTS domicilio text CHECK (length(domicilio) <= 200),
  ADD COLUMN IF NOT EXISTS localidad text CHECK (length(localidad) <= 120),
  ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Prospecto', 'Inactivo')),
  ADD COLUMN IF NOT EXISTS observaciones text CHECK (length(observaciones) <= 2000);

CREATE INDEX IF NOT EXISTS clientes_vendedor_idx ON public.clientes (vendedor_id);

CREATE TABLE IF NOT EXISTS public.contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 120),
  cargo text CHECK (length(cargo) <= 80),
  telefono text CHECK (length(telefono) <= 40),
  email text CHECK (length(email) <= 160),
  notas text CHECK (length(notas) <= 500),
  principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contactos_cliente_idx ON public.contactos (cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS contactos_un_principal ON public.contactos (cliente_id) WHERE principal;

ALTER TABLE public.contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_todo ON public.contactos FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.contactos FROM anon;

CREATE OR REPLACE FUNCTION public.contactos_principal_unico()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- El primer contacto del cliente es el principal
  IF TG_OP = 'INSERT' AND NOT NEW.principal
     AND NOT EXISTS (SELECT 1 FROM public.contactos WHERE cliente_id = NEW.cliente_id) THEN
    NEW.principal := true;
  END IF;
  IF NEW.principal THEN
    UPDATE public.contactos SET principal = false
     WHERE cliente_id = NEW.cliente_id AND principal AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER contactos_principal_unico
  BEFORE INSERT OR UPDATE OF principal ON public.contactos
  FOR EACH ROW EXECUTE FUNCTION public.contactos_principal_unico();
