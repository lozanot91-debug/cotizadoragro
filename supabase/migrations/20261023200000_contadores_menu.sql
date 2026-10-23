/*
# Contadores del menú en una sola consulta

## Problema
Cada vez que se cambiaba de pantalla la app hacía 5 consultas separadas para los numeritos del menú
(tareas, cotizaciones por vencer, cobros, pedidos a mesa, facturación), y la de cotizaciones bajaba
hasta 1000 filas para contarlas en el navegador.

## Cambios (todo aditivo)
- public.contadores_menu(p_hoy date): devuelve un json con los 5 contadores, con el mismo criterio que usaba la app.
  Corre con los permisos de quien llama (SECURITY INVOKER), así que respeta las mismas reglas de acceso que antes.
*/

CREATE OR REPLACE FUNCTION public.contadores_menu(p_hoy date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tareas', (SELECT count(*) FROM public.tareas
               WHERE estado = 'Pendiente' AND fecha_vencimiento <= p_hoy),
    'vencimientos', (SELECT count(*) FROM public.cotizaciones
               WHERE estado IN ('Borrador', 'Enviada', 'En negociación')
                 AND (fecha + COALESCE(vigencia_dias, 0)) - p_hoy <= 3),
    'cobros', (SELECT count(*) FROM public.cobranzas
               WHERE estado = 'Pendiente' AND vencimiento <= p_hoy),
    'pedidos', (SELECT count(*) FROM public.pedidos_precio
               WHERE estado = 'Respondido' AND (aplicado_at IS NULL OR correccion_solicitada = true)),
    'facturas', (SELECT count(*) FROM public.pedidos_facturacion
               WHERE estado = 'Observado')
  );
$$;

GRANT EXECUTE ON FUNCTION public.contadores_menu(date) TO authenticated;
