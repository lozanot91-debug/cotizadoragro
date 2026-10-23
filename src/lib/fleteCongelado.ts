import type { CalcLineaResult } from '@/lib/calculations';

/**
 * Flete de una cotización guardada: al abrirla se mantiene el flete que se guardó, aunque la planilla del
 * convenio haya cambiado desde entonces. Solo se vuelve a calcular cuando la persona toca algo que afecta
 * el flete (km, modalidad, convenio, TC de flete, aforo, o las toneladas cargadas si hay aforo).
 */
export interface DatosFirmaFlete {
  modalidad: string;
  km: number;
  kmCorto: number;
  tcFlete: number;
  aforoTn: number;
  aforoCortoTn: number;
  /** Solo cuenta si hay aforo: sin aforo, cambiar una cantidad no cambia el flete por tonelada. */
  tnCargadas: number;
  convenioId: string | null;
  convenioCortoId: string | null;
}

/** Huella de todo lo que mueve el flete. Si cambia respecto de la del momento de abrir, el flete se recalcula. */
export function firmaDeFlete(d: DatosFirmaFlete): string {
  const hayAforo = d.aforoTn > 0 || d.aforoCortoTn > 0;
  return JSON.stringify([d.modalidad, d.km, d.kmCorto, d.tcFlete, d.aforoTn, d.aforoCortoTn, hayAforo ? d.tnCargadas : 0, d.convenioId ?? '', d.convenioCortoId ?? '']);
}

/** Pone el flete guardado en el resultado de la línea (solo fertilizantes con flete, que son los que lo llevan). */
export function conFleteGuardado(
  calc: CalcLineaResult,
  fleteGuardado: number | undefined,
  linea: { cantidad: number; conFlete: boolean; esFertilizante: boolean },
): CalcLineaResult {
  if (fleteGuardado === undefined || !linea.conFlete || !linea.esFertilizante) return calc;
  const precioConFlete = calc.precioUSD + fleteGuardado;
  return { ...calc, fleteUSD: fleteGuardado, precioConFlete, totalUSD: precioConFlete * linea.cantidad, tarifaFaltante: false };
}
