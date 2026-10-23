import type { Cotizacion, CotizacionLinea, OpcionPago } from '@/types';
import type { TotalesIva } from '@/lib/calculations';
import { calcularOpcion, ID_PRINCIPAL, MAX_OPCIONES } from '@/lib/opcionesPago';
import { vencimientoDesdeDias } from '@/lib/fechas';

/**
 * Opciones a mostrar en PDF / WhatsApp / Excel / vista previa: [principal, ...alternativas].
 * Vacío si no hay alternativas o si el cliente ya eligió una (la cotización ya la lleva en líneas y cabecera).
 */
export function opcionesParaMostrar(cotiz: Cotizacion): OpcionPago[] {
  if (cotiz.opcion_elegida) return [];
  const todas = cotiz.opciones_pago ?? [];
  const principal = todas.find((o) => o.id === ID_PRINCIPAL);
  const otras = todas.filter((o) => o.id !== ID_PRINCIPAL);
  if (!principal || otras.length === 0) return [];
  return [principal, ...otras].slice(0, MAX_OPCIONES);
}

export interface CeldaOpcion {
  precioUnit: number;
  total: number;
  plazo: number;
  /** 'YYYY-MM-DD' (vacío si es contado) */
  vence: string;
}

/** Una fila por artículo con una celda por opción (mismo orden que `opcionesParaMostrar`). */
export function filasMatriz(cotiz: Cotizacion, lineas: CotizacionLinea[]): { linea: CotizacionLinea; celdas: CeldaOpcion[] }[] {
  const calc = opcionesParaMostrar(cotiz).map((op) => calcularOpcion(cotiz, lineas, op).lineas);
  return lineas.map((linea, i) => ({
    linea,
    celdas: calc.map((ls) => ({
      precioUnit: ls[i].precioUnit,
      total: ls[i].total,
      plazo: ls[i].plazo,
      vence: vencimientoDesdeDias(cotiz.fecha, ls[i].plazo),
    })),
  }));
}

/** Totales de cada opción a mostrar. */
export function totalesOpciones(cotiz: Cotizacion, lineas: CotizacionLinea[]): { opcion: OpcionPago; totales: TotalesIva }[] {
  return opcionesParaMostrar(cotiz).map((opcion) => ({ opcion, totales: calcularOpcion(cotiz, lineas, opcion).totales }));
}

/** Unidad del precio unitario, como la muestra la tabla principal. */
export const unidadLinea = (l: CotizacionLinea): string => (l.es_fertilizante ? 'tn' : (l.unid || '').toLowerCase());

/** % de financiación incluido sobre el subtotal. */
export const pctFinanciacion = (t: TotalesIva): number => (t.subtotal > 0 ? (t.recargo / t.subtotal) * 100 : 0);
