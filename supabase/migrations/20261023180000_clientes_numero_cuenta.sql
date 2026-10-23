/*
# Número de cuenta del cliente

## Problema
La empresa usa un número de cuenta interno para identificar a cada cliente. No había dónde guardarlo.

## Cambios (todo aditivo)
- clientes.numero_cuenta (text, NULL): número interno de cuenta. Es texto para no perder ceros a la izquierda.
- Índice único (sin distinguir mayúsculas ni espacios en los bordes) solo cuando el número está cargado:
  cada cliente tiene el suyo, no se puede repetir. Los clientes sin número no chocan entre sí.
*/

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS numero_cuenta text;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_numero_cuenta_unico
  ON public.clientes (lower(trim(numero_cuenta)))
  WHERE numero_cuenta IS NOT NULL AND trim(numero_cuenta) <> '';
