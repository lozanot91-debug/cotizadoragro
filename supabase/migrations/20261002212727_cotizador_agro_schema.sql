/*
# Cotizador Agro - Esquema completo

## Resumen
Crea el esquema de base de datos para "Cotizador Agro", una app de cotización de agroquímicos y fertilizantes
con seguimiento comercial, auth con roles (admin/vendedor), y RLS.

## Tablas nuevas

1. `usuarios` - Extiende auth.users con rol (admin/vendedor) y permiso de ver costos.
   - id (uuid, PK, FK a auth.users)
   - email (text)
   - nombre (text)
   - rol (text: 'admin' | 'vendedor', default 'vendedor')
   - puede_ver_costos (boolean, default true)
   - created_at (timestamptz)

2. `configuracion` - Clave/valor global (margen general, tipo de cambio, IVA, logo, nombre empresa, vigencia).
   - clave (text, PK)
   - valor (text)

3. `familias_config` - Configuración por familia: moneda y margen por defecto.
   - id (uuid, PK)
   - familia (text, unique)
   - moneda (text: 'USD' | 'ARS', default 'USD')
   - margen_default (numeric, default 0)

4. `productos` - Maestro de productos (se popula al subir listas).
   - id (uuid, PK)
   - cod (text, unique) - código único del producto
   - proveedor (text)
   - familia (text)
   - producto (text)
   - unid (text) - unidad (LTRS, KGRS, etc.)
   - created_at (timestamptz)

5. `listas_costos` - Cada lista semanal de costos.
   - id (uuid, PK)
   - fecha (date) - fecha de vigencia inferida del nombre
   - nombre_archivo (text)
   - uploaded_by (uuid, FK auth.users)
   - created_at (timestamptz)

6. `costos_historial` - Costo de cada producto en cada lista.
   - id (uuid, PK)
   - producto_id (uuid, FK productos)
   - lista_id (uuid, FK listas_costos)
   - costo (numeric) - costo en la moneda de la familia
   - UNIQUE (producto_id, lista_id)

7. `tarifa_flete` - Tarifa de flete en pesos por 100 kg.
   - id (uuid, PK)
   - km (int, unique)
   - tarifa (numeric) - pesos por 100 kg

8. `clientes` - Fichas de clientes.
   - id (uuid, PK)
   - nombre (text)
   - cuit (text)
   - zona (text)
   - condiciones_pago (text)
   - created_by (uuid, FK auth.users, default auth.uid())
   - created_at (timestamptz)

9. `margenes_producto` - Margen específico por producto.
   - id (uuid, PK)
   - producto_id (uuid, FK productos)
   - margen (numeric)
   - UNIQUE (producto_id)

10. `margenes_cliente` - Margen acordado por cliente (override por producto o familia).
    - id (uuid, PK)
    - cliente_id (uuid, FK clientes)
    - producto_id (uuid, FK productos, nullable)
    - familia (text, nullable)
    - margen (numeric)
    - CHECK: producto_id IS NOT NULL OR familia IS NOT NULL

11. `cotizaciones` - Cotizaciones con número correlativo.
    - id (uuid, PK)
    - numero (int, unique) - correlativo
    - cliente_id (uuid, FK clientes)
    - cliente_nombre (text) - snapshot del nombre
    - fecha (date)
    - tc (numeric) - tipo de cambio $/USD
    - km (int) - km de destino
    - iva (numeric) - % IVA
    - estado (text: 'Borrador','Enviada','En negociación','Ganada','Perdida','Vencida', default 'Borrador')
    - motivo_perdida (text, nullable)
    - vigencia_dias (int, default 15)
    - vendedor (uuid, FK auth.users, default auth.uid())
    - lista_id (uuid, FK listas_costos, nullable)
    - subtotal_usd (numeric, default 0)
    - iva_usd (numeric, default 0)
    - total_usd (numeric, default 0)
    - total_ars (numeric, default 0)
    - notas (text, nullable)
    - cantidades_reales (jsonb, nullable) - cantidades y precio final reales al ganar
    - created_at (timestamptz)
    - updated_at (timestamptz)

12. `cotizacion_lineas` - Líneas de cada cotización.
    - id (uuid, PK)
    - cotizacion_id (uuid, FK cotizaciones ON DELETE CASCADE)
    - producto_id (uuid, FK productos, nullable)
    - cod (text)
    - producto (text) - nombre snapshot
    - familia (text)
    - proveedor (text)
    - unid (text)
    - es_fertilizante (boolean, default false)
    - cantidad (numeric, default 0)
    - costo_usd (numeric, default 0)
    - margen (numeric, default 0) - margen aplicado (0-95)
    - precio_usd (numeric, default 0) - precio unitario
    - flete_usd (numeric, default 0) - flete por unidad (solo fertilizantes)
    - total_usd (numeric, default 0) - total de la línea
    - con_flete (boolean, default true)
    - orden (int, default 0)

## Seguridad
- RLS activado en todas las tablas.
- Polices authenticated con ownership/membership checks.
- admin ve todo; vendedor ve solo sus cotizaciones/clientes.
- Costos: controlados por flag puede_ver_costos en usuarios (la policy SELECT permite ver productos pero el frontend oculta costos según el flag).
- Secuencia para número correlativo de cotizaciones.
*/

