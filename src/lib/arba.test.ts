import { describe, expect, it } from 'vitest';
import { areaM2, centro, contiene, formatoPartida, limpiarPartida, normalizarGeom, parsearParcelas, recuadro, urlParcelaEnPunto, urlParcelaPorPartida } from './arba';
import type { GeoPoligono } from '@/types';

// Cuadrado de ~0,01° cerca de Tandil, con un hueco en el medio
const cuadrado: GeoPoligono = {
  type: 'MultiPolygon',
  coordinates: [[
    [[-59.14, -37.33], [-59.13, -37.33], [-59.13, -37.32], [-59.14, -37.32], [-59.14, -37.33]],
    [[-59.136, -37.326], [-59.134, -37.326], [-59.134, -37.324], [-59.136, -37.324], [-59.136, -37.326]],
  ]],
};

describe('geometría', () => {
  it('contiene respeta el hueco', () => {
    expect(contiene(cuadrado, -59.138, -37.322)).toBe(true);
    expect(contiene(cuadrado, -59.135, -37.325)).toBe(false);
    expect(contiene(cuadrado, -59.12, -37.322)).toBe(false);
  });
  it('recuadro y centro', () => {
    expect(recuadro(cuadrado)).toEqual([-59.14, -37.33, -59.13, -37.32]);
    expect(centro([cuadrado])).toEqual({ lng: -59.135, lat: -37.325 });
    expect(centro([])).toBeNull();
  });
  it('área aproximada (0,01° × 0,01° a −37° ≈ 98 ha, menos el hueco)', () => {
    const ha = areaM2(cuadrado) / 10000;
    expect(ha).toBeGreaterThan(90);
    expect(ha).toBeLessThan(100);
  });
  it('da vuelta lat,lng si viene al revés', () => {
    const alReves: GeoPoligono = { type: 'Polygon', coordinates: [[[-37.33, -59.14], [-37.33, -59.13], [-37.32, -59.13], [-37.33, -59.14]]] };
    expect((normalizarGeom(alReves).coordinates as number[][][])[0][0]).toEqual([-59.14, -37.33]);
    expect(normalizarGeom(cuadrado)).toBe(cuadrado);
  });
});

describe('partidas', () => {
  it('limpia y formatea', () => {
    expect(limpiarPartida('103-063845 ')).toBe('103063845');
    expect(formatoPartida('103063845')).toBe('103-063845');
    expect(formatoPartida(null)).toBe('—');
  });
});

describe('WFS', () => {
  it('arma las URLs', () => {
    const u = new URL(urlParcelaEnPunto(-59.1, -37.3));
    expect(u.searchParams.get('typeNames')).toBe('idera:Parcela');
    expect(u.searchParams.get('bbox')).toBe('-59.1000500,-37.3000500,-59.0999500,-37.2999500,EPSG:4326');
    expect(new URL(urlParcelaPorPartida('103-063845')).searchParams.get('cql_filter')).toBe("pda='103063845'");
  });
  it('parsea las features', () => {
    const ps = parsearParcelas({ features: [
      { properties: { pda: '103063845', cca: '103-IV-B-...', tpa: 'Rural', ara1: 1250000 }, geometry: cuadrado },
      { properties: { pda: '1' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      { properties: { pda: '2', ara1: null }, geometry: cuadrado },
    ] });
    expect(ps).toHaveLength(2);
    expect(ps[0]).toMatchObject({ partida: '103063845', tipo: 'Rural', superficie_m2: 1250000 });
    expect(ps[1].superficie_m2).toBeGreaterThan(900000); // sin dato: la calcula del contorno
    expect(parsearParcelas(null)).toEqual([]);
  });
});
