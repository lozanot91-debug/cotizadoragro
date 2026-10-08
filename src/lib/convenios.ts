/** Convenios de flete: validación y elección de la planilla a usar. */
import type { ConvenioFlete, TarifaFlete } from '@/types';

export function validarConvenio(numeroTxt: string, descripcion: string, existentes: Pick<ConvenioFlete, 'id' | 'numero'>[], idActual?: string):
  | { ok: true; numero: number; descripcion: string }
  | { ok: false; error: string } {
  const t = numeroTxt.trim();
  if (!/^\d{1,9}$/.test(t)) return { ok: false, error: 'El número de convenio tiene que ser un número entero (ej.: 625).' };
  const numero = parseInt(t, 10);
  const d = descripcion.trim();
  if (!d) return { ok: false, error: 'Poné una descripción (ej.: Autodescargable entre 8 y 12 tn).' };
  if (d.length > 200) return { ok: false, error: 'La descripción es muy larga.' };
  if (existentes.some((c) => c.numero === numero && c.id !== idActual)) {
    return { ok: false, error: `Ya hay un convenio con el número ${numero}.` };
  }
  return { ok: true, numero, descripcion: d };
}

/** El convenio pedido; si no está (o no se pidió ninguno), el predeterminado; si no hay, el primero. */
export function elegirConvenio<T extends Pick<ConvenioFlete, 'id' | 'predeterminado'>>(convenios: T[], id?: string | null): T | null {
  return convenios.find((c) => c.id === id) ?? convenios.find((c) => c.predeterminado) ?? convenios[0] ?? null;
}

/** "625 · Autodescargable entre 8 y 12 tn" */
export function nombreConvenio(c: Pick<ConvenioFlete, 'numero' | 'descripcion'>): string {
  return `${c.numero} · ${c.descripcion}`;
}

export function resumenTarifas(tarifas: TarifaFlete[]): { cantidad: number; desde: number; hasta: number } {
  if (!tarifas.length) return { cantidad: 0, desde: 0, hasta: 0 };
  const kms = tarifas.map((t) => t.km);
  return { cantidad: tarifas.length, desde: Math.min(...kms), hasta: Math.max(...kms) };
}
