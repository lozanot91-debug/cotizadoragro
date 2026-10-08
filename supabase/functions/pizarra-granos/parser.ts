// Lectura de los precios de Cámara de la Bolsa de Cereales y Productos de Bahía Blanca (bcp.org.ar).
// Consulta por rango: https://bcp.org.ar/cotizaciones/precios_dia.asp?Tipo=Rgo&... → tabla id="tablaRango"
// con una fila por día: <td>d/m/aaaa</td> <td>precio</td>. Sin dependencias: lo usan la edge function (Deno) y los tests (vitest).

export const PLAZAS = { 'Bahía Blanca': 1, 'Rosario': 2, 'Dársena': 3, 'Quequén': 4 } as const;
export type Plaza = keyof typeof PLAZAS;

export const CEREALES = { 'Maíz': 2, 'Girasol': 3, 'Sorgo': 4, 'Soja': 5, 'Trigo': 8, 'Cebada': 9 } as const;
export type Cereal = keyof typeof CEREALES;

export interface FilaPizarra { fecha: string; precio: number }

/** URL de la consulta por rango (fechas 'YYYY-MM-DD'); unidad 0 = U$S/tn, 1 = $/tn. */
export function urlRango(plaza: Plaza, cereal: Cereal, desde: string, hasta: string, unidad: 0 | 1): string {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  const q = new URLSearchParams({
    Tipo: 'Rgo',
    DiaPrecio1: String(d1), MesPrecio1: String(m1), AnoPrecio1: String(a1),
    DiaPrecio2: String(d2), MesPrecio2: String(m2), AnoPrecio2: String(a2),
    Puerto: String(PLAZAS[plaza]), Cereal: String(CEREALES[cereal]), Unidad: String(unidad),
  });
  return `https://bcp.org.ar/cotizaciones/precios_dia.asp?${q.toString()}`;
}

/** "1.234,5" o "1234.5" → número. */
export function numeroPizarra(s: string): number {
  const t = s.trim().replace(/\s/g, '');
  if (!t) return NaN;
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Filas (fecha, precio) de la tabla de la consulta por rango. Ignora precios 0 o vacíos (sin cotización). */
export function parsearRango(html: string): FilaPizarra[] {
  const ini = html.indexOf('id="tablaRango"');
  if (ini < 0) return [];
  const fin = html.indexOf('</table>', ini);
  const tabla = html.slice(ini, fin < 0 ? undefined : fin);
  const out = new Map<string, number>();
  const re = /<td>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*<\/td>\s*<td>\s*([\d.,]+)\s*<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tabla))) {
    const precio = numeroPizarra(m[4]);
    if (!(precio > 0)) continue;
    const fecha = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    out.set(fecha, precio);
  }
  return [...out.entries()].map(([fecha, precio]) => ({ fecha, precio })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
