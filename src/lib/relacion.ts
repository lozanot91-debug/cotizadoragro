/**
 * Relación insumo/grano: cuánto grano hace falta para pagar una unidad de insumo.
 * - Fertilizantes (precio por tn): tn de grano por tn de insumo (= kg de grano por kg).
 * - Resto (precio por L, kg o unidad): kg de grano por unidad.
 * Los precios van sin IVA y en USD. El grano puede ir lleno (el que pasa el acopio) o neto de liquidación.
 */
import type { PizarraGrano, PrecioGrano } from '@/types';

export interface PuntoPrecio { fecha: string; valor: number }

export interface PuntoRelacion {
  fecha: string;
  /** USD por tn (fertilizante) o por unidad */
  insumo: number;
  /** USD por tn de grano */
  grano: number;
  relacion: number;
}

const normCultivo = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Último precio cargado de cada cultivo (clave normalizada). */
export function ultimosPrecios(precios: PrecioGrano[]): Map<string, PrecioGrano> {
  const m = new Map<string, PrecioGrano>();
  for (const p of precios) {
    const k = normCultivo(p.cultivo);
    const prev = m.get(k);
    if (!prev || p.fecha > prev.fecha) m.set(k, p);
  }
  return m;
}

/** Último precio de un cultivo (o null). */
export function precioDelDia(precios: PrecioGrano[], cultivo: string): PrecioGrano | null {
  return ultimosPrecios(precios).get(normCultivo(cultivo)) ?? null;
}

/** Serie de precios de un cultivo, por fecha ascendente. */
export function seriePrecioGrano(precios: PrecioGrano[], cultivo: string): PuntoPrecio[] {
  const k = normCultivo(cultivo);
  return precios.filter((p) => normCultivo(p.cultivo) === k).map((p) => ({ fecha: p.fecha, valor: p.precio_usd })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** kg o tn de grano por unidad de insumo. */
export function relacion(precioInsumo: number, precioGranoTn: number, esFertilizante: boolean): number {
  if (!(precioInsumo > 0) || !(precioGranoTn > 0)) return 0;
  return esFertilizante ? precioInsumo / precioGranoTn : (precioInsumo / precioGranoTn) * 1000;
}

/**
 * Relación a lo largo del tiempo: en cada fecha en que cambió el insumo o el grano se usa el último
 * valor conocido de cada uno. Arranca cuando hay datos de los dos.
 */
export function serieRelacion(insumo: PuntoPrecio[], grano: PuntoPrecio[], esFertilizante: boolean): PuntoRelacion[] {
  const ins = [...insumo].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const gra = [...grano].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const fechas = [...new Set([...ins, ...gra].map((p) => p.fecha))].sort();
  const out: PuntoRelacion[] = [];
  let i = -1, g = -1;
  for (const f of fechas) {
    while (i + 1 < ins.length && ins[i + 1].fecha <= f) i++;
    while (g + 1 < gra.length && gra[g + 1].fecha <= f) g++;
    if (i < 0 || g < 0) continue;
    const r = relacion(ins[i].valor, gra[g].valor, esFertilizante);
    if (r > 0) out.push({ fecha: f, insumo: ins[i].valor, grano: gra[g].valor, relacion: r });
  }
  return out;
}

export interface ResumenRelacion {
  actual: number;
  minimo: PuntoRelacion;
  maximo: PuntoRelacion;
  promedio: number;
  /** Actual contra el promedio, en %: negativo = hoy el insumo está más barato medido en grano */
  vsPromedioPct: number;
}

export function resumirRelacion(serie: PuntoRelacion[]): ResumenRelacion | null {
  if (!serie.length) return null;
  let minimo = serie[0], maximo = serie[0], suma = 0;
  for (const p of serie) {
    if (p.relacion < minimo.relacion) minimo = p;
    if (p.relacion > maximo.relacion) maximo = p;
    suma += p.relacion;
  }
  const promedio = suma / serie.length;
  const actual = serie[serie.length - 1].relacion;
  return { actual, minimo, maximo, promedio, vsPromedioPct: promedio > 0 ? ((actual - promedio) / promedio) * 100 : 0 };
}

// ---- Pizarras automáticas (Bolsa de Cereales y Productos de Bahía Blanca) ----

export const PLAZAS_PIZARRA = ['Quequén', 'Bahía Blanca', 'Rosario', 'Dársena'] as const;
export const PLAZA_DEFECTO = 'Quequén';

export interface PrecioPizarra {
  fecha: string;
  plaza: string;
  usd: number;
  /** El USD salió de convertir pesos al TC comprador de hoy (Rosario sin TC del día) */
  convertido: boolean;
  ars: number | null;
}

/** USD de una fila; si solo hay pesos, al TC indicado (o null). */
export function usdDePizarra(p: Pick<PizarraGrano, 'precio_usd' | 'precio_ars'>, tc: number | null | undefined): { usd: number; convertido: boolean } | null {
  if (p.precio_usd && p.precio_usd > 0) return { usd: Number(p.precio_usd), convertido: false };
  if (p.precio_ars && p.precio_ars > 0 && tc && tc > 0) return { usd: Number(p.precio_ars) / tc, convertido: true };
  return null;
}

/**
 * Última pizarra con precio de una plaza y cultivo (si el último día salió sin cotización, queda la anterior
 * con su fecha). `tcHoy` convierte los pesos de Rosario cuando no hay TC de ese día.
 */
export function ultimaPizarra(filas: PizarraGrano[], plaza: string, cultivo: string, tcHoy?: number | null): PrecioPizarra | null {
  const k = normCultivo(cultivo);
  let mejor: PizarraGrano | null = null;
  for (const f of filas) {
    if (f.plaza !== plaza || normCultivo(f.cultivo) !== k) continue;
    if (!usdDePizarra(f, tcHoy)) continue;
    if (!mejor || f.fecha > mejor.fecha) mejor = f;
  }
  if (!mejor) return null;
  const u = usdDePizarra(mejor, tcHoy)!;
  return { fecha: mejor.fecha, plaza, usd: Math.round(u.usd * 100) / 100, convertido: u.convertido, ars: mejor.precio_ars };
}

/** Serie en USD de una plaza y cultivo (solo días con USD propio, sin convertir con el TC de hoy). */
export function seriePizarra(filas: PizarraGrano[], plaza: string, cultivo: string): PuntoPrecio[] {
  const k = normCultivo(cultivo);
  return filas.filter((f) => f.plaza === plaza && normCultivo(f.cultivo) === k && f.precio_usd && f.precio_usd > 0)
    .map((f) => ({ fecha: f.fecha, valor: Number(f.precio_usd) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Une dos series por fecha; la segunda (precios cargados a mano) pisa a la primera el mismo día. */
export function unirSeries(base: PuntoPrecio[], encima: PuntoPrecio[]): PuntoPrecio[] {
  const m = new Map(base.map((p) => [p.fecha, p.valor]));
  for (const p of encima) m.set(p.fecha, p.valor);
  return [...m.entries()].map(([fecha, valor]) => ({ fecha, valor })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
