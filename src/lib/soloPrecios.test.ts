import { describe, it, expect } from 'vitest';
import { sinCantidad, todasSinCantidad, esSoloPrecios } from './soloPrecios';

describe('solo precios', () => {
  it('detecta líneas sin cantidad', () => {
    expect(sinCantidad({ cantidad: 0 })).toBe(true);
    expect(sinCantidad({ cantidad: NaN })).toBe(true);
    expect(sinCantidad({ cantidad: 2 })).toBe(false);
  });
  it('todas sin cantidad: solo si hay líneas y ninguna tiene', () => {
    expect(todasSinCantidad([])).toBe(false);
    expect(todasSinCantidad([{ cantidad: 0 }, { cantidad: 0 }])).toBe(true);
    expect(todasSinCantidad([{ cantidad: 0 }, { cantidad: 1 }])).toBe(false);
  });
  it('una cotización guardada con subtotal 0 es solo precios', () => {
    expect(esSoloPrecios({ subtotal_usd: 0 })).toBe(true);
    expect(esSoloPrecios({ subtotal_usd: 150 })).toBe(false);
  });
});
