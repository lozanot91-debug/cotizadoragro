/**
 * Precios de la competencia: cuánto ofreció otro y quién, por producto. Sirve para ver contra quién se
 * pierde y por cuánto. Los precios van sin IVA, en la misma unidad que la cotización (USD/tn en fertilizantes).
 */
import type { Cotizacion, CotizacionLinea, PrecioCompetencia } from '@/types';
import { parseNumberInput } from '@/lib/format';

export const MOTIVOS_CON_COMPETENCIA = ['Precio', 'Competencia'];

export type NuevoPrecioCompetencia = Omit<PrecioCompetencia, 'id' | 'usuario_id' | 'created_at'>;

/** Precio final de la línea que vio el cliente (con flete, sin IVA ni financiación). */
export const precioNuestro = (l: Pick<CotizacionLinea, 'precio_usd' | 'flete_usd'>) => (l.precio_usd || 0) + (l.flete_usd || 0);

/** Filas a guardar desde el cierre de una cotización (solo las líneas con precio cargado). */
export function filasDesdeCierre(
  cotiz: Pick<Cotizacion, 'id' | 'cliente_id' | 'cliente_nombre'>,
  lineas: CotizacionLinea[],
  competidor: string,
  precios: Record<string, string>,
  origen: 'perdida' | 'ganada_parcial',
  fecha: string,
  usuario: string,
): NuevoPrecioCompetencia[] {
  const comp = competidor.trim();
  if (!comp) return [];
  const out: NuevoPrecioCompetencia[] = [];
  for (const l of lineas) {
    const p = parseNumberInput(precios[l.id] || '');
    if (!(p > 0)) continue;
    out.push({
      fecha, cotizacion_id: cotiz.id, cliente_id: cotiz.cliente_id, cliente_nombre: cotiz.cliente_nombre,
      cod: l.cod, producto: l.producto, unidad: l.es_fertilizante ? 'tn' : (l.unid || 'un').toLowerCase(),
      competidor: comp.slice(0, 120), precio_usd: p, nuestro_precio_usd: precioNuestro(l) > 0 ? precioNuestro(l) : null,
      origen, notas: null, usuario_nombre: usuario,
    });
  }
  return out;
}

/** Diferencia del competidor contra nuestro precio, en % (negativo = más barato que nosotros). null si no hay referencia. */
export function diferenciaPct(r: Pick<PrecioCompetencia, 'precio_usd' | 'nuestro_precio_usd'>): number | null {
  if (!r.nuestro_precio_usd || !(r.nuestro_precio_usd > 0)) return null;
  return ((r.precio_usd - r.nuestro_precio_usd) / r.nuestro_precio_usd) * 100;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Nombres de competidores ya usados (sin repetir mayúsculas/tildes), los más frecuentes primero. */
export function competidoresConocidos(regs: Pick<PrecioCompetencia, 'competidor'>[]): string[] {
  const m = new Map<string, { nombre: string; n: number }>();
  for (const r of regs) {
    const k = norm(r.competidor);
    const x = m.get(k);
    if (x) x.n++; else m.set(k, { nombre: r.competidor.trim(), n: 1 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, 'es')).map((x) => x.nombre);
}

export interface ResumenCompetidor { competidor: string; registros: number; difPromedio: number | null; productos: number; ultimo: string }
export interface ResumenProducto { clave: string; producto: string; cod: string | null; registros: number; ultimo: PrecioCompetencia; difPromedio: number | null; competidores: string[] }

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function resumirPorCompetidor(regs: PrecioCompetencia[]): ResumenCompetidor[] {
  const m = new Map<string, PrecioCompetencia[]>();
  for (const r of regs) m.set(norm(r.competidor), [...(m.get(norm(r.competidor)) || []), r]);
  return [...m.values()].map((rs) => ({
    competidor: rs[0].competidor.trim(),
    registros: rs.length,
    difPromedio: promedio(rs.map(diferenciaPct).filter((x): x is number => x !== null)),
    productos: new Set(rs.map((r) => r.cod || norm(r.producto))).size,
    ultimo: rs.reduce((m, r) => (r.fecha > m ? r.fecha : m), ''),
  })).sort((a, b) => b.registros - a.registros);
}

export function resumirPorProducto(regs: PrecioCompetencia[]): ResumenProducto[] {
  const m = new Map<string, PrecioCompetencia[]>();
  for (const r of regs) { const k = r.cod || norm(r.producto); m.set(k, [...(m.get(k) || []), r]); }
  return [...m.entries()].map(([clave, rs]) => {
    const ultimo = rs.reduce((a, b) => (b.fecha > a.fecha || (b.fecha === a.fecha && b.created_at > a.created_at) ? b : a));
    return {
      clave, producto: ultimo.producto, cod: ultimo.cod, registros: rs.length, ultimo,
      difPromedio: promedio(rs.map(diferenciaPct).filter((x): x is number => x !== null)),
      competidores: competidoresConocidos(rs),
    };
  }).sort((a, b) => b.ultimo.fecha.localeCompare(a.ultimo.fecha));
}

/** Último precio de la competencia por código (para mostrarlo al cotizar). */
export function ultimoPorCod(regs: PrecioCompetencia[]): Map<string, PrecioCompetencia> {
  const m = new Map<string, PrecioCompetencia>();
  for (const r of regs) {
    if (!r.cod) continue;
    const prev = m.get(r.cod);
    if (!prev || r.fecha > prev.fecha || (r.fecha === prev.fecha && r.created_at > prev.created_at)) m.set(r.cod, r);
  }
  return m;
}
