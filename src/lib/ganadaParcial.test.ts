import { describe, expect, it } from 'vitest';
import { detalleGanada, lineasGanadas, montoGanado, motivosDePerdida, noGanados, subtotalGanado, validarGanada, type Reales } from './ganadaParcial';

const L = (id: string, producto: string, cantidad: number, precio: number, flete = 0) => ({
  id, cod: id.toUpperCase(), producto, cantidad, precio_usd: precio, flete_usd: flete, total_usd: (precio + flete) * cantidad,
});
const urea = L('u', 'Urea', 30, 620, 18);   // 19.140
const gli = L('g', 'Glifosato', 400, 5.8);  //  2.320

describe('ganada parcial', () => {
  it('sin cantidades reales se gana todo lo cotizado', () => {
    expect(noGanados([urea, gli], null)).toEqual([]);
    expect(subtotalGanado([urea, gli], null)).toBeCloseTo(21460, 6);
  });

  it('una línea en 0 no se gana y lleva su motivo', () => {
    const r: Reales = { g: { cantidad: 0, precio: 5.8, motivo: 'Precio' } };
    expect(lineasGanadas([urea, gli], r).map((l) => l.id)).toEqual(['u']);
    const ng = noGanados([urea, gli], r);
    expect(ng).toHaveLength(1);
    expect(ng[0]).toMatchObject({ producto: 'Glifosato', cantidad: 400, motivo: 'Precio' });
    expect(ng[0].usd).toBeCloseTo(2320, 6);
  });

  it('una parte de la línea: se gana lo real, el resto es no ganado (con flete)', () => {
    const r: Reales = { u: { cantidad: 20, precio: 620, motivo: 'Competencia' } };
    expect(subtotalGanado([urea, gli], r)).toBeCloseTo(638 * 20 + 2320, 6);
    expect(noGanados([urea], r)[0].usd).toBeCloseTo(638 * 10, 6);
  });

  it('precio real distinto cambia lo ganado, no lo no ganado', () => {
    const r: Reales = { g: { cantidad: 400, precio: 5.5 } };
    expect(subtotalGanado([gli], r)).toBeCloseTo(2200, 6);
    expect(noGanados([gli], r)).toEqual([]);
  });

  it('valida: falta motivo, cantidad mayor a la cotizada y nada ganado', () => {
    expect(validarGanada([urea, gli], { g: { cantidad: 0, precio: 5.8 } })).toMatch(/Falta el motivo.*Glifosato/);
    expect(validarGanada([gli], { g: { cantidad: 500, precio: 5.8 } })).toMatch(/mayor a la cotizada/);
    expect(validarGanada([gli], { g: { cantidad: 0, precio: 5.8, motivo: 'Precio' } })).toMatch(/Perdida/);
    expect(validarGanada([urea, gli], { g: { cantidad: 0, precio: 5.8, motivo: 'Precio' } })).toBeNull();
  });

  it('arma el detalle para el historial', () => {
    const r: Reales = { g: { cantidad: 0, precio: 5.8, motivo: 'Precio' }, u: { cantidad: 20, precio: 620, motivo: 'Competencia' } };
    expect(detalleGanada([urea, gli], r)).toBe('Ganada parcial (59 %): no se ganó Urea 10 de 30 (Competencia); Glifosato (Precio)');
    expect(detalleGanada([urea, gli], {})).toBe('Ganada completa');
  });
});

describe('motivosDePerdida', () => {
  it('suma perdidas enteras y lo no ganado de las parciales, ordenado por USD', () => {
    const filas = motivosDePerdida([
      { estado: 'Perdida', motivo_perdida: 'Precio', subtotal_usd: 1000, no_ganado: null },
      { estado: 'Perdida', motivo_perdida: 'Competencia', subtotal_usd: 500, no_ganado: null },
      { estado: 'Ganada', motivo_perdida: null, subtotal_usd: 9000, no_ganado: [
        { cod: 'G', producto: 'Glifosato', cantidad: 400, cotizada: 400, usd: 2320, motivo: 'Competencia' },
        { cod: 'U', producto: 'Urea', cantidad: 10, cotizada: 30, usd: 300, motivo: 'Precio' },
      ] },
      { estado: 'Enviada', motivo_perdida: null, subtotal_usd: 7000, no_ganado: null },
    ]);
    expect(filas.map((f) => f.motivo)).toEqual(['Competencia', 'Precio']);
    expect(filas[0]).toMatchObject({ usd: 2820, perdidas: 1, productos: 1 });
    expect(filas[1]).toMatchObject({ usd: 1300, usdPerdidas: 1000, usdParciales: 300 });
  });
});

describe('montoGanado', () => {
  it('usa lo realmente ganado y cae al subtotal en ganadas viejas', () => {
    expect(montoGanado({ estado: 'Ganada', subtotal_usd: 1000, ganado_usd: 700 })).toBe(700);
    expect(montoGanado({ estado: 'Ganada', subtotal_usd: 1000, ganado_usd: null })).toBe(1000);
    expect(montoGanado({ estado: 'Perdida', subtotal_usd: 1000, ganado_usd: null })).toBe(0);
  });
});
