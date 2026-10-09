import { describe, expect, it } from 'vitest';
import { diferencialPlaza, etiquetaPosicion, posicionCosecha, posicionesVigentes } from './futuros';
import type { FuturoGrano, PizarraGrano } from '@/types';

const fu = (fecha: string, cultivo: string, posicion: string, ajuste: number): FuturoGrano => ({ fecha, simbolo: `${cultivo}/${posicion}`, cultivo, posicion, ajuste });
const pz = (fecha: string, plaza: string, cultivo: string, precio_usd: number): PizarraGrano => ({ fecha, plaza, cultivo, precio_usd, precio_ars: null });

const futuros = [
  fu('2026-10-06', 'Soja', '2027-05', 355), fu('2026-10-07', 'Soja', '2027-05', 359.2), fu('2026-10-07', 'Soja', '2026-11', 374.2),
  fu('2026-10-07', 'Soja', '2027-07', 366.3), fu('2026-10-07', 'Soja', 'DIS', 369.5), fu('2026-10-05', 'Soja', 'DIS', 368),
  fu('2026-10-07', 'Maíz', '2027-04', 203.1),
];

describe('futuros', () => {
  it('etiquetas', () => {
    expect(etiquetaPosicion('2027-05')).toBe('Mayo 2027');
    expect(etiquetaPosicion('DIS')).toBe('Disponible');
  });
  it('posiciones del último día, sin el disponible, en orden', () => {
    expect(posicionesVigentes(futuros, 'soja').map((p) => [p.posicion, p.ajuste])).toEqual([['2026-11', 374.2], ['2027-05', 359.2], ['2027-07', 366.3]]);
    expect(posicionesVigentes(futuros, 'Girasol')).toEqual([]);
  });
  it('posición de cosecha por defecto', () => {
    const ps = posicionesVigentes(futuros, 'Soja');
    expect(posicionCosecha(ps, 'Soja', '2026-10-08')?.posicion).toBe('2027-05');
    expect(posicionCosecha(posicionesVigentes(futuros, 'Maíz'), 'Maíz', '2026-10-08')?.posicion).toBe('2027-04');
    expect(posicionCosecha([], 'Soja', '2026-10-08')).toBeNull();
  });
  it('diferencial de plaza: pizarra − disponible Rosario del mismo día', () => {
    const pizarras = [pz('2026-10-08', 'Quequén', 'Soja', 350), pz('2026-10-05', 'Quequén', 'Soja', 355)];
    // el 08/10 no hay disponible: se usa el 05/10 (355 − 368)
    expect(diferencialPlaza(pizarras, futuros, 'Quequén', 'Soja')).toEqual({ usd: -13, fecha: '2026-10-05', pizarra: 355, disponible: 368 });
    expect(diferencialPlaza(pizarras, futuros, 'Bahía Blanca', 'Soja')).toBeNull();
  });
});
