import { describe, expect, it } from 'vitest';
import { armarResumen, fechaAR, textoNotificacion, type CotizResumen } from '../../supabase/functions/resumen-semanal/resumen';

const c = (o: Partial<CotizResumen>): CotizResumen => ({ id: 'q1', fecha: '2026-10-01', estado: 'Enviada', subtotal_usd: 1000, ganado_usd: null, vigencia_dias: 15, cliente_nombre: 'La Peña', numero: 1, numero_cliente: 1, motivo_perdida: null, ...o });
const HOY = '2026-10-12'; // lunes: semana 05/10 a 11/10

describe('resumen semanal', () => {
  it('cotizadas por fecha; ganadas y perdidas por el cambio de estado de la semana', () => {
    const cots = [
      c({ id: 'a', fecha: '2026-10-06', estado: 'Ganada', subtotal_usd: 5000, ganado_usd: 4000 }),
      c({ id: 'b', fecha: '2026-09-20', estado: 'Ganada', subtotal_usd: 3000 }), // cotizada antes, ganada esta semana
      c({ id: 'p', fecha: '2026-10-07', estado: 'Perdida', subtotal_usd: 2000, motivo_perdida: 'Precio' }),
      c({ id: 'r', fecha: '2026-10-08', estado: 'En negociación', subtotal_usd: 700 }), // ganada y reabierta: no cuenta
      c({ id: 'v', fecha: '2026-09-30', estado: 'Enviada', vigencia_dias: 15 }), // vence 15/10
      c({ id: 'w', fecha: '2026-09-01', estado: 'Borrador' }), // vencida
    ];
    const cambios = [
      { cotizacion_id: 'a', valor_nuevo: 'Ganada', created_at: '2026-10-09T15:00:00Z' },
      { cotizacion_id: 'b', valor_nuevo: 'Ganada', created_at: '2026-10-05T12:00:00Z' },
      { cotizacion_id: 'p', valor_nuevo: 'Perdida', created_at: '2026-10-10T12:00:00Z' },
      { cotizacion_id: 'r', valor_nuevo: 'Ganada', created_at: '2026-10-08T12:00:00Z' },
      { cotizacion_id: 'r', valor_nuevo: 'En negociación', created_at: '2026-10-09T12:00:00Z' },
      { cotizacion_id: 'a', valor_nuevo: 'Ganada', created_at: '2026-10-12T02:00:00Z' }, // 11/10 23 h en Argentina
    ];
    const cobros = [{ vencimiento: '2026-10-01', monto_usd: 500, estado: 'Pendiente' }, { vencimiento: '2026-10-15', monto_usd: 300, estado: 'Pendiente' }, { vencimiento: '2026-10-02', monto_usd: 900, estado: 'Cobrada' }];
    const r = armarResumen(HOY, cots, cambios, cobros);
    expect([r.desde, r.hasta]).toEqual(['2026-10-05', '2026-10-11']);
    expect(r.cotizadas).toEqual({ n: 3, usd: 7700 });
    expect(r.ganadas).toMatchObject({ n: 2, usd: 7000 });
    expect(r.perdidas).toMatchObject({ n: 1, usd: 2000, motivos: [{ motivo: 'Precio', n: 1 }] });
    expect(r.tasaCierre).toBeCloseTo(66.667, 2);
    expect(r.porVencer.map((p) => [p.id, p.vence])).toEqual([['v', '2026-10-15']]);
    expect(r.vencidas).toBe(1);
    expect(r.cobros).toEqual({ vencidos: { n: 1, usd: 500 }, proximos7: { n: 1, usd: 300 } });
    const t = textoNotificacion(r);
    expect(t.titulo).toBe('Resumen de la semana 05/10 al 11/10');
    expect(t.cuerpo).toContain('3 cotizaciones (USD 7.700)');
    expect(t.cuerpo).toContain('ganadas 2 (USD 7.000)');
  });
  it('fecha argentina de un timestamp', () => {
    expect(fechaAR('2026-10-12T02:00:00Z')).toBe('2026-10-11');
  });
  it('semana sin cierres', () => {
    expect(armarResumen(HOY, [], [], []).tasaCierre).toBeNull();
  });
});
