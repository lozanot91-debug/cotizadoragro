/*
# Índice de listas: único por fuente y fecha, no solo por fecha

Se aplica APARTE, después de 20261009300000_fuentes_lista.sql: la herramienta de migraciones
pide confirmación ante un DROP, por eso no va en la migración principal.

Dos fuentes distintas pueden tener una lista con la misma fecha, así que el único por fecha
sola ya no corresponde. Lo reemplaza idx_listas_costos_fuente_fecha_unique (fuente_id, fecha).
*/

DROP INDEX IF EXISTS public.idx_listas_costos_fecha_unique;
