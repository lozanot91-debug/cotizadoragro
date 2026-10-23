/*
# Índices para consultas frecuentes

## Problema
Varias consultas filtran u ordenan por columnas sin índice. Con pocos datos no se nota, pero a medida que
crezcan las tablas se van a poner lentas.

## Cambios (todo aditivo, solo índices)
- clientes(nombre): el listado de clientes siempre va ordenado por nombre.
- costos_historial(lista_id, producto_id): al abrir una lista se piden sus costos ordenados por producto.
- cotizaciones(cliente_id, fecha): historial de cotizaciones de un cliente ordenado por fecha.
- cotizacion_lineas(cotizacion_id) solo donde costo_editado: buscar cotizaciones con costo editado a mano.
- historial_cambios(tipo, created_at): estadísticas de cambios de estado desde una fecha.
*/

CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON public.clientes (nombre);
CREATE INDEX IF NOT EXISTS idx_costos_lista_producto ON public.costos_historial (lista_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_cotiz_cliente_fecha ON public.cotizaciones (cliente_id, fecha);
CREATE INDEX IF NOT EXISTS idx_lineas_costo_editado ON public.cotizacion_lineas (cotizacion_id) WHERE costo_editado = true;
CREATE INDEX IF NOT EXISTS idx_historial_tipo_fecha ON public.historial_cambios (tipo, created_at);
