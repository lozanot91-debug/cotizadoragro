/*
# CRM: Pipeline, Tareas, Visitas, Fotos

## Nuevas tablas: tareas, visitas, visita_fotos
## Nuevas columnas en cotizaciones: probabilidad, fecha_cierre_estimada, fecha_envio
## Nuevas claves de configuracion: prob_borrador, prob_enviada, prob_negociacion, sin_respuesta_dias, seguimiento_dias, ultimo_contacto_dias
## Storage bucket: visitas-fotos (privado)
*/

-- ============ NUEVAS COLUMNAS EN COTIZACIONES ============
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS probabilidad numeric;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha_cierre_estimada date;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha_envio timestamptz;

-- ============ TABLA tareas ============
CREATE TABLE IF NOT EXISTS tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  titulo text NOT NULL,
  descripcion text,
  tipo text DEFAULT 'Seguimiento',
  prioridad text DEFAULT 'Normal',
  fecha_vencimiento date NOT NULL,
  hora time,
  estado text DEFAULT 'Pendiente',
  asignado_a text,
  creada_por text,
  cotizacion_id uuid REFERENCES cotizaciones(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  completada_at timestamptz,
  resultado text
);

ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_tareas" ON tareas;
CREATE POLICY "anon_select_tareas" ON tareas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tareas" ON tareas;
CREATE POLICY "anon_insert_tareas" ON tareas FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tareas" ON tareas;
CREATE POLICY "anon_update_tareas" ON tareas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tareas" ON tareas;
CREATE POLICY "anon_delete_tareas" ON tareas FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_tareas_fecha_vencimiento ON tareas(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_tareas_estado ON tareas(estado);

-- ============ TABLA visitas ============
CREATE TABLE IF NOT EXISTS visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  fecha date NOT NULL,
  hora time,
  tipo text DEFAULT 'Comercial',
  estado text DEFAULT 'Programada',
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  cotizacion_id uuid REFERENCES cotizaciones(id) ON DELETE SET NULL,
  establecimiento text,
  lote text,
  ubicacion_texto text,
  latitud numeric,
  longitud numeric,
  cultivo text,
  estadio text,
  objetivo text,
  observaciones text,
  problema_detectado text,
  recomendacion text,
  proximos_pasos text,
  responsable text,
  creada_por text
);

ALTER TABLE visitas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_visitas" ON visitas;
CREATE POLICY "anon_select_visitas" ON visitas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_visitas" ON visitas;
CREATE POLICY "anon_insert_visitas" ON visitas FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_visitas" ON visitas;
CREATE POLICY "anon_update_visitas" ON visitas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_visitas" ON visitas;
CREATE POLICY "anon_delete_visitas" ON visitas FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_visitas_fecha ON visitas(fecha);
CREATE INDEX IF NOT EXISTS idx_visitas_estado ON visitas(estado);
CREATE INDEX IF NOT EXISTS idx_visitas_cliente_id ON visitas(cliente_id);

-- ============ TABLA visita_fotos ============
CREATE TABLE IF NOT EXISTS visita_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid REFERENCES visitas(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  descripcion text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE visita_fotos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_visita_fotos" ON visita_fotos;
CREATE POLICY "anon_select_visita_fotos" ON visita_fotos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_visita_fotos" ON visita_fotos;
CREATE POLICY "anon_insert_visita_fotos" ON visita_fotos FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_visita_fotos" ON visita_fotos;
CREATE POLICY "anon_delete_visita_fotos" ON visita_fotos FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_visita_fotos_visita_id ON visita_fotos(visita_id);

-- ============ CONFIG DEFAULTS ============
INSERT INTO configuracion (clave, valor) VALUES
  ('prob_borrador', '10'),
  ('prob_enviada', '25'),
  ('prob_negociacion', '50'),
  ('sin_respuesta_dias', '7'),
  ('seguimiento_dias', '3'),
  ('ultimo_contacto_dias', '60')
ON CONFLICT (clave) DO NOTHING;

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('visitas-fotos', 'visitas-fotos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_select_visitas_fotos" ON storage.objects;
CREATE POLICY "anon_select_visitas_fotos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'visitas-fotos');

DROP POLICY IF EXISTS "anon_insert_visitas_fotos" ON storage.objects;
CREATE POLICY "anon_insert_visitas_fotos" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'visitas-fotos');

DROP POLICY IF EXISTS "anon_delete_visitas_fotos" ON storage.objects;
CREATE POLICY "anon_delete_visitas_fotos" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'visitas-fotos');
