import { describe, it, expect } from 'vitest';
import { apilar, mismaVista, type Vista } from './navegacion';

const lista: Vista = { screen: 'cotizaciones' };
const abierta: Vista = { screen: 'nueva', editCotizId: 'abc' };

describe('navegación con "Atrás"', () => {
  it('abrir una cotización desde la lista guarda la lista para volver', () => {
    expect(apilar([], lista, abierta)).toEqual([lista]);
  });
  it('ir a la misma vista no apila', () => {
    expect(apilar([lista], abierta, { ...abierta })).toEqual([lista]);
  });
  it('distingue cotizaciones abiertas distintas', () => {
    expect(mismaVista(abierta, { screen: 'nueva', editCotizId: 'xyz' })).toBe(false);
  });
  it('mantiene el orden de las vistas anteriores', () => {
    const inicio: Vista = { screen: 'inicio' };
    const pila = apilar(apilar([], inicio, lista), lista, abierta);
    expect(pila).toEqual([inicio, lista]);
  });
});
