import { describe, expect, it } from 'vitest';
import { aplicarPrefijoCod, fuentePrincipal, listasVigentes, vigentePorFuente } from './fuentesLista';
import type { FuenteLista, ListaCostos } from '@/types';

const fuente = (id: string, orden: number, created_at: string): FuenteLista => ({
  id, nombre: id, descripcion: null, prefijo_cod: null, orden, created_at, updated_at: created_at,
});
const lista = (id: string, fuente_id: string, fecha: string, created_at = '2026-01-01T00:00:00Z'): ListaCostos => ({
  id, fuente_id, fecha, nombre_archivo: null, uploaded_by: null, created_at, descripcion: null,
});

describe('fuentePrincipal', () => {
  it('null si no hay fuentes', () => expect(fuentePrincipal([])).toBeNull());
  it('menor orden', () => {
    expect(fuentePrincipal([fuente('a', 2, '2026-01-01'), fuente('b', 1, '2026-02-01')])?.id).toBe('b');
  });
  it('a igual orden, la más vieja', () => {
    expect(fuentePrincipal([fuente('a', 0, '2026-02-01'), fuente('b', 0, '2026-01-01')])?.id).toBe('b');
  });
});

describe('vigentePorFuente / listasVigentes', () => {
  const ls = [
    lista('1', 'A', '2026-01-10'),
    lista('2', 'A', '2026-03-10'),
    lista('3', 'B', '2026-02-01'),
    lista('4', 'B', '2026-02-01', '2026-02-02T00:00:00Z'),
  ];
  it('la de fecha más nueva por fuente, empate por created_at', () => {
    const m = vigentePorFuente(ls);
    expect(m.get('A')?.id).toBe('2');
    expect(m.get('B')?.id).toBe('4');
  });
  it('una por fuente', () => expect(listasVigentes(ls).map((l) => l.id)).toEqual(['2', '4']));
  it('vacío', () => {
    expect(vigentePorFuente([]).size).toBe(0);
    expect(listasVigentes([])).toEqual([]);
  });
});

describe('aplicarPrefijoCod', () => {
  const filas = [{ cod: '123', x: 1 }, { cod: 'H-456', x: 2 }, { cod: '', x: 3 }];
  it('prefijo vacío o indefinido no cambia', () => {
    expect(aplicarPrefijoCod(filas, '')).toEqual(filas);
    expect(aplicarPrefijoCod(filas, '   ')).toEqual(filas);
    expect(aplicarPrefijoCod(filas, undefined)).toEqual(filas);
    expect(aplicarPrefijoCod(filas, null)).toEqual(filas);
  });
  it('antepone, recorta el prefijo, no duplica y salta cod vacío', () => {
    expect(aplicarPrefijoCod(filas, ' H-')).toEqual([{ cod: 'H-123', x: 1 }, { cod: 'H-456', x: 2 }, { cod: '', x: 3 }]);
  });
  it('devuelve un array nuevo sin mutar', () => {
    const r = aplicarPrefijoCod(filas, 'H-');
    expect(r).not.toBe(filas);
    expect(filas[0].cod).toBe('123');
  });
});
