import { describe, it, expect } from 'vitest';
import { generarWhatsApp, totalesDeCotizacion } from './export';
import { calcularTotalesIva, recargoPorcentaje, toneladasCanje } from './calculations';
import { parseNumberInput } from './format';
import type { Cotizacion, CotizacionLinea, Configuracion } from '@/types';

const linea = (o: Partial<CotizacionLinea>): CotizacionLinea => ({
  id: 'x', cotizacion_id: '', producto_id: null, cod: 'C', producto: 'Producto', familia: 'F', proveedor: 'P',
  unid: 'LT', es_fertilizante: false, cantidad: 1, costo_usd: 0, costo_lista_usd: null, costo_editado: false,
  margen: 10, precio_usd: 100, flete_usd: 0, total_usd: 100, con_flete: false, iva: 21, orden: 0, ...o,
});
const cotiz = { numero: 1, fecha: '2026-10-07', cliente_nombre: 'ALTOSENA', tc: 1515, km: 0, vigencia_dias: 15, iva: 21, con_iva: true } as Cotizacion;
const config = { empresa_nombre: 'Agro' } as Configuracion;

describe('parseNumberInput', () => {
  it('acepta punto decimal y coma decimal', () => {
    expect(parseNumberInput('10.5')).toBe(10.5);
    expect(parseNumberInput('10,5')).toBe(10.5);
    expect(parseNumberInput('21')).toBe(21);
    expect(parseNumberInput('1515.5')).toBe(1515.5);
  });
  it('separador de miles argentino', () => {
    expect(parseNumberInput('1.500')).toBe(1500);
    expect(parseNumberInput('1.500,25')).toBe(1500.25);
    expect(parseNumberInput('1.234.567')).toBe(1234567);
  });
  it('vacío o basura = 0', () => {
    expect(parseNumberInput('')).toBe(0);
    expect(parseNumberInput('abc')).toBe(0);
  });
});

describe('IVA por línea', () => {
  it('fertilizante 10,5% + agroquímico 21%', () => {
    const t = calcularTotalesIva([{ totalUSD: 1000, ivaPercent: 10.5 }, { totalUSD: 1000, ivaPercent: 21 }], 1000);
    expect(t.subtotal).toBe(2000);
    expect(t.iva).toBeCloseTo(105 + 210, 6);
    expect(t.total).toBeCloseTo(2315, 6);
    expect(t.totalARS).toBeCloseTo(2315000, 3);
    expect(t.desglose.map((d) => d.tasa)).toEqual([10.5, 21]);
    expect(t.ivaEfectivo).toBeCloseTo(15.75, 6);
  });
  it('líneas sin IVA propio usan el de la cabecera', () => {
    const t = totalesDeCotizacion(cotiz, [linea({ iva: null, total_usd: 100 })]);
    expect(t.iva).toBeCloseTo(21, 6);
  });
});

describe('cotización sin IVA (por defecto)', () => {
  const sinIva = { ...cotiz, con_iva: false } as Cotizacion;
  it('los totales no suman IVA', () => {
    const t = totalesDeCotizacion(sinIva, [linea({ total_usd: 100, iva: 21 })]);
    expect(t.iva).toBe(0);
    expect(t.total).toBe(100);
  });
  it('WhatsApp no menciona IVA y aclara que no lo incluye', () => {
    const msg = generarWhatsApp(sinIva, [linea({ total_usd: 100 })], config);
    expect(msg).not.toMatch(/IVA \d/);
    expect(msg).toContain('sin IVA');
  });
});

describe('texto de WhatsApp', () => {
  it('muestra producto, cantidades, precios y IVA desglosado', () => {
    const msg = generarWhatsApp(
      cotiz,
      [
        linea({ producto: 'Glifosato', cantidad: 100, precio_usd: 5, total_usd: 500, iva: 21 }),
        linea({ producto: 'Urea', es_fertilizante: true, cantidad: 10, precio_usd: 650, flete_usd: 52.47, total_usd: 7024.7, iva: 10.5 }),
      ],
      config
    );
    expect(msg).not.toContain('[object Object]');
    expect(msg).toContain('Glifosato');
    expect(msg).toContain('Urea');
    expect(msg).toContain('IVA 10,5%');
    expect(msg).toContain('IVA 21%');
    expect(msg).not.toMatch(/105%/);
    // flete incluido en el precio, sin separar
    expect(msg).not.toMatch(/flete/i);
    expect(msg).toContain('702,47 USD/tn');
  });
});

describe('financiación y canje', () => {
  it('recargo = tasa mensual × días / 30', () => {
    expect(recargoPorcentaje(60, 1.5)).toBe(3);
    expect(recargoPorcentaje(45, 2)).toBe(3);
    expect(recargoPorcentaje(0, 2)).toBe(0);
    expect(recargoPorcentaje(30, 0)).toBe(0);
  });

  it('el recargo se suma al total, el subtotal sigue siendo contado y el IVA va sobre el precio financiado', () => {
    const t = calcularTotalesIva([{ totalUSD: 1000, ivaPercent: 21 }], 1000, 3);
    expect(t.subtotal).toBe(1000);
    expect(t.recargo).toBeCloseTo(30, 6);
    expect(t.iva).toBeCloseTo(216.3, 6);
    expect(t.total).toBeCloseTo(1246.3, 6);
  });

  it('sin IVA: total = contado + recargo', () => {
    const t = calcularTotalesIva([{ totalUSD: 1000, ivaPercent: 0 }], 1000, 3);
    expect(t.total).toBeCloseTo(1030, 6);
    expect(t.iva).toBe(0);
  });

  it('toneladas de canje', () => {
    expect(toneladasCanje(10000, 400)).toBe(25);
    expect(toneladasCanje(10000, 0)).toBe(0);
  });

  it('WhatsApp muestra financiación y canje', () => {
    const c = { ...cotiz, con_iva: false, plazo_dias: 60, tasa_mensual: 1.5, canje_cultivo: 'Soja', canje_precio_usd: 400 } as Cotizacion;
    const msg = generarWhatsApp(c, [linea({ total_usd: 1000 })], config);
    expect(msg).toContain('Financiación 60 días (+3%)');
    expect(msg).toContain('Total: 1.030,00 USD');
    expect(msg).toContain('Equivale a 2,58 tn de Soja');
  });

  it('cotización común: sin financiación ni canje en el texto', () => {
    const msg = generarWhatsApp({ ...cotiz, con_iva: false } as Cotizacion, [linea({ total_usd: 1000 })], config);
    expect(msg).not.toContain('Financiación');
    expect(msg).not.toContain('Equivale');
  });
});
