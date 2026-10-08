import { describe, expect, it } from 'vitest';
import { numeroBNA, parsearDivisaBNA } from '../../supabase/functions/tc-bna/parser';

// Recorte con la misma forma que la página del BNA: primero billetes, después divisas
const html = `
<div class="tab-pane fade in active" id="billetes">
  <table class="table cotizacion"><thead><tr><th class="fechaCot">7/10/2026</th><th>Compra</th><th>Venta</th></tr></thead>
  <tbody><tr><td class="tit">Dolar U.S.A</td><td>1490,00</td><td>1540,00</td></tr></tbody></table>
</div>
<div class="tab-pane fade" id="divisas">
  <table class="table cotizacion"><thead><tr><th class="fechaCot">7/10/2026</th><th>Compra</th><th>Venta</th></tr></thead>
  <tbody>
    <tr><td class="tit">Dolar U.S.A</td><td>1508.0000</td><td>1517.0000</td></tr>
    <tr><td class="tit">Euro</td><td>1700.0000</td><td>1760.0000</td></tr>
  </tbody></table>
</div>
<div class="tab-pane fade" id="otra"></div>`;

describe('parsearDivisaBNA', () => {
  it('lee el dólar de la tabla de divisas, no la de billetes', () => {
    expect(parsearDivisaBNA(html)).toEqual({ fecha: '2026-10-07', compra: 1508, venta: 1517 });
  });
  it('falla si no está la tabla de divisas', () => {
    expect(() => parsearDivisaBNA('<html>mantenimiento</html>')).toThrow(/divisas/);
  });
  it('falla con valores absurdos', () => {
    expect(() => parsearDivisaBNA(html.replace('1517.0000', '15.17'))).toThrow(/raros/);
  });
});

describe('numeroBNA', () => {
  it('acepta punto decimal y formato argentino', () => {
    expect(numeroBNA('1517.0000')).toBe(1517);
    expect(numeroBNA('1.517,50')).toBe(1517.5);
  });
});
