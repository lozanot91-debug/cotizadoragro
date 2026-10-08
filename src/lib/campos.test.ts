import { describe, expect, it } from 'vitest';
import { FORM_CAMPO_VACIO, formDeCampo, superficieTotal, validarCampo } from './campos';
import type { Campo } from '@/types';

describe('validarCampo', () => {
  it('exige nombre y deja vacíos los números opcionales', () => {
    expect(validarCampo(FORM_CAMPO_VACIO)).toEqual({ ok: false, error: 'Poné el nombre del campo.' });
    const r = validarCampo({ ...FORM_CAMPO_VACIO, nombre: ' La Esperanza ' });
    expect(r).toEqual({ ok: true, datos: { nombre: 'La Esperanza', superficie_ha: null, localidad: null, km_puerto: null, planta: null, km_planta: null } });
  });
  it('acepta coma decimal y miles, rechaza texto', () => {
    const r = validarCampo({ nombre: 'El Ombú', superficie: '1.250,5', localidad: 'Tandil', kmPuerto: '170', planta: 'Planta Tandil', kmPlanta: '35' });
    expect(r.ok && r.datos).toEqual({ nombre: 'El Ombú', superficie_ha: 1250.5, localidad: 'Tandil', km_puerto: 170, planta: 'Planta Tandil', km_planta: 35 });
    expect(validarCampo({ ...FORM_CAMPO_VACIO, nombre: 'X', kmPuerto: 'lejos' })).toMatchObject({ ok: false });
    expect(validarCampo({ ...FORM_CAMPO_VACIO, nombre: 'X', superficie: '-3' })).toMatchObject({ ok: false });
  });
});

describe('formDeCampo / superficieTotal', () => {
  const c = { id: '1', cliente_id: 'c', nombre: 'A', superficie_ha: 320, localidad: null, km_puerto: 150.5, planta: null, km_planta: null, created_at: '', updated_at: '' } as Campo;
  it('arma el formulario para editar', () => {
    expect(formDeCampo(c)).toMatchObject({ nombre: 'A', superficie: '320', kmPuerto: '150,5', kmPlanta: '' });
  });
  it('suma la superficie ignorando vacíos', () => {
    expect(superficieTotal([c, { superficie_ha: null }, { superficie_ha: 80 }])).toBe(400);
  });
});
