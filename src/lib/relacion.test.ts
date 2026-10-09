import { describe, expect, it } from 'vitest';
import { precioDelDia, pizarraConVariacion, relacion, resumirRelacion, seriePizarra, seriePrecioGrano, serieRelacion, ultimaPizarra, unirSeries } from './relacion';
import type { PizarraGrano, PrecioGrano } from '@/types';

const pg = (fecha: string, cultivo: string, precio_usd: number): PrecioGrano => ({ id: fecha + cultivo, fecha, cultivo, precio_usd, destino: null, usuario_nombre: null, created_at: '', updated_at: '' });

describe('relacion', () => {
  it('fertilizante: tn de grano por tn de insumo', () => {
    expect(relacion(600, 300, true)).toBe(2);
  });
  it('resto: kg de grano por unidad', () => {
    expect(relacion(4.5, 300, false)).toBeCloseTo(15, 9);
  });
  it('sin precio da 0', () => {
    expect(relacion(0, 300, true)).toBe(0);
    expect(relacion(600, 0, true)).toBe(0);
  });
});

describe('precios del grano', () => {
  const ps = [pg('2026-10-01', 'Soja', 330), pg('2026-10-08', 'Soja', 340), pg('2026-10-05', 'Maíz', 180), pg('2026-10-06', 'soja ', 335)];
  it('último por cultivo (sin importar mayúsculas ni tildes)', () => {
    expect(precioDelDia(ps, 'SOJA')?.precio_usd).toBe(340);
    expect(precioDelDia(ps, 'Maiz')?.precio_usd).toBe(180);
    expect(precioDelDia(ps, 'Trigo')).toBeNull();
  });
  it('serie ordenada', () => {
    expect(seriePrecioGrano(ps, 'Soja').map((p) => p.valor)).toEqual([330, 335, 340]);
  });
});

describe('serieRelacion', () => {
  const insumo = [{ fecha: '2026-09-01', valor: 600 }, { fecha: '2026-10-01', valor: 660 }];
  const grano = [{ fecha: '2026-09-15', valor: 300 }, { fecha: '2026-10-05', valor: 330 }];
  it('usa el último valor conocido de cada uno y arranca con los dos', () => {
    const s = serieRelacion(insumo, grano, true);
    expect(s.map((p) => [p.fecha, p.relacion])).toEqual([
      ['2026-09-15', 2],
      ['2026-10-01', 2.2],
      ['2026-10-05', 2],
    ]);
  });
  it('resumen', () => {
    const r = resumirRelacion(serieRelacion(insumo, grano, true))!;
    expect(r.actual).toBe(2);
    expect(r.maximo.fecha).toBe('2026-10-01');
    expect(r.promedio).toBeCloseTo(6.2 / 3, 9);
    expect(r.vsPromedioPct).toBeCloseTo((2 - 6.2 / 3) / (6.2 / 3) * 100, 9);
    expect(resumirRelacion([])).toBeNull();
  });
});

describe('pizarras', () => {
  const pz = (fecha: string, plaza: string, cultivo: string, precio_usd: number | null, precio_ars: number | null = null): PizarraGrano => ({ fecha, plaza, cultivo, precio_usd, precio_ars });
  const filas = [
    pz('2026-10-05', 'Quequén', 'Soja', 355), pz('2026-10-01', 'Quequén', 'Soja', 360),
    pz('2026-10-06', 'Quequén', 'Girasol', 450),
    pz('2026-10-06', 'Rosario', 'Soja', null, 560000), pz('2026-10-07', 'Rosario', 'Soja', 371.6, 560000),
    pz('2026-10-02', 'Quequén', 'Maíz', 185),
  ];
  it('última de la plaza, aunque sea de días atrás (s/c los días siguientes)', () => {
    expect(ultimaPizarra(filas, 'Quequén', 'Soja')).toMatchObject({ fecha: '2026-10-05', usd: 355, convertido: false });
    expect(ultimaPizarra(filas, 'Quequén', 'maiz')).toMatchObject({ fecha: '2026-10-02', usd: 185 });
    expect(ultimaPizarra(filas, 'Bahía Blanca', 'Soja')).toBeNull();
  });
  it('Rosario en pesos: con USD propio o convertido al TC de hoy', () => {
    expect(ultimaPizarra(filas, 'Rosario', 'Soja', 1500)).toMatchObject({ fecha: '2026-10-07', usd: 371.6, convertido: false });
    const solo = [pz('2026-10-06', 'Rosario', 'Soja', null, 560000)];
    expect(ultimaPizarra(solo, 'Rosario', 'Soja', 1500)).toMatchObject({ usd: 373.33, convertido: true });
    expect(ultimaPizarra(solo, 'Rosario', 'Soja', null)).toBeNull();
  });
  it('serie y unión con los cargados a mano', () => {
    expect(seriePizarra(filas, 'Quequén', 'Soja').map((p) => p.valor)).toEqual([360, 355]);
    expect(unirSeries([{ fecha: '2026-10-01', valor: 360 }], [{ fecha: '2026-10-01', valor: 362 }, { fecha: '2026-10-08', valor: 350 }]))
      .toEqual([{ fecha: '2026-10-01', valor: 362 }, { fecha: '2026-10-08', valor: 350 }]);
  });
});

describe('variación de pizarra', () => {
  const pz = (fecha: string, precio_usd: number): PizarraGrano => ({ fecha, plaza: 'Quequén', cultivo: 'Soja', precio_usd, precio_ars: null });
  it('contra la pizarra anterior con dato', () => {
    const r = pizarraConVariacion([pz('2026-10-05', 355), pz('2026-10-01', 350), pz('2026-09-29', 360)], 'Quequén', 'Soja')!;
    expect(r).toMatchObject({ fecha: '2026-10-05', usd: 355, anterior: 350, fechaAnterior: '2026-10-01' });
    expect(r.variacionPct).toBeCloseTo(1.4286, 3);
    expect(pizarraConVariacion([pz('2026-10-05', 355)], 'Quequén', 'Soja')!.variacionPct).toBeNull();
  });
});