-- ===================== USUARIOS =====================
CREATE TABLE IF NOT EXISTS usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nombre text,
  rol text NOT NULL DEFAULT 'vendedor' CHECK (rol IN ('admin','vendedor')),
  puede_ver_costos boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT TO authenticated
USING (auth.uid() = id OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "usuarios_update_self" ON usuarios;
CREATE POLICY "usuarios_update_self" ON usuarios FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "usuarios_update_admin" ON usuarios;
CREATE POLICY "usuarios_update_admin" ON usuarios FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;
CREATE POLICY "usuarios_insert" ON usuarios FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

-- ===================== CONFIGURACION =====================
CREATE TABLE IF NOT EXISTS configuracion (
  clave text PRIMARY KEY,
  valor text NOT NULL
);
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "config_select" ON configuracion;
CREATE POLICY "config_select" ON configuracion FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "config_insert" ON configuracion;
CREATE POLICY "config_insert" ON configuracion FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "config_update" ON configuracion;
CREATE POLICY "config_update" ON configuracion FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "config_delete" ON configuracion;
CREATE POLICY "config_delete" ON configuracion FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

-- ===================== FAMILIAS_CONFIG =====================
CREATE TABLE IF NOT EXISTS familias_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia text UNIQUE NOT NULL,
  moneda text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD','ARS')),
  margen_default numeric NOT NULL DEFAULT 0
);
ALTER TABLE familias_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "familias_config_select" ON familias_config;
CREATE POLICY "familias_config_select" ON familias_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "familias_config_insert" ON familias_config;
CREATE POLICY "familias_config_insert" ON familias_config FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "familias_config_update" ON familias_config;
CREATE POLICY "familias_config_update" ON familias_config FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "familias_config_delete" ON familias_config;
CREATE POLICY "familias_config_delete" ON familias_config FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

-- ===================== PRODUCTOS =====================
CREATE TABLE IF NOT EXISTS productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cod text UNIQUE NOT NULL,
  proveedor text,
  familia text,
  producto text,
  unid text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "productos_select" ON productos;
CREATE POLICY "productos_select" ON productos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "productos_insert" ON productos;
CREATE POLICY "productos_insert" ON productos FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "productos_update" ON productos;
CREATE POLICY "productos_update" ON productos FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "productos_delete" ON productos;
CREATE POLICY "productos_delete" ON productos FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

-- ===================== LISTAS_COSTOS =====================
CREATE TABLE IF NOT EXISTS listas_costos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  nombre_archivo text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE listas_costos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listas_select" ON listas_costos;
CREATE POLICY "listas_select" ON listas_costos FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "listas_insert" ON listas_costos;
CREATE POLICY "listas_insert" ON listas_costos FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "listas_delete" ON listas_costos;
CREATE POLICY "listas_delete" ON listas_costos FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

-- ===================== COSTOS_HISTORIAL =====================
CREATE TABLE IF NOT EXISTS costos_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  lista_id uuid NOT NULL REFERENCES listas_costos(id) ON DELETE CASCADE,
  costo numeric NOT NULL DEFAULT 0,
  UNIQUE (producto_id, lista_id)
);
ALTER TABLE costos_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "costos_select" ON costos_historial;
CREATE POLICY "costos_select" ON costos_historial FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "costos_insert" ON costos_historial;
CREATE POLICY "costos_insert" ON costos_historial FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "costos_delete" ON costos_historial;
CREATE POLICY "costos_delete" ON costos_historial FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

