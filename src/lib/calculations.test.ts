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

describe('calcularLinea aforo', () => {
  it('factor 2 duplica el flete; factor 1 no cambia nada', () => {
    const r1 = calcularLinea(base);
    const r2 = calcularLinea({ ...base, factorAforo: 2 });
    expect(r2.fleteUSD).toBeCloseTo(r1.fleteUSD * 2, 8);
    expect(r2.precioUSD).toBe(r1.precioUSD);
    expect(r2.totalUSD - r1.totalUSD).toBeCloseTo(base.cantidad * r1.fleteUSD, 6);
    expect(calcularLinea({ ...base, factorAforo: 1 })).toEqual(r1);
  });
  it('sin flete o no fertilizante no se ve afectado', () => {
    expect(calcularLinea({ ...base, conFlete: false, factorAforo: 2 }).fleteUSD).toBe(0);
    const otro = { ...urea, es_fertilizante: false, unid: 'LT' } as unknown as ProductoConCosto;
    expect(calcularLinea({ ...base, producto: otro, factorAforo: 2 })).toEqual(calcularLinea({ ...base, producto: otro }));
  });
});

describe('buscarTarifa', () => {
  it('km exacto', () => expect(buscarTarifa(1200, tarifas)).toBe(12071.655));
  it('redondea hacia arriba', () => expect(buscarTarifa(149.2, tarifas)).toBe(3457.077));
  it('sin km', () => expect(buscarTarifa(0, tarifas)).toBe(0));
  it('km faltante devuelve null', () => expect(buscarTarifa(1100, tarifas)).toBeNull());
});
