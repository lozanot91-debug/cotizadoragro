/*
  # Pedidos de facturación

  Cuando el cliente acepta (todo o parte de una cotización Ganada) se arma un pedido para quien factura.
  Se factura una sola vez por cotización. El pedido guarda una foto de los datos (cliente, líneas con
  cantidad, costo, precio, margen, flete e IVA, condiciones de pago y totales).

  Quien factura lo abre con un link SIN usuario ni contraseña (?facturar=<código de 64>), ve el detalle,
  baja Excel/PDF y lo marca Facturado (número y fecha de factura) u Observado (con un comentario).
  Si se observa, el vendedor lo corrige y lo reenvía (mismo link). Facturado queda bloqueado.

  Seguridad (igual que pedidos_precio): la tabla solo con sesión; el público entra solo por 3 funciones
  SECURITY DEFINER que reciben el código y operan sobre ese pedido.
*/

CREATE TABLE IF NOT EXISTS public.pedidos_facturacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id uuid NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  estado text NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Facturado', 'Observado', 'Cancelado')),
  vence_el timestamptz NOT NULL,
  nota_venta text CHECK (length(nota_venta) <= 40),
  observaciones text CHECK (length(observaciones) <= 1000),
  cliente jsonb NOT NULL,
  condiciones jsonb NOT NULL,
  lineas jsonb NOT NULL,
  totales jsonb NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_por text,
  creado_por_id uuid,
  enviado_at timestamptz NOT NULL DEFAULT now(),
  factura_numero text,
  factura_fecha date,
  facturado_por text,
  facturado_at timestamptz,
  observacion text,
  observado_por text,
  observado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Una sola vez por cotización (los cancelados no cuentan)
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_facturacion_uno_por_cotizacion
  ON public.pedidos_facturacion (cotizacion_id) WHERE estado <> 'Cancelado';
CREATE INDEX IF NOT EXISTS pedidos_facturacion_estado_idx ON public.pedidos_facturacion (estado);

ALTER TABLE public.pedidos_facturacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_todo ON public.pedidos_facturacion FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.pedidos_facturacion FROM anon;

-- Lo facturado no se toca; updated_at al día
CREATE OR REPLACE FUNCTION public.pedidos_facturacion_proteger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.estado = 'Facturado' THEN
    RAISE EXCEPTION 'Este pedido ya está facturado y no se puede cambiar';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER pedidos_facturacion_proteger
  BEFORE UPDATE ON public.pedidos_facturacion
  FOR EACH ROW EXECUTE FUNCTION public.pedidos_facturacion_proteger();

-- Enviar (o reenviar después de una observación). Solo usuarios con sesión. Devuelve el código del link.
CREATE OR REPLACE FUNCTION public.enviar_a_facturar(p_cotizacion_id uuid, p_dias integer, p_datos jsonb)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado_cot text;
  v_prev public.pedidos_facturacion%ROWTYPE;
  v_token text;
