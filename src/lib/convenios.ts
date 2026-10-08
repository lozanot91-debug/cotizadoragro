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

/** Para una cotización nueva o Recotizar: el pedido solo si sigue vigente; si no, el predeterminado. */
export function elegirConvenioVigente<T extends Pick<ConvenioFlete, 'id' | 'predeterminado' | 'vigente'>>(convenios: T[], id?: string | null): T | null {
  return elegirConvenio(convenios.filter((c) => c.vigente), id) ?? elegirConvenio(convenios, id);
}

/** Opciones del selector: los vigentes, más el elegido si dejó de estar vigente (cotizaciones viejas). */
export function conveniosParaElegir<T extends Pick<ConvenioFlete, 'id' | 'vigente'>>(convenios: T[], elegidoId?: string | null): T[] {
  return convenios.filter((c) => c.vigente || c.id === elegidoId);
}

/** Vigentes primero (por número), después los no vigentes. */
export function ordenarConvenios<T extends Pick<ConvenioFlete, 'numero' | 'vigente'>>(convenios: T[]): T[] {
  return [...convenios].sort((a, b) => Number(b.vigente) - Number(a.vigente) || a.numero - b.numero);
}

/** "625 · Autodescargable entre 8 y 12 tn" */
export function nombreConvenio(c: Pick<ConvenioFlete, 'numero' | 'descripcion'>): string {
  return `${c.numero} · ${c.descripcion}`;
}

/** Texto de la opción en los selectores: marca predeterminado y no vigente. */
export function etiquetaConvenio(c: Pick<ConvenioFlete, 'numero' | 'descripcion' | 'predeterminado' | 'vigente'>): string {
  return `${nombreConvenio(c)}${c.predeterminado ? ' (predet.)' : ''}${c.vigente ? '' : ' (no vigente)'}`;
}

export function resumenTarifas(tarifas: TarifaFlete[]): { cantidad: number; desde: number; hasta: number } {
  if (!tarifas.length) return { cantidad: 0, desde: 0, hasta: 0 };
  const kms = tarifas.map((t) => t.km);
  return { cantidad: tarifas.length, desde: Math.min(...kms), hasta: Math.max(...kms) };
}
