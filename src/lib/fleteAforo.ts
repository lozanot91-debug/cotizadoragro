/** Aforo del flete: el camión se cobra por el aforo aunque lleve menos (el espacio vacío se paga). */

export interface LineaAforo {
  cantidad: number;
  conFlete: boolean;
  producto: { es_fertilizante: boolean };
}

/** Toneladas cargadas que llevan flete: fertilizantes con flete tildado. */
export function tnCargadasConFlete(lineas: LineaAforo[]): number {
  return lineas.reduce((s, l) => (l.producto.es_fertilizante && l.conFlete ? s + (Number(l.cantidad) || 0) : s), 0);
}

/** Multiplicador del flete USD/tn: max(1, aforo / carga). 1 si el aforo no aplica. */
export function factorAforo(tnCargadas: number, aforoTn: number | null | undefined): number {
  if (aforoTn == null || !Number.isFinite(aforoTn) || aforoTn <= 0) return 1;
  if (!Number.isFinite(tnCargadas) || tnCargadas <= 0 || aforoTn <= tnCargadas) return 1;
  return aforoTn / tnCargadas;
}

export function resumenAforo(tnCargadas: number, aforoTn: number | null | undefined, fleteBaseUsdTn: number) {
  const factor = factorAforo(tnCargadas, aforoTn);
  const aplica = factor > 1;
  const tnFacturadas = aplica ? (aforoTn as number) : Math.max(tnCargadas, 0);
  const tnVacias = aplica ? tnFacturadas - tnCargadas : 0;
  return { aplica, factor, tnFacturadas, tnVacias, costoVacioUSD: fleteBaseUsdTn * tnVacias };
}
