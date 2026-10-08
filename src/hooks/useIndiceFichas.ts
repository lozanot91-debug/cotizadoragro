import { useEffect, useState } from 'react';
import { useData } from '@/hooks/useData';

export type IndiceFichas = Record<string, { fichaId: string; conMarbete: boolean }>;

// Se carga una vez y lo comparten todos los íconos "i"; se refresca cuando cambia una ficha.
let cache: Promise<IndiceFichas> | null = null;
const suscriptos = new Set<() => void>();

export function refrescarIndiceFichas() {
  cache = null;
  suscriptos.forEach((f) => f());
}

/** Código de producto → ficha (y si tiene marbete). */
export function useIndiceFichas(): IndiceFichas {
  const data = useData();
  const [indice, setIndice] = useState<IndiceFichas>({});
  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      if (!cache) cache = data.fetchIndiceFichas().catch((e) => { console.error('No se pudo cargar el índice de fichas:', e); cache = null; return {}; });
      void cache.then((r) => { if (vivo) setIndice(r); });
    };
    cargar();
    suscriptos.add(cargar);
    return () => { vivo = false; suscriptos.delete(cargar); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return indice;
}
