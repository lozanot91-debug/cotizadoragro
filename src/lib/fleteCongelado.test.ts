import { describe, it, expect } from 'vitest';
import { firmaDeFlete, conFleteGuardado } from './fleteCongelado';
import type { CalcLineaResult } from './calculations';

const base = { modalidad: 'directo', km: 120, kmCorto: 0, tcFlete: 1000, aforoTn: 0, aforoCortoTn: 0, tnCargadas: 30, convenioId: 'c1', convenioCortoId: null };
const calc = { costoUSD: 0, costoListaUSD: 0, costoEditado: false, precioUSD: 500, fleteUSD: 40, precioConFlete: 540, totalUSD: 5400, tarifaFaltante: true, margenEfectivo: 10 } as CalcLineaResult;

describe('firmaDeFlete', () => {
  it('es igual si no cambia nada', () => {
    expect(firmaDeFlete(base)).toBe(firmaDeFlete({ ...base }));
  });
  it('cambia con el km, el convenio, la modalidad o el TC de flete', () => {
    const f = firmaDeFlete(base);
    expect(firmaDeFlete({ ...base, km: 121 })).not.toBe(f);
    expect(firmaDeFlete({ ...base, convenioId: 'c2' })).not.toBe(f);
    expect(firmaDeFlete({ ...base, modalidad: 'largo_corto' })).not.toBe(f);
    expect(firmaDeFlete({ ...base, tcFlete: 1100 })).not.toBe(f);
  });
  it('sin aforo, las toneladas no mueven la huella; con aforo sí', () => {
    expect(firmaDeFlete({ ...base, tnCargadas: 99 })).toBe(firmaDeFlete(base));
    expect(firmaDeFlete({ ...base, aforoTn: 25, tnCargadas: 99 })).not.toBe(firmaDeFlete({ ...base, aforoTn: 25 }));
  });
});

describe('conFleteGuardado', () => {
  it('usa el flete guardado y rearma precio y total', () => {
    const r = conFleteGuardado(calc, 55, { cantidad: 10, conFlete: true, esFertilizante: true });
    expect(r.fleteUSD).toBe(55);
    expect(r.precioConFlete).toBe(555);
    expect(r.totalUSD).toBe(5550);
    expect(r.tarifaFaltante).toBe(false);
  });
  it('no toca líneas sin flete, sin fertilizante o sin dato guardado', () => {
    expect(conFleteGuardado(calc, 55, { cantidad: 10, conFlete: false, esFertilizante: true })).toBe(calc);
    expect(conFleteGuardado(calc, 55, { cantidad: 10, conFlete: true, esFertilizante: false })).toBe(calc);
    expect(conFleteGuardado(calc, undefined, { cantidad: 10, conFlete: true, esFertilizante: true })).toBe(calc);
  });
});
