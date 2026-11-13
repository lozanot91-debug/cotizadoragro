import type { Cotizacion, CotizacionLinea } from '@/types';
import { formatARS, formatUSD } from '@/lib/format';

/**
 * Cotizaciones en pesos (alimento balanceado y premezclas).
 *
 * La lista de costos no trae columna de moneda: los productos de estas familias vienen en pesos.
 * Una cotización es en pesos si TODAS sus líneas son de estas familias; no se mezcla con dólares.
 *
 * Los importes de una cotización en pesos se guardan en las columnas `*_ars` (pesos reales) y, al lado,
 * en las `*_usd` de siempre guardamos el equivalente en dólares al TC de la cotización. Así todo lo que
 * suma en dólares (Inicio, Pipeline, estadísticas, resumen semanal) sigue funcionando sin sumar pesos
 * como si fueran dólares.
 */
export type Moneda = 'USD' | 'ARS';

/** Familias de la lista de costos que están en pesos. */
export const FAMILIAS_EN_PESOS = ['AB PRODUCTO', 'AB MICRO'] as const;

function normalizar(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

/** ¿La familia es de las que se cotizan en pesos? */
export function esFamiliaEnPesos(familia: string | null | undefined): boolean {
  const f = normalizar(familia);
  return (FAMILIAS_EN_PESOS as readonly string[]).includes(f);
}

/** Moneda en la que se cotiza un producto (según su familia en la lista). */
export function monedaDeProducto(p: { familia?: string | null }): Moneda {
  return esFamiliaEnPesos(p.familia) ? 'ARS' : 'USD';
}

/** Moneda de una cotización guardada: 'ARS' solo si así está marcada; las viejas quedan en USD. */
export function monedaDeCotizacion(c: { moneda?: string | null } | null | undefined): Moneda {
  return c?.moneda === 'ARS' ? 'ARS' : 'USD';
}

/** TC que usa el motor de cálculo: en pesos no se convierte nada, así que es 1. */
export function tcMotor(moneda: Moneda, tc: number): number {
  return moneda === 'ARS' ? 1 : tc;
}

/** Formateador de importes de la moneda de la cotización: $ para pesos, USD para dólares. */
export function formatMoneda(moneda: Moneda): (n: number) => string {
  return moneda === 'ARS' ? (n) => formatARS(n) : (n) => formatUSD(n);
}

/** Equivalente en dólares de un monto en pesos al TC de la cotización (0 si no hay TC). */
export function arsAUsd(ars: number, tc: number): number {
  if (!(tc > 0) || !Number.isFinite(ars)) return 0;
  return ars / tc;
}

/** ¿Se puede agregar un producto a una cotización con estas líneas? Devuelve el motivo si no. */
export function motivoNoSePuedeAgregar(
  moneda: Moneda,
  hayLineas: boolean,
  producto: { familia?: string | null }
): string | null {
  if (!hayLineas) return null;
  const mp = monedaDeProducto(producto);
  if (mp === moneda) return null;
  return moneda === 'ARS'
    ? 'Esta cotización es en pesos (balanceado). Los productos en dólares se cotizan aparte.'
    : 'Esta cotización es en dólares. El balanceado y las premezclas (en pesos) se cotizan aparte.';
}

/**
 * Vista de una cotización en su propia moneda, para pantalla, PDF, Excel y WhatsApp.
 * En USD devuelve lo mismo. En ARS pone los importes en pesos en los campos `*_usd` y fuerza tc = 1,
 * de modo que todo el código de formato/cálculo existente muestre pesos sin saber de monedas.
 * Quien muestre los importes debe usar `formatMoneda(moneda)`.
 */
export function vistaEnMoneda<
  C extends Partial<Cotizacion> & { tc: number },
  L extends Partial<CotizacionLinea>
>(cotiz: C, lineas: L[]): { moneda: Moneda; cotiz: C; lineas: L[] } {
  const moneda = monedaDeCotizacion(cotiz);
  if (moneda === 'USD') return { moneda, cotiz, lineas };
  return {
    moneda,
    cotiz: {
      ...cotiz,
      tc: 1,
      subtotal_usd: cotiz.subtotal_ars ?? 0,
      recargo_usd: cotiz.recargo_ars ?? 0,
      iva_usd: cotiz.iva_ars ?? 0,
      total_usd: cotiz.total_ars ?? 0,
    },
    lineas: lineas.map((l) => ({
      ...l,
      costo_usd: l.costo_ars ?? 0,
      costo_lista_usd: l.costo_lista_ars ?? l.costo_ars ?? 0,
      precio_usd: l.precio_ars ?? 0,
      flete_usd: 0,
      total_usd: l.total_ars ?? 0,
    })),
  };
}

/** Lo que suman, en un grupo de cotizaciones, las que están en pesos (balanceado). */
export interface ResumenPesos {
  /** Cantidad de cotizaciones en pesos del grupo. */
  n: number;
  /** Total en pesos reales (sin IVA, salvo que `usdDe` diga otra cosa). */
  ars: number;
  /** Su equivalente en dólares al TC de cada cotización: es lo que ya suma el total general en USD. */
  usd: number;
}

/**
 * Suma solo las cotizaciones en pesos de un grupo. `usdDe` da el monto en dólares de cada una según lo
 * que esté contando la pantalla (por defecto el subtotal sin IVA; puede ser ponderado por probabilidad,
 * el monto ganado, etc.). Los pesos salen de ese mismo monto × el TC de la cotización, así que siempre
 * son coherentes con el total en dólares que muestra la pantalla.
 */
export function sumarEnPesos<T extends { moneda?: string | null; tc?: number | null; subtotal_usd?: number | null }>(
  cotizs: T[],
  usdDe: (c: T) => number = (c) => c.subtotal_usd ?? 0
): ResumenPesos {
  let n = 0;
  let ars = 0;
  let usd = 0;
  for (const c of cotizs) {
    if (monedaDeCotizacion(c) !== 'ARS') continue;
    const u = usdDe(c);
    if (!Number.isFinite(u)) continue;
    n += 1;
    usd += u;
    ars += u * (c.tc ?? 0);
  }
  return { n, ars, usd };
}
