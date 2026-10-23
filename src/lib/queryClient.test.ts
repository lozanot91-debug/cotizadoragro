import { describe, it, expect, beforeEach } from 'vitest';
import { queryClient, CLAVE_COTIZACIONES, invalidarCotizaciones, vaciarCache } from './queryClient';

describe('caché de datos', () => {
  beforeEach(() => vaciarCache());

  it('dos pedidos seguidos usan una sola consulta', async () => {
    let llamadas = 0;
    const pedir = () => queryClient.fetchQuery({ queryKey: CLAVE_COTIZACIONES, queryFn: async () => { llamadas++; return [llamadas]; } });
    await pedir();
    await pedir();
    expect(llamadas).toBe(1);
  });

  it('después de una escritura se vuelve a consultar', async () => {
    let llamadas = 0;
    const pedir = () => queryClient.fetchQuery({ queryKey: CLAVE_COTIZACIONES, queryFn: async () => { llamadas++; return [llamadas]; } });
    await pedir();
    invalidarCotizaciones();
    expect(await pedir()).toEqual([2]);
  });

  it('vaciar la caché (cambio de sesión) fuerza una consulta nueva', async () => {
    let llamadas = 0;
    const pedir = () => queryClient.fetchQuery({ queryKey: CLAVE_COTIZACIONES, queryFn: async () => { llamadas++; return [llamadas]; } });
    await pedir();
    vaciarCache();
    await pedir();
    expect(llamadas).toBe(2);
  });
});
