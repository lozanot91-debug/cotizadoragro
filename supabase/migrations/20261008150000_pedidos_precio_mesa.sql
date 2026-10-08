-- Pedidos de precio a la mesa de insumos.
-- Desde una cotización se genera un link con un código largo e imposible de adivinar. La mesa de insumos
-- lo abre SIN usuario ni contraseña, ve solo ese pedido (cliente, número y productos), carga los costos y
-- al guardar queda bloqueado. Para corregir, un usuario de la app lo vuelve a habilitar.
--
-- Seguridad: las tablas NO se pueden leer ni escribir con la clave pública (solo usuarios con sesión).
-- Lo único que se abre al público son 3 funciones que reciben el código y solo operan sobre ese pedido.

CREATE TABLE IF NOT EXISTS public.pedidos_precio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id uuid NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  estado text NOT NULL DEFAULT 'Abierto' CHECK (estado IN ('Abierto', 'Respondido', 'Cancelado')),
  vence_el timestamptz NOT NULL,
  auto_aplicar boolean NOT NULL DEFAULT false,
  nota text,
  creado_por text,
  respondido_por text,
  respondido_at timestamptz,
  nota_respuesta text,
  correccion_solicitada boolean NOT NULL DEFAULT false,
  correccion_mensaje text,
  aplicado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pedidos_precio_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_precio(id) ON DELETE CASCADE,
  orden integer NOT NULL DEFAULT 0,
  cod text NOT NULL,
  producto text NOT NULL,
  unidad text,
  es_fertilizante boolean NOT NULL DEFAULT false,
  cantidad numeric NOT NULL DEFAULT 0,
  costo_usd numeric,
  proveedor text
);

CREATE INDEX IF NOT EXISTS pedidos_precio_cotizacion_idx ON public.pedidos_precio (cotizacion_id);
CREATE INDEX IF NOT EXISTS pedidos_precio_estado_idx ON public.pedidos_precio (estado);
CREATE INDEX IF NOT EXISTS pedidos_precio_lineas_pedido_idx ON public.pedidos_precio_lineas (pedido_id);

ALTER TABLE public.pedidos_precio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_precio_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_todo ON public.pedidos_precio FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_todo ON public.pedidos_precio_lineas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Crear el pedido (solo usuarios con sesión). Devuelve el código del link.
CREATE OR REPLACE FUNCTION public.crear_pedido_precio(
  p_cotizacion_id uuid, p_dias integer, p_auto_aplicar boolean, p_nota text, p_creado_por text, p_lineas jsonb
) RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_token text;
BEGIN
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 60 THEN
    RAISE EXCEPTION 'Los días de vigencia del link tienen que estar entre 1 y 60';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'El pedido no tiene productos';
  END IF;

  -- Un pedido abierto anterior de la misma cotización deja de valer
  UPDATE public.pedidos_precio SET estado = 'Cancelado'
   WHERE cotizacion_id = p_cotizacion_id AND estado = 'Abierto';

  INSERT INTO public.pedidos_precio (cotizacion_id, vence_el, auto_aplicar, nota, creado_por)
  VALUES (p_cotizacion_id, now() + make_interval(days => p_dias), COALESCE(p_auto_aplicar, false),
          NULLIF(left(trim(COALESCE(p_nota, '')), 500), ''), left(p_creado_por, 100))
  RETURNING id, token INTO v_id, v_token;

  INSERT INTO public.pedidos_precio_lineas (pedido_id, orden, cod, producto, unidad, es_fertilizante, cantidad)
  SELECT v_id, (t.ord - 1)::integer, left(t.l->>'cod', 100), left(t.l->>'producto', 200), left(t.l->>'unidad', 30),
         COALESCE((t.l->>'es_fertilizante')::boolean, false), COALESCE((t.l->>'cantidad')::numeric, 0)
    FROM jsonb_array_elements(p_lineas) WITH ORDINALITY AS t(l, ord);

  RETURN v_token;
END;
$$;

