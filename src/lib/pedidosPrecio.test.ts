import { describe, it, expect } from 'vitest';
import { estadoPedido, necesitaAtencion, costosAplicables, urlPedido, textoWhatsAppPedido, diasRestantes, unidadCosto } from './pedidosPrecio';

const ahora = new Date('2026-10-08T12:00:00Z').getTime();

describe('estadoPedido', () => {
  it('abierto vigente, abierto vencido, respondido y cancelado', () => {
    expect(estadoPedido({ estado: 'Abierto', vence_el: '2026-10-10T00:00:00Z' }, ahora)).toBe('Abierto');
    expect(estadoPedido({ estado: 'Abierto', vence_el: '2026-10-07T00:00:00Z' }, ahora)).toBe('Vencido');
    expect(estadoPedido({ estado: 'Respondido', vence_el: '2026-10-07T00:00:00Z' }, ahora)).toBe('Respondido');
    expect(estadoPedido({ estado: 'Cancelado', vence_el: '2026-10-10T00:00:00Z' }, ahora)).toBe('Cancelado');
  });
});

describe('necesitaAtencion', () => {
  it('respondido sin aplicar avisa; ya aplicado no; corrección pedida sí', () => {
    expect(necesitaAtencion({ estado: 'Respondido', aplicado_at: null, correccion_solicitada: false })).toBe(true);
    expect(necesitaAtencion({ estado: 'Respondido', aplicado_at: '2026-10-08', correccion_solicitada: false })).toBe(false);
    expect(necesitaAtencion({ estado: 'Respondido', aplicado_at: '2026-10-08', correccion_solicitada: true })).toBe(true);
    expect(necesitaAtencion({ estado: 'Abierto', aplicado_at: null, correccion_solicitada: false })).toBe(false);
    expect(necesitaAtencion({ estado: 'Cancelado', aplicado_at: null, correccion_solicitada: true })).toBe(false);
  });
});

describe('costosAplicables', () => {
  it('cruza por código y marca lo que quedó sin costo', () => {
    const r = costosAplicables(
      [{ cod: 'A', costo_usd: 5, proveedor: 'X' }, { cod: 'B', costo_usd: 0, proveedor: null }],
      [{ key: '1', cod: 'A' }, { key: '2', cod: 'B' }, { key: '3', cod: 'C' }]
    );
    expect(r.aplicar).toEqual([{ key: '1', costo: 5, proveedor: 'X' }]);
    expect(r.sinCosto).toEqual(['2', '3']);
  });
  it('con códigos repetidos no usa dos veces la misma línea', () => {
    const r = costosAplicables(
      [{ cod: 'A', costo_usd: 5, proveedor: null }, { cod: 'A', costo_usd: 7, proveedor: null }],
      [{ key: '1', cod: 'A' }, { key: '2', cod: 'A' }, { key: '3', cod: 'A' }]
    );
    expect(r.aplicar.map((a) => a.costo)).toEqual([5, 7]);
    expect(r.sinCosto).toEqual(['3']);
  });
});

describe('textos y links', () => {
  it('arma el link sin barras duplicadas', () => {
    expect(urlPedido('https://app.netlify.app/', 'abc')).toBe('https://app.netlify.app/?mesa=abc');
  });
  it('el texto de WhatsApp lleva cliente, número y link', () => {
    const t = textoWhatsAppPedido({ url: 'https://x/?mesa=t', numero: 12, cliente: 'Perez', venceEl: '2026-10-10T15:00:00Z' });
    expect(t).toContain('N° 12');
    expect(t).toContain('Perez');
    expect(t).toContain('https://x/?mesa=t');
  });
  it('días restantes y unidad', () => {
    expect(diasRestantes('2026-10-10T12:00:00Z', ahora)).toBe(2);
    expect(unidadCosto({ es_fertilizante: true, unidad: 'tn' })).toBe('USD por tonelada');
    expect(unidadCosto({ es_fertilizante: false, unidad: 'lt' })).toBe('USD por lt');
  });
});
