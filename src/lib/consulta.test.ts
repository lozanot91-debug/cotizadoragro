import { describe, expect, it } from 'vitest';
import { buscarProductos, costoDeLista, fleteConsulta } from './consulta';

const tarifas = [{ km: 100, tarifa: 2766.984 }, { km: 101, tarifa: 2780 }] as never;

describe('fleteConsulta', () => {
  it('redondea los km hacia arriba y pasa la tarifa a $/tn y USD/tn', () => {
    const f = fleteConsulta(100.2, tarifas, 1508)!;
    expect(f.km).toBe(101);
    expect(f.pesosTn).toBeCloseTo(27800, 6);
    expect(f.usdTn).toBeCloseTo(27800 / 1508, 6);
  });
  it('sin km o sin tarifa devuelve null', () => {
    expect(fleteConsulta(0, tarifas, 1508)).toBeNull();
    expect(fleteConsulta(900, tarifas, 1508)).toBeNull();
  });
});

describe('costoDeLista', () => {
  it('fertilizantes por tonelada, el resto por unidad', () => {
    expect(costoDeLista({ costo: 0.62, es_fertilizante: true, unid: 'KGRS', moneda: 'USD' })).toEqual({ valor: 620, unidad: 'tn', moneda: 'USD' });
    expect(costoDeLista({ costo: 5.2, es_fertilizante: false, unid: 'LT', moneda: 'USD' })).toEqual({ valor: 5.2, unidad: 'lt', moneda: 'USD' });
  });
});

describe('buscarProductos', () => {
  const ps = [
    { cod: 'GLI-66', producto: 'Glifosato sal potásica 66,2%', proveedor: 'Atanor', familia: 'Herbicidas' },
    { cod: 'ATZ-90', producto: 'Atrazina 90%', proveedor: 'Syngenta', familia: 'Herbicidas' },
    { cod: 'UREA', producto: 'Urea granulada', proveedor: 'Fertilizante', familia: 'Fertilizantes' },
  ];
  it('busca por varias palabras, sin importar tildes ni mayúsculas', () => {
    expect(buscarProductos(ps, 'potasica gli').map((p) => p.cod)).toEqual(['GLI-66']);
    expect(buscarProductos(ps, 'herbicidas').length).toBe(2);
    expect(buscarProductos(ps, 'syngenta 90').map((p) => p.cod)).toEqual(['ATZ-90']);
    expect(buscarProductos(ps, '  ')).toEqual([]);
  });
});
