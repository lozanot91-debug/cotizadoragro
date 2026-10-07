import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Envuelve la carga de datos de una pantalla para que un error no deje la pantalla
 * girando para siempre ni vacía: guarda el error, apaga el "cargando" y permite reintentar.
 *
 * Uso:
 *   const cargar = useCallback(async () => { ...pedidos y setState... }, []);
 *   const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
 *   useEffect(() => { load(); }, [load]);
 *   if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
 *
 * `load` cambia de identidad cuando cambia `cargar` (igual que antes con useCallback).
 */
export function useCargaSegura(
  cargar: () => Promise<void>,
  setLoading: Dispatch<SetStateAction<boolean>>
) {
  const [errorCarga, setErrorCarga] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      await cargar();
      setErrorCarga(null);
    } catch (e) {
      console.error('Error al cargar la pantalla:', e);
      setErrorCarga(e);
    } finally {
      setLoading(false);
    }
  }, [cargar, setLoading]);

  const reintentar = useCallback(() => {
    setErrorCarga(null);
    setLoading(true);
    void load();
  }, [load, setLoading]);

  return { load, reintentar, errorCarga };
}
