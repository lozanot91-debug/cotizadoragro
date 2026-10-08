import { describe, expect, it } from 'vitest';
import { elegirConvenio, nombreConvenio, resumenTarifas, validarConvenio } from './convenios';

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
