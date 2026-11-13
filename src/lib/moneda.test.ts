import { describe, expect, it } from 'vitest';
import {
  arsAUsd, esFamiliaEnPesos, monedaDeCotizacion, monedaDeProducto, motivoNoSePuedeAgregar, tcMotor, vistaEnMoneda,
} from './moneda';

describe('moneda de producto', () => {
  it('AB PRODUCTO y AB MICRO son en pesos (sin importar mayúsculas ni espacios)', () => {
    expect(esFamiliaEnPesos('AB PRODUCTO')).toBe(true);
    expect(esFamiliaEnPesos('  ab   micro ')).toBe(true);
    expect(monedaDeProducto({ familia: 'AB PRODUCTO' })).toBe('ARS');
  });
  it('el resto es en dólares', () => {
    expect(esFamiliaEnPesos('HERBICIDAS')).toBe(false);
    expect(esFamiliaEnPesos('FERTILIZANTE SOLIDO')).toBe(false);
    expect(esFamiliaEnPesos(null)).toBe(false);
    expect(monedaDeProducto({ familia: undefined })).toBe('USD');
  });
});

describe('moneda de cotización', () => {
  it('las cotizaciones viejas (sin moneda) son en dólares', () => {
    expect(monedaDeCotizacion({})).toBe('USD');
    expect(monedaDeCotizacion({ moneda: null })).toBe('USD');
    expect(monedaDeCotizacion(null)).toBe('USD');
    expect(monedaDeCotizacion({ moneda: 'ARS' })).toBe('ARS');
  });
  it('en pesos el motor no convierte (tc = 1)', () => {
    expect(tcMotor('ARS', 1450)).toBe(1);
    expect(tcMotor('USD', 1450)).toBe(1450);
  });
});

describe('arsAUsd', () => {
  it('convierte al TC y no explota sin TC', () => {
    expect(arsAUsd(14500, 1450)).toBeCloseTo(10);
    expect(arsAUsd(14500, 0)).toBe(0);
    expect(arsAUsd(NaN, 1450)).toBe(0);
  });
});

describe('no se mezclan monedas', () => {
  it('con la cotización vacía se puede agregar cualquier cosa', () => {
    expect(motivoNoSePuedeAgregar('USD', false, { familia: 'AB PRODUCTO' })).toBeNull();
  });
  it('en pesos no entra un producto en dólares y al revés', () => {
    expect(motivoNoSePuedeAgregar('ARS', true, { familia: 'HERBICIDAS' })).toMatch(/pesos/);
    expect(motivoNoSePuedeAgregar('USD', true, { familia: 'AB MICRO' })).toMatch(/dólares/);
    expect(motivoNoSePuedeAgregar('ARS', true, { familia: 'AB PRODUCTO' })).toBeNull();
    expect(motivoNoSePuedeAgregar('USD', true, { familia: 'HERBICIDAS' })).toBeNull();
  });
});

describe('vistaEnMoneda', () => {
  it('en dólares devuelve lo mismo', () => {
    const c = { tc: 1450, subtotal_usd: 10, total_usd: 12 };
    const ls = [{ precio_usd: 5 }];
    const v = vistaEnMoneda(c, ls);
    expect(v.moneda).toBe('USD');
    expect(v.cotiz).toBe(c);
    expect(v.lineas).toBe(ls);
  });
  it('en pesos pone los importes en pesos, tc = 1 y flete 0', () => {
    const c = { moneda: 'ARS' as const, tc: 1450, subtotal_usd: 10, iva_usd: 1, total_usd: 12, subtotal_ars: 14500, recargo_ars: 0, iva_ars: 3045, total_ars: 17545 };
    const ls = [{ costo_usd: 9, costo_ars: 13050, costo_lista_ars: 13050, precio_usd: 10, precio_ars: 14500, flete_usd: 3, total_usd: 10, total_ars: 14500 }];
    const v = vistaEnMoneda(c, ls);
    expect(v.moneda).toBe('ARS');
    expect(v.cotiz.tc).toBe(1);
    expect(v.cotiz.total_usd).toBe(17545);
    expect(v.cotiz.iva_usd).toBe(3045);
    expect(v.lineas[0].precio_usd).toBe(14500);
    expect(v.lineas[0].total_usd).toBe(14500);
    expect(v.lineas[0].costo_usd).toBe(13050);
    expect(v.lineas[0].flete_usd).toBe(0);
  });
});
