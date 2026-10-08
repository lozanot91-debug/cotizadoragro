import { describe, expect, it } from 'vitest';
import {
  calcularTotalesFacturacion, condicionesIniciales, lineasDesdeCotizacion, describirCondicion, nuevaCondicion, sinUsar,
  textoWhatsAppFacturacion, urlFacturacion, validarPedidoFacturacion, type LineaFacturacion,
} from './facturacion';
import { PARAMS_CANJE_BASE, netoPorTn } from './canje';

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');
const linea = (o: Partial<LineaFacturacion>): LineaFacturacion => ({
  cod: 'UREA', producto: 'Urea', unidad: 'TN', es_fertilizante: true, cantidad: 10, costo_usd: 600,
  precio_usd: 700, flete_usd: 20, margen: 14.29, iva: 10.5, condicion_id: 'a', ...o,
});

describe('calcularTotalesFacturacion', () => {
  const contado = { ...nuevaCondicion('contado'), id: 'a' };
  const tarjeta = { ...nuevaCondicion('tarjeta', { tarjeta: 'Agro Nación', plazo_dias: 180, tasa_mensual: 1, nd_pct: 3 }), id: 'b' };
  const canje = { ...nuevaCondicion('canje', { cultivo: 'Soja', precio_cultivo: 300 }), id: 'c' };

  it('contado: precio con flete × cantidad, más IVA', () => {
    const t = calcularTotalesFacturacion([linea({})], [contado]);
    expect(t.subtotal).toBeCloseTo(7200, 6);
    expect(t.iva).toBeCloseTo(756, 6);
    expect(t.total).toBeCloseTo(7956, 6);
  });

  it('tarjeta: recargo = tasa × días / 30 sobre la base, IVA sobre lo financiado, ND sobre el total', () => {
    const t = calcularTotalesFacturacion([linea({ condicion_id: 'b', iva: 21, cantidad: 1, precio_usd: 100, flete_usd: 0 })], [tarjeta]);
    const c = t.porCondicion[0];
    expect(c.recargoPct).toBe(6);
    expect(c.recargo).toBeCloseTo(6, 6);
    expect(c.iva).toBeCloseTo(106 * 0.21, 6);
    expect(c.total).toBeCloseTo(128.26, 6);
    expect(c.ndMonto).toBeCloseTo(128.26 * 0.03, 6);
    expect(t.ndTotal).toBeCloseTo(c.ndMonto!, 6);
  });

  it('mezcla condiciones y calcula toneladas de canje', () => {
    const ls = [linea({}), linea({ condicion_id: 'c', cantidad: 5 }), linea({ condicion_id: 'b', iva: 21, cantidad: 1, precio_usd: 100, flete_usd: 0 })];
    const t = calcularTotalesFacturacion(ls, [contado, tarjeta, canje]);
    expect(t.porCondicion.map((c) => c.lineas)).toEqual([1, 1, 1]);
    const cj = t.porCondicion[2];
    expect(cj.total).toBeCloseTo(3600 * 1.105, 6);
    expect(cj.toneladas).toBeCloseTo((3600 * 1.105) / 300, 6);
    expect(t.total).toBeCloseTo(7956 + 3978 + 128.26, 6);
  });

  it('canje con liquidación: toneladas = total con IVA / neto por tn', () => {
    const params = { ...PARAMS_CANJE_BASE, pago_pct: 98, flete_usd_tn: 25 };
    const c = { ...nuevaCondicion('canje', { cultivo: 'Soja', precio_cultivo: 340, canje_params: params }), id: 'c' };
    const t = calcularTotalesFacturacion([linea({ condicion_id: 'c', cantidad: 5 })], [c]);
    const cj = t.porCondicion[0];
    expect(cj.netoTn).toBeCloseTo(323.190234, 6);
    expect(cj.toneladas).toBeCloseTo((3600 * 1.105) / netoPorTn(340, params), 6);
    expect(describirCondicion(c, fmt)).toBe('Canje · Soja a USD 340,00/tn · neto USD 323,19/tn · Necochea, condiciones cámara');
  });
});

describe('condicionesIniciales', () => {
  it('canje en la cotización: una sola condición de canje', () => {
    const r = condicionesIniciales([{ plazo_dias: 0 }, { plazo_dias: 90 }], { plazo_dias: 90, tasa_mensual: 2, canje_cultivo: 'Maíz', canje_precio_usd: 180 });
    expect(r.condiciones).toHaveLength(1);
    expect(r.condiciones[0]).toMatchObject({ tipo: 'canje', cultivo: 'Maíz', precio_cultivo: 180 });
    expect(new Set(r.asignacion).size).toBe(1);
  });
  it('sin canje: contado y una financiada por plazo', () => {
    const r = condicionesIniciales([{ plazo_dias: 0 }, { plazo_dias: 90 }, { plazo_dias: 90 }, { plazo_dias: 180 }], { plazo_dias: 180, tasa_mensual: 2, canje_cultivo: null, canje_precio_usd: 0 });
    expect(r.condiciones.map((c) => [c.tipo, c.plazo_dias ?? 0])).toEqual([['contado', 0], ['financiado', 90], ['financiado', 180]]);
    expect(r.asignacion[1]).toBe(r.asignacion[2]);
    expect(r.asignacion[0]).not.toBe(r.asignacion[1]);
  });
});