BEGIN
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 60 THEN
    RAISE EXCEPTION 'Los días de vigencia del link tienen que estar entre 1 y 60';
  END IF;
  SELECT estado INTO v_estado_cot FROM public.cotizaciones WHERE id = p_cotizacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La cotización no existe'; END IF;
  IF v_estado_cot <> 'Ganada' THEN RAISE EXCEPTION 'Solo se envían a facturar cotizaciones ganadas'; END IF;
  IF p_datos IS NULL
     OR jsonb_typeof(p_datos->'lineas') <> 'array' OR jsonb_array_length(p_datos->'lineas') = 0
     OR jsonb_array_length(p_datos->'lineas') > 300 THEN
    RAISE EXCEPTION 'El pedido no tiene productos';
  END IF;
  IF jsonb_typeof(p_datos->'condiciones') <> 'array' OR jsonb_array_length(p_datos->'condiciones') = 0
     OR jsonb_array_length(p_datos->'condiciones') > 10 THEN
    RAISE EXCEPTION 'Falta la condición de pago';
  END IF;
  IF jsonb_typeof(p_datos->'cliente') <> 'object' OR jsonb_typeof(p_datos->'totales') <> 'object' THEN
    RAISE EXCEPTION 'Faltan datos del pedido';
  END IF;
  IF length(p_datos::text) > 200000 THEN RAISE EXCEPTION 'El pedido es demasiado grande'; END IF;

  SELECT * INTO v_prev FROM public.pedidos_facturacion
   WHERE cotizacion_id = p_cotizacion_id AND estado <> 'Cancelado' FOR UPDATE;

  IF FOUND THEN
    IF v_prev.estado = 'Facturado' THEN RAISE EXCEPTION 'Esta cotización ya está facturada'; END IF;
    UPDATE public.pedidos_facturacion SET
      estado = 'Pendiente', vence_el = now() + make_interval(days => p_dias),
      nota_venta = NULLIF(left(trim(COALESCE(p_datos->>'nota_venta', '')), 40), ''),
      observaciones = NULLIF(left(trim(COALESCE(p_datos->>'observaciones', '')), 1000), ''),
      cliente = p_datos->'cliente', condiciones = p_datos->'condiciones', lineas = p_datos->'lineas',
      totales = p_datos->'totales', extra = COALESCE(p_datos->'extra', '{}'::jsonb),
      creado_por = left(p_datos->>'creado_por', 100), creado_por_id = auth.uid(), enviado_at = now(),
      observacion = NULL, observado_por = NULL, observado_at = NULL
    WHERE id = v_prev.id
    RETURNING token INTO v_token;
  ELSE
    INSERT INTO public.pedidos_facturacion
      (cotizacion_id, vence_el, nota_venta, observaciones, cliente, condiciones, lineas, totales, extra, creado_por, creado_por_id)
    VALUES (
      p_cotizacion_id, now() + make_interval(days => p_dias),
      NULLIF(left(trim(COALESCE(p_datos->>'nota_venta', '')), 40), ''),
      NULLIF(left(trim(COALESCE(p_datos->>'observaciones', '')), 1000), ''),
      p_datos->'cliente', p_datos->'condiciones', p_datos->'lineas', p_datos->'totales',
      COALESCE(p_datos->'extra', '{}'::jsonb), left(p_datos->>'creado_por', 100), auth.uid())
    RETURNING token INTO v_token;
  END IF;
  RETURN v_token;
END;
$$;

