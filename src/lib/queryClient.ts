import { QueryClient } from '@tanstack/react-query';

/**
 * Caché de datos compartida entre pantallas.
 * - Los datos se consideran frescos 30 segundos: si dos pantallas piden lo mismo, la segunda no vuelve a la base.
 * - Toda escritura (useData.ts) invalida la caché de lo que toca, así que nunca se ve un dato propio viejo.
 * - Los cambios de OTRA persona aparecen en cuanto vence ese plazo.
 */
export const TTL_CACHE_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: TTL_CACHE_MS, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export const CLAVE_CLIENTES = ['clientes'] as const;
export const CLAVE_COTIZACIONES = ['cotizaciones'] as const;

export function invalidarClientes(): void {
  void queryClient.invalidateQueries({ queryKey: CLAVE_CLIENTES });
}

export function invalidarCotizaciones(): void {
  void queryClient.invalidateQueries({ queryKey: CLAVE_COTIZACIONES });
}

/** Al cerrar o cambiar de sesión: que nadie vea datos en caché de otra cuenta. */
export function vaciarCache(): void {
  queryClient.clear();
}
