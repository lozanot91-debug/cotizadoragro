import { describe, it, expect } from 'vitest';
import { ultimaCotizacion, productosDelCliente, type LineaDeCliente } from './historialCliente';
import type { CotizacionLinea } from '@/types';

const L = (cod: string, cotizacionId: string, numero: number, fecha: string, estado: string, precio = 100, cantidad = 10): LineaDeCliente => ({
  cotizacionId, numero, fecha, estado,
  linea: { id: `${cotizacionId}${cod}`, cod, producto: `Prod ${cod}`, precio_usd: precio, cantidad } as CotizacionLinea,
});

const hist = [
  L('A', 'c1', 1, '2026-08-01', 'Ganada', 90),
  L('A', 'c2', 2, '2026-09-10', 'Perdida', 100),
  L('A', 'c3', 3, '2026-10-05', 'Borrador', 110),
  L('B', 'c2', 2, '2026-09-10', 'Perdida', 50),
  L('C', 'c1', 1, '2026-08-01', 'Ganada', 20),
  L('C', 'c4', 4, '2026-09-20', 'Ganada', 22),
];

describe('ultimaCotizacion', () => {
  it('toma la más reciente que no sea borrador ni la cotización actual', () => {
    expect(ultimaCotizacion(hist, 'A', 'c9')).toMatchObject({ numero: 2, precio: 100, estado: 'Perdida' });
  });
  it('si solo hay borradores, usa el borrador', () => {
    expect(ultimaCotizacion([L('Z', 'c1', 1, '2026-10-01', 'Borrador', 5)], 'Z')).toMatchObject({ numero: 1 });
  });
  it('no cuenta la cotización que se está editando', () => {
    expect(ultimaCotizacion(hist, 'A', 'c2')).toMatchObject({ numero: 1, precio: 90 });
  });
  it('null si nunca se le cotizó', () => {
    expect(ultimaCotizacion(hist, 'Q')).toBeNull();
  });
});

describe('productosDelCliente', () => {
  it('compras primero (la más vieja primero), después lo que solo se cotizó', () => {
    const r = productosDelCliente(hist, '2026-10-07');
    expect(r.map((p) => p.cod)).toEqual(['A', 'C', 'B']);
    expect(r[0]).toMatchObject({ veces: 3, diasDesdeCompra: 67 });
    expect(r[1]).toMatchObject({ veces: 2, diasDesdeCompra: 17 });
    expect(r[2].ultimaCompra).toBeNull();
  });
});
