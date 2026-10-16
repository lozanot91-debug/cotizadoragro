/*
  # Canjes: el autor (o un admin) puede actualizar su canje guardado

  - La calculadora ahora guarda una sola vez y actualiza el mismo canje en los guardados siguientes.
  - Hasta ahora canjes no tenía policy de UPDATE (solo leer, insertar y borrar).
  - Con WITH CHECK, el autor_id no se puede cambiar a otro usuario (salvo que sea admin).
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'canjes' AND policyname = 'autor_o_admin_actualiza') THEN
    CREATE POLICY autor_o_admin_actualiza ON public.canjes FOR UPDATE TO authenticated
      USING ((SELECT public.es_activo()) AND (autor_id = (SELECT auth.uid()) OR (SELECT public.es_admin())))
      WITH CHECK ((SELECT public.es_activo()) AND (autor_id = (SELECT auth.uid()) OR (SELECT public.es_admin())));
  END IF;
END $$;
