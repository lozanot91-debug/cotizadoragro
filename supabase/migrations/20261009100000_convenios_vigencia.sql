/*
  # Convenios de flete vigentes y no vigentes

  - convenios_flete.vigente (por defecto true). Los no vigentes no se ofrecen al cotizar ni en
    Consulta de costos, pero las cotizaciones que ya los usan los conservan.
  - El predeterminado tiene que estar vigente (CHECK) y predeterminar_convenio lo valida con un
    mensaje claro.
*/

ALTER TABLE public.convenios_flete
  ADD COLUMN IF NOT EXISTS vigente boolean NOT NULL DEFAULT true;

ALTER TABLE public.convenios_flete
  ADD CONSTRAINT convenios_predeterminado_vigente CHECK (vigente OR NOT predeterminado);

CREATE OR REPLACE FUNCTION public.predeterminar_convenio(p_convenio_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT es_admin() THEN RAISE EXCEPTION 'Solo el administrador cambia el convenio predeterminado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM convenios_flete WHERE id = p_convenio_id) THEN RAISE EXCEPTION 'El convenio no existe'; END IF;
  IF NOT EXISTS (SELECT 1 FROM convenios_flete WHERE id = p_convenio_id AND vigente) THEN
    RAISE EXCEPTION 'Un convenio no vigente no puede ser el predeterminado. Marcalo como vigente primero.';
  END IF;
  UPDATE convenios_flete SET predeterminado = false WHERE predeterminado AND id <> p_convenio_id;
  UPDATE convenios_flete SET predeterminado = true WHERE id = p_convenio_id;
END;
$function$;
