import { describe, it, expect } from 'vitest';
import { opcionesParaMostrar, filasMatriz, totalesOpciones, avisoFormasDePago } from './opcionesSalida';
import { calcularOpcion } from './opcionesPago';
import { financiacionLinea } from './export';
import type { Cotizacion, CotizacionLinea, OpcionPago } from '@/types';

const linea = (o: Partial<CotizacionLinea>): CotizacionLinea => ({
  id: 'x', cotizacion_id: '', producto_id: null, cod: 'C', producto: 'Producto', familia: 'F', proveedor: 'P',
  unid: 'LT', es_fertilizante: false, cantidad: 1, costo_usd: 0, costo_lista_usd: null, costo_editado: false,
  margen: 10, precio_usd: 100, flete_usd: 0, total_usd: 100, con_flete: false, iva: 21, plazo_dias: null, orden: 0, ...o,
});
const principal: OpcionPago = { id: 'principal', nombre: 'Contado', tasa_mensual: 0, plazos: [0, 0] };
const alt: OpcionPago = { id: 'o2', nombre: 'Cosecha', tasa_mensual: 2, plazos: [0, 150] };
const base = { fecha: '2026-10-07', tc: 1000, con_iva: true, iva: 21, tasa_mensual: 0 } as Cotizacion;
const con = (o: Partial<Cotizacion>) => ({ ...base, ...o }) as Cotizacion;
const lineas = [linea({ id: 'a', total_usd: 100 }), linea({ id: 'b', total_usd: 200, precio_usd: 200 })];

describe('opcionesParaMostrar', () => {
  it('vacío sin opciones, con solo principal o si el cliente ya eligió', () => {
    expect(opcionesParaMostrar(con({}))).toEqual([]);
    expect(opcionesParaMostrar(con({ opciones_pago: [principal] }))).toEqual([]);
    expect(opcionesParaMostrar(con({ opciones_pago: [principal, alt], opcion_elegida: 'o2' }))).toEqual([]);
  });
  it('principal + 1 alternativa, principal primero', () => {
    expect(opcionesParaMostrar(con({ opciones_pago: [principal, alt], opcion_elegida: null })).map((o) => o.id)).toEqual(['principal', 'o2']);
    expect(opcionesParaMostrar(con({ opciones_pago: [alt, principal] })).map((o) => o.id)).toEqual(['principal', 'o2']);
  });
});

describe('filasMatriz y totales', () => {
  const c = con({ opciones_pago: [principal, alt] });
  it('plazos mixtos por artículo; la principal coincide con financiacionLinea', () => {
    const f = filasMatriz(c, lineas);
    expect(f[0].celdas.map((x) => x.plazo)).toEqual([0, 0]);
    expect(f[1].celdas.map((x) => x.plazo)).toEqual([0, 150]);
    expect(f[1].celdas[0].precioUnit).toBe(financiacionLinea(lineas[1], c).precioUnit);
    expect(f[1].celdas[1].precioUnit).toBeGreaterThan(200);
    expect(f[1].celdas[0].vence).toBe('');
    expect(f[1].celdas[1].vence).toBe('2027-03-06');
    expect(f[0].celdas[1].precioUnit).toBe(100);
  });
  it('totales = calcularOpcion', () => {
    const t = totalesOpciones(c, lineas);
    expect(t.map((x) => x.opcion.id)).toEqual(['principal', 'o2']);
    expect(t[1].totales).toEqual(calcularOpcion(c, lineas, alt).totales);
    expect(t[1].totales.recargo).toBeGreaterThan(0);
  });
});

describe('avisoFormasDePago', () => {
  it('avisa con la cantidad (con la principal) solo si hay opciones sin elegir', () => {
    expect(avisoFormasDePago(con({ opciones_pago: [principal, alt], opcion_elegida: null }))).toBe('2 formas de pago · sin elegir');
    expect(avisoFormasDePago(con({ opciones_pago: [principal, alt], opcion_elegida: 'o2' }))).toBeNull();
    expect(avisoFormasDePago(con({}))).toBeNull();
  });
});