-- ===================== TARIFA_FLETE =====================
CREATE TABLE IF NOT EXISTS tarifa_flete (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  km int UNIQUE NOT NULL,
  tarifa numeric NOT NULL DEFAULT 0
);
ALTER TABLE tarifa_flete ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flete_select" ON tarifa_flete;
CREATE POLICY "flete_select" ON tarifa_flete FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "flete_insert" ON tarifa_flete;
CREATE POLICY "flete_insert" ON tarifa_flete FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "flete_update" ON tarifa_flete;
CREATE POLICY "flete_update" ON tarifa_flete FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "flete_delete" ON tarifa_flete;
CREATE POLICY "flete_delete" ON tarifa_flete FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

-- ===================== CLIENTES =====================
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  cuit text,
  zona text,
  condiciones_pago text,
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
);

DROP POLICY IF EXISTS "clientes_insert" ON clientes;
CREATE POLICY "clientes_insert" ON clientes FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "clientes_update" ON clientes;
CREATE POLICY "clientes_update" ON clientes FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
)
WITH CHECK (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
);

DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_delete" ON clientes FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
);

-- ===================== MARGENES_PRODUCTO =====================
CREATE TABLE IF NOT EXISTS margenes_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid UNIQUE NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  margen numeric NOT NULL DEFAULT 0
);
ALTER TABLE margenes_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marg_prod_select" ON margenes_producto;
CREATE POLICY "marg_prod_select" ON margenes_producto FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "marg_prod_insert" ON margenes_producto;
CREATE POLICY "marg_prod_insert" ON margenes_producto FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "marg_prod_update" ON margenes_producto;
CREATE POLICY "marg_prod_update" ON margenes_producto FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

DROP POLICY IF EXISTS "marg_prod_delete" ON margenes_producto;
CREATE POLICY "marg_prod_delete" ON margenes_producto FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin'));

-- ===================== MARGENES_CLIENTE =====================
CREATE TABLE IF NOT EXISTS margenes_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES productos(id) ON DELETE CASCADE,
  familia text,
  margen numeric NOT NULL DEFAULT 0,
  CHECK (producto_id IS NOT NULL OR familia IS NOT NULL)
);
ALTER TABLE margenes_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marg_cli_select" ON margenes_cliente;
CREATE POLICY "marg_cli_select" ON margenes_cliente FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM clientes c WHERE c.id = margenes_cliente.cliente_id AND (c.created_by = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
);

DROP POLICY IF EXISTS "marg_cli_insert" ON margenes_cliente;
CREATE POLICY "marg_cli_insert" ON margenes_cliente FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM clientes c WHERE c.id = margenes_cliente.cliente_id AND (c.created_by = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
);

