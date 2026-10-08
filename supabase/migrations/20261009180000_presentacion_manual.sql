/*
  # Presentación cargada a mano

  fichas_codigos.presentacion: la presentación de ese código escrita por el admin
  ("Bidón 20 L", "Caja 15 kg"). NULL = se sigue sacando del nombre del producto o de la unidad.
*/

ALTER TABLE public.fichas_codigos
  ADD COLUMN IF NOT EXISTS presentacion text
    CHECK (presentacion IS NULL OR length(trim(presentacion)) BETWEEN 1 AND 60);