-- Lo que ve la mesa de insumos al abrir el link
CREATE OR REPLACE FUNCTION public.pedido_publico_obtener(p_token text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.pedidos_precio%ROWTYPE;
  c record;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN jsonb_build_object('estado', 'NoExiste'); END IF;
  SELECT * INTO p FROM public.pedidos_precio WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('estado', 'NoExiste'); END IF;
  IF p.estado = 'Cancelado' THEN RETURN jsonb_build_object('estado', 'Cancelado'); END IF;
  IF now() > p.vence_el THEN RETURN jsonb_build_object('estado', 'Vencido'); END IF;

  SELECT numero, cliente_nombre INTO c FROM public.cotizaciones WHERE id = p.cotizacion_id;

  RETURN jsonb_build_object(
    'estado', p.estado,
    'numero', c.numero,
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
$$;

-- La mesa de insumos guarda los costos: todo o nada, y queda bloqueado
CREATE OR REPLACE FUNCTION public.pedido_publico_guardar(p_token text, p_nombre text, p_nota text, p_costos jsonb) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.pedidos_precio%ROWTYPE;
  n_lineas integer;
  n_ok integer;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RAISE EXCEPTION 'El link no es válido'; END IF;
  SELECT * INTO p FROM public.pedidos_precio WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El link no es válido'; END IF;
  IF p.estado = 'Cancelado' THEN RAISE EXCEPTION 'Este pedido fue cancelado'; END IF;
  IF now() > p.vence_el THEN RAISE EXCEPTION 'El link venció. Pedí uno nuevo'; END IF;
  IF p.estado <> 'Abierto' THEN RAISE EXCEPTION 'Este pedido ya está guardado y bloqueado'; END IF;
  IF length(trim(COALESCE(p_nombre, ''))) < 2 THEN RAISE EXCEPTION 'Poné tu nombre'; END IF;
  IF p_costos IS NULL OR jsonb_typeof(p_costos) <> 'array' THEN RAISE EXCEPTION 'Faltan los costos'; END IF;

  SELECT count(*) INTO n_lineas FROM public.pedidos_precio_lineas WHERE pedido_id = p.id;

  UPDATE public.pedidos_precio_lineas l
     SET costo_usd = (x->>'costo_usd')::numeric,
         proveedor = NULLIF(left(trim(COALESCE(x->>'proveedor', '')), 100), '')
    FROM jsonb_array_elements(p_costos) AS x
   WHERE l.pedido_id = p.id
     AND l.id = (x->>'id')::uuid
     AND (x->>'costo_usd')::numeric > 0
     AND (x->>'costo_usd')::numeric < 100000000;
  GET DIAGNOSTICS n_ok = ROW_COUNT;

  IF n_ok <> n_lineas THEN
    RAISE EXCEPTION 'Cargá un costo mayor a cero en todos los productos';
  END IF;

  UPDATE public.pedidos_precio
     SET estado = 'Respondido', respondido_por = left(trim(p_nombre), 100), respondido_at = now(),
         nota_respuesta = NULLIF(left(trim(COALESCE(p_nota, '')), 500), ''),
         correccion_solicitada = false, correccion_mensaje = NULL
   WHERE id = p.id;

  RETURN public.pedido_publico_obtener(p_token);
END;
$$;

-- La mesa de insumos pide permiso para corregir (un usuario de la app tiene que habilitarlo)
CREATE OR REPLACE FUNCTION public.pedido_publico_pedir_correccion(p_token text, p_mensaje text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.pedidos_precio%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RAISE EXCEPTION 'El link no es válido'; END IF;
  SELECT * INTO p FROM public.pedidos_precio WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El link no es válido'; END IF;
  IF p.estado <> 'Respondido' OR now() > p.vence_el THEN RAISE EXCEPTION 'No se puede pedir una corrección de este pedido'; END IF;
  IF length(trim(COALESCE(p_mensaje, ''))) < 3 THEN RAISE EXCEPTION 'Contanos qué hay que corregir'; END IF;

  UPDATE public.pedidos_precio
     SET correccion_solicitada = true, correccion_mensaje = left(trim(p_mensaje), 500)
   WHERE id = p.id;

  RETURN public.pedido_publico_obtener(p_token);
END;
$$;

-- Permisos: crear = solo con sesión; las 3 públicas = cualquiera con el código
REVOKE ALL ON FUNCTION public.crear_pedido_precio(uuid, integer, boolean, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_pedido_precio(uuid, integer, boolean, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.pedido_publico_obtener(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pedido_publico_guardar(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pedido_publico_pedir_correccion(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pedido_publico_obtener(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_publico_guardar(text, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pedido_publico_pedir_correccion(text, text) TO anon, authenticated;
