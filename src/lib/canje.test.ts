import { describe, expect, it } from 'vitest';
import {
  PARAMS_CANJE_BASE, conIvaInsumos, fleteGranoUSD, liquidarTn, montoPorToneladas, netoGuardado, netoPorTn,
  normalizarParams, paramsDesdeConfig, toneladasPorMonto, type ParamsCanje,
} from './canje';

/** El caso que quedó cargado en la hoja "Insumos 21%" de CANJES_EDG.xls */
const EXCEL: ParamsCanje = { ...PARAMS_CANJE_BASE, pago_pct: 98, flete_usd_tn: 25 };

describe('liquidación igual a la planilla del equipo', () => {
  it('soja a 340 con flete 25 → neto 323,190234', () => {
    const l = liquidarTn(340, EXCEL);
    expect(l.pagado).toBeCloseTo(333.2, 9);
    expect(l.ivaGrano).toBeCloseTo(34.986, 9);
    expect(l.comision).toBeCloseTo(8.33, 9);
    expect(l.ivaComAlm).toBeCloseTo(0.87465, 9);
    expect(l.ivaFlete).toBeCloseTo(5.25, 9);
    expect(l.subtotal).toBeCloseTo(328.73135, 9);
    expect(l.sellos).toBeCloseTo(2.209116, 9);
    expect(l.retIibb).toBeCloseTo(3.332, 9);
    expect(l.impuestos).toBeCloseTo(5.541116, 9);
    expect(l.neto).toBeCloseTo(323.190234, 9);
  });

  it('factura de 14.550 → 45,02 tn', () => {
    expect(toneladasPorMonto(14550, netoPorTn(340, EXCEL))).toBeCloseTo(45.019924704779285, 9);
  });

  it('almacenaje: USD/tn/día × días, con IVA de comisión y almacenaje', () => {
    const l = liquidarTn(340, { ...EXCEL, almacenaje_usd_tn_dia: 0.1, almacenaje_dias: 30 });
    expect(l.almacenaje).toBeCloseTo(3, 9);
    expect(l.ivaComAlm).toBeCloseTo((8.33 + 3) * 0.105, 9);
  });

  it('retenciones elegibles: IVA y Ganancias sobre pagado − comisión − almacenaje', () => {
    const sin = liquidarTn(340, EXCEL);
    const con = liquidarTn(340, { ...EXCEL, ret_iva: true, ret_iva_pct: 8, ret_ganancias: true, ret_ganancias_pct: 2 });
    expect(con.retIva).toBeCloseTo((333.2 - 8.33) * 0.08, 9);
    expect(con.retGanancias).toBeCloseTo((333.2 - 8.33) * 0.02, 9);
    expect(sin.neto - con.neto).toBeCloseTo(con.retIva + con.retGanancias, 9);
    // sin IIBB
    expect(liquidarTn(340, { ...EXCEL, ret_iibb: false }).neto).toBeCloseTo(323.190234 + 3.332, 9);
  });

  it('IVA del grano elegible (21 % o 0)', () => {
    expect(liquidarTn(340, { ...EXCEL, iva_grano_pct: 0 }).ivaGrano).toBe(0);
    expect(liquidarTn(340, { ...EXCEL, iva_grano_pct: 21 }).ivaGrano).toBeCloseTo(333.2 * 0.21, 9);
  });

  it('el desglose suma el neto', () => {
    const l = liquidarTn(340, { ...EXCEL, almacenaje_usd_tn_dia: 0.2, almacenaje_dias: 10, ret_iva: true, ret_iva_pct: 5 });
    const suma = l.conceptos.filter((c) => c.clave !== 'precio').reduce((s, c) => s + c.usd, 0);
    expect(suma).toBeCloseTo(l.neto, 9);
  });
});

describe('montos y casos borde', () => {
  it('sin precio o sin neto da 0', () => {
    expect(netoPorTn(0, EXCEL)).toBe(0);
    expect(netoPorTn(20, { ...EXCEL, flete_usd_tn: 100 })).toBe(0);
    expect(toneladasPorMonto(1000, 0)).toBe(0);
    expect(montoPorToneladas(10, 0)).toBe(0);
  });
  it('cuenta inversa', () => {
    const n = netoPorTn(340, EXCEL);
    expect(montoPorToneladas(toneladasPorMonto(14550, n), n)).toBeCloseTo(14550, 9);
  });
  it('IVA de insumos', () => {
    expect(conIvaInsumos(1000, 10.5)).toBeCloseTo(1105, 9);
    expect(conIvaInsumos(1000, 0)).toBe(1000);
  });
  it('cotizaciones viejas sin parámetros usan el precio tal cual', () => {
    expect(netoGuardado(340, null)).toBe(340);
    expect(netoGuardado(340, EXCEL)).toBeCloseTo(323.190234, 9);
    expect(netoGuardado(0, EXCEL)).toBe(0);
  });
});

describe('normalizar', () => {
  it('completa lo que falta con la base y descarta basura', () => {
    const p = normalizarParams({ pago_pct: 'x' as unknown as number, comision_pct: -3, flete_usd_tn: 25 });
    expect(p.pago_pct).toBe(98.5);
    expect(p.comision_pct).toBe(2.5);
    expect(p.flete_usd_tn).toBe(25);
    expect(normalizarParams({ pago_pct: 150 }).pago_pct).toBe(100);
  });
  it('config: JSON inválido → base', () => {
    expect(paramsDesdeConfig('no json')).toEqual(PARAMS_CANJE_BASE);
    expect(paramsDesdeConfig(null)).toEqual(PARAMS_CANJE_BASE);
    expect(paramsDesdeConfig(JSON.stringify({ sellos_pct: 0.75 })).sellos_pct).toBe(0.75);
  });
});

describe('flete del grano por convenio', () => {
  const tarifas = [{ km: 120, tarifa: 2500 }, { km: 121, tarifa: 2520 }];
  it('tarifa × 10 / TC comprador, km redondeado hacia arriba', () => {
    expect(fleteGranoUSD(120.3, tarifas, 1400)).toEqual({ km: 121, pesosTn: 25200, usdTn: 18 });
  });
  it('sin km, TC o tarifa → null', () => {
    expect(fleteGranoUSD(0, tarifas, 1400)).toBeNull();
    expect(fleteGranoUSD(120, tarifas, 0)).toBeNull();
    expect(fleteGranoUSD(300, tarifas, 1400)).toBeNull();
  });
  it('normalizar conserva modo, convenio y km', () => {
    const p = normalizarParams({ flete_modo: 'manual', flete_convenio_id: 'abc', flete_km: 150 });
    expect(p).toMatchObject({ flete_modo: 'manual', flete_convenio_id: 'abc', flete_km: 150 });
    expect(normalizarParams({}).flete_modo).toBe('convenio');
  });
});
