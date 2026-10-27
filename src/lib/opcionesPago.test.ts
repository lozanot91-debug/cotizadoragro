import { describe, it, expect } from 'vitest';
import type { Cotizacion, CotizacionLinea, OpcionPago } from '@/types';
import { totalesDeCotizacion } from './export';
import {
  ID_PRINCIPAL, MAX_OPCIONES, normalizarOpciones, calcularOpcion, aplicarOpcion,
  opcionPrincipalDesdeLineas, alinearOpcionesTrasQuitar, validarOpciones,
} from './opcionesPago';

const linea = (o: Partial<CotizacionLinea>): CotizacionLinea => ({
  id: 'x', cotizacion_id: '', producto_id: null, cod: 'C', producto: 'Producto', familia: 'F', proveedor: 'P',
  unid: 'LT', es_fertilizante: false, cantidad: 1, costo_usd: 0, costo_lista_usd: null, costo_editado: false,
  margen: 10, precio_usd: 100, flete_usd: 0, total_usd: 100, con_flete: false, iva: 21, plazo_dias: 0, orden: 0, ...o,
});
const cotiz = {
  numero: 1, fecha: '2026-10-07', cliente_nombre: 'X', tc: 1000, km: 0, vigencia_dias: 15, iva: 21, con_iva: true,
  plazo_dias: 0, tasa_mensual: 0, subtotal_usd: 300, recargo_usd: 0, iva_usd: 63, total_usd: 363, total_ars: 363000,
} as Cotizacion;
const lineas = [linea({ orden: 0 }), linea({ orden: 1, precio_usd: 200, total_usd: 200 })];
const op = (o: Partial<OpcionPago>): OpcionPago => ({ id: 'op-a', nombre: 'A', tasa_mensual: 0.7, plazos: [0, 150], ...o });
const principal = op({ id: ID_PRINCIPAL, nombre: 'Contado', tasa_mensual: 0, plazos: [0, 0] });

describe('calcularOpcion', () => {
  it('contado vs financiado sobre las mismas líneas', () => {
    const c = calcularOpcion(cotiz, lineas, principal);
    expect(c.totales.recargo).toBe(0);
    expect(c.totales.total).toBeCloseTo(363, 6);
    const f = calcularOpcion(cotiz, lineas, op({ plazos: [60, 60], tasa_mensual: 1.5 }));
    expect(f.totales.recargo).toBeCloseTo(9, 6);
    expect(f.totales.total).toBeCloseTo(300 * 1.03 * 1.21, 6);
  });
  it('una celda de 10 días vale lo mismo que contado', () => {
    const r = calcularOpcion(cotiz, lineas, op({ plazos: [10, 10], tasa_mensual: 1.5 }));
    expect(r.lineas.every((x) => x.pct === 0)).toBe(true);
    expect(r.totales.total).toBeCloseTo(calcularOpcion(cotiz, lineas, principal).totales.total, 6);
  });
  it('plazos mixtos por artículo: solo la línea 1 recarga', () => {
    const r = calcularOpcion(cotiz, lineas, op({}));
    expect(r.lineas[0].pct).toBe(0);
    expect(r.lineas[1].pct).toBeCloseTo(3.5, 6);
    expect(r.lineas[1].precioUnit).toBeCloseTo(200 * 1.035, 6);
    expect(r.lineas[1].total).toBeCloseTo(207, 6);
    expect(r.totales.recargo).toBeCloseTo(7, 6);
  });
  it('mes entero redondeado hacia arriba: 76 días x 1,5% = 4,5%', () => {
    const r = calcularOpcion(cotiz, lineas, op({ plazos: [76, 0], tasa_mensual: 1.5 }));
    expect(r.lineas[0].pct).toBeCloseTo(4.5, 6);
  });
  it('el subtotal no depende de la opción (pipeline intacto)', () => {
    const base = totalesDeCotizacion(cotiz, lineas).subtotal;
    for (const o of [principal, op({}), op({ plazos: [365, 30], tasa_mensual: 3 })]) {
      expect(calcularOpcion(cotiz, lineas, o).totales.subtotal).toBe(base);
    }
  });
});

describe('aplicarOpcion', () => {
  it('no toca subtotal y es consistente con calcularOpcion', () => {
    const o = op({});
    const { cotizPatch, lineasPatch } = aplicarOpcion(cotiz, lineas, o);
    const t = calcularOpcion(cotiz, lineas, o).totales;
    expect('subtotal_usd' in cotizPatch).toBe(false);
    expect(cotizPatch).toEqual({
      plazo_dias: 150, tasa_mensual: 0.7, recargo_usd: t.recargo, iva_usd: t.iva,
      total_usd: t.total, total_ars: t.total * cotiz.tc, opcion_elegida: 'op-a',
    });
    expect(lineasPatch).toEqual([{ index: 0, plazo_dias: 0, tasa_mensual: null }, { index: 1, plazo_dias: 150, tasa_mensual: null }]);
  });
  it("elegir 'principal' restaura", () => {
    const o = op({});
    const { cotizPatch, lineasPatch } = aplicarOpcion(cotiz, lineas, principal);
    expect(cotizPatch.recargo_usd).toBe(0);
    expect(cotizPatch.total_usd).toBeCloseTo(363, 6);
    expect(cotizPatch.opcion_elegida).toBe(ID_PRINCIPAL);
    expect(lineasPatch.every((l) => l.plazo_dias === 0)).toBe(true);
    expect(o.id).not.toBe(ID_PRINCIPAL);
  });
});

