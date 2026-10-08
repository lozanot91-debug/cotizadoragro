/**
 * Cotización ganada en forma parcial: de cada línea se gana todo, una parte o nada.
 * Lo que no se gana lleva un motivo (los mismos que una cotización perdida).
 *
 * `cantidades_reales` (por id de línea) guarda cantidad, precio y, si no se ganó todo, el motivo.
 * Una cantidad real de 0 significa "no se ganó esa línea" (antes se tomaba como "igual a lo cotizado").
 */
import type { Cotizacion, CotizacionLinea } from '@/types';

export type Reales = NonNullable<Cotizacion['cantidades_reales']>;
type LineaBase = Pick<CotizacionLinea, 'id' | 'cod' | 'producto' | 'cantidad' | 'precio_usd' | 'flete_usd' | 'total_usd'>;

/** Margen para comparar cantidades con decimales (0,01 de producto). */
const TOL = 0.005;

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/** Cantidad y precio reales de la línea. Sin dato cargado (o inválido) vale lo cotizado. */
export function realDeLinea(l: Pick<CotizacionLinea, 'id' | 'cantidad' | 'precio_usd'>, reales?: Reales | null) {
  const r = reales?.[l.id];
  const c = r ? num(r.cantidad) : NaN;
  const p = r ? num(r.precio) : NaN;
  return {
    cantidad: Number.isFinite(c) && c >= 0 ? c : l.cantidad,
    precio: Number.isFinite(p) && p > 0 ? p : l.precio_usd,
    motivo: (r?.motivo || '').trim() || null,
  };
}

/** Líneas como quedaron ganadas (cantidad y precio reales); las no ganadas no aparecen. */
export function lineasGanadas<T extends LineaBase>(lineas: T[], reales?: Reales | null): T[] {
  const out: T[] = [];
  for (const l of lineas) {
    const r = realDeLinea(l, reales);
    if (r.cantidad <= TOL) continue;
    out.push({ ...l, cantidad: r.cantidad, precio_usd: r.precio, total_usd: (r.precio + (l.flete_usd || 0)) * r.cantidad });
  }
  return out;
}

export interface NoGanado {
  lineaId: string;
  cod: string;
  producto: string;
  /** Cantidad que no se ganó (cotizada − real) */
  cantidad: number;
  cotizada: number;
  /** USD sin IVA ni financiación, a precio cotizado (misma base que subtotal_usd) */
  usd: number;
  motivo: string | null;
}

/** Lo que no se ganó de cada línea (todo o una parte). */
export function noGanados(lineas: LineaBase[], reales?: Reales | null): NoGanado[] {
  const out: NoGanado[] = [];
  for (const l of lineas) {
    const r = realDeLinea(l, reales);
    const falta = l.cantidad - r.cantidad;
    if (falta <= TOL) continue;
    out.push({
      lineaId: l.id, cod: l.cod, producto: l.producto,
      cantidad: falta, cotizada: l.cantidad,
      usd: (l.precio_usd + (l.flete_usd || 0)) * falta,
      motivo: r.motivo,
    });
  }
  return out;
}

/** Subtotal ganado en USD (sin IVA ni financiación), con cantidades y precios reales. */
export function subtotalGanado(lineas: LineaBase[], reales?: Reales | null): number {
  return lineasGanadas(lineas, reales).reduce((s, l) => s + l.total_usd, 0);
}

/** Error a mostrar antes de confirmar una Ganada, o null si está todo bien. */
export function validarGanada(lineas: LineaBase[], reales: Reales): string | null {
  if (lineas.length > 0 && lineasGanadas(lineas, reales).length === 0) {
    return 'No queda ningún producto ganado. Si no se ganó nada, pasala a Perdida.';
  }
  for (const l of lineas) {
    const c = num(reales[l.id]?.cantidad);
    if (Number.isFinite(c) && c > l.cantidad + TOL) return `${l.producto}: la cantidad real no puede ser mayor a la cotizada.`;
  }
  const sinMotivo = noGanados(lineas, reales).filter((n) => !n.motivo);
  if (sinMotivo.length) return `Falta el motivo de lo que no se ganó: ${sinMotivo.map((n) => n.producto).join(', ')}.`;
  return null;
}

/** Texto para el historial: "Ganada parcial (70 %): no se ganó Glifosato (Precio); Urea 10 de 30 (Competencia)". */
export function detalleGanada(lineas: LineaBase[], reales: Reales): string {
  const ng = noGanados(lineas, reales);
  if (!ng.length) return 'Ganada completa';
  const total = lineas.reduce((s, l) => s + (l.total_usd || 0), 0);
  const pct = total > 0 ? Math.round((subtotalGanado(lineas, reales) / total) * 100) : 0;
  const partes = ng.map((n) => (n.cantidad >= n.cotizada - TOL
    ? `${n.producto} (${n.motivo})`
    : `${n.producto} ${redondear(n.cantidad)} de ${redondear(n.cotizada)} (${n.motivo})`));
  return `Ganada parcial (${pct} %): no se ganó ${partes.join('; ')}`;
}

function redondear(n: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);
}

/** Lo ganado de una cotización Ganada (si es parcial, solo lo ganado); 0 si no está Ganada. */
export function montoGanado(c: Pick<Cotizacion, 'estado' | 'subtotal_usd' | 'ganado_usd'>): number {
  if (c.estado !== 'Ganada') return 0;
  return c.ganado_usd ?? c.subtotal_usd ?? 0;
}

export interface FilaMotivo {
  motivo: string;
  /** USD perdidos: cotizaciones perdidas enteras + lo no ganado de las ganadas parciales */
  usd: number;
  usdPerdidas: number;
  usdParciales: number;
  /** Cotizaciones perdidas con este motivo */
  perdidas: number;
  /** Productos no ganados (en ganadas parciales) con este motivo */
  productos: number;
}

/** Motivos de pérdida juntando cotizaciones perdidas y lo que no se ganó de las ganadas parciales. */
export function motivosDePerdida(
  cotizaciones: Pick<Cotizacion, 'estado' | 'motivo_perdida' | 'subtotal_usd' | 'no_ganado'>[]
): FilaMotivo[] {
  const m = new Map<string, FilaMotivo>();
  const fila = (motivo: string | null) => {
    const k = (motivo || '').trim() || 'Sin motivo';
    if (!m.has(k)) m.set(k, { motivo: k, usd: 0, usdPerdidas: 0, usdParciales: 0, perdidas: 0, productos: 0 });
    return m.get(k)!;
  };
  for (const c of cotizaciones) {
    if (c.estado === 'Perdida') {
      const f = fila(c.motivo_perdida);
      f.perdidas++;
      f.usdPerdidas += c.subtotal_usd || 0;
    } else if (c.estado === 'Ganada') {
      for (const n of c.no_ganado || []) {
        const f = fila(n.motivo);
        f.productos++;
        f.usdParciales += n.usd || 0;
      }
    }
  }
  for (const f of m.values()) f.usd = f.usdPerdidas + f.usdParciales;
  return [...m.values()].sort((a, b) => b.usd - a.usd || b.perdidas + b.productos - (a.perdidas + a.productos));
}