describe('validarPedidoFacturacion', () => {
  const base = { nota_venta: '', observaciones: '' };
  it('acepta un pedido completo', () => {
    expect(validarPedidoFacturacion({ ...base, lineas: [linea({})], condiciones: [{ id: 'a', tipo: 'contado' }] })).toEqual([]);
  });
  it('pide los datos de cada condición usada', () => {
    const errores = validarPedidoFacturacion({
      ...base,
      lineas: [linea({ condicion_id: 't' }), linea({ condicion_id: 'k' })],
      condiciones: [{ id: 't', tipo: 'tarjeta', nd_pct: 150 }, { id: 'k', tipo: 'canje' }, { id: 'f', tipo: 'financiado' }],
    });
    expect(errores).toContain('Tarjeta: falta el plazo.');
    expect(errores).toContain('Tarjeta: falta cuál es.');
    expect(errores).toContain('Tarjeta: el % de nota de débito tiene que estar entre 0 y 100.');
    expect(errores).toContain('Canje: falta el precio del grano.');
    // la financiada no tiene productos: no se valida
    expect(errores.some((e) => e.startsWith('Financiado'))).toBe(false);
  });
  it('rechaza cantidades en cero, líneas sin condición y nota de venta rara', () => {
    expect(validarPedidoFacturacion({ ...base, lineas: [linea({ cantidad: 0 })], condiciones: [{ id: 'a', tipo: 'contado' }] }).length).toBe(1);
    expect(validarPedidoFacturacion({ ...base, lineas: [linea({ condicion_id: 'x' })], condiciones: [{ id: 'a', tipo: 'contado' }] })).toContain('Cada producto tiene que tener una condición de pago.');
    expect(validarPedidoFacturacion({ ...base, nota_venta: '00012-3456', lineas: [linea({})], condiciones: [{ id: 'a', tipo: 'contado' }] })).toEqual([]);
    expect(validarPedidoFacturacion({ ...base, nota_venta: '12;drop', lineas: [linea({})], condiciones: [{ id: 'a', tipo: 'contado' }] }).length).toBe(1);
    expect(validarPedidoFacturacion({ ...base, lineas: [], condiciones: [] })).toContain('No hay productos para facturar.');
  });
});

describe('textos', () => {
  it('describe cada condición', () => {
    expect(describirCondicion({ id: 'x', tipo: 'tarjeta', tarjeta: 'Agro Nación', plazo_dias: 180, tasa_mensual: 0, nd_pct: 3 }, fmt)).toBe('Tarjeta Agro Nación · 180 días · sin interés · ND 3,00 %');
    expect(describirCondicion({ id: 'x', tipo: 'canje', cultivo: 'Soja', precio_cultivo: 300 }, fmt)).toBe('Canje · Soja a USD 300,00/tn');
    expect(describirCondicion({ id: 'x', tipo: 'financiado', plazo_dias: 90, tasa_mensual: 1.5 }, fmt)).toBe('Financiado · 90 días · 1,50 % mensual');
  });
  it('arma link y texto de WhatsApp', () => {
    const url = urlFacturacion('https://app.test/', 'a'.repeat(64));
    expect(url).toBe(`https://app.test/?facturar=${'a'.repeat(64)}`);
    expect(textoWhatsAppFacturacion({ url, nombre: 'La Peña - 002', notaVenta: '4521' })).toContain('Nota de venta: 4521');
    expect(textoWhatsAppFacturacion({ url, nombre: 'La Peña - 002' })).toContain('Pedido de facturación · La Peña - 002');
  });
  it('detecta condiciones sin productos', () => {
    expect(sinUsar([{ id: 'a', tipo: 'contado' }, { id: 'b', tipo: 'canje' }], [{ condicion_id: 'a' }]).map((c) => c.id)).toEqual(['b']);
  });
});

describe('lineasDesdeCotizacion', () => {
  const base = { cotizacion_id: 'c', producto_id: 'p', familia: null, proveedor: null, costo_lista_usd: 600, costo_editado: false, total_usd: 0 };
  const ls = [
    { ...base, id: 'l2', orden: 1, cod: 'GLIFO', producto: 'Glifosato', unid: 'LTS', es_fertilizante: false, cantidad: 100, costo_usd: 4, precio_usd: 5, flete_usd: 0, con_flete: false, margen: 20, iva: 21, plazo_dias: 180 },
    { ...base, id: 'l1', orden: 0, cod: 'UREA', producto: 'Urea', unid: 'KGRS', es_fertilizante: true, cantidad: 30, costo_usd: 600, precio_usd: 700, flete_usd: 25, con_flete: true, margen: 14, iva: 10.5, plazo_dias: 0 },
  ] as never[];
  it('toma lo ganado con su precio real, en orden, y recalcula el margen', () => {
    const r = lineasDesdeCotizacion(ls, { l1: { cantidad: 20, precio: 750 }, l2: { cantidad: 0, precio: 5, motivo: 'Precio' } }, (l) => l.iva ?? 0);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cod: 'UREA', cantidad: 20, precio_usd: 750, flete_usd: 25, margen: 20, iva: 10.5, plazo_dias: 0 });
  });
  it('sin cantidades reales toma todo lo cotizado', () => {
    const r = lineasDesdeCotizacion(ls, null, () => 21);
    expect(r.map((l) => l.cod)).toEqual(['UREA', 'GLIFO']);
    expect(r[1]).toMatchObject({ cantidad: 100, flete_usd: 0, margen: 20 });
  });
});
