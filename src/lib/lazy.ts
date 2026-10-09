import { lazy, type ComponentType } from 'react';

const CLAVE = 'recarga-por-version';

/**
 * React.lazy que se recupera de una versión nueva publicada: si la app quedó abierta con la versión anterior,
 * los archivos de esa versión ya no existen y el import falla. En ese caso recarga la página una vez (para traer
 * la versión nueva); si vuelve a fallar enseguida, deja pasar el error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- misma firma que React.lazy
export function lazyConRecarga<T extends ComponentType<any>>(cargar: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const m = await cargar();
      try { sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
      return m;
    } catch (e) {
      let yaRecargo = false;
      try { yaRecargo = sessionStorage.getItem(CLAVE) === '1'; sessionStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento */ }
      if (!yaRecargo) {
        window.location.reload();
        return new Promise<never>(() => {}); // queda esperando la recarga
      }
      throw e;
    }
  });
}
