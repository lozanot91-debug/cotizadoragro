import { describe, it, expect } from 'vitest';
import { gananciaLinea, calcularRentabilidad } from './rentabilidad';
import type { Cotizacion, CotizacionLinea } from '@/types';

const l = (o: Partial<CotizacionLinea>): CotizacionLinea => ({
  id: 'l1', cotizacion_id: 'c1', producto_id: null, cod: 'A', producto: 'Producto A', familia: 'FAM', proveedor: 'PROV',
  unid: 'LT', es_fertilizante: false, cantidad: 10, costo_usd: 80, costo_lista_usd: 80, costo_editado: false, margen: 20,
  precio_usd: 100, flete_usd: 0, total_usd: 1000, con_flete: false, iva: 21, plazo_dias: null, orden: 0, ...o,
});
const c = (o: Partial<Cotizacion>): Cotizacion => ({
  id: 'c1', numero: 1, cliente_nombre: 'ALTOSENA', fecha: '2026-10-01', estado: 'Ganada', cantidades_reales: null, ...o,
} as Cotizacion);

describe('gananciaLinea', () => {
  it('ganancia = (precio − costo) × cantidad y margen sobre venta', () => {
    const g = gananciaLinea(l({}));
    expect(g.venta).toBe(1000);
    expect(g.ganancia).toBe(200);
    expect(g.margenPct).toBeCloseTo(20, 6);
  });
  it('el flete no cuenta como ganancia ni como venta', () => {
    const g = gananciaLinea(l({ flete_usd: 25, total_usd: 1250 }));
    expect(g.venta).toBe(1000);
    expect(g.ganancia).toBe(200);
  });
  it('usa cantidades y precios reales (guardados como texto) si existen', () => {
    const g = gananciaLinea(l({}), { l1: { cantidad: '8', precio: '95,5' } as never });
    expect(g.usoReales).toBe(true);
    expect(g.venta).toBeCloseTo(764, 6);
    expect(g.ganancia).toBeCloseTo(764 - 640, 6);
  });
  it('real vacío = usa lo cotizado', () => {
    const g = gananciaLinea(l({}), { l1: { cantidad: '', precio: '' } as never });
    expect(g.venta).toBe(1000);
    expect(g.usoReales).toBe(false);
  });
});

describe('calcularRentabilidad', () => {
  const cots = [c({}), c({ id: 'c2', numero: 2, cliente_nombre: 'OTRO', estado: 'Perdida' }), c({ id: 'c3', numero: 3, fecha: '2026-08-01' })];
  const lins = [
    l({}),
    l({ id: 'l2', cotizacion_id: 'c2' }),
    l({ id: 'l3', cotizacion_id: 'c3', cod: 'B', producto: 'B', proveedor: 'P2', precio_usd: 50, costo_usd: 50, costo_editado: true }),
  ];
  it('filtra por estado y por fecha', () => {
    const r = calcularRentabilidad(cots, lins, { estados: ['Ganada'] });
    expect(r.cotizaciones).toBe(2);
    expect(r.venta).toBe(1000 + 500);
    expect(r.ganancia).toBe(200);
    const r2 = calcularRentabilidad(cots, lins, { estados: ['Ganada'], desde: '2026-09-01' });
    expect(r2.cotizaciones).toBe(1);
  });
  it('agrupa por producto, proveedor y cliente, y cuenta costos editados', () => {
    const r = calcularRentabilidad(cots, lins, { estados: ['Ganada', 'Perdida'] });
    expect(r.filas.producto.map((f) => f.clave)).toEqual(['A', 'B']);
    expect(r.filas.producto[0].ganancia).toBe(400);
    expect(r.filas.proveedor.find((f) => f.clave === 'P2')!.margenPct).toBe(0);
    expect(r.filas.cliente.map((f) => f.clave).sort()).toEqual(['ALTOSENA', 'OTRO']);
    expect(r.conCostoEditado).toBe(1);
    expect(r.filas.cotizacion.find((f) => f.clave === 'N° 2')!.cotizacionId).toBe('c2');
  });
});
