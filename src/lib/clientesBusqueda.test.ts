import { describe, expect, it } from 'vitest';
import { coincideCliente } from './clientesBusqueda';

const c = { nombre: 'Peñín Hnos', razon_social: 'Peñín y Cía S.A.', cuit: '30-12345678-9', numero_cuenta: '01-002363' };

describe('coincideCliente', () => {
  it('cuenta exacta y parcial', () => {
    expect(coincideCliente(c, '01-002363')).toBe(true);
    expect(coincideCliente(c, '2363')).toBe(true);
  });
  it('sin guion y sin ceros', () => {
    expect(coincideCliente(c, '01002363')).toBe(true);
    expect(coincideCliente(c, '002363')).toBe(true);
  });
  it('nombre sin acentos y sin mayúsculas', () => {
    expect(coincideCliente(c, 'penin')).toBe(true);
    expect(coincideCliente(c, 'PEÑÍN')).toBe(true);
    expect(coincideCliente(c, 'cía')).toBe(true);
  });
  it('CUIT por dígitos', () => {
    expect(coincideCliente(c, '30123456789')).toBe(true);
    expect(coincideCliente(c, '30-12345678-9')).toBe(true);
  });
  it('vacío devuelve todo', () => {
    expect(coincideCliente(c, '')).toBe(true);
    expect(coincideCliente(c, '   ')).toBe(true);
  });
  it('no coincide', () => {
    expect(coincideCliente(c, '999999')).toBe(false);
    expect(coincideCliente(c, 'zzz')).toBe(false);
    expect(coincideCliente({ nombre: 'X', numero_cuenta: null }, '0100')).toBe(false);
  });
});
