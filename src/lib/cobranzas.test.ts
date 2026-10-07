import { describe, it, expect } from 'vitest';
import { generarCobranzas, situacionCobro, resumenCobranzas, cobroEnGranos } from './cobranzas';
import type { Cobranza, Cotizacion, CotizacionLinea } from '@/types';

const l = (o: Partial<CotizacionLinea>): CotizacionLinea => ({
  id: 'x', cotizacion_id: 'c1', producto_id: null, cod: 'C', producto: 'P', familia: 'F', proveedor: 'P',
  unid: 'LT', es_fertilizante: false, cantidad: 1, costo_usd: 0, costo_lista_usd: null, costo_editado: false,
  margen: 10, precio_usd: 1000, flete_usd: 0, total_usd: 1000, con_flete: false, iva: 21, plazo_dias: null, orden: 0, ...o,
});
const cot = (o: Partial<Cotizacion> = {}) => ({ id: 'c1', numero: 5, tc: 1500, con_iva: false, plazo_dias: 0, tasa_mensual: 1.5, ...o }) as Cotizacion;
const cobro = (o: Partial<Cobranza>): Cobranza => ({ id: 'b', cotizacion_id: 'c1', vencimiento: '2026-10-10', plazo_dias: 0, monto_usd: 100, estado: 'Pendiente', cobrada_el: null, nota: null, created_at: '', updated_at: '', ...o });

describe('generarCobranzas', () => {
  it('un cobro por cada plazo distinto, con su financiación', () => {
    const r = generarCobranzas(cot(), [l({ plazo_dias: 0 }), l({ plazo_dias: 60 }), l({ plazo_dias: 60 })], '2026-10-07');
    expect(r).toEqual([
      { plazo_dias: 0, vencimiento: '2026-10-07', monto_usd: 1000 },
      { plazo_dias: 60, vencimiento: '2026-12-06', monto_usd: 2060 },
    ]);
  });
  it('suma el IVA de cada fila si la cotización lo lleva', () => {
    const r = generarCobranzas(cot({ con_iva: true }), [l({ plazo_dias: 0, iva: 21 }), l({ plazo_dias: 30, iva: 10.5, total_usd: 1000 })], '2026-10-07');
    expect(r[0].monto_usd).toBe(1210);
    expect(r[1].monto_usd).toBe(1121.58);
  });
  it('filas sin plazo propio usan el de la cabecera', () => {
    const r = generarCobranzas(cot({ plazo_dias: 30 }), [l({ plazo_dias: null })], '2026-10-07');
    expect(r).toHaveLength(1);
    expect(r[0].vencimiento).toBe('2026-11-06');
  });
});

describe('situación y resumen', () => {
  const hoy = '2026-10-07';
  it('clasifica cada cobro', () => {
    expect(situacionCobro(cobro({ vencimiento: '2026-10-05' }), hoy)).toBe('vencida');
    expect(situacionCobro(cobro({ vencimiento: '2026-10-07' }), hoy)).toBe('hoy');
    expect(situacionCobro(cobro({ vencimiento: '2026-10-12' }), hoy)).toBe('semana');
    expect(situacionCobro(cobro({ vencimiento: '2026-12-01' }), hoy)).toBe('futura');
    expect(situacionCobro(cobro({ estado: 'Cobrada' }), hoy)).toBe('cobrada');
  });
  it('suma lo pendiente, lo vencido y lo de los próximos 30 días', () => {
    const r = resumenCobranzas([
      cobro({ vencimiento: '2026-10-01', monto_usd: 100 }),
      cobro({ vencimiento: '2026-10-07', monto_usd: 200 }),
      cobro({ vencimiento: '2026-10-20', monto_usd: 300 }),
      cobro({ vencimiento: '2026-12-20', monto_usd: 400 }),
      cobro({ estado: 'Cobrada', monto_usd: 999 }),
    ], hoy);
    expect(r).toMatchObject({ porCobrar: 1000, vencido: 100, hoy: 200, proximos30: 500, cantVencidas: 1, cantHoy: 1 });
  });
  it('cobro en granos solo si es canje', () => {
    expect(cobroEnGranos(cobro({}))).toBeNull();
    const g = cobroEnGranos(cobro({ monto_usd: 1000, cotizacion: { numero: 1, cliente_nombre: 'X', canje_cultivo: 'Soja', canje_precio_usd: 400, con_iva: false } }));
    expect(g).toEqual({ cultivo: 'Soja', tn: 2.5 });
  });
});
