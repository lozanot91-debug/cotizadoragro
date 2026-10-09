import { describe, expect, it } from 'vitest';
import { compararFormasPago, mejorOpcion, normalizarFormasPago, paramsFormasPagoDesdeConfig, tcEstimado, textoWhatsAppFormasPago, valorHoy, type ParamsFormasPago } from './formasPago';
import { PARAMS_CANJE_BASE, netoPorTn } from './canje';

const params: ParamsFormasPago = {
  tasa_ref_anual_pct: 10,
  devaluacion_mensual_pct: 2,
  descuento_contado_pct: 0,
  tarjetas: [
    { id: 'u', nombre: 'Agro USD', moneda: 'USD', nd_pct: 3, tna_pct: 0, dias: 180 },
    { id: 'p', nombre: 'Agro $', moneda: 'ARS', nd_pct: 0, tna_pct: 36, dias: 180 },
  ],
};
const base = { netoUSD: 10000, ivaUSD: 1050, hoy: '2026-10-09', tcHoy: 1500, params };

describe('formas de pago', () => {
  it('contado, plazo, canje y tarjetas llevados a hoy', () => {
    const ops = compararFormasPago({ ...base, plazo: { dias: 90, tasa_mensual_pct: 1.5 }, canje: { cultivo: 'Soja', precioUSD: 340, params: PARAMS_CANJE_BASE, dias: 210 } });
    const por = Object.fromEntries(ops.map((o) => [o.clave, o]));
    expect(por.contado).toMatchObject({ monto: 11050, valorHoyUSD: 11050, difVsContadoPct: 0, fecha: '2026-10-09' });
    // plazo: 1,5% × 3 meses = 4,5% sobre el total con IVA
    expect(por.plazo.monto).toBeCloseTo(11050 * 1.045, 2);
    expect(por.plazo.fecha).toBe('2027-01-07');
    expect(por.plazo.valorHoyUSD).toBeCloseTo((11050 * 1.045) / (1 + 0.1 * 90 / 365), 2);
    // canje: toneladas = total con IVA / neto por tn
    expect(por.canje.toneladas).toBeCloseTo(11050 / netoPorTn(340, PARAMS_CANJE_BASE), 2);
    // tarjeta USD con ND 3% y tasa 0
    expect(por['tarjeta-u'].monto).toBeCloseTo(11050 * 1.03, 2);
    // tarjeta en pesos: pesos al TC de hoy + 36% anual por 180 días, a dólar estimado
    const pesos = 11050 * 1500 * (1 + 0.36 * 180 / 365);
    expect(por['tarjeta-p'].moneda).toBe('ARS');
    expect(por['tarjeta-p'].monto).toBe(Math.round(pesos));
    expect(por['tarjeta-p'].usdAlVencimiento).toBeCloseTo(pesos / tcEstimado(1500, 2, 180), 2);
    expect(por['tarjeta-p'].tcVencimiento).toBeCloseTo(1500 * Math.pow(1.02, 6), 2);
  });
  it('la más barata es la de menor valor hoy', () => {
    const ops = compararFormasPago({ ...base, plazo: null, canje: null });
    const m = mejorOpcion(ops)!;
    expect(m.valorHoyUSD).toBe(Math.min(...ops.map((o) => o.valorHoyUSD)));
    // tarjeta USD tasa 0 a 180 días con ND 3%: 11.381,50 / (1 + 10% × 180/365) ≈ 10.846 < contado 11.050
    expect(m.clave).toBe('tarjeta-u');
    expect(m.valorHoyUSD).toBeCloseTo(11381.5 / (1 + 0.1 * 180 / 365), 2);
  });
  it('sin dólar no calcula las opciones en pesos; sin monto no hay opciones', () => {
    expect(compararFormasPago({ ...base, tcHoy: null, plazo: null, canje: null }).map((o) => o.clave)).toEqual(['contado', 'tarjeta-u']);
    expect(compararFormasPago({ ...base, netoUSD: 0, ivaUSD: 0, plazo: null, canje: null })).toEqual([]);
  });
  it('descuento contado y plazo 0 no agrega opción', () => {
    const ops = compararFormasPago({ ...base, params: { ...params, descuento_contado_pct: 5, tarjetas: [] }, plazo: { dias: 0, tasa_mensual_pct: 2 }, canje: null });
    expect(ops).toHaveLength(1);
    expect(ops[0].monto).toBeCloseTo(11050 * 0.95, 2);
  });
  it('valor hoy y dólar estimado', () => {
    expect(valorHoy(110, 365, 10)).toBeCloseTo(100, 9);
    expect(valorHoy(110, 0, 10)).toBe(110);
    expect(tcEstimado(1000, 0, 90)).toBe(1000);
  });
  it('normaliza lo guardado', () => {
    const p = paramsFormasPagoDesdeConfig('{"tasa_ref_anual_pct":"12","tarjetas":[{"nombre":"Procampo","moneda":"ARS","tna_pct":-3,"dias":"120"}]}');
    expect(p.tasa_ref_anual_pct).toBe(12);
    expect(p.tarjetas[0]).toMatchObject({ nombre: 'Procampo', moneda: 'ARS', tna_pct: 0, dias: 120, nd_pct: 0 });
    expect(paramsFormasPagoDesdeConfig('roto').tarjetas).toHaveLength(2);
    expect(normalizarFormasPago(null).devaluacion_mensual_pct).toBe(2);
  });
  it('texto de WhatsApp', () => {
    const ops = compararFormasPago({ ...base, plazo: null, canje: null });
    const t = textoWhatsAppFormasPago(ops, (n, d = 2) => n.toFixed(d), (f) => f, 'COT-12');
    expect(t).toContain('*Formas de pago · COT-12*');
    expect(t).toContain('*Contado*: USD 11050.00 hoy');
    expect(t).toMatch(/\*Agro \$\*: \$ \d+ al 2027-04-07/);
  });
});
