/*
  # Notificaciones push: aviso cuando la mesa carga precios

  1. `push_suscripciones`: un registro por dispositivo donde el usuario activó los avisos.
     Cada usuario ve y maneja solo los suyos.
  2. Las claves VAPID y el secreto del webhook están en Vault (no en esta migración):
     push_vapid_publica, push_vapid_privada, push_webhook_secreto.
     `push_config()` los entrega solo a la service role (la usa la edge function enviar-push).
  3. Trigger en `pedidos_precio`: cuando la mesa guarda los costos (pasa a Respondido) o pide una
     corrección, llama por pg_net a la edge function `enviar-push`, que avisa al vendedor de la
     cotización y a los admins.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Suscripciones ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_suscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.usuarios(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 10 AND 1000),
  p256dh text NOT NULL CHECK (length(p256dh) <= 200),
  auth text NOT NULL CHECK (length(auth) <= 100),
  dispositivo text CHECK (length(dispositivo) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_suscripciones_usuario_idx ON public.push_suscripciones (usuario_id);

ALTER TABLE public.push_suscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY propias_ver ON public.push_suscripciones FOR SELECT TO authenticated USING (usuario_id = auth.uid());
CREATE POLICY propias_alta ON public.push_suscripciones FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());
CREATE POLICY propias_cambio ON public.push_suscripciones FOR UPDATE TO authenticated USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());
CREATE POLICY propias_baja ON public.push_suscripciones FOR DELETE TO authenticated USING (usuario_id = auth.uid());
REVOKE ALL ON public.push_suscripciones FROM anon;

-- Si el mismo navegador ya estaba registrado por otro usuario (se cambió de usuario en el celular),
-- pasa a ser del usuario actual. SECURITY DEFINER porque la fila vieja no es visible para quien llama.
CREATE OR REPLACE FUNCTION public.registrar_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Hace falta iniciar sesión'; END IF;
  IF p_endpoint IS NULL OR p_endpoint !~ '^https://' THEN RAISE EXCEPTION 'Suscripción inválida'; END IF;
  INSERT INTO push_suscripciones (usuario_id, endpoint, p256dh, auth, dispositivo)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET usuario_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        dispositivo = EXCLUDED.dispositivo, created_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.registrar_push(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_push(text, text, text, text) TO authenticated;

-- 2. Configuración para la edge function (solo service role) -------------------------------------
CREATE OR REPLACE FUNCTION public.push_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_object_agg(name, decrypted_secret)
    FROM vault.decrypted_secrets
   WHERE name IN ('push_vapid_publica', 'push_vapid_privada', 'push_webhook_secreto');
$$;
REVOKE EXECUTE ON FUNCTION public.push_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_config() TO service_role;

-- 3. Trigger: avisar cuando responde la mesa -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avisar_pedido_precio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_secreto text;
BEGIN
  IF NEW.estado = 'Respondido' AND OLD.estado IS DISTINCT FROM 'Respondido' THEN
    v_tipo := 'respondido';
  ELSIF NEW.correccion_solicitada AND NOT COALESCE(OLD.correccion_solicitada, false) THEN
    v_tipo := 'correccion';
  ELSE
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_secreto FROM vault.decrypted_secrets WHERE name = 'push_webhook_secreto';
  IF v_secreto IS NULL THEN RETURN NEW; END IF;

  -- pg_net es asíncrono: si la función falla, el guardado de la mesa no se entera ni se frena
  PERFORM net.http_post(
    url := 'https://aiquozcrtgzavlckdsea.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secreto', v_secreto),
    body := jsonb_build_object('pedido_id', NEW.id, 'tipo', v_tipo),
    timeout_milliseconds := 15000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'avisar_pedido_precio: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.avisar_pedido_precio() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER pedidos_precio_avisar
  AFTER UPDATE OF estado, correccion_solicitada ON public.pedidos_precio
  FOR EACH ROW EXECUTE FUNCTION public.avisar_pedido_precio();
