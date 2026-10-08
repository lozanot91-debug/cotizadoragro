/*
  # Convenios de flete: varias planillas de tarifa independientes

  Antes había una sola tarifa (`tarifa_flete`) y cargar una planilla pisaba la anterior.
  Ahora cada planilla es un convenio con su número (ej. 625) y una descripción
  (ej. "Autodescargable entre 8 y 12 tn"). Cargar la planilla de un convenio reemplaza solo
  las tarifas de ese convenio.

  - convenios_flete: numero (único), descripcion, predeterminado (uno solo), actualizado_at y
    tarifas (jsonb [{km, tarifa}], ordenado por km; misma unidad que antes: × 10 = $/tn).
    Las tarifas van en la misma fila para que reemplazar una planilla sea un solo UPDATE.
  - La tarifa que ya estaba cargada pasa a un convenio predeterminado (número 0, para editar).
  - cotizaciones.convenio_flete_id: convenio con el que se calculó el flete (NULL = predeterminado).
  - cargar_tarifa_convenio(convenio, filas) y predeterminar_convenio(convenio): solo admin.
  - `tarifa_flete` y `tarifas_convenio` quedan sin uso (no se borran para no hacer un DROP).

  Se aplicó en tres pasos (convenios_flete_tablas, convenios_flete_planilla_jsonb); acá va todo junto.
*/

CREATE TABLE IF NOT EXISTS public.convenios_flete (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL UNIQUE CHECK (numero >= 0),
  descripcion text NOT NULL CHECK (length(trim(descripcion)) BETWEEN 1 AND 200),
  predeterminado boolean NOT NULL DEFAULT false,
  actualizado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS convenios_flete_un_predeterminado ON public.convenios_flete (predeterminado) WHERE predeterminado;

-- Primera versión (por fila); quedó sin uso al pasar las tarifas a jsonb
CREATE TABLE IF NOT EXISTS public.tarifas_convenio (
  convenio_id uuid NOT NULL REFERENCES public.convenios_flete(id) ON DELETE CASCADE,
  km integer NOT NULL CHECK (km > 0),
  tarifa numeric NOT NULL CHECK (tarifa > 0),
  PRIMARY KEY (convenio_id, km)
);

ALTER TABLE public.convenios_flete ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifas_convenio ENABLE ROW LEVEL SECURITY;
CREATE POLICY auth_leer ON public.convenios_flete FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_escribe ON public.convenios_flete FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY auth_leer ON public.tarifas_convenio FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_escribe ON public.tarifas_convenio FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());

ALTER TABLE public.cotizaciones ADD COLUMN IF NOT EXISTS convenio_flete_id uuid REFERENCES public.convenios_flete(id) ON DELETE SET NULL;

INSERT INTO convenios_flete (numero, descripcion, predeterminado, actualizado_at)
SELECT 0, 'Tarifa que estaba cargada (poné el número y la descripción del convenio)', true, now()
 WHERE NOT EXISTS (SELECT 1 FROM convenios_flete) AND EXISTS (SELECT 1 FROM tarifa_flete);

INSERT INTO tarifas_convenio (convenio_id, km, tarifa)
SELECT c.id, t.km, t.tarifa FROM tarifa_flete t CROSS JOIN convenios_flete c
 WHERE c.numero = 0 AND t.km > 0 AND t.tarifa > 0
ON CONFLICT DO NOTHING;

-- Tarifas en la fila del convenio
ALTER TABLE public.convenios_flete ADD COLUMN IF NOT EXISTS tarifas jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE convenios_flete c
   SET tarifas = coalesce((SELECT jsonb_agg(jsonb_build_object('km', t.km, 'tarifa', t.tarifa) ORDER BY t.km)
                             FROM tarifas_convenio t WHERE t.convenio_id = c.id), '[]'::jsonb)
 WHERE c.tarifas = '[]'::jsonb;

COMMENT ON TABLE public.tarifas_convenio IS 'Sin uso: las tarifas de cada convenio están en convenios_flete.tarifas.';

CREATE OR REPLACE FUNCTION public.cargar_tarifa_convenio(p_convenio_id uuid, p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  IF NOT es_admin() THEN RAISE EXCEPTION 'Solo el administrador carga tarifas'; END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'La planilla no tiene filas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_filas) f
     WHERE (f->>'km') IS NULL OR (f->>'tarifa') IS NULL
        OR (f->>'km')::numeric <= 0 OR (f->>'tarifa')::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'Hay filas de tarifa con km o valor inválido';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_filas) f GROUP BY (f->>'km')::int HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay kilómetros repetidos en la planilla';
  END IF;

  UPDATE convenios_flete
     SET tarifas = (SELECT jsonb_agg(jsonb_build_object('km', (f->>'km')::int, 'tarifa', (f->>'tarifa')::numeric) ORDER BY (f->>'km')::int)
                      FROM jsonb_array_elements(p_filas) f),
         actualizado_at = now()
   WHERE id = p_convenio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El convenio no existe'; END IF;

  v_n := jsonb_array_length(p_filas);
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.predeterminar_convenio(p_convenio_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT es_admin() THEN RAISE EXCEPTION 'Solo el administrador cambia el convenio predeterminado'; END IF;
  UPDATE convenios_flete SET predeterminado = false WHERE predeterminado AND id <> p_convenio_id;
  UPDATE convenios_flete SET predeterminado = true WHERE id = p_convenio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El convenio no existe'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cargar_tarifa_convenio(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.predeterminar_convenio(uuid) TO authenticated;
