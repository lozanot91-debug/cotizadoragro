import { describe, it, expect } from 'vitest';
import { generarWhatsApp, totalesDeCotizacion } from './export';
import { calcularTotalesIva } from './calculations';
import { parseNumberInput } from './format';
import type { Cotizacion, CotizacionLinea, Configuracion } from '@/types';

const linea = (o: Partial<CotizacionLinea>): CotizacionLinea => ({
  id: 'x', cotizacion_id: '', producto_id: null, cod: 'C', producto: 'Producto', familia: 'F', proveedor: 'P',
  unid: 'LT', es_fertilizante: false, cantidad: 1, costo_usd: 0, costo_lista_usd: null, costo_editado: false,
  margen: 10, precio_usd: 100, flete_usd: 0, total_usd: 100, con_flete: false, iva: 21, orden: 0, ...o,
});
const cotiz = { numero: 1, fecha: '2026-10-07', cliente_nombre: 'ALTOSENA', tc: 1515, km: 0, vigencia_dias: 15, iva: 21 } as Cotizacion;
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
  });
});
