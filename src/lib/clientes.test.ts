import { describe, expect, it } from 'vitest';
import { filtrarClientes, formClienteVacio, formDeCliente, validarCliente, type ResumenCliente } from './clientes';
import type { Cliente } from '@/types';

function cli(p: Partial<Cliente>): Cliente {
  return {
    id: 'x', nombre: 'X', cuit: null, zona: null, condiciones_pago: null, razon_social: null, domicilio: null,
    localidad: null, vendedor_id: null, estado: 'Activo', observaciones: null, created_by: null, created_at: '', ...p,
  };
}

describe('validarCliente', () => {
  it('pide nombre', () => {
    expect(validarCliente(formClienteVacio()).ok).toBe(false);
  });
  it('vacíos a null y vendedor sin elegir a null', () => {
    const v = validarCliente({ ...formClienteVacio(), nombre: ' El Ombú ', razon_social: ' El Ombú S.A. ', observaciones: '  ' });
    expect(v.ok && v.datos).toMatchObject({ nombre: 'El Ombú', razon_social: 'El Ombú S.A.', observaciones: null, vendedor_id: null, estado: 'Activo' });
  });
  it('ida y vuelta con el formulario', () => {
    const c = cli({ nombre: 'A', razon_social: 'A SRL', vendedor_id: 'u1', estado: 'Prospecto', localidad: 'Tandil' });
    const v = validarCliente(formDeCliente(c));
    expect(v.ok && v.datos).toMatchObject({ razon_social: 'A SRL', vendedor_id: 'u1', estado: 'Prospecto', localidad: 'Tandil' });
  });
});

describe('filtrarClientes', () => {
  const clientes = [
    cli({ id: '1', nombre: 'Agropecuaria Peña', cuit: '30-71234567-8', vendedor_id: 'u1', localidad: 'Tandil' }),
    cli({ id: '2', nombre: 'Los Álamos', estado: 'Prospecto', vendedor_id: 'u2' }),
    cli({ id: '3', nombre: 'Viejo cliente', estado: 'Inactivo' }),
  ];
  const resumen: Record<string, ResumenCliente> = {
    '1': { contacto: null, textoContactos: 'Juan Gómez juan@pena.com', telefonos: ['0249 15 412-3456'], hectareas: 0 },
  };
  const base = { busqueda: '', estado: 'vigentes' as const, vendedor: '' };
  const ids = (cs: Cliente[]) => cs.map((c) => c.id);

  it('por defecto oculta los inactivos', () => {
    expect(ids(filtrarClientes(clientes, resumen, base))).toEqual(['1', '2']);
    expect(ids(filtrarClientes(clientes, resumen, { ...base, estado: 'todos' }))).toEqual(['1', '2', '3']);
    expect(ids(filtrarClientes(clientes, resumen, { ...base, estado: 'Inactivo' }))).toEqual(['3']);
  });
  it('filtra por vendedor y sin vendedor', () => {
    expect(ids(filtrarClientes(clientes, resumen, { ...base, estado: 'todos', vendedor: 'u2' }))).toEqual(['2']);
    expect(ids(filtrarClientes(clientes, resumen, { ...base, estado: 'todos', vendedor: 'sin' }))).toEqual(['3']);
  });
  it('busca sin acentos, por contacto, localidad y teléfono', () => {
    expect(ids(filtrarClientes(clientes, resumen, { ...base, busqueda: 'alamos' }))).toEqual(['2']);
    expect(ids(filtrarClientes(clientes, resumen, { ...base, busqueda: 'gomez' }))).toEqual(['1']);
    expect(ids(filtrarClientes(clientes, resumen, { ...base, busqueda: 'tandil' }))).toEqual(['1']);
    expect(ids(filtrarClientes(clientes, resumen, { ...base, busqueda: '412-3456' }))).toEqual(['1']);
    expect(ids(filtrarClientes(clientes, resumen, { ...base, busqueda: '71234567' }))).toEqual(['1']);
    expect(ids(filtrarClientes(clientes, resumen, { ...base, busqueda: '9999' }))).toEqual([]);
  });
});
