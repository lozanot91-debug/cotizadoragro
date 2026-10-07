import { describe, it, expect, vi } from 'vitest';

// useData importa el cliente de Supabase, que necesita variables de entorno: no hace falta para probar la paginación
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { fetchAllPaged, type AnyFilter } from './useData';

function fabrica(paginas: Array<{ data: unknown[] | null; error: unknown }>): { query: () => AnyFilter; rangos: Array<[number, number]> } {
  const rangos: Array<[number, number]> = [];
  let n = 0;
  return {
    rangos,
    query: () => ({
      range: async (from: number, to: number) => {
        rangos.push([from, to]);
        return paginas[n++] ?? { data: [], error: null };
      },
    }),
  };
}

const filas = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));

describe('fetchAllPaged', () => {
  it('trae las 1200 filas de la tarifa aunque Supabase corte en 1000', async () => {
    const f = fabrica([{ data: filas(1000), error: null }, { data: filas(200), error: null }]);
    const r = await fetchAllPaged(f.query);
    expect(r).toHaveLength(1200);
    expect(f.rangos).toEqual([[0, 999], [1000, 1999]]);
  });
  it('una sola página incompleta termina sin pedir otra', async () => {
    const f = fabrica([{ data: filas(367), error: null }]);
    expect(await fetchAllPaged(f.query)).toHaveLength(367);
    expect(f.rangos).toHaveLength(1);
  });
  it('si falla una página lanza el error y no devuelve datos parciales', async () => {
    const f = fabrica([{ data: filas(1000), error: null }, { data: null, error: { code: '57014', message: 'timeout' } }]);
    await expect(fetchAllPaged(f.query)).rejects.toThrow();
  });
});
