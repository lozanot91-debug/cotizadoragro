/*
  # Precios pizarra automáticos

  pizarras_granos: precios de Cámara por día, plaza y cultivo, leídos de la Bolsa de Cereales y Productos
  de Bahía Blanca por la edge function `pizarra-granos`. Los lee cualquier usuario; los escribe solo la función.
  Rosario cotiza en pesos: precio_ars y precio_usd al comprador BNA del día (NULL si no hay TC de ese día).

  Tarea programada (pg_cron): días hábiles 13:00 y 18:00 (Argentina) llama a la función con un secreto
  guardado en Vault ('pizarra_secreto'); pizarra_secreto() lo lee solo el service role.
  precios_grano (carga a mano) queda para correcciones puntuales.
*/

CREATE TABLE IF NOT EXISTS public.pizarras_granos (
  fecha date NOT NULL,
  plaza text NOT NULL CHECK (plaza IN ('Quequén', 'Bahía Blanca', 'Rosario', 'Dársena')),
  cultivo text NOT NULL CHECK (length(cultivo) BETWEEN 1 AND 40),
  precio_usd numeric CHECK (precio_usd IS NULL OR precio_usd > 0),
  precio_ars numeric CHECK (precio_ars IS NULL OR precio_ars > 0),
  fuente text NOT NULL DEFAULT 'Bolsa de Cereales y Productos de Bahía Blanca',
  obtenido_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, plaza, cultivo)
);
CREATE INDEX IF NOT EXISTS pizarras_granos_plaza_cultivo ON public.pizarras_granos (plaza, cultivo, fecha DESC);
ALTER TABLE public.pizarras_granos ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_leer ON public.pizarras_granos FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.pizarras_granos FROM anon;

-- Secreto de la tarea programada (el valor real se carga aparte, no en el repo)
CREATE OR REPLACE FUNCTION public.pizarra_secreto()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pizarra_secreto' LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.pizarra_secreto() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pizarra_secreto() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Llama a la edge function con el secreto (lo usa la tarea programada)
CREATE OR REPLACE FUNCTION public.pizarra_disparar(p_accion text DEFAULT 'actualizar', p_dias int DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT net.http_post(
    url := 'https://aiquozcrtgzavlckdsea.supabase.co/functions/v1/pizarra-granos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-pizarra-secreto', public.pizarra_secreto()),
    body := jsonb_build_object('accion', p_accion, 'dias', p_dias),
    timeout_milliseconds := 120000
  );
$$;
REVOKE EXECUTE ON FUNCTION public.pizarra_disparar(text, int) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('pizarra-granos-13', '0 16 * * 1-5', $$SELECT public.pizarra_disparar('actualizar')$$);
SELECT cron.schedule('pizarra-granos-18', '0 21 * * 1-5', $$SELECT public.pizarra_disparar('actualizar')$$);
