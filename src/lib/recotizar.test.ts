import { describe, it, expect } from 'vitest';
import { recotizar, cabeceraRecotizada } from './recotizar';
import type { Cotizacion, CotizacionLinea, ProductoConCosto, TarifaFlete } from '@/types';

const tarifas: TarifaFlete[] = [{ id: '150', km: 150, tarifa: 3457.077 }];
const config = { iva_fertilizantes: 10.5, iva_agroquimicos: 21 };

const prod = (o: Partial<ProductoConCosto>): ProductoConCosto => ({
  id: 'p1', cod: 'UREA', proveedor: 'FERTILIZANTE', familia: 'FERTILIZANTE', producto: 'UREA', unid: 'KGRS',
  costo: 0.61, moneda: 'USD', margen_default: null, margen_producto: null, es_fertilizante: true, ...o,
} as ProductoConCosto);

const linea = (o: Partial<CotizacionLinea>): CotizacionLinea => ({
  id: 'l1', cotizacion_id: 'c1', producto_id: 'p1', cod: 'UREA', producto: 'UREA', familia: 'FERTILIZANTE', proveedor: 'FERTILIZANTE',
  unid: 'KGRS', es_fertilizante: true, cantidad: 20, costo_usd: 610, costo_lista_usd: 610, costo_editado: false, margen: 10,
  precio_usd: 677.78, flete_usd: 24.69, total_usd: 14049.42, con_flete: true, iva: 10.5, plazo_dias: null, orden: 0, ...o,
});

const cotiz = (o: Partial<Cotizacion> = {}): Cotizacion => ({
  id: 'c1', numero: 7, cliente_id: 'cli', cliente_nombre: 'ALTOSENA', fecha: '2026-09-20', tc: 1400, km: 150, iva: 0, con_iva: false,
  plazo_dias: 0, tasa_mensual: 0, recargo_usd: 0, canje_cultivo: null, canje_precio_usd: 0, estado: 'Enviada', vigencia_dias: 15,
  subtotal_usd: 14049.42, iva_usd: 0, total_usd: 14049.42, total_ars: 0, notas: null, lista_id: 'vieja', ...o,
} as Cotizacion);

