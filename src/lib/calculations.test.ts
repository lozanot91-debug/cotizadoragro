import { describe, it, expect } from 'vitest';
import { calcularLinea, buscarTarifa, mesesDeTasa, textoMesesTasa, recargoPorcentaje, esContado, DIAS_CONTADO, margenDesdePrecio, precioConMargen, limitesPrecio } from './calculations';
import type { ProductoConCosto, TarifaFlete } from '@/types';

const tarifas: TarifaFlete[] = [
  { id: '1', km: 1, tarifa: 980.576 },
  { id: '150', km: 150, tarifa: 3457.077 },
  { id: '300', km: 300, tarifa: 5820.633 },
  { id: '1200', km: 1200, tarifa: 12071.655 },
];

const urea = {
  id: 'u', nombre: 'UREA', unid: 'KGRS', proveedor: 'FERTILIZANTE', familia: 'FERTILIZANTE',
  costo: 0.61, moneda: 'USD', margen_default: null, margen_producto: null, es_fertilizante: true,
} as unknown as ProductoConCosto;

const base = { producto: urea, cantidad: 20, margen: 10, conFlete: true, tc: 1400, km: 150, tarifaFlete: tarifas };

describe('calcularLinea fertilizante', () => {
  it('urea 10% con flete 150 km', () => {
    const r = calcularLinea(base);
    expect(r.precioUSD).toBeCloseTo(677.78, 2);
    expect(r.fleteUSD).toBeCloseTo(24.69, 2);
    expect(r.precioConFlete).toBeCloseTo(702.47, 2);
    expect(r.totalUSD).toBeCloseTo(14049.42, 1);
  });
  it('costo editado 700 USD/tn', () => {
    const r = calcularLinea({ ...base, costoOverrideUSD: 700 });
    expect(r.precioUSD).toBeCloseTo(777.78, 2);
    expect(r.precioConFlete).toBeCloseTo(802.47, 2);
    expect(r.costoEditado).toBe(true);
  });
});

describe('calcularLinea aforo por tramo', () => {
  const t = (km: number, factorAforo?: number) => ({ km, tarifas, factorAforo });
  const usd = (km: number) => (buscarTarifa(km, tarifas)! * 10) / base.tc;
  it('cada tramo multiplica solo su propio flete', () => {
    const r = calcularLinea({ ...base, tramos: [t(300, 2), t(150, 1.5)] });
    expect(r.fleteUSD).toBeCloseTo(usd(300) * 2 + usd(150) * 1.5, 8);
  });
  it('factor 1 o ausente no cambia nada', () => {
    const r1 = calcularLinea(base);
    expect(calcularLinea({ ...base, tramos: [t(150, 1)] })).toEqual(r1);
    expect(calcularLinea({ ...base, tramos: [t(150, 0.5)] })).toEqual(r1);
  });
  it('un tramo con aforo y el otro sin', () => {
    const r = calcularLinea({ ...base, tramos: [t(300, 2), t(150)] });
    expect(r.fleteUSD).toBeCloseTo(usd(300) * 2 + usd(150), 8);
  });
  it('sin flete o no fertilizante no se ve afectado', () => {
    expect(calcularLinea({ ...base, conFlete: false, tramos: [t(150, 2)] }).fleteUSD).toBe(0);
    const otro = { ...urea, es_fertilizante: false, unid: 'LT' } as unknown as ProductoConCosto;
    expect(calcularLinea({ ...base, producto: otro, tramos: [t(150, 2)] })).toEqual(calcularLinea({ ...base, producto: otro }));
  });
});

describe('mesesDeTasa', () => {
  it('mes completo, el parcial sube', () => {
    for (const [d, m] of [[30, 1], [60, 2], [90, 3], [120, 4], [150, 5], [180, 6], [360, 12], [11, 1], [31, 2], [45, 2], [76, 3]]) expect(mesesDeTasa(d)).toBe(m);
  });
  it('hasta 10 días es contado: 0 meses', () => {
    expect(DIAS_CONTADO).toBe(10);
    for (const [d, m] of [[0, 0], [1, 0], [10, 0], [11, 1], [30, 1], [31, 2], [60, 2], [76, 3], [150, 5]]) expect(mesesDeTasa(d)).toBe(m);
    expect(esContado(10)).toBe(true);
    expect(esContado(11)).toBe(false);
  });
  it('recargoPorcentaje: 10 días sin recargo, 11 días un mes', () => {
    expect(recargoPorcentaje(10, 1.5)).toBe(0);
    expect(recargoPorcentaje(11, 1.5)).toBe(1.5);
  });
  it('textoMesesTasa de 1 a 10 días dice contado', () => {
    expect(textoMesesTasa(8)).toContain('contado');
  });
  it('sin plazo válido = 0', () => {
    for (const d of [0, -5, NaN]) expect(mesesDeTasa(d)).toBe(0);
  });
  it('textoMesesTasa', () => {
    expect(textoMesesTasa(30)).toBe('1 mes de tasa');
    expect(textoMesesTasa(76)).toBe('3 meses de tasa');
    expect(textoMesesTasa(0)).toBe('');
  });
});

describe('margenDesdePrecio', () => {
  it('round-trip exacto dentro del rango', () => {
    for (const [c, p] of [[6, 6.52], [100, 130], [0.37, 0.41], [1500, 1650.5], [6, 6]]) {
      const m = margenDesdePrecio(c, p)!;
      expect(precioConMargen(c, m)).toBeCloseTo(p, 9);
    }
  });
  it('total = cantidad x precio tipeado', () => {
    const m = margenDesdePrecio(6, 6.52)!;
    expect(Math.round(precioConMargen(6, m) * 12.5 * 100) / 100).toBe(Math.round(6.52 * 12.5 * 100) / 100);
  });
  it('acota al piso (margen 0) y al tope (margen 95)', () => {
    expect(margenDesdePrecio(6, 5)).toBe(0);
    expect(margenDesdePrecio(6, 1000)).toBeCloseTo(95, 9);
    expect(margenDesdePrecio(6, 1000)!).toBeLessThanOrEqual(95);
    expect(precioConMargen(6, margenDesdePrecio(6, 5)!)).toBe(6);
    expect(precioConMargen(6, margenDesdePrecio(6, 1000)!)).toBeCloseTo(120, 9);
    expect(limitesPrecio(6).max).toBeCloseTo(120, 9);
  });
  it('null si no se puede calcular', () => {
    expect(margenDesdePrecio(0, 5)).toBeNull();
    expect(margenDesdePrecio(5, 0)).toBeNull();
    expect(margenDesdePrecio(-1, 5)).toBeNull();
    expect(margenDesdePrecio(5, NaN)).toBeNull();
    expect(margenDesdePrecio(Infinity, 5)).toBeNull();
  });
});
