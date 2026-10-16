import { describe, expect, it } from 'vitest';
import { buscarCotizaciones } from './cotizacionesBusqueda';
import type { Cotizacion } from '@/types';

const mk = (id: string, cliente: string, cid: string, n: number, fecha: string) =>
  ({ id, cliente_id: cid, cliente_nombre: cliente, numero: n + 100, numero_cliente: n, fecha }) as unknown as Cotizacion;

const lista = [
  mk('a', 'Juan Pérez', 'c1', 1, '2026-01-10'),
  mk('b', 'Juan Pérez', 'c1', 2, '2026-03-10'),
  mk('c', 'María Gómez', 'c2', 1, '2026-02-10'),
  mk('d', 'María Gómez', 'c2', 12, '2026-03-10'),
];
const ids = (r: Cotizacion[]) => r.map((x) => x.id);

describe('buscarCotizaciones', () => {
  it('texto vacío devuelve todas, más nuevas primero (empate por número desc)', () => {
    expect(ids(buscarCotizaciones(lista, { texto: '' }))).toEqual(['d', 'b', 'c', 'a']);
  });
  it('matchea por nombre con prefijo y por número suelto sin ceros', () => {
    expect(ids(buscarCotizaciones(lista, { texto: 'Juan Perez - 002' }))).toEqual(['b']);
    expect(ids(buscarCotizaciones(lista, { texto: '12' }))).toEqual(['d']);
    expect(ids(buscarCotizaciones(lista, { texto: '0012' }))).toEqual(['d']);
  });
  it('cliente sin acentos ni mayúsculas', () => {
    expect(ids(buscarCotizaciones(lista, { texto: 'maria GOMEZ' }))).toEqual(['d', 'c']);
  });
  it('filtra por clienteId', () => {
    expect(ids(buscarCotizaciones(lista, { texto: '1', clienteId: 'c2' }))).toEqual(['c']);
  });
  it('respeta el límite', () => {
    expect(buscarCotizaciones(lista, { texto: '', limite: 2 })).toHaveLength(2);
  });
});
