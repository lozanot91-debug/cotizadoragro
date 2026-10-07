import { describe, it, expect } from 'vitest';
import { serieDeCostos, variacionesEntreListas } from './costos';
import type { ProductoConCosto } from '@/types';

const p = (o: Partial<ProductoConCosto>): ProductoConCosto => ({ id: 'p1', cod: 'A', producto: 'A', costo: 10, moneda: 'USD', es_fertilizante: false, ...o } as ProductoConCosto);

describe('serieDeCostos', () => {
  it('ordena por fecha y calcula la variación contra la anterior', () => {
    const s = serieDeCostos([{ fecha: '2026-10-07', costo: 11 }, { fecha: '2026-09-30', costo: 10 }, { fecha: '2026-10-14', costo: 11 }], false);
    expect(s.map((x) => x.fecha)).toEqual(['2026-09-30', '2026-10-07', '2026-10-14']);
    expect(s[0].variacionPct).toBeNull();
    expect(s[1].variacionPct).toBeCloseTo(10, 6);
    expect(s[2].variacionPct).toBeCloseTo(0, 6);
  });
  it('fertilizantes se muestran por tonelada', () => {
    expect(serieDeCostos([{ fecha: '2026-10-07', costo: 0.61 }], true)[0].costo).toBeCloseTo(610, 6);
  });
});

describe('variacionesEntreListas', () => {
  it('ordena de mayor aumento a mayor baja y descarta lo que no cambió o no estaba', () => {
    const ant = [p({ id: '1', cod: 'A', costo: 100 }), p({ id: '2', cod: 'B', costo: 100 }), p({ id: '3', cod: 'C', costo: 100 }), p({ id: '9', cod: 'Z', costo: 5 })];
    const act = [p({ id: '1', cod: 'A', costo: 110 }), p({ id: '2', cod: 'B', costo: 90 }), p({ id: '3', cod: 'C', costo: 100 }), p({ id: '4', cod: 'N', costo: 7 })];
    const v = variacionesEntreListas(act, ant);
    expect(v.map((x) => [x.cod, Math.round(x.pct)])).toEqual([['A', 10], ['B', -10]]);
  });
  it('no compara si cambió la moneda de la familia', () => {
    expect(variacionesEntreListas([p({ costo: 20, moneda: 'ARS' })], [p({ costo: 10, moneda: 'USD' })])).toEqual([]);
  });
});
