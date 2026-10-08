/*
  # Todos ven costos

  Decisión: en el equipo todos ven costos y márgenes. El permiso `puede_ver_costos` solo ocultaba
  cosas en la pantalla (el costo igual se podía sacar con precio × (1 − margen)), así que la app
  deja de usarlo. La columna queda en la tabla para no hacer un DROP; se pone en true para todos.
*/

UPDATE usuarios SET puede_ver_costos = true WHERE puede_ver_costos IS DISTINCT FROM true;
ALTER TABLE usuarios ALTER COLUMN puede_ver_costos SET DEFAULT true;
COMMENT ON COLUMN usuarios.puede_ver_costos IS 'Sin uso desde 2026-10-08: todos los usuarios ven costos.';
