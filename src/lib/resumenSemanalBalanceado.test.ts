import { describe, expect, it } from 'vitest';
import { balanceadoSemana } from './resumenSemanal';

describe('balanceadoSemana', () => {
  it('suma solo las de pesos con el mismo monto USD que el resumen', () => {
    const cots = [
      { id: 'a', fecha: '2026-10-06', moneda: 'ARS', tc: 1000, subtotal_usd: 500, ganado_usd: 400 },
      { id: 'b', fecha: '2026-10-07', moneda: 'USD', tc: 1000, subtotal_usd: 900 },
      { id: 'c', fecha: '2026-09-01', moneda: 'ARS', tc: 1000, subtotal_usd: 100 },
    ];
    const r = { desde: '2026-10-05', hasta: '2026-10-11', ganadas: { n: 2, usd: 0, ids: ['a', 'b'] }, perdidas: { n: 1, usd: 0, ids: ['c'], motivos: [] } };
    const b = balanceadoSemana(r, cots);
    expect(b.cotizadas).toEqual({ n: 1, ars: 500000, usd: 500 });
    expect(b.ganadas).toEqual({ n: 1, ars: 400000, usd: 400 });
    expect(b.perdidas).toEqual({ n: 1, ars: 100000, usd: 100 });
  });
});