describe('opcionPrincipalDesdeLineas', () => {
  it('Contado si todo es 0, Principal si no', () => {
    expect(opcionPrincipalDesdeLineas(cotiz, lineas)).toMatchObject({ id: 'principal', nombre: 'Contado', plazos: [0, 0] });
    const ls = [linea({}), linea({ plazo_dias: 30 })];
    expect(opcionPrincipalDesdeLineas({ ...cotiz, tasa_mensual: 2 } as Cotizacion, ls))
      .toMatchObject({ nombre: 'Principal', tasa_mensual: 2, plazos: [0, 30] });
  });
});

describe('normalizarOpciones', () => {
  it('rellena, recorta, corrige plazos inválidos y pone principal primera', () => {
    const r = normalizarOpciones([op({ plazos: [30] }), op({ id: 'op-b', plazos: [1, 2, 3, 4] })], 2);
    expect(r.map((o) => o.id)).toEqual(['principal', 'op-a', 'op-b']);
    expect(r[1].plazos).toEqual([30, 0]);
    expect(r[2].plazos).toEqual([1, 2]);
    expect(normalizarOpciones([op({ plazos: [-1, 2.5] })], 2)[1].plazos).toEqual([0, 0]);
  });
  it('descarta inválidas y vacío queda vacío', () => {
    expect(normalizarOpciones([], 2)).toEqual([]);
    expect(normalizarOpciones([{ id: '', nombre: 'x', tasa_mensual: 0, plazos: [] }], 2)).toEqual([]);
    expect(normalizarOpciones(undefined, 2)).toEqual([]);
  });
});

describe('alinearOpcionesTrasQuitar', () => {
  it('saca las posiciones de todas las opciones', () => {
    const r = alinearOpcionesTrasQuitar([op({ plazos: [1, 2, 3] }), op({ id: 'b', plazos: [4, 5, 6] })], [0, 2]);
    expect(r.map((o) => o.plazos)).toEqual([[2], [5]]);
  });
});

describe('validarOpciones', () => {
  it('opciones correctas no dan errores', () => {
    expect(validarOpciones([principal, op({})], 2)).toEqual([]);
  });
  it('detecta nombre vacío, ids repetidos, de más, tasa negativa e igual a principal', () => {
    expect(validarOpciones([principal, op({ nombre: ' ' })], 2).join()).toMatch(/nombre/);
    expect(validarOpciones([principal, op({}), op({})], 2).join()).toMatch(/repetido/);
    const muchas = Array.from({ length: MAX_OPCIONES + 1 }, (_, i) => op({ id: `op-${i}` }));
    expect(validarOpciones(muchas, 2).join()).toMatch(/Máximo/);
    expect(validarOpciones([principal, op({ tasa_mensual: -1 })], 2).join()).toMatch(/negativa/);
    expect(validarOpciones([principal, op({ plazos: [0, 0], tasa_mensual: 0 })], 2).join()).toMatch(/igual a la principal/);
  });
});

describe('tasa propia por artículo', () => {
  const cotiz = { tasa_mensual: 2, plazo_dias: 0, con_iva: false, tc: 1000, fecha: '2026-01-01', iva: 0 } as unknown as Cotizacion;
  const mk = (total: number) => ({ total_usd: total, precio_usd: total, flete_usd: 0, plazo_dias: 0, iva: 0 }) as unknown as CotizacionLinea;
  const lineas = [mk(1000), mk(1000)];

  it('usa la tasa de la opción cuando no hay tasa por artículo', () => {
    const r = calcularOpcion(cotiz, lineas, { id: 'a', nombre: 'A', tasa_mensual: 2, plazos: [60, 60] });
    expect(r.lineas[0].pct).toBe(r.lineas[1].pct);
  });
  it('un artículo puede tener su propia tasa y otro heredar la de la opción', () => {
    const base = calcularOpcion(cotiz, lineas, { id: 'a', nombre: 'A', tasa_mensual: 2, plazos: [60, 60] });
    const r = calcularOpcion(cotiz, lineas, { id: 'a', nombre: 'A', tasa_mensual: 2, plazos: [60, 60], tasas: [null, 4] });
    expect(r.lineas[0].pct).toBe(base.lineas[0].pct);
    expect(r.lineas[1].pct).toBeCloseTo(base.lineas[1].pct * 2, 4);
  });
  it('aplicarOpcion lleva la tasa de cada artículo a las líneas', () => {
    const { lineasPatch } = aplicarOpcion(cotiz, lineas, { id: 'a', nombre: 'A', tasa_mensual: 2, plazos: [60, 30], tasas: [null, 3] });
    expect(lineasPatch).toEqual([{ index: 0, plazo_dias: 60, tasa_mensual: null }, { index: 1, plazo_dias: 30, tasa_mensual: 3 }]);
  });
  it('normalizarOpciones descarta tasas inválidas y ajusta el largo', () => {
    const [p, o] = normalizarOpciones([
      { id: 'principal', nombre: 'P', tasa_mensual: 0, plazos: [0, 0, 0] },
      { id: 'x', nombre: 'X', tasa_mensual: 1, plazos: [10, 10, 10], tasas: [2, -1] as (number | null)[] },
    ], 3);
    expect(p.tasas).toBeUndefined();
    expect(o.tasas).toEqual([2, null, null]);
  });
});