-- Lo que ve quien factura
CREATE OR REPLACE FUNCTION public.facturacion_publico_obtener(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.pedidos_facturacion%ROWTYPE;
  c record;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RETURN jsonb_build_object('estado', 'NoExiste'); END IF;
  SELECT * INTO p FROM public.pedidos_facturacion WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('estado', 'NoExiste'); END IF;
  IF p.estado = 'Cancelado' THEN RETURN jsonb_build_object('estado', 'Cancelado'); END IF;
  -- Lo facturado se puede seguir consultando; lo pendiente vence
  IF p.estado <> 'Facturado' AND now() > p.vence_el THEN RETURN jsonb_build_object('estado', 'Vencido'); END IF;

  SELECT numero, fecha INTO c FROM public.cotizaciones WHERE id = p.cotizacion_id;

  RETURN jsonb_build_object(
    'estado', p.estado, 'numero', c.numero, 'fecha_cotizacion', c.fecha, 'vence_el', p.vence_el,
    'nota_venta', p.nota_venta, 'observaciones', p.observaciones, 'cliente', p.cliente,
    'condiciones', p.condiciones, 'lineas', p.lineas, 'totales', p.totales, 'extra', p.extra,
    'creado_por', p.creado_por, 'enviado_at', p.enviado_at,
    'factura_numero', p.factura_numero, 'factura_fecha', p.factura_fecha,
    'facturado_por', p.facturado_por, 'facturado_at', p.facturado_at,
    'observacion', p.observacion, 'observado_por', p.observado_por, 'observado_at', p.observado_at
  );
END;
$$;

-- Marcar facturado: queda bloqueado
CREATE OR REPLACE FUNCTION public.facturacion_publico_facturar(p_token text, p_nombre text, p_numero text, p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.pedidos_facturacion%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RAISE EXCEPTION 'El link no es válido'; END IF;
  SELECT * INTO p FROM public.pedidos_facturacion WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El link no es válido'; END IF;
  IF p.estado = 'Cancelado' THEN RAISE EXCEPTION 'Este pedido fue cancelado'; END IF;
  IF p.estado = 'Facturado' THEN RAISE EXCEPTION 'Este pedido ya está facturado'; END IF;
  IF p.estado = 'Observado' THEN RAISE EXCEPTION 'El pedido está observado: esperá a que el vendedor lo corrija y lo reenvíe'; END IF;
  IF now() > p.vence_el THEN RAISE EXCEPTION 'El link venció. Pedile uno nuevo al vendedor'; END IF;
  IF length(trim(COALESCE(p_nombre, ''))) < 2 THEN RAISE EXCEPTION 'Poné tu nombre'; END IF;
  IF length(trim(COALESCE(p_numero, ''))) < 1 OR length(trim(p_numero)) > 40 THEN RAISE EXCEPTION 'Poné el número de factura'; END IF;
  IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
     OR p_fecha < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 365 THEN
    RAISE EXCEPTION 'Revisá la fecha de la factura';
  END IF;

  UPDATE public.pedidos_facturacion
     SET estado = 'Facturado', factura_numero = trim(p_numero), factura_fecha = p_fecha,
         facturado_por = left(trim(p_nombre), 100), facturado_at = now()
   WHERE id = p.id;

  RETURN public.facturacion_publico_obtener(p_token);
END;
$$;

-- Observar: vuelve al vendedor con un comentario
CREATE OR REPLACE FUNCTION public.facturacion_publico_observar(p_token text, p_nombre text, p_mensaje text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  p public.pedidos_facturacion%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) <> 64 THEN RAISE EXCEPTION 'El link no es válido'; END IF;
  SELECT * INTO p FROM public.pedidos_facturacion WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El link no es válido'; END IF;
  IF p.estado <> 'Pendiente' THEN RAISE EXCEPTION 'Solo se puede observar un pedido pendiente'; END IF;
  IF now() > p.vence_el THEN RAISE EXCEPTION 'El link venció. Pedile uno nuevo al vendedor'; END IF;
  IF length(trim(COALESCE(p_nombre, ''))) < 2 THEN RAISE EXCEPTION 'Poné tu nombre'; END IF;
  IF length(trim(COALESCE(p_mensaje, ''))) < 3 THEN RAISE EXCEPTION 'Contá qué hay que corregir'; END IF;

  UPDATE public.pedidos_facturacion
     SET estado = 'Observado', observacion = left(trim(p_mensaje), 500),
         observado_por = left(trim(p_nombre), 100), observado_at = now()
   WHERE id = p.id;

  RETURN public.facturacion_publico_obtener(p_token);
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_a_facturar(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_a_facturar(uuid, integer, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.facturacion_publico_obtener(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.facturacion_publico_facturar(text, text, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.facturacion_publico_observar(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.facturacion_publico_obtener(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.facturacion_publico_facturar(text, text, text, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.facturacion_publico_observar(text, text, text) TO anon, authenticated;

-- Aviso push al vendedor y a los admins cuando se factura u observa
CREATE OR REPLACE FUNCTION public.avisar_facturacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_secreto text;
BEGIN
  IF NEW.estado = OLD.estado THEN RETURN NEW; END IF;
  IF NEW.estado = 'Facturado' THEN v_tipo := 'facturado';
  ELSIF NEW.estado = 'Observado' THEN v_tipo := 'observado';
  ELSE RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secreto FROM vault.decrypted_secrets WHERE name = 'push_webhook_secreto';
  IF v_secreto IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://aiquozcrtgzavlckdsea.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secreto', v_secreto),
    body := jsonb_build_object('facturacion_id', NEW.id, 'tipo', v_tipo),
    timeout_milliseconds := 15000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'avisar_facturacion: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.avisar_facturacion() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER pedidos_facturacion_avisar
  AFTER UPDATE OF estado ON public.pedidos_facturacion
  FOR EACH ROW EXECUTE FUNCTION public.avisar_facturacion();
