/*
# Cambiar RLS a acceso público (sin login)

## Resumen
Convierte todas las políticas de `authenticated` a `anon, authenticated` para que la app funcione sin login.
También otorga permiso de ejecución de la función RPC `get_next_numero` al rol `anon`.
Las políticas que validaban rol de admin ahora permiten acceso público completo.
*/

-- usuarios
DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "usuarios_update_self" ON usuarios;
CREATE POLICY "usuarios_update_self" ON usuarios FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "usuarios_update_admin" ON usuarios;
CREATE POLICY "usuarios_update_admin" ON usuarios FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "usuarios_insert" ON usuarios;
CREATE POLICY "usuarios_insert" ON usuarios FOR INSERT TO anon, authenticated WITH CHECK (true);

-- configuracion
DROP POLICY IF EXISTS "config_select" ON configuracion;
CREATE POLICY "config_select" ON configuracion FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "config_insert" ON configuracion;
CREATE POLICY "config_insert" ON configuracion FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "config_update" ON configuracion;
CREATE POLICY "config_update" ON configuracion FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "config_delete" ON configuracion;
CREATE POLICY "config_delete" ON configuracion FOR DELETE TO anon, authenticated USING (true);

-- familias_config
DROP POLICY IF EXISTS "familias_config_select" ON familias_config;
CREATE POLICY "familias_config_select" ON familias_config FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "familias_config_insert" ON familias_config;
CREATE POLICY "familias_config_insert" ON familias_config FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "familias_config_update" ON familias_config;
CREATE POLICY "familias_config_update" ON familias_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "familias_config_delete" ON familias_config;
CREATE POLICY "familias_config_delete" ON familias_config FOR DELETE TO anon, authenticated USING (true);

-- productos
DROP POLICY IF EXISTS "productos_select" ON productos;
CREATE POLICY "productos_select" ON productos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "productos_insert" ON productos;
CREATE POLICY "productos_insert" ON productos FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "productos_update" ON productos;
CREATE POLICY "productos_update" ON productos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "productos_delete" ON productos;
CREATE POLICY "productos_delete" ON productos FOR DELETE TO anon, authenticated USING (true);

-- listas_costos
DROP POLICY IF EXISTS "listas_select" ON listas_costos;
CREATE POLICY "listas_select" ON listas_costos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "listas_insert" ON listas_costos;
CREATE POLICY "listas_insert" ON listas_costos FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "listas_delete" ON listas_costos;
CREATE POLICY "listas_delete" ON listas_costos FOR DELETE TO anon, authenticated USING (true);

-- costos_historial
DROP POLICY IF EXISTS "costos_select" ON costos_historial;
CREATE POLICY "costos_select" ON costos_historial FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "costos_insert" ON costos_historial;
CREATE POLICY "costos_insert" ON costos_historial FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "costos_delete" ON costos_historial;
CREATE POLICY "costos_delete" ON costos_historial FOR DELETE TO anon, authenticated USING (true);

-- tarifa_flete
DROP POLICY IF EXISTS "flete_select" ON tarifa_flete;
CREATE POLICY "flete_select" ON tarifa_flete FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "flete_insert" ON tarifa_flete;
CREATE POLICY "flete_insert" ON tarifa_flete FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "flete_update" ON tarifa_flete;
CREATE POLICY "flete_update" ON tarifa_flete FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "flete_delete" ON tarifa_flete;
CREATE POLICY "flete_delete" ON tarifa_flete FOR DELETE TO anon, authenticated USING (true);

-- clientes
DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "clientes_insert" ON clientes;
CREATE POLICY "clientes_insert" ON clientes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "clientes_update" ON clientes;
CREATE POLICY "clientes_update" ON clientes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_delete" ON clientes FOR DELETE TO anon, authenticated USING (true);

-- margenes_producto
DROP POLICY IF EXISTS "marg_prod_select" ON margenes_producto;
CREATE POLICY "marg_prod_select" ON margenes_producto FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "marg_prod_insert" ON margenes_producto;
CREATE POLICY "marg_prod_insert" ON margenes_producto FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "marg_prod_update" ON margenes_producto;
CREATE POLICY "marg_prod_update" ON margenes_producto FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "marg_prod_delete" ON margenes_producto;
CREATE POLICY "marg_prod_delete" ON margenes_producto FOR DELETE TO anon, authenticated USING (true);

-- margenes_cliente
DROP POLICY IF EXISTS "marg_cli_select" ON margenes_cliente;
CREATE POLICY "marg_cli_select" ON margenes_cliente FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "marg_cli_insert" ON margenes_cliente;
CREATE POLICY "marg_cli_insert" ON margenes_cliente FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "marg_cli_update" ON margenes_cliente;
CREATE POLICY "marg_cli_update" ON margenes_cliente FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "marg_cli_delete" ON margenes_cliente;
CREATE POLICY "marg_cli_delete" ON margenes_cliente FOR DELETE TO anon, authenticated USING (true);

-- cotizaciones
DROP POLICY IF EXISTS "cotiz_select" ON cotizaciones;
CREATE POLICY "cotiz_select" ON cotizaciones FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "cotiz_insert" ON cotizaciones;
CREATE POLICY "cotiz_insert" ON cotizaciones FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cotiz_update" ON cotizaciones;
CREATE POLICY "cotiz_update" ON cotizaciones FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cotiz_delete" ON cotizaciones;
CREATE POLICY "cotiz_delete" ON cotizaciones FOR DELETE TO anon, authenticated USING (true);

-- cotizacion_lineas
DROP POLICY IF EXISTS "lineas_select" ON cotizacion_lineas;
CREATE POLICY "lineas_select" ON cotizacion_lineas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "lineas_insert" ON cotizacion_lineas;
CREATE POLICY "lineas_insert" ON cotizacion_lineas FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "lineas_update" ON cotizacion_lineas;
CREATE POLICY "lineas_update" ON cotizacion_lineas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "lineas_delete" ON cotizacion_lineas;
CREATE POLICY "lineas_delete" ON cotizacion_lineas FOR DELETE TO anon, authenticated USING (true);

-- Grant RPC to anon
GRANT EXECUTE ON FUNCTION get_next_numero() TO anon, authenticated;

-- Allow cotizaciones.vendedor to be nullable
ALTER TABLE cotizaciones ALTER COLUMN vendedor DROP NOT NULL;
