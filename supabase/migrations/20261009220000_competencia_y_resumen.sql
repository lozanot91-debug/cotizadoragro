/*
  # Precios de la competencia y resumen semanal

  - precios_competencia: cuánto ofreció otro y quién, por producto. Se carga al perder por precio o
    competencia (toda la cotización o líneas de una ganada parcial) o a mano desde la pantalla Competencia.
    nuestro_precio_usd: nuestro precio final (con flete, sin IVA) en la misma unidad, para comparar.
  - Resumen semanal: los lunes 8:00 (Argentina) la tarea programada llama a la edge function
    `resumen-semanal`, que manda la notificación a todos los que tienen los avisos activados.
    Usa el mismo secreto de los avisos push (Vault 'push_webhook_secreto').
*/

CREATE TABLE IF NOT EXISTS public.precios_competencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  cotizacion_id uuid REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre text CHECK (cliente_nombre IS NULL OR length(cliente_nombre) <= 200),
  cod text CHECK (cod IS NULL OR length(cod) <= 100),
  producto text NOT NULL CHECK (length(trim(producto)) BETWEEN 1 AND 200),
  unidad text CHECK (unidad IS NULL OR length(unidad) <= 20),
  competidor text NOT NULL CHECK (length(trim(competidor)) BETWEEN 1 AND 120),
  precio_usd numeric NOT NULL CHECK (precio_usd > 0 AND precio_usd < 10000000),
  nuestro_precio_usd numeric CHECK (nuestro_precio_usd IS NULL OR nuestro_precio_usd > 0),
  origen text NOT NULL DEFAULT 'manual' CHECK (origen IN ('perdida', 'ganada_parcial', 'manual')),
  notas text CHECK (notas IS NULL OR length(notas) <= 500),
  usuario_id uuid DEFAULT auth.uid(),
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS precios_competencia_cod ON public.precios_competencia (cod, fecha DESC);
CREATE INDEX IF NOT EXISTS precios_competencia_fecha ON public.precios_competencia (fecha DESC);
ALTER TABLE public.precios_competencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_leer ON public.precios_competencia FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_cargar ON public.precios_competencia FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY autor_o_admin_borra ON public.precios_competencia FOR DELETE TO authenticated USING (usuario_id = auth.uid() OR es_admin());
REVOKE ALL ON public.precios_competencia FROM anon;

CREATE OR REPLACE FUNCTION public.resumen_semanal_disparar()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT net.http_post(
    url := 'https://aiquozcrtgzavlckdsea.supabase.co/functions/v1/resumen-semanal',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-webhook-secreto', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secreto' LIMIT 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;
REVOKE EXECUTE ON FUNCTION public.resumen_semanal_disparar() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('resumen-semanal', '0 11 * * 1', $$SELECT public.resumen_semanal_disparar()$$);
