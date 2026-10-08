/*
  # Catálogo: fichas de producto con marbete y comentarios

  - fichas_producto: un producto comercial (ej.: "A 35 T"), con su marbete en PDF.
  - fichas_codigos: qué códigos de la lista (envases / presentaciones) pertenecen a cada ficha.
    Un código va a una sola ficha.
  - fichas_comentarios: notas del equipo (manejo, posicionamiento, cuestiones técnicas).
  - Bucket privado "marbetes": solo PDF, hasta 5 MB.

  Permisos: todos los usuarios con sesión ven todo. Fichas, códigos y marbetes los edita solo el admin.
  Comentarios: cualquiera comenta; cada uno edita o borra lo suyo y el admin puede borrar cualquiera.
*/

CREATE TABLE IF NOT EXISTS public.fichas_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 160),
  marbete_path text,
  marbete_nombre text CHECK (length(marbete_nombre) <= 200),
  marbete_bytes integer CHECK (marbete_bytes IS NULL OR marbete_bytes BETWEEN 1 AND 5242880),
  marbete_subido_at timestamptz,
  marbete_subido_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fichas_producto_nombre_unico ON public.fichas_producto (lower(trim(nombre)));

CREATE TABLE IF NOT EXISTS public.fichas_codigos (
  cod text PRIMARY KEY CHECK (length(cod) BETWEEN 1 AND 100),
  ficha_id uuid NOT NULL REFERENCES public.fichas_producto(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fichas_codigos_ficha_idx ON public.fichas_codigos (ficha_id);

CREATE TABLE IF NOT EXISTS public.fichas_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid NOT NULL REFERENCES public.fichas_producto(id) ON DELETE CASCADE,
  autor_id uuid DEFAULT auth.uid(),
  autor_nombre text,
  etiqueta text CHECK (etiqueta IS NULL OR etiqueta IN ('Manejo', 'Posicionamiento', 'Técnico')),
  texto text NOT NULL CHECK (length(trim(texto)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fichas_comentarios_ficha_idx ON public.fichas_comentarios (ficha_id, created_at DESC);

-- El autor lo pone la base (no se puede escribir a nombre de otro) y no se cambia al editar
CREATE OR REPLACE FUNCTION public.fichas_comentarios_autor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.autor_id := auth.uid();
    SELECT COALESCE(NULLIF(trim(nombre), ''), split_part(email, '@', 1)) INTO NEW.autor_nombre
      FROM public.usuarios WHERE id = auth.uid();
    NEW.created_at := now();
  ELSE
    NEW.autor_id := OLD.autor_id;
    NEW.autor_nombre := OLD.autor_nombre;
    NEW.ficha_id := OLD.ficha_id;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fichas_comentarios_autor() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER fichas_comentarios_autor
  BEFORE INSERT OR UPDATE ON public.fichas_comentarios
  FOR EACH ROW EXECUTE FUNCTION public.fichas_comentarios_autor();

CREATE OR REPLACE FUNCTION public.fichas_producto_actualizada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER fichas_producto_actualizada
  BEFORE UPDATE ON public.fichas_producto
  FOR EACH ROW EXECUTE FUNCTION public.fichas_producto_actualizada();

ALTER TABLE public.fichas_producto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_codigos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichas_comentarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fichas_producto, public.fichas_codigos, public.fichas_comentarios FROM anon;

CREATE POLICY auth_leer ON public.fichas_producto FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_escribe ON public.fichas_producto FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY auth_leer ON public.fichas_codigos FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_escribe ON public.fichas_codigos FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());

CREATE POLICY auth_leer ON public.fichas_comentarios FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_comenta ON public.fichas_comentarios FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY autor_edita ON public.fichas_comentarios FOR UPDATE TO authenticated
  USING (autor_id = auth.uid()) WITH CHECK (autor_id = auth.uid());
CREATE POLICY autor_o_admin_borra ON public.fichas_comentarios FOR DELETE TO authenticated
  USING (autor_id = auth.uid() OR es_admin());

-- Archivo de marbetes: privado, solo PDF, hasta 5 MB
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('marbetes', 'marbetes', false, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['application/pdf'];

CREATE POLICY auth_select_marbetes ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'marbetes');
CREATE POLICY admin_insert_marbetes ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'marbetes' AND public.es_admin());
CREATE POLICY admin_update_marbetes ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'marbetes' AND public.es_admin()) WITH CHECK (bucket_id = 'marbetes' AND public.es_admin());
CREATE POLICY admin_delete_marbetes ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'marbetes' AND public.es_admin());
