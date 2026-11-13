import { describe, it, expect } from 'vitest';
import { hidratarLineaGuardada } from './hidratarCotizacion';
import { calcularLinea, calcularTotalesIva } from './calculations';
import type { CotizacionLinea, ProductoConCosto, TarifaFlete } from '@/types';

const tarifas: TarifaFlete[] = [{ id: '150', km: 150, tarifa: 3457.077 }];
const ctx = { tc: 1400, tcFlete: 1380, km: 150, tarifaFlete: tarifas };

const prod = (o: Partial<ProductoConCosto> = {}): ProductoConCosto => ({
  id: 'p1', cod: 'GLI', proveedor: 'X', familia: 'HERB', producto: 'GLIFO', unid: 'LT',
  costo: 5, moneda: 'USD', margen_default: null, margen_producto: null, es_fertilizante: false, ...o,
} as ProductoConCosto);

/** Línea guardada tal como la guarda el editor (calcularLinea al momento de cotizar). */
function guardar(p: ProductoConCosto, margen: number, over: number | null, conFlete = false, tc = 1400): CotizacionLinea {
  const c = calcularLinea({ producto: p, cantidad: 10, margen, conFlete, tc, km: 150, tarifaFlete: tarifas, tcFlete: 1380, costoOverrideUSD: over });
  return {
    id: 'l1', cotizacion_id: 'c1', producto_id: p.id, cod: p.cod, producto: p.producto!, familia: p.familia!, proveedor: p.proveedor!,
    unid: p.unid!, es_fertilizante: p.es_fertilizante, cantidad: 10, costo_usd: c.costoUSD, costo_lista_usd: c.costoListaUSD,
    costo_editado: c.costoEditado, margen, precio_usd: c.precioUSD, flete_usd: c.fleteUSD, total_usd: c.totalUSD,
    con_flete: conFlete, iva: 21, plazo_dias: 0, orden: 0,
  };
}

function rehidratar(l: CotizacionLinea, p: ProductoConCosto | null, c = ctx) {
  const h = hidratarLineaGuardada(l, p, c);
  const r = calcularLinea({ producto: h.producto, cantidad: l.cantidad, margen: l.margen, conFlete: l.con_flete, tc: c.tc, km: c.km, tarifaFlete: c.tarifaFlete, tcFlete: c.tcFlete, costoOverrideUSD: h.costoOverrideUSD });
  return { h, r };
}

describe('hidratarLineaGuardada', () => {
  it('lista con otro costo para el mismo cod: se mantiene lo guardado', () => {
    const l = guardar(prod(), 20, null);
    const { r } = rehidratar(l, prod({ costo: 9 }));
    expect(r.costoUSD).toBe(l.costo_usd);
    expect(r.precioUSD).toBeCloseTo(l.precio_usd, 2);
    expect(r.totalUSD).toBeCloseTo(l.total_usd, 2);
    expect(r.costoListaUSD).toBe(5);
    expect(r.costoEditado).toBe(false);
  });

  it('producto que no está en la lista: la línea se conserva con los datos guardados', () => {
    const l = guardar(prod(), 20, null);
    const { h, r } = rehidratar(l, null);
    expect(h.producto).toMatchObject({ id: 'p1', cod: 'GLI', producto: 'GLIFO', familia: 'HERB', proveedor: 'X', unid: 'LT' });
    expect(r.costoUSD).toBe(l.costo_usd);
    expect(r.precioUSD).toBeCloseTo(l.precio_usd, 2);
    expect(r.totalUSD).toBeCloseTo(l.total_usd, 2);
  });

  it('costo_editado true y false reproducen lo guardado (también fertilizante con flete)', () => {
    const fert = prod({ cod: 'UREA', unid: 'KGRS', familia: 'FERTILIZANTE', proveedor: 'FERTILIZANTE', costo: 0.61, es_fertilizante: true });
    for (const [p, over, flete] of [[prod(), 7, false], [prod(), null, false], [fert, 650, true], [fert, null, true]] as const) {
      const l = guardar(p, 12.3456, over, flete);
      const { r } = rehidratar(l, { ...p, costo: p.costo * 3 });
      expect(r.costoEditado).toBe(l.costo_editado);
      expect(r.costoListaUSD).toBeCloseTo(l.costo_lista_usd!, 6);
      expect(r.costoUSD).toBeCloseTo(l.costo_usd, 6);
      expect(r.precioUSD).toBeCloseTo(l.precio_usd, 2);
      expect(r.fleteUSD).toBeCloseTo(l.flete_usd, 2);
      expect(r.totalUSD).toBeCloseTo(l.total_usd, 2);
    }
  });

  it('costo en pesos: con otro TC hoy el precio queda como se guardó', () => {
    const ars = prod({ costo: 7000, moneda: 'ARS' });
    const l = guardar(ars, 25, null, false, 1400);
    expect(l.costo_usd).toBeCloseTo(5, 6);
    const { r } = rehidratar(l, { ...ars, costo: 8000 }, { ...ctx, tc: 1500 });
    expect(r.costoUSD).toBeCloseTo(5, 6);
    expect(r.precioUSD).toBeCloseTo(l.precio_usd, 2);
    expect(r.totalUSD).toBeCloseTo(l.total_usd, 2);
  });

  it('cotización vieja sin costo_lista_usd: cae al costo guardado', () => {
    const l = { ...guardar(prod(), 20, null), costo_lista_usd: null };
    const { r } = rehidratar(l, null);
    expect(r.costoUSD).toBe(l.costo_usd);
    expect(r.costoListaUSD).toBe(l.costo_usd);
    expect(r.precioUSD).toBeCloseTo(l.precio_usd, 2);
  });

  it('ida y vuelta: los totales dan igual a los guardados', () => {
    const ls = [guardar(prod(), 18.123456789, null), guardar(prod({ cod: 'B', costo: 3.3 }), 31.987654321, 3.9), guardar(prod({ cod: 'C', costo: 7000, moneda: 'ARS' }), 22, null)];
    const guardado = calcularTotalesIva(ls.map((l) => ({ totalUSD: l.total_usd, ivaPercent: 21, recargoPct: 3 })), 1400);
    const nuevo = calcularTotalesIva(ls.map((l) => ({ totalUSD: rehidratar(l, prod({ costo: 99 }), { ...ctx, tc: 1600 }).r.totalUSD, ivaPercent: 21, recargoPct: 3 })), 1400);
    for (const k of ['subtotal', 'recargo', 'iva', 'total'] as const) expect(Math.abs(nuevo[k] - guardado[k])).toBeLessThan(0.005);
  });

  it('margen con muchos decimales mantiene el precio al centavo', () => {
    const l = guardar(prod({ costo: 4.37 }), 23.456789012345, null);
    const { r } = rehidratar(l, null);
    expect(Math.abs(r.precioUSD - l.precio_usd)).toBeLessThan(0.005);
    expect(Math.abs(r.totalUSD - l.total_usd)).toBeLessThan(0.005);
  });
});

