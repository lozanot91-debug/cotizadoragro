/**
 * Relación insumo/grano: cuánto grano hace falta para pagar una unidad de insumo.
 * - Fertilizantes (precio por tn): tn de grano por tn de insumo (= kg de grano por kg).
 * - Resto (precio por L, kg o unidad): kg de grano por unidad.
 * Los precios van sin IVA y en USD. El grano puede ir lleno (el que pasa el acopio) o neto de liquidación.
 */
import type { PrecioGrano } from '@/types';

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
