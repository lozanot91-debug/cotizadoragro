import { describe, it, expect } from 'vitest';
import { diasParaVencer, vencimientos, vigenciaExtendida, tareaDeVencimiento, tieneTareaPendiente, mensajeRecordatorio } from './vencimientos';
import type { Cotizacion } from '@/types';

const c = (o: Partial<Cotizacion>): Cotizacion => ({
  id: 'c1', numero: 7, cliente_id: 'cli', cliente_nombre: 'ALTOSENA', fecha: '2026-10-01', vigencia_dias: 15, estado: 'Enviada', ...o,
} as Cotizacion);

describe('vencimientos', () => {
  it('vence a los N días de la fecha', () => {
    expect(diasParaVencer(c({}), '2026-10-07')).toBe(9);
    expect(diasParaVencer(c({}), '2026-10-16')).toBe(0);
    expect(diasParaVencer(c({}), '2026-10-20')).toBe(-4);
  });
  it('lista vencidas, de hoy y por vencer; ignora cerradas y vigentes; ordena por urgencia', () => {
    const lista = vencimientos([
      c({ id: 'a', numero: 1, fecha: '2026-09-01' }),
      c({ id: 'b', numero: 2, fecha: '2026-09-22' }),
      c({ id: 'd', numero: 3, fecha: '2026-10-05' }),
      c({ id: 'e', numero: 4, fecha: '2026-09-01', estado: 'Ganada' }),
      c({ id: 'f', numero: 5, fecha: '2026-09-25' }),
    ], '2026-10-07', 3);
    expect(lista.map((v) => [v.cotiz.numero, v.situacion])).toEqual([[1, 'vencida'], [2, 'hoy'], [5, 'pronto']]);
  });
  it('extender: desde hoy si ya venció, desde el vencimiento si todavía no', () => {
    expect(vigenciaExtendida(c({ fecha: '2026-09-01', vigencia_dias: 15 }), '2026-10-07', 7)).toBe(43);
    expect(vigenciaExtendida(c({}), '2026-10-07', 7)).toBe(22);
  });
  it('tarea de seguimiento y detección de tarea existente', () => {
    const [v] = vencimientos([c({ fecha: '2026-09-23' })], '2026-10-07', 3);
    const t = tareaDeVencimiento(v, '2026-10-07');
    expect(t.titulo).toContain('N° 7');
    expect(t.prioridad).toBe('Alta');
    expect(t.fecha_vencimiento).toBe('2026-10-07');
    expect(t.cotizacion_id).toBe('c1');
    expect(tieneTareaPendiente('c1', [{ cotizacion_id: 'c1', estado: 'Pendiente' }])).toBe(true);
    expect(tieneTareaPendiente('c1', [{ cotizacion_id: 'c1', estado: 'Hecha' }])).toBe(false);
  });
  it('mensaje al cliente', () => {
    const [v] = vencimientos([c({ fecha: '2026-09-23' })], '2026-10-07', 3);
    expect(mensajeRecordatorio(v)).toContain('N° 7');
    expect(mensajeRecordatorio(v)).toContain('08/10/2026');
  });
});
