/*
  # Calculadora de canje

  Misma cuenta que la planilla CANJES_EDG: precio neto por tn (pago de liquidación, IVA del grano,
  comisión, flete, almacenaje, sellos y retenciones elegibles) y toneladas = total con IVA / neto.

  - cotizaciones.canje_params: parámetros de la liquidación con los que se calculó el canje.
    NULL = cotización anterior a esta cuenta (toneladas = total / precio, como antes).
  - canjes: historial de cálculos guardados desde la calculadora (por cliente, opcionalmente
    vinculados a una cotización). Son una foto: no se editan; los borra su autor o un admin.
  - configuracion 'canje_parametros': valores por defecto (JSON), los edita el admin.
*/

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS canje_params jsonb
    CHECK (canje_params IS NULL OR jsonb_typeof(canje_params) = 'object');

CREATE TABLE IF NOT EXISTS public.canjes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nombre text CHECK (cliente_nombre IS NULL OR length(cliente_nombre) <= 200),
  cotizacion_id uuid REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  cultivo text NOT NULL CHECK (length(trim(cultivo)) BETWEEN 1 AND 60),
  precio_usd numeric NOT NULL CHECK (precio_usd > 0),
  params jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object'),
  neto_usd numeric NOT NULL CHECK (neto_usd > 0),
  -- Total de insumos CON IVA que se paga con grano
  monto_usd numeric NOT NULL CHECK (monto_usd >= 0),
  -- Solo informativo: alícuota con que se pasó a "con IVA" un monto cargado sin IVA (NULL = vino con IVA)
  iva_insumos_pct numeric CHECK (iva_insumos_pct IS NULL OR iva_insumos_pct >= 0),
  tn numeric NOT NULL CHECK (tn >= 0),
  tc_compra numeric CHECK (tc_compra IS NULL OR tc_compra > 0),
  notas text CHECK (notas IS NULL OR length(notas) <= 1000),
  autor_id uuid DEFAULT auth.uid(),
  autor_nombre text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canjes_cliente_idx ON public.canjes (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS canjes_fecha_idx ON public.canjes (created_at DESC);
CREATE INDEX IF NOT EXISTS canjes_cotizacion_idx ON public.canjes (cotizacion_id);

-- El autor lo pone la base
CREATE OR REPLACE FUNCTION public.canjes_autor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.autor_id := auth.uid();
  SELECT COALESCE(NULLIF(trim(nombre), ''), split_part(email, '@', 1)) INTO NEW.autor_nombre
    FROM public.usuarios WHERE id = auth.uid();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.canjes_autor() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER canjes_autor BEFORE INSERT ON public.canjes FOR EACH ROW EXECUTE FUNCTION public.canjes_autor();

ALTER TABLE public.canjes ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_leer ON public.canjes FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_insertar ON public.canjes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY autor_o_admin_borra ON public.canjes FOR DELETE TO authenticated USING (autor_id = auth.uid() OR es_admin());
REVOKE ALL ON public.canjes FROM anon;

INSERT INTO public.configuracion (clave, valor) VALUES (
  'canje_parametros',
  '{"destino":"Necochea, condiciones cámara","pago_pct":98.5,"iva_grano_pct":10.5,"comision_pct":2.5,"iva_comision_pct":10.5,"flete_usd_tn":0,"iva_flete_pct":21,"almacenaje_usd_tn_dia":0,"almacenaje_dias":0,"sellos_pct":0.6,"ret_iibb":true,"ret_iibb_pct":1,"ret_iva":false,"ret_iva_pct":0,"ret_ganancias":false,"ret_ganancias_pct":0}'
) ON CONFLICT (clave) DO NOTHING;
