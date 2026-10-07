import { describe, it, expect } from 'vitest';
import { verificarFechas, diaDeLaSemana, diasDelMes, esFechaVencida, diasDesde } from './fechas';

describe('fechas (zona Argentina)', () => {
  it('pasa la autoverificación', () => {
    expect(verificarFechas()).toEqual([]);
  });
  it('calendario', () => {
    expect(diasDelMes(2026, 2)).toBe(28);
    expect(diasDelMes(2028, 2)).toBe(29);
    expect(diaDeLaSemana('2026-10-05')).toBe(1); // lunes
  });
  it('vencida usa la fecha de Argentina', () => {
    const ahora = new Date('2026-10-06T01:30:00Z'); // 05/10 22:30 AR
    expect(esFechaVencida('2026-10-05', ahora)).toBe(false);
    expect(esFechaVencida('2026-10-04', ahora)).toBe(true);
  });
  it('diasDesde con timestamp cuenta en fecha argentina, no en UTC', () => {
    const ahora = new Date('2026-10-05T15:00:00Z'); // 05/10 12:00 AR
    // Enviada 04/10 22:00 AR = 05/10 01:00 UTC: pasó 1 día (en UTC parecería el mismo día)
    expect(diasDesde('2026-10-05T01:00:00Z', ahora)).toBe(1);
    expect(diasDesde('2026-10-04', ahora)).toBe(1);
    expect(diasDesde('2026-10-05', ahora)).toBe(0);
  });
});
