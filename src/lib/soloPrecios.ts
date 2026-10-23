/**
 * Cotizaciones "solo precios": se piden para saber el precio unitario, sin cantidad (cantidad 0).
 * Se emiten con el precio unitario nada más, no cuentan en pipeline ni estadísticas, y para
 * marcarlas Ganada o Perdida hay que completar las cantidades.
 */

/** ¿La línea no tiene cantidad? (se informa solo su precio unitario) */
export const sinCantidad = (l: { cantidad: number }): boolean => !(Number(l.cantidad) > 0);

/** ¿Ninguna línea tiene cantidad? (la cotización entera es una lista de precios) */
export const todasSinCantidad = (ls: { cantidad: number }[]): boolean => ls.length > 0 && ls.every(sinCantidad);

/** Para listas de cotizaciones guardadas: sin cantidades el subtotal es 0. */
export const esSoloPrecios = (c: { subtotal_usd: number }): boolean => !(Number(c.subtotal_usd) > 0);

export const MENSAJE_COMPLETAR_CANTIDADES =
  'Esta cotización no tiene cantidades (solo precios). Cargá las cantidades antes de marcarla como ganada o perdida.';
