/*
  # Mapa: parcelas de los campos

  campos_parcelas: las parcelas (contornos) de cada campo. Se agregan desde el mapa tocando una parcela del
  catastro de ARBA (geoARBA, capa idera:Parcela: partida, nomenclatura, rural/urbana, superficie) o, más
  adelante, importando un KML o dibujando. El contorno se guarda como GeoJSON (MultiPolygon, EPSG:4326).
  Una partida va una sola vez por campo.

  campos.lat / campos.lng: punto del campo (centro de sus parcelas o marcado a mano), para el mapa de clientes.
*/

ALTER TABLE public.campos
  ADD COLUMN IF NOT EXISTS lat numeric CHECK (lat IS NULL OR lat BETWEEN -56 AND -21),
  ADD COLUMN IF NOT EXISTS lng numeric CHECK (lng IS NULL OR lng BETWEEN -74 AND -53);

CREATE TABLE IF NOT EXISTS public.campos_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campo_id uuid NOT NULL REFERENCES public.campos(id) ON DELETE CASCADE,
  fuente text NOT NULL DEFAULT 'ARBA' CHECK (fuente IN ('ARBA', 'KML', 'dibujo')),
  partida text CHECK (partida IS NULL OR length(partida) <= 20),
  nomenclatura text CHECK (nomenclatura IS NULL OR length(nomenclatura) <= 60),
  tipo text CHECK (tipo IS NULL OR length(tipo) <= 20),
  superficie_m2 numeric CHECK (superficie_m2 IS NULL OR superficie_m2 >= 0),
  geom jsonb NOT NULL CHECK (jsonb_typeof(geom) = 'object' AND geom->>'type' IN ('Polygon', 'MultiPolygon')),
  -- Recuadro para ubicar rápido (lng/lat)
  min_lng numeric, min_lat numeric, max_lng numeric, max_lat numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS campos_parcelas_partida_unica ON public.campos_parcelas (campo_id, partida) WHERE partida IS NOT NULL;
CREATE INDEX IF NOT EXISTS campos_parcelas_campo ON public.campos_parcelas (campo_id);
CREATE INDEX IF NOT EXISTS campos_parcelas_partida ON public.campos_parcelas (partida);
ALTER TABLE public.campos_parcelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_todo ON public.campos_parcelas FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.campos_parcelas FROM anon;