describe('recotizar', () => {
  it('con el mismo costo da el mismo precio (urea 702,47 con flete)', () => {
    const r = recotizar({ cotiz: cotiz(), lineas: [linea({})], productos: [prod({})], tarifas, config });
    expect(r.lineas[0].precio_usd! + r.lineas[0].flete_usd!).toBeCloseTo(702.47, 2);
    expect(Math.abs(r.variacionPct)).toBeLessThan(0.01);
    expect(r.bloqueada).toBeNull();
  });

  it('con costo nuevo mantiene margen, cantidad y flete, y calcula la variación', () => {
    const r = recotizar({ cotiz: cotiz(), lineas: [linea({})], productos: [prod({ costo: 0.671 })], tarifas, config });
    expect(r.lineas[0].margen).toBe(10);
    expect(r.lineas[0].cantidad).toBe(20);
    expect(r.lineas[0].con_flete).toBe(true);
    // costo +10% => precio sin flete +10%
    expect(r.lineas[0].precio_usd).toBeCloseTo(677.78 * 1.1, 1);
    expect(r.variacionPct).toBeGreaterThan(9);
    expect(r.subtotalNuevo).toBeGreaterThan(r.subtotalAnterior);
  });

  it('largo + corto: suma los dos tramos y se bloquea si falta la tarifa del corto', () => {
    const corto: TarifaFlete[] = [{ id: '25', km: 25, tarifa: 700 }];
    const c = cotiz({ flete_modalidad: 'largo_corto', km_corto: 25 });
    const r = recotizar({ cotiz: c, lineas: [linea({})], productos: [prod({})], tarifas, tarifasCorto: corto, config });
    expect(r.lineas[0].flete_usd).toBeCloseTo((3457.077 + 700) * 10 / 1400, 6);
    const sinCorto = recotizar({ cotiz: c, lineas: [linea({})], productos: [prod({})], tarifas, tarifasCorto: [], config });
    expect(sinCorto.bloqueada).toContain('corto');
    const h = cabeceraRecotizada(c, r, { fecha: '2026-10-08', vigenciaDias: 15, listaId: 'v', convenioFleteId: 'L', convenioCortoId: 'C' });
    expect(h).toMatchObject({ flete_modalidad: 'largo_corto', km_corto: 25, convenio_flete_id: 'L', convenio_corto_id: 'C' });
  });

  it('usa el TC de flete guardado y lo copia; las viejas (sin TC de flete) siguen con tc', () => {
    const c = cotiz({ tc_flete: 1350 });
    const r = recotizar({ cotiz: c, lineas: [linea({})], productos: [prod({})], tarifas, config });
    expect(r.lineas[0].flete_usd).toBeCloseTo(3457.077 * 10 / 1350, 6);
    expect(cabeceraRecotizada(c, r, { fecha: '2026-10-08', vigenciaDias: 15, listaId: 'v' }).tc_flete).toBe(1350);
    const vieja = recotizar({ cotiz: cotiz(), lineas: [linea({})], productos: [prod({})], tarifas, config });
    expect(vieja.lineas[0].flete_usd).toBeCloseTo(3457.077 * 10 / 1400, 6);
  });

  it('mantiene el costo editado a mano y lo avisa', () => {
    const l = linea({ costo_usd: 700, costo_editado: true });
    const r = recotizar({ cotiz: cotiz(), lineas: [l], productos: [prod({ costo: 0.9 })], tarifas, config });
    expect(r.lineas[0].costo_usd).toBe(700);
    expect(r.lineas[0].costo_editado).toBe(true);
    expect(r.avisos.costoEditado).toBe(1);
  });

  it('un producto que ya no está en la lista conserva su precio y se avisa', () => {
    const r = recotizar({ cotiz: cotiz(), lineas: [linea({})], productos: [], tarifas, config });
    expect(r.avisos.fueraDeLista).toHaveLength(1);
    expect(r.lineas[0].total_usd).toBe(14049.42);
  });

  it('los insumos manuales se conservan sin avisar', () => {
    const manual = linea({ producto_id: null, cod: 'MANUAL-123', es_fertilizante: false, total_usd: 100, iva: 21 });
    const r = recotizar({ cotiz: cotiz(), lineas: [manual], productos: [], tarifas, config });
    expect(r.avisos.fueraDeLista).toHaveLength(0);
    expect(r.lineas[0].total_usd).toBe(100);
  });

  it('sin tarifa para esos km, bloquea', () => {
    const r = recotizar({ cotiz: cotiz({ km: 999 }), lineas: [linea({})], productos: [prod({})], tarifas, config });
    expect(r.bloqueada).toMatch(/tarifa/i);
  });

  it('mantiene financiación e IVA en los totales', () => {
    const c = cotiz({ con_iva: true, plazo_dias: 60, tasa_mensual: 1.5 });
    const r = recotizar({ cotiz: c, lineas: [linea({})], productos: [prod({})], tarifas, config });
    expect(r.totales.recargo).toBeCloseTo(r.totales.subtotal * 0.03, 4);
    expect(r.totales.iva).toBeCloseTo((r.totales.subtotal * 1.03) * 0.105, 4);
  });

  it('conserva el plazo de cada fila (contado y financiada)', () => {
    const c = cotiz({ con_iva: false, plazo_dias: 60, tasa_mensual: 1.5 });
    const r = recotizar({
      cotiz: c, productos: [prod({})], tarifas, config,
      lineas: [linea({ plazo_dias: 0 }), linea({ id: 'l2', plazo_dias: 60 })],
    });
    expect(r.lineas.map((l) => l.plazo_dias)).toEqual([0, 60]);
    expect(r.totales.recargo).toBeCloseTo(r.lineas[1].total_usd! * 0.03, 4);
    expect(cabeceraRecotizada(c, r, { fecha: '2026-10-08', vigenciaDias: 15, listaId: 'x' }).plazo_dias).toBe(60);
  });

  it('cotización vieja con IVA 105% por error usa el IVA sugerido', () => {
    const c = cotiz({ con_iva: true, iva: 105 });
    const r = recotizar({ cotiz: c, lineas: [linea({ iva: null })], productos: [prod({})], tarifas, config });
    expect(r.lineas[0].iva).toBe(10.5);
  });

  it('la cabecera nueva queda en Borrador, enlazada a la original y con la lista vigente', () => {
    const c = cotiz({ canje_cultivo: 'Soja', canje_precio_usd: 400 });
    const r = recotizar({ cotiz: c, lineas: [linea({})], productos: [prod({})], tarifas, config });
    const h = cabeceraRecotizada(c, r, { fecha: '2026-10-08', vigenciaDias: 15, listaId: 'vigente' });
    expect(h.estado).toBe('Borrador');
    expect(h.cotizacion_origen_id).toBe('c1');
    expect(h.lista_id).toBe('vigente');
    expect(h.fecha).toBe('2026-10-08');
    expect(h.canje_precio_usd).toBe(400);
    expect(h.subtotal_usd).toBeCloseTo(r.totales.subtotal, 6);
    expect(h.convenio_flete_id).toBeNull();
  });

  it('guarda el convenio con el que se recalculó el flete', () => {
    const c = cotiz({});
    const r = recotizar({ cotiz: c, lineas: [linea({})], productos: [prod({})], tarifas, config });
    expect(cabeceraRecotizada(c, r, { fecha: '2026-10-08', vigenciaDias: 15, listaId: 'v', convenioFleteId: 'conv-678' }).convenio_flete_id).toBe('conv-678');
  });
});
