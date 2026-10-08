import { describe, expect, it } from 'vitest';
import { conveniosParaElegir, elegirConvenio, elegirConvenioVigente, etiquetaConvenio, nombreConvenio, ordenarConvenios, resumenTarifas, validarConvenio } from './convenios';

const existentes = [{ id: 'a', numero: 625 }, { id: 'b', numero: 700 }];

describe('validarConvenio', () => {
  it('acepta número entero y descripción', () => {
    expect(validarConvenio(' 812 ', ' Autodescargable entre 8 y 12 tn ', existentes)).toEqual({ ok: true, numero: 812, descripcion: 'Autodescargable entre 8 y 12 tn' });
  });
  it('rechaza número inválido, descripción vacía y número repetido', () => {
    expect(validarConvenio('62,5', 'x', existentes)).toMatchObject({ ok: false });
    expect(validarConvenio('812', '  ', existentes)).toMatchObject({ ok: false });
    expect(validarConvenio('625', 'otra', existentes)).toEqual({ ok: false, error: 'Ya hay un convenio con el número 625.' });
  });
  it('al editar, su propio número no cuenta como repetido', () => {
    expect(validarConvenio('625', 'nueva descripción', existentes, 'a')).toMatchObject({ ok: true, numero: 625 });
  });
});

describe('elegirConvenio', () => {
  const cs = [{ id: 'a', predeterminado: false }, { id: 'b', predeterminado: true }];
  it('usa el pedido, si no el predeterminado, si no el primero', () => {
    expect(elegirConvenio(cs, 'a')?.id).toBe('a');
    expect(elegirConvenio(cs, null)?.id).toBe('b');
    expect(elegirConvenio(cs, 'borrado')?.id).toBe('b');
    expect(elegirConvenio([{ id: 'x', predeterminado: false }])?.id).toBe('x');
    expect(elegirConvenio([])).toBeNull();
  });
});

describe('nombreConvenio / resumenTarifas', () => {
  it('arma el nombre y el rango de km', () => {
    expect(nombreConvenio({ numero: 625, descripcion: 'Autodescargable' })).toBe('625 · Autodescargable');
    expect(resumenTarifas([{ km: 3, tarifa: 1 }, { km: 1, tarifa: 1 }, { km: 300, tarifa: 2 }])).toEqual({ cantidad: 3, desde: 1, hasta: 300 });
    expect(resumenTarifas([])).toEqual({ cantidad: 0, desde: 0, hasta: 0 });
  });
});

describe('vigencia', () => {
  const cs = [
    { id: 'a', numero: 700, predeterminado: false, vigente: false, descripcion: 'Viejo' },
    { id: 'b', numero: 678, predeterminado: true, vigente: true, descripcion: 'Chasis' },
    { id: 'c', numero: 695, predeterminado: false, vigente: true, descripcion: 'Batea' },
  ];
  it('para cotizar: el pedido si está vigente, si no el predeterminado', () => {
    expect(elegirConvenioVigente(cs, 'c')?.id).toBe('c');
    expect(elegirConvenioVigente(cs, 'a')?.id).toBe('b');
    expect(elegirConvenioVigente(cs, null)?.id).toBe('b');
  });
  it('si no queda ninguno vigente, no deja sin flete', () => {
    expect(elegirConvenioVigente([{ id: 'a', predeterminado: false, vigente: false }], 'a')?.id).toBe('a');
  });
  it('el selector muestra vigentes y el no vigente ya elegido', () => {
    expect(conveniosParaElegir(cs).map((c) => c.id)).toEqual(['b', 'c']);
    expect(conveniosParaElegir(cs, 'a').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('ordena vigentes primero y etiqueta', () => {
    expect(ordenarConvenios(cs).map((c) => c.numero)).toEqual([678, 695, 700]);
    expect(etiquetaConvenio(cs[0])).toBe('700 · Viejo (no vigente)');
    expect(etiquetaConvenio(cs[1])).toBe('678 · Chasis (predet.)');
  });
});