describe('hidratarLineaGuardada en pesos', () => {
  // Cotización en pesos: el motor corre con tc 1 y las columnas *_ars son las reales
  const ab = prod({ familia: 'AB PRODUCTO', cod: 'BAL', producto: 'BALANCEADO', unid: 'KG', costo: 850, moneda: 'ARS' });
  const ctxARS = { ...ctx, tc: 1, moneda: 'ARS' as const };
  function guardarARS(over: number | null) {
    const c = calcularLinea({ producto: ab, cantidad: 10, margen: 20, conFlete: false, tc: 1, km: 150, tarifaFlete: tarifas, tcFlete: 1380, costoOverrideUSD: over });
    return {
      ...guardar(ab, 20, over, false, 1),
      costo_usd: c.costoUSD / 1400, costo_lista_usd: c.costoListaUSD / 1400, precio_usd: c.precioUSD / 1400, total_usd: c.totalUSD / 1400,
      costo_ars: c.costoUSD, costo_lista_ars: c.costoListaUSD, precio_ars: c.precioUSD, total_ars: c.totalUSD,
    } as CotizacionLinea;
  }

  it('reproduce el precio y el total en pesos desde *_ars, sin usar la lista de hoy', () => {
    const l = guardarARS(null);
    const h = hidratarLineaGuardada(l, { ...ab, costo: 999 }, ctxARS);
    expect(h.producto.moneda).toBe('ARS');
    expect(h.calc.costoUSD).toBeCloseTo(l.costo_ars!, 2);
    expect(h.calc.precioUSD).toBeCloseTo(l.precio_ars!, 2);
    expect(h.calc.totalUSD).toBeCloseTo(l.total_ars!, 2);
    expect(h.calc.costoEditado).toBe(false);
  });

  it('costo editado: queda el override en pesos y la foto de lista en pesos', () => {
    const l = guardarARS(900);
    const h = hidratarLineaGuardada(l, null, ctxARS);
    expect(h.costoOverrideUSD).toBe(900);
    expect(h.calc.costoEditado).toBe(true);
    expect(h.calc.costoListaUSD).toBeCloseTo(850, 2);
    expect(h.calc.totalUSD).toBeCloseTo(l.total_ars!, 2);
  });

  it('cotización vieja sin costo_lista_ars: la foto es costo_ars', () => {
    const l = { ...guardarARS(null), costo_lista_ars: null } as CotizacionLinea;
    const h = hidratarLineaGuardada(l, null, ctxARS);
    expect(h.calc.costoListaUSD).toBeCloseTo(l.costo_ars!, 2);
  });
});
