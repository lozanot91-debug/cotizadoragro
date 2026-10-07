-- Fija el search_path de las funciones de la app (aviso de seguridad de Supabase).
ALTER FUNCTION public.cargar_lista(date, text, jsonb, boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.cargar_tarifa_flete(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.cotizaciones_afectadas(date) SET search_path = public, pg_temp;
ALTER FUNCTION public.guardar_cotizacion(uuid, jsonb, jsonb) SET search_path = public, pg_temp;
