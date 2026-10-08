/**
 * Cobranzas: cuando una cotización se gana, cada plazo distinto de sus filas genera un cobro.
 * Ej.: una fila de contado y dos a 60 días → 2 cobros (hoy y a 60 días).
 * El monto incluye la financiación de esas filas y el IVA si la cotización lo lleva.
 */
import type { Cobranza, Cotizacion, CotizacionLinea } from '@/types';
import { sumarDias, diasEntre } from '@/lib/fechas';
import { plazoLinea, totalesDeCotizacion } from '@/lib/export';
import { netoGuardado, toneladasPorMonto } from '@/lib/canje';

export interface CobroNuevo {
  plazo_dias: number;
  vencimiento: string;
  monto_usd: number;
}

/** Cobros a generar al ganar la cotización (el plazo cuenta desde `hoy`). */
export function generarCobranzas(cotiz: Cotizacion, lineas: CotizacionLinea[], hoy: string): CobroNuevo[] {
  const porPlazo = new Map<number, CotizacionLinea[]>();
  for (const l of lineas) {
    const p = plazoLinea(l, cotiz);
    porPlazo.set(p, [...(porPlazo.get(p) || []), l]);
  }
  return [...porPlazo.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([plazo, ls]) => ({
      plazo_dias: plazo,
      vencimiento: sumarDias(hoy, plazo),
      monto_usd: Math.round(totalesDeCotizacion(cotiz, ls).total * 100) / 100,
    }))
    .filter((c) => c.monto_usd > 0);
}

export type SituacionCobro = 'cobrada' | 'vencida' | 'hoy' | 'semana' | 'futura';

/** Días hasta el vencimiento (negativo = atrasado). */
export function diasParaCobrar(c: Pick<Cobranza, 'vencimiento'>, hoy: string): number {
  return diasEntre(hoy, c.vencimiento);
}

export function situacionCobro(c: Pick<Cobranza, 'vencimiento' | 'estado'>, hoy: string): SituacionCobro {
  if (c.estado === 'Cobrada') return 'cobrada';
  const d = diasParaCobrar(c, hoy);
  if (d < 0) return 'vencida';
  if (d === 0) return 'hoy';
  if (d <= 7) return 'semana';
  return 'futura';
}

export interface ResumenCobranzas {
  porCobrar: number;
  vencido: number;
  hoy: number;
  proximos30: number;
  cantVencidas: number;
  cantHoy: number;
}

export function resumenCobranzas(cobros: Cobranza[], hoy: string): ResumenCobranzas {
  const r: ResumenCobranzas = { porCobrar: 0, vencido: 0, hoy: 0, proximos30: 0, cantVencidas: 0, cantHoy: 0 };
  for (const c of cobros) {
    if (c.estado !== 'Pendiente') continue;
    const d = diasParaCobrar(c, hoy);
    r.porCobrar += c.monto_usd;
    if (d < 0) { r.vencido += c.monto_usd; r.cantVencidas++; }
    else if (d === 0) { r.hoy += c.monto_usd; r.cantHoy++; }
    if (d >= 0 && d <= 30) r.proximos30 += c.monto_usd;
  }
  return r;
}

/** Toneladas de grano equivalentes si la cotización es de canje; null si no. */
export function cobroEnGranos(c: Cobranza): { cultivo: string; tn: number } | null {
  const precio = c.cotizacion?.canje_precio_usd || 0;
  if (!(precio > 0)) return null;
  return { cultivo: c.cotizacion?.canje_cultivo || 'grano', tn: toneladasPorMonto(c.monto_usd, netoGuardado(precio, c.cotizacion?.canje_params)) };
}
