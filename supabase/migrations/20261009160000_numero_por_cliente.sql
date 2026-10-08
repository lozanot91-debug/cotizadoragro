/*
  # Nombre de cotización: "Cliente - 001"

  Cada cliente tiene su propio correlativo (001, 002, ...). Se guarda en
  cotizaciones.numero_cliente y lo asigna la base al crear la cotización, así dos
  vendedores cotizando al mismo cliente a la vez nunca reciben el mismo número.

  - El número global (cotizaciones.numero) queda como identificador interno.
  - El contador vive en cotizacion_correlativos y nunca retrocede: si se borra la 003,
    la próxima es 004 (un PDF ya enviado nunca queda con el nombre de otra cotización).
  - La clave es el cliente_id; si la cotización no tiene cliente cargado, el nombre
    escrito (sin mayúsculas ni espacios de más).
  - Si al editar se cambia el cliente, la cotización toma el siguiente número del cliente nuevo.
*/

ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS numero_cliente integer;

CREATE TABLE IF NOT EXISTS public.cotizacion_correlativos (
  clave text PRIMARY KEY,
  ultimo integer NOT NULL DEFAULT 0
);
ALTER TABLE public.cotizacion_correlativos ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo la función de abajo (SECURITY DEFINER) la toca.
REVOKE ALL ON public.cotizacion_correlativos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.clave_correlativo(p_cliente_id uuid, p_cliente_nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_cliente_id IS NOT NULL THEN 'id:' || p_cliente_id::text
    ELSE 'nombre:' || lower(trim(regexp_replace(COALESCE(p_cliente_nombre, ''), '\s+', ' ', 'g')))
  END;
$$;

CREATE OR REPLACE FUNCTION public.asignar_numero_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clave text := public.clave_correlativo(NEW.cliente_id, NEW.cliente_nombre);
BEGIN
  IF TG_OP = 'UPDATE' AND v_clave = public.clave_correlativo(OLD.cliente_id, OLD.cliente_nombre) THEN
    NEW.numero_cliente := OLD.numero_cliente;   -- no se puede cambiar a mano
    RETURN NEW;
  END IF;

  INSERT INTO public.cotizacion_correlativos AS c (clave, ultimo) VALUES (v_clave, 1)
    ON CONFLICT (clave) DO UPDATE SET ultimo = c.ultimo + 1
    RETURNING ultimo INTO NEW.numero_cliente;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_numero_cliente() FROM PUBLIC, anon, authenticated;

-- Las que ya existen (antes de crear el trigger, que bloquea cambios a mano): numeradas por cliente en el orden en que se crearon.
WITH n AS (
  SELECT id, row_number() OVER (PARTITION BY public.clave_correlativo(cliente_id, cliente_nombre) ORDER BY numero, created_at) AS rn
  FROM public.cotizaciones
)
UPDATE public.cotizaciones c SET numero_cliente = n.rn FROM n
WHERE c.id = n.id AND c.numero_cliente IS NULL;

INSERT INTO public.cotizacion_correlativos (clave, ultimo)
SELECT public.clave_correlativo(cliente_id, cliente_nombre), max(numero_cliente)
FROM public.cotizaciones GROUP BY 1
ON CONFLICT (clave) DO UPDATE SET ultimo = GREATEST(public.cotizacion_correlativos.ultimo, EXCLUDED.ultimo);

CREATE TRIGGER cotizaciones_numero_cliente
  BEFORE INSERT OR UPDATE OF cliente_id, cliente_nombre, numero_cliente ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public.asignar_numero_cliente();

-- Páginas sin login: devuelven también el correlativo y el cliente.
CREATE OR REPLACE FUNCTION public.facturacion_publico_obtener(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  p public.pedidos_facturacion%ROWTYPE;
  c record;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN jsonb_build_object('estado', 'NoExiste'); END IF;
  SELECT * INTO p FROM public.pedidos_facturacion WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('estado', 'NoExiste'); END IF;
  IF p.estado = 'Cancelado' THEN RETURN jsonb_build_object('estado', 'Cancelado'); END IF;
  IF p.estado <> 'Facturado' AND now() > p.vence_el THEN RETURN jsonb_build_object('estado', 'Vencido'); END IF;

  SELECT numero, numero_cliente, cliente_nombre, fecha INTO c FROM public.cotizaciones WHERE id = p.cotizacion_id;

  RETURN jsonb_build_object(
    'estado', p.estado, 'numero', c.numero, 'numero_cliente', c.numero_cliente, 'cliente_nombre', c.cliente_nombre,
    'fecha_cotizacion', c.fecha, 'vence_el', p.vence_el,
    'nota_venta', p.nota_venta, 'observaciones', p.observaciones, 'cliente', p.cliente,
    'condiciones', p.condiciones, 'lineas', p.lineas, 'totales', p.totales, 'extra', p.extra,
    'creado_por', p.creado_por, 'enviado_at', p.enviado_at,
    'factura_numero', p.factura_numero, 'factura_fecha', p.factura_fecha,
    'facturado_por', p.facturado_por, 'facturado_at', p.facturado_at,
    'observacion', p.observacion, 'observado_por', p.observado_por, 'observado_at', p.observado_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.pedido_publico_obtener(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  p public.pedidos_precio%ROWTYPE;
  c record;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN jsonb_build_object('estado', 'NoExiste'); END IF;
  SELECT * INTO p FROM public.pedidos_precio WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('estado', 'NoExiste'); END IF;
  IF p.estado = 'Cancelado' THEN RETURN jsonb_build_object('estado', 'Cancelado'); END IF;
  IF now() > p.vence_el THEN RETURN jsonb_build_object('estado', 'Vencido'); END IF;

  SELECT numero, numero_cliente, cliente_nombre INTO c FROM public.cotizaciones WHERE id = p.cotizacion_id;

  RETURN jsonb_build_object(
    'estado', p.estado,
    'numero', c.numero,
    'numero_cliente', c.numero_cliente,
    'cliente', c.cliente_nombre,
    'vence_el', p.vence_el,
    'nota', p.nota,
    'respondido_por', p.respondido_por,
    'respondido_at', p.respondido_at,
    'nota_respuesta', p.nota_respuesta,
    'correccion_solicitada', p.correccion_solicitada,
    'lineas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id, 'cod', l.cod, 'producto', l.producto, 'unidad', l.unidad,
        'es_fertilizante', l.es_fertilizante, 'cantidad', l.cantidad,
        'costo_usd', l.costo_usd, 'proveedor', l.proveedor) ORDER BY l.orden), '[]'::jsonb)
        FROM public.pedidos_precio_lineas l WHERE l.pedido_id = p.id)
  );
END;
$function$;