DROP POLICY IF EXISTS "marg_cli_update" ON margenes_cliente;
CREATE POLICY "marg_cli_update" ON margenes_cliente FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM clientes c WHERE c.id = margenes_cliente.cliente_id AND (c.created_by = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM clientes c WHERE c.id = margenes_cliente.cliente_id AND (c.created_by = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
);

DROP POLICY IF EXISTS "marg_cli_delete" ON margenes_cliente;
CREATE POLICY "marg_cli_delete" ON margenes_cliente FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM clientes c WHERE c.id = margenes_cliente.cliente_id AND (c.created_by = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
);

-- ===================== COTIZACIONES =====================
CREATE TABLE IF NOT EXISTS cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero int UNIQUE NOT NULL,
  cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tc numeric NOT NULL DEFAULT 0,
  km int NOT NULL DEFAULT 0,
  iva numeric NOT NULL DEFAULT 10.5,
  estado text NOT NULL DEFAULT 'Borrador' CHECK (estado IN ('Borrador','Enviada','En negociación','Ganada','Perdida','Vencida')),
  motivo_perdida text,
  vigencia_dias int NOT NULL DEFAULT 15,
  vendedor uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  lista_id uuid REFERENCES listas_costos(id),
  subtotal_usd numeric NOT NULL DEFAULT 0,
  iva_usd numeric NOT NULL DEFAULT 0,
  total_usd numeric NOT NULL DEFAULT 0,
  total_ars numeric NOT NULL DEFAULT 0,
  notas text,
  cantidades_reales jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cotiz_select" ON cotizaciones;
CREATE POLICY "cotiz_select" ON cotizaciones FOR SELECT TO authenticated
USING (
  vendedor = auth.uid()
  OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
);

DROP POLICY IF EXISTS "cotiz_insert" ON cotizaciones;
CREATE POLICY "cotiz_insert" ON cotizaciones FOR INSERT TO authenticated
WITH CHECK (
  vendedor = auth.uid()
  OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
);

DROP POLICY IF EXISTS "cotiz_update" ON cotizaciones;
CREATE POLICY "cotiz_update" ON cotizaciones FOR UPDATE TO authenticated
USING (
  vendedor = auth.uid()
  OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
)
WITH CHECK (
  vendedor = auth.uid()
  OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
);

DROP POLICY IF EXISTS "cotiz_delete" ON cotizaciones;
CREATE POLICY "cotiz_delete" ON cotizaciones FOR DELETE TO authenticated
USING (
  vendedor = auth.uid()
  OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')
);

-- ===================== COTIZACION_LINEAS =====================
CREATE TABLE IF NOT EXISTS cotizacion_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  producto_id uuid REFERENCES productos(id),
  cod text,
  producto text,
  familia text,
  proveedor text,
  unid text,
  es_fertilizante boolean NOT NULL DEFAULT false,
  cantidad numeric NOT NULL DEFAULT 0,
  costo_usd numeric NOT NULL DEFAULT 0,
  margen numeric NOT NULL DEFAULT 0,
  precio_usd numeric NOT NULL DEFAULT 0,
  flete_usd numeric NOT NULL DEFAULT 0,
  total_usd numeric NOT NULL DEFAULT 0,
  con_flete boolean NOT NULL DEFAULT true,
  orden int NOT NULL DEFAULT 0
);
ALTER TABLE cotizacion_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lineas_select" ON cotizacion_lineas;
CREATE POLICY "lineas_select" ON cotizacion_lineas FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_lineas.cotizacion_id AND (c.vendedor = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
);

DROP POLICY IF EXISTS "lineas_insert" ON cotizacion_lineas;
CREATE POLICY "lineas_insert" ON cotizacion_lineas FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_lineas.cotizacion_id AND (c.vendedor = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
);

DROP POLICY IF EXISTS "lineas_update" ON cotizacion_lineas;
CREATE POLICY "lineas_update" ON cotizacion_lineas FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_lineas.cotizacion_id AND (c.vendedor = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_lineas.cotizacion_id AND (c.vendedor = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
);

DROP POLICY IF EXISTS "lineas_delete" ON cotizacion_lineas;
CREATE POLICY "lineas_delete" ON cotizacion_lineas FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM cotizaciones c WHERE c.id = cotizacion_lineas.cotizacion_id AND (c.vendedor = auth.uid() OR EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid() AND u.rol = 'admin')))
);

-- ===================== SECUENCIA NUMERO COTIZACION =====================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'cotizacion_numero_seq') THEN
    CREATE SEQUENCE cotizacion_numero_seq START 1;
  END IF;
END $$;

-- ===================== DEFAULT CONFIG =====================
INSERT INTO configuracion (clave, valor) VALUES
  ('empresa_nombre', 'Agro Químicos S.A.'),
  ('empresa_cuit', ''),
  ('empresa_telefono', ''),
  ('empresa_direccion', ''),
  ('empresa_logo', ''),
  ('margen_general', '8'),
  ('tipo_cambio_default', '1400'),
  ('iva_default', '10.5'),
  ('vigencia_default', '15')
ON CONFLICT (clave) DO NOTHING;

-- ===================== INDEXES =====================
CREATE INDEX IF NOT EXISTS idx_costos_producto ON costos_historial(producto_id);
CREATE INDEX IF NOT EXISTS idx_costos_lista ON costos_historial(lista_id);
CREATE INDEX IF NOT EXISTS idx_cotiz_cliente ON cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotiz_vendedor ON cotizaciones(vendedor);
CREATE INDEX IF NOT EXISTS idx_cotiz_estado ON cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_lineas_cotiz ON cotizacion_lineas(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_productos_familia ON productos(familia);
CREATE INDEX IF NOT EXISTS idx_productos_cod ON productos(cod);
CREATE INDEX IF NOT EXISTS idx_clientes_created_by ON clientes(created_by);
