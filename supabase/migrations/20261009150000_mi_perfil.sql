/*
  # Mi perfil: cada usuario cambia su propio nombre

  La tabla usuarios solo la modifica el admin (política admin_modifica). Para que cada uno
  edite su nombre sin poder tocar el rol ni a otros, se usa esta función: actualiza únicamente
  el nombre de quien la llama.
*/

CREATE OR REPLACE FUNCTION public.actualizar_mi_nombre(p_nombre text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre text := trim(regexp_replace(COALESCE(p_nombre, ''), '\s+', ' ', 'g'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Hace falta iniciar sesión'; END IF;
  IF length(v_nombre) < 2 THEN RAISE EXCEPTION 'El nombre tiene que tener al menos 2 letras'; END IF;
  IF length(v_nombre) > 60 THEN RAISE EXCEPTION 'El nombre es muy largo (máximo 60 caracteres)'; END IF;
  UPDATE public.usuarios SET nombre = v_nombre WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró tu usuario'; END IF;
  RETURN v_nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_mi_nombre(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_nombre(text) TO authenticated;
