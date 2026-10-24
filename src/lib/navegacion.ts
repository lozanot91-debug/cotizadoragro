import type { Screen } from '@/lib/menu';
import type { CanjeGuardado } from '@/types';

/** Lo que define "dónde está" la persona en la app: la pantalla y lo que se abrió en ella. */
export interface Vista {
  screen: Screen;
  editCotizId?: string;
  duplicateFromId?: string;
  canjeClienteId?: string;
  canjeEditar?: CanjeGuardado;
}

export function mismaVista(a: Vista, b: Vista): boolean {
  return a.screen === b.screen
    && a.editCotizId === b.editCotizId
    && a.duplicateFromId === b.duplicateFromId
    && a.canjeClienteId === b.canjeClienteId
    && a.canjeEditar?.id === b.canjeEditar?.id;
}

/** Pila de vistas anteriores: al ir a otra vista, la actual se guarda para poder volver. Ir a la misma vista no apila. */
export function apilar(pila: Vista[], actual: Vista, destino: Vista): Vista[] {
  return mismaVista(actual, destino) ? pila : [...pila, actual];
}
