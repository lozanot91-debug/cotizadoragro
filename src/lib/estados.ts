/**
 * Reglas de cambio de estado de una cotización. Son funciones puras para poder probarlas
 * y para que las use tanto la pantalla (el modal) como la capa de datos (que es la que
 * realmente las hace cumplir, aunque alguien llame sin pasar por el modal).
 */
import type { EstadoCotizacion } from '@/types';

export const MOTIVOS_PERDIDA = ['Precio', 'Plazo de pago', 'Competencia', 'El cliente no compró', 'Otro'] as const;

/** Estados "cerrados": solo se puede salir de ellos reabriendo a En negociación. */
export const ESTADOS_CERRADOS: EstadoCotizacion[] = ['Ganada', 'Perdida'];

export function estaCerrada(estado: EstadoCotizacion): boolean {
  return ESTADOS_CERRADOS.includes(estado);
}

/** Reabrir = pasar de Ganada/Perdida a En negociación. */
export function esReapertura(desde: EstadoCotizacion, hacia: EstadoCotizacion): boolean {
  return estaCerrada(desde) && hacia === 'En negociación';
}

/** Motivo final: si eligió "Otro" vale el texto que escribió. */
export function motivoFinal(motivo: string, otroMotivo: string): string {
  return motivo === 'Otro' ? otroMotivo.trim() : motivo.trim();
}

export interface CambioEstado {
  desde: EstadoCotizacion;
  hacia: EstadoCotizacion;
  /** Motivo ya resuelto (si eligió "Otro", el texto escrito). */
  motivo?: string | null;
  comentario?: string | null;
}

/**
 * Devuelve un mensaje de error si el cambio no está permitido, o null si se puede hacer.
 * Reglas:
 *  1. A Perdida: motivo obligatorio.
 *  2. Desde Ganada o Perdida solo se puede ir a En negociación (reabrir), con comentario obligatorio.
 */
export function validarCambioEstado({ desde, hacia, motivo, comentario }: CambioEstado): string | null {
  if (desde === hacia) return 'La cotización ya está en ese estado.';
  if (hacia === 'Perdida' && !(motivo ?? '').trim()) {
    return 'Para marcar la cotización como Perdida tenés que indicar el motivo.';
  }
  if (estaCerrada(desde)) {
    if (hacia !== 'En negociación') {
      return `Una cotización ${desde.toLowerCase()} solo se puede reabrir a En negociación.`;
    }
    if (!(comentario ?? '').trim()) {
      return 'Para reabrir la cotización tenés que escribir un comentario.';
    }
  }
  return null;
}
