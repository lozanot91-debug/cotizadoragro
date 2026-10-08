import { describe, expect, it } from 'vitest';
import { alertasRecompra, aniversario, claveCliente, textoDias, type CotizRecompra } from './recompras';

let n = 0;
const cot = (o: Partial<CotizRecompra>): CotizRecompra => ({
  id: `q${++n}`, cliente_id: 'c1', cliente_nombre: 'La Peña', fecha: '2025-10-20', estado: 'Ganada', subtotal_usd: 10000, ganado_usd: null, ...o,
});
const HOY = '2026-10-08';

describe('alertasRecompra', () => {
  it('avisa la compra ganada del año pasado que cae en la ventana', () => {
    const a = alertasRecompra([cot({})], HOY);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ cliente: 'La Peña', montoUsd: 10000, fechaAniversario: '2026-10-20', dias: 12 });
  });

  it('no avisa si ya se le cotizó hace poco (cualquier estado)', () => {
    expect(alertasRecompra([cot({}), cot({ fecha: '2026-09-01', estado: 'Borrador', subtotal_usd: 500 })], HOY)).toHaveLength(0);
    // una cotización de hace más de 60 días no cuenta
    expect(alertasRecompra([cot({}), cot({ fecha: '2026-07-01', estado: 'Perdida' })], HOY)).toHaveLength(1);
  });

  it('fuera de la ventana no avisa (muy lejos o ya muy pasada)', () => {
    expect(alertasRecompra([cot({ fecha: '2025-12-30' })], HOY)).toHaveLength(0); // faltan 83 días
    expect(alertasRecompra([cot({ fecha: '2025-09-01' })], HOY)).toHaveLength(0); // pasó hace 37 días
    expect(alertasRecompra([cot({ fecha: '2025-09-25' })], HOY)[0].dias).toBe(-13);
  });

  it('solo ganadas con monto; usa lo ganado real', () => {
    expect(alertasRecompra([cot({ estado: 'Perdida' })], HOY)).toHaveLength(0);
    expect(alertasRecompra([cot({ ganado_usd: 0 })], HOY)).toHaveLength(0);
    expect(alertasRecompra([cot({ ganado_usd: 4000 })], HOY)[0].montoUsd).toBe(4000);
  });

  it('agrupa por cliente y respeta lo pospuesto', () => {
    const cs = [cot({}), cot({ fecha: '2025-11-01', subtotal_usd: 5000 }), cot({ cliente_id: 'c2', cliente_nombre: 'Gómez', fecha: '2025-10-10' })];
    const a = alertasRecompra(cs, HOY);
    expect(a.map((x) => x.cliente)).toEqual(['Gómez', 'La Peña']);
    expect(a[1]).toMatchObject({ montoUsd: 15000, dias: 12 });
    expect(a[1].compras).toHaveLength(2);
    const pos = new Map([['id:c2', '2026-11-01']]);
    expect(alertasRecompra(cs, HOY, pos).map((x) => x.cliente)).toEqual(['La Peña']);
    expect(alertasRecompra(cs, HOY, new Map([['id:c2', '2026-10-01']]))).toHaveLength(2); // vencido el posponer
  });

  it('clientes sin cargar se agrupan por nombre', () => {
    expect(claveCliente({ cliente_id: null, cliente_nombre: '  Juan  Pérez ' })).toBe('nombre:juan perez');
  });
});

describe('auxiliares', () => {
  it('aniversario', () => {
    expect(aniversario('2025-10-20')).toBe('2026-10-20');
    expect(aniversario('2024-02-29')).toBe('2025-02-28');
  });
  it('textoDias', () => {
    expect(textoDias(0)).toBe('hoy');
    expect(textoDias(12)).toBe('en 12 días');
    expect(textoDias(-3)).toBe('hace 3 días');
  });
});
