/*
  # Alertas de recompra y precio del grano del día

  - recompras_pospuestas: cuando alguien pospone o descarta el aviso de recompra de un cliente,
    no se le vuelve a avisar hasta la fecha "hasta". Una fila por cliente (clave = id o nombre).
  - precios_grano: precio del grano que pasa el acopio, uno por cultivo y día. Sirve para la
    relación insumo/grano (y su historia) y para precargar la calculadora de canje.
*/

CREATE TABLE IF NOT EXISTS public.recompras_pospuestas (
  clave text PRIMARY KEY CHECK (length(clave) BETWEEN 3 AND 300),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  hasta date NOT NULL,
  motivo text CHECK (motivo IS NULL OR length(motivo) <= 300),
  usuario_nombre text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recompras_pospuestas ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_todo ON public.recompras_pospuestas FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.recompras_pospuestas FROM anon;

CREATE TABLE IF NOT EXISTS public.precios_grano (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  cultivo text NOT NULL CHECK (length(trim(cultivo)) BETWEEN 1 AND 60),
  precio_usd numeric NOT NULL CHECK (precio_usd > 0 AND precio_usd < 100000),
  destino text CHECK (destino IS NULL OR length(destino) <= 120),
  usuario_nombre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS precios_grano_dia_cultivo ON public.precios_grano (fecha, lower(trim(cultivo)));
CREATE INDEX IF NOT EXISTS precios_grano_cultivo_fecha ON public.precios_grano (lower(trim(cultivo)), fecha DESC);
ALTER TABLE public.precios_grano ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_leer ON public.precios_grano FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_cargar ON public.precios_grano FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY auth_corregir ON public.precios_grano FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY admin_borra ON public.precios_grano FOR DELETE TO authenticated USING (es_admin());
REVOKE ALL ON public.precios_grano FROM anon;

-- Carga o corrige el precio de un cultivo para un día (uno por día y cultivo)
CREATE OR REPLACE FUNCTION public.cargar_precio_grano(p_fecha date, p_cultivo text, p_precio numeric, p_destino text, p_usuario text)
RETURNS public.precios_grano
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE r public.precios_grano;
BEGIN
  UPDATE public.precios_grano SET precio_usd = p_precio, destino = p_destino, usuario_nombre = p_usuario, updated_at = now()
   WHERE fecha = p_fecha AND lower(trim(cultivo)) = lower(trim(p_cultivo))
  RETURNING * INTO r;
  IF r.id IS NULL THEN
    INSERT INTO public.precios_grano (fecha, cultivo, precio_usd, destino, usuario_nombre)
    VALUES (p_fecha, trim(p_cultivo), p_precio, p_destino, p_usuario) RETURNING * INTO r;
  END IF;
  RETURN r;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cargar_precio_grano(date, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cargar_precio_grano(date, text, numeric, text, text) TO authenticated;
