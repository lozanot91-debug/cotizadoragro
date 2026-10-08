import { describe, expect, it } from 'vitest';
import { calcularLinea, fleteDeTramos } from './calculations';
import { kmFaltantes, kmSugeridos, plantaDeCampo, textoFlete, validarPlanta, tramosDeCotizacion } from './fleteTramos';
import type { ProductoConCosto } from '@/types';

const tarifaA = [{ km: 100, tarifa: 2000 }, { km: 150, tarifa: 2600 }];
const tarifaB = [{ km: 20, tarifa: 900 }, { km: 21, tarifa: 950 }];

describe('fleteDeTramos', () => {
  it('suma los tramos: tarifa × 10 / TC cada uno', () => {
    // 2000*10/1000 = 20 ; 900*10/1000 = 9
    expect(fleteDeTramos([{ km: 100, tarifas: tarifaA }, { km: 20, tarifas: tarifaB }], 1000)).toEqual({ usdTn: 29, tarifaFaltante: false });
  });
  it('redondea los km hacia arriba en cada tramo', () => {
    expect(fleteDeTramos([{ km: 20.3, tarifas: tarifaB }], 1000).usdTn).toBeCloseTo(9.5, 6);
  });
  it('tramo sin km no suma; km fuera de planilla avisa', () => {
    expect(fleteDeTramos([{ km: 100, tarifas: tarifaA }, { km: 0, tarifas: tarifaB }], 1000)).toEqual({ usdTn: 20, tarifaFaltante: false });
    expect(fleteDeTramos([{ km: 100, tarifas: tarifaA }, { km: 50, tarifas: tarifaB }], 1000)).toEqual({ usdTn: 20, tarifaFaltante: true });
  });
});

describe('calcularLinea con tramos', () => {
  const urea = { id: 'u', cod: 'UREA', producto: 'Urea', es_fertilizante: true, costo: 0.5, moneda: 'USD', unid: 'KGRS' } as unknown as ProductoConCosto;
  it('el flete por tn es la suma de largo + corto', () => {
    const r = calcularLinea({
      producto: urea, cantidad: 10, margen: 0, conFlete: true, tc: 1000, km: 0, tarifaFlete: [],
      tramos: [{ km: 150, tarifas: tarifaA }, { km: 21, tarifas: tarifaB }],
    });
    expect(r.fleteUSD).toBeCloseTo(26 + 9.5, 6);
    expect(r.precioConFlete).toBeCloseTo(500 + 35.5, 6);
    expect(r.totalUSD).toBeCloseTo(5355, 6);
  });
  it('sin tramos usa km y tarifaFlete como antes', () => {
    const r = calcularLinea({ producto: urea, cantidad: 1, margen: 0, conFlete: true, tc: 1000, km: 100, tarifaFlete: tarifaA });
    expect(r.fleteUSD).toBeCloseTo(20, 6);
  });
  it('sin flete tildado no suma nada', () => {
    const r = calcularLinea({ producto: urea, cantidad: 1, margen: 0, conFlete: false, tc: 1000, km: 0, tarifaFlete: [], tramos: [{ km: 150, tarifas: tarifaA }] });
    expect(r.fleteUSD).toBe(0);
  });
});

describe('modalidades', () => {
  it('arma uno o dos tramos', () => {
    const base = { km: 100, tarifas: tarifaA, kmCorto: 20, tarifasCorto: tarifaB };
    expect(tramosDeCotizacion({ ...base, modalidad: 'directo' })).toHaveLength(1);
    expect(tramosDeCotizacion({ ...base, modalidad: 'largo' })).toHaveLength(1);
    expect(tramosDeCotizacion({ ...base, modalidad: 'largo_corto' })).toEqual([{ km: 100, tarifas: tarifaA }, { km: 20, tarifas: tarifaB }]);
  });
  it('avisa los km que faltan', () => {
    expect(kmFaltantes('directo', 0, 0)).toEqual(['km del directo']);
    expect(kmFaltantes('largo_corto', 120, 0)).toEqual(['km del corto']);
    expect(kmFaltantes('largo', 120, 0)).toEqual([]);
  });
});

describe('kmSugeridos', () => {
  const campo = { nombre: 'La Peña', km_puerto: 180, planta: ' tandil ', km_planta: 25 };
  const plantas = [{ nombre: 'Tandil', km_puerto: 165 }, { nombre: 'Barker', km_puerto: null }];
  it('encuentra la planta sin importar mayúsculas ni espacios', () => {
    expect(plantaDeCampo(campo, plantas)?.nombre).toBe('Tandil');
  });
  it('directo: km del campo a puerto', () => {
    expect(kmSugeridos('directo', campo, plantas)).toEqual({ principal: { km: 180, origen: 'km a puerto de La Peña' }, corto: null });
  });
  it('largo + corto: planta a puerto y campo a planta', () => {
    expect(kmSugeridos('largo_corto', campo, plantas)).toEqual({
      principal: { km: 165, origen: 'km de planta Tandil a puerto' },
      corto: { km: 25, origen: 'km de La Peña a su planta' },
    });
  });
  it('sin dato no sugiere', () => {
    expect(kmSugeridos('largo', { ...campo, planta: 'Barker' }, plantas).principal).toBeNull();
    expect(kmSugeridos('largo', null, plantas)).toEqual({ principal: null, corto: null });
  });
});

describe('textoFlete', () => {
  it('dice dónde queda puesto y los km', () => {
    expect(textoFlete({ km: 180 })).toBe('Puesto en campo · 180 km');
    expect(textoFlete({ km: 165, flete_modalidad: 'largo' })).toBe('Puesto en planta · 165 km');
    expect(textoFlete({ km: 165, flete_modalidad: 'largo_corto', km_corto: 25 })).toBe('Puesto en campo · 165 + 25 km');
    expect(textoFlete({ km: 0 })).toBeNull();
  });
});

describe('validarPlanta', () => {
  const ex = [{ id: 'a', nombre: 'Tandil' }];
  it('valida nombre, repetidos y km', () => {
    expect(validarPlanta(' Barker ', '1.200', ex)).toEqual({ ok: true, nombre: 'Barker', km_puerto: 1200 });
    expect(validarPlanta('Barker', '', ex)).toEqual({ ok: true, nombre: 'Barker', km_puerto: null });
    expect(validarPlanta('Barker', '165,5', ex)).toEqual({ ok: true, nombre: 'Barker', km_puerto: 165.5 });
    expect(validarPlanta('tandil', '10', ex).ok).toBe(false);
    expect(validarPlanta('tandil', '10', ex, 'a').ok).toBe(true);
    expect(validarPlanta('', '10', ex).ok).toBe(false);
    expect(validarPlanta('X', 'cien', ex).ok).toBe(false);
  });
});
