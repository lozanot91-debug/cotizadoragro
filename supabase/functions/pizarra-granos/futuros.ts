// Precios de ajuste de futuros agrícolas (Matba-Rofex / A3 Mercados), API pública del CEM:
// https://apicem.matbarofex.com.ar/api/v2/closing-prices?segment=Agropecuario&type=FUT&from=…&to=…&page=…&pageSize=50&market=ROFX
// Se guardan solo los contratos en dólares de Rosario: SOJ.ROS/MAY27, MAI.ROS/ABR27, TRI.ROS/ENE27, … y el
// disponible (…/DIS26). Se descartan los de pesos (.P) y los mini (.MIN), que repiten el mismo precio.

const CULTIVO: Record<string, string> = { SOJ: 'Soja', MAI: 'Maíz', TRI: 'Trigo', GIR: 'Girasol', SOR: 'Sorgo', CEB: 'Cebada' };
const MESES: Record<string, number> = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12 };

export interface Futuro {
  fecha: string;
  simbolo: string;
  cultivo: string;
  /** 'YYYY-MM' de la posición, o 'DIS' para el disponible */
  posicion: string;
  ajuste: number;
}

export function urlFuturos(desde: string, hasta: string, pagina: number): string {
  const q = new URLSearchParams({
    product: '', segment: 'Agropecuario', type: 'FUT', excludeEmptyVol: 'false',
    from: desde, to: hasta, page: String(pagina), pageSize: '50', sortDir: 'ASC', market: 'ROFX',
  });
  return `https://apicem.matbarofex.com.ar/api/v2/closing-prices?${q.toString()}`;
}

/** "SOJ.ROS/MAY27" → { cultivo: 'Soja', posicion: '2027-05' }; null si no es un contrato en USD de Rosario. */
export function leerSimbolo(simbolo: string): { cultivo: string; posicion: string } | null {
  const m = /^([A-Z]{3})\.ROS\/(DIS|[A-Z]{3})(\d{2})$/.exec(simbolo.trim());
  if (!m || !CULTIVO[m[1]]) return null;
  if (m[2] === 'DIS') return { cultivo: CULTIVO[m[1]], posicion: 'DIS' };
  const mes = MESES[m[2]];
  if (!mes) return null;
  return { cultivo: CULTIVO[m[1]], posicion: `20${m[3]}-${String(mes).padStart(2, '0')}` };
}

/** Filas útiles de una respuesta de la API. */
export function parsearFuturos(json: unknown): Futuro[] {
  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return [];
  const out: Futuro[] = [];
  for (const d of data as { dateTime?: string; symbol?: string; settlement?: number }[]) {
    if (!d?.symbol || !d.dateTime) continue;
    const s = leerSimbolo(d.symbol);
    const ajuste = Number(d.settlement);
    if (!s || !(ajuste > 0)) continue;
    out.push({ fecha: d.dateTime.slice(0, 10), simbolo: d.symbol, cultivo: s.cultivo, posicion: s.posicion, ajuste });
  }
  return out;
}
