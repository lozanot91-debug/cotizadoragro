/*
# Historial de cambios + cotizacion_origen_id

## Resumen
1. Crear tabla historial_cambios para auditar todos los cambios de la app
2. Agregar cotizaciones.cotizacion_origen_id para marcar cotizaciones duplicadas
3. RLS: solo SELECT e INSERT en historial_cambios (no se edita ni borra)

## Tabla historial_cambios
- id uuid pk
- created_at timestamptz default now()
- usuario_nombre text not null
- usuario_id uuid null
- tipo text not null ('estado','cotizacion','linea','margen','costo','lista','config')
- cotizacion_id uuid null references cotizaciones(id) ON DELETE SET NULL
- entidad text
- campo text
- valor_anterior text null
- valor_nuevo text null
- detalle text null

## Índices
- idx_historial_created_at: created_at DESC
- idx_historial_cotizacion_id: cotizacion_id
- idx_historial_tipo: tipo

## cotizaciones
- cotizacion_origen_id uuid null references cotizaciones(id) ON DELETE SET NULL

## Security
- RLS enabled on historial_cambios
- SELECT y INSERT para anon, authenticated (misma apertura pública que las demás tablas)
- Sin políticas de UPDATE ni DELETE
*/

CREATE TABLE IF NOT EXISTS historial_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  usuario_nombre text NOT NULL,
  usuario_id uuid,
  tipo text NOT NULL,
  cotizacion_id uuid REFERENCES cotizaciones(id) ON DELETE SET NULL,
  entidad text,
  campo text,
  valor_anterior text,
  valor_nuevo text,
  detalle text
);

ALTER TABLE historial_cambios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_historial" ON historial_cambios;
CREATE POLICY "anon_select_historial" ON historial_cambios FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_historial" ON historial_cambios;
CREATE POLICY "anon_insert_historial" ON historial_cambios FOR INSERT
TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_historial_created_at ON historial_cambios(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_historial_cotizacion_id ON historial_cambios(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_historial_tipo ON historial_cambios(tipo);

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS cotizacion_origen_id uuid REFERENCES cotizaciones(id) ON DELETE SET NULL;
