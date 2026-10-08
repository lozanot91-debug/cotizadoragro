import { describe, expect, it } from 'vitest';
import { precioDelDia, relacion, resumirRelacion, seriePrecioGrano, serieRelacion } from './relacion';
import type { PrecioGrano } from '@/types';

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
