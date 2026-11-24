/*
# Insumos propios (cargados a mano, fuera de la lista de precios)

## Problema
Un insumo que no viene en la lista de costos solo se podía agregar a mano dentro de una cotización y no quedaba guardado.

## Cambios (todo aditivo)
- productos.propio (boolean, por defecto false): marca los insumos dados de alta a mano. No tienen costo cargado:
  el costo se escribe en cada cotización. Las cargas de lista no los tocan.
- crear_insumo_propio(...): da de alta el insumo con código automático PROP-0001, PROP-0002... Solo admin (lo controla la política de productos).
*/

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS propio boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.crear_insumo_propio(p_producto text, p_proveedor text, p_familia text, p_unid text)
RETURNS public.productos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_n integer;
  v_res public.productos;
BEGIN
  IF p_producto IS NULL OR btrim(p_producto) = '' THEN
    RAISE EXCEPTION 'El insumo necesita un nombre';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('crear_insumo_propio'));
  SELECT COALESCE(MAX(substring(cod FROM '^PROP-([0-9]+)$')::integer), 0) + 1 INTO v_n FROM public.productos WHERE cod ~ '^PROP-[0-9]+$';
  INSERT INTO public.productos (cod, proveedor, familia, producto, unid, propio)
  VALUES ('PROP-' || lpad(v_n::text, 4, '0'), NULLIF(btrim(p_proveedor), ''), NULLIF(btrim(p_familia), ''), btrim(p_producto), NULLIF(btrim(p_unid), ''), true)
  RETURNING * INTO v_res;
  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_insumo_propio(text, text, text, text) TO authenticated;
