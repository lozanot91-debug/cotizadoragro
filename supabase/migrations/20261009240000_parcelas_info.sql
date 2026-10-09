/*
  # Mapa: titular y quién trabaja cada parcela

  parcelas_info: lo que el equipo sabe de una parcela, por partida de ARBA (que no trae el titular):
  titular registral, quién la trabaja (arrendatario/contratista) y notas. Vale para parcelas de clientes y para
  prospectos (parcelas que no están en ningún campo de cliente): por eso guarda también el contorno, para dibujarla.
*/

CREATE TABLE IF NOT EXISTS public.parcelas_info (
  partida text PRIMARY KEY CHECK (length(partida) BETWEEN 1 AND 20),
  titular text CHECK (titular IS NULL OR length(titular) <= 120),
  trabaja text CHECK (trabaja IS NULL OR length(trabaja) <= 120),
  notas text CHECK (notas IS NULL OR length(notas) <= 500),
  nomenclatura text CHECK (nomenclatura IS NULL OR length(nomenclatura) <= 60),
  tipo text CHECK (tipo IS NULL OR length(tipo) <= 20),
  superficie_m2 numeric CHECK (superficie_m2 IS NULL OR superficie_m2 >= 0),
  geom jsonb NOT NULL CHECK (jsonb_typeof(geom) = 'object' AND geom->>'type' IN ('Polygon', 'MultiPolygon')),
  min_lng numeric, min_lat numeric, max_lng numeric, max_lat numeric,
  usuario_nombre text CHECK (usuario_nombre IS NULL OR length(usuario_nombre) <= 120),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.parcelas_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_todo ON public.parcelas_info FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.parcelas_info FROM anon;
