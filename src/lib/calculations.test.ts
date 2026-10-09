import { describe, it, expect } from 'vitest';
import { calcularLinea, buscarTarifa } from './calculations';
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
