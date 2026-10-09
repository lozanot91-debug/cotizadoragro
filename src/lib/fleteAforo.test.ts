import { describe, expect, it } from 'vitest';
import { fleteDeTramos } from './calculations';
import { tramosDeCotizacion } from './fleteTramos';
import { factorAforo, resumenAforo, tnCargadasConFlete } from './fleteAforo';

describe('fleteAforo', () => {
  it('suma solo fertilizantes con flete', () => {
    const l = (cantidad: number, es: boolean, conFlete: boolean) => ({ cantidad, conFlete, producto: { es_fertilizante: es } });
    expect(tnCargadasConFlete([l(4, true, true), l(3, true, false), l(10, false, true), l(2.5, true, true)])).toBe(6.5);
  });
  it('4 tn con aforo 8 -> factor 2 y 4 tn vacías', () => {
    const r = resumenAforo(4, 8, 20);
    expect(r).toMatchObject({ aplica: true, factor: 2, tnFacturadas: 8, tnVacias: 4, costoVacioUSD: 80 });
  });
  it('aforo menor que la carga no cambia nada', () => {
    expect(factorAforo(12, 8)).toBe(1);
    expect(resumenAforo(12, 8, 20)).toMatchObject({ aplica: false, factor: 1, tnVacias: 0, costoVacioUSD: 0 });
  });
  it('aforo inválido -> 1', () => {
    for (const a of [null, undefined, 0, -3, NaN]) expect(factorAforo(4, a)).toBe(1);
  });
  it('sin carga -> 1', () => expect(factorAforo(0, 8)).toBe(1));
  it('aforo decimal', () => expect(factorAforo(4, 8.5)).toBe(2.125));
  describe('independiente por tramo', () => {
    // tc 10 => USD/tn = tarifa
    const input = { km: 100, tarifas: [{ id: 'a', km: 100, tarifa: 20 }], kmCorto: 20, tarifasCorto: [{ id: 'b', km: 20, tarifa: 10 }], tnCargadas: 4 };
    const flete = (o: object) => fleteDeTramos(tramosDeCotizacion({ ...input, ...o } as Parameters<typeof tramosDeCotizacion>[0]), 10).usdTn;
    it('largo 20 aforo 8 + corto 10 aforo 6, carga 4 -> 20*2 + 10*1,5 = 55', () => {
      expect(flete({ modalidad: 'largo_corto', aforoTn: 8, aforoCortoTn: 6 })).toBeCloseTo(55, 8);
    });
    it('el aforo corto se ignora si la modalidad no es largo_corto', () => {
      expect(flete({ modalidad: 'largo', aforoTn: 8, aforoCortoTn: 6 })).toBeCloseTo(40, 8);
      expect(flete({ modalidad: 'directo', aforoCortoTn: 6 })).toBeCloseTo(20, 8);
    });
    it('un tramo con aforo y el otro sin', () => {
      expect(flete({ modalidad: 'largo_corto', aforoTn: 8 })).toBeCloseTo(50, 8);
      expect(flete({ modalidad: 'largo_corto', aforoCortoTn: 6 })).toBeCloseTo(35, 8);
    });
  });
});
