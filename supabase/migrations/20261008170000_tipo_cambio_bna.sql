/*
  # Tipo de cambio BNA (dólar divisa)

  La edge function `tc-bna` lee la cotización de divisas del Banco Nación y la guarda acá, una fila
  por día (la última lectura del día pisa la anterior). La app la usa como TC sugerido al cotizar;
  el vendedor la puede cambiar a mano.

  - Solo la función escribe (con la service role); los usuarios logueados leen.
*/

CREATE TABLE IF NOT EXISTS tipo_cambio_bna (
  fecha date PRIMARY KEY,               -- fecha que publica el BNA en la tabla
  compra numeric NOT NULL CHECK (compra > 0),
  venta numeric NOT NULL CHECK (venta > 0),
  obtenido_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tipo_cambio_bna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_leer" ON tipo_cambio_bna FOR SELECT TO authenticated USING (true);
REVOKE ALL ON tipo_cambio_bna FROM anon;
