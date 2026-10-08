/*
  # Flete por tramos (fertilizantes)

  Modalidad por cotización:
    - directo: un tramo origen → campo (km + convenio_flete_id)
    - largo: un tramo origen → planta (km + convenio_flete_id)
    - largo_corto: largo (km + convenio_flete_id) + corto planta → campo (km_corto + convenio_corto_id)
  Lo ya guardado queda como 'directo'. Cualquier convenio sirve para cualquier tramo.

  campo_id: campo del cliente del que se precargaron los km (los km se pueden editar).
  plantas: nombre y km a puerto, para precargar el tramo largo. Las lee cualquier usuario, las edita el admin.
*/

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS flete_modalidad text NOT NULL DEFAULT 'directo'
    CHECK (flete_modalidad IN ('directo', 'largo', 'largo_corto')),
  ADD COLUMN IF NOT EXISTS km_corto numeric NOT NULL DEFAULT 0 CHECK (km_corto >= 0),
  ADD COLUMN IF NOT EXISTS convenio_corto_id uuid REFERENCES public.convenios_flete(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campo_id uuid REFERENCES public.campos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.plantas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 120),
  km_puerto numeric CHECK (km_puerto IS NULL OR km_puerto >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS plantas_nombre_unico ON public.plantas (lower(trim(nombre)));

ALTER TABLE public.plantas ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_leer ON public.plantas FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_escribe ON public.plantas FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());
REVOKE ALL ON public.plantas FROM anon;

-- Las plantas que ya figuran en los campos, sin distancia (la carga el admin)
INSERT INTO public.plantas (nombre)
SELECT DISTINCT ON (lower(trim(planta))) trim(planta)
  FROM public.campos
 WHERE planta IS NOT NULL AND trim(planta) <> ''
ON CONFLICT DO NOTHING;
