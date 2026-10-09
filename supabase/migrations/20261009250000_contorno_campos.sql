/*
  # Contorno real de los campos

  El catastro (campos_parcelas) dice qué partidas tiene el campo; el contorno es lo que realmente se trabaja
  (alambrado), dibujado sobre el satélite o importado de un KML. Si está, la superficie del campo sale de acá.
*/
ALTER TABLE public.campos
  ADD COLUMN IF NOT EXISTS contorno jsonb CHECK (contorno IS NULL OR (jsonb_typeof(contorno) = 'object' AND contorno->>'type' IN ('Polygon', 'MultiPolygon'))),
  ADD COLUMN IF NOT EXISTS contorno_fuente text CHECK (contorno_fuente IS NULL OR contorno_fuente IN ('dibujo', 'KML', 'ARBA')),
  ADD COLUMN IF NOT EXISTS contorno_ha numeric CHECK (contorno_ha IS NULL OR contorno_ha >= 0);
