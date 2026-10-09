import { describe, expect, it } from 'vitest';
import { competidoresConocidos, diferenciaPct, filasDesdeCierre, resumirPorCompetidor, resumirPorProducto, ultimoPorCod } from './competencia';
import type { CotizacionLinea, PrecioCompetencia } from '@/types';

const linea = (o: Partial<CotizacionLinea>): CotizacionLinea => ({
  id: 'l1', cotizacion_id: 'q1', producto_id: null, cod: 'UREA', producto: 'Urea', familia: 'F', proveedor: 'P', unid: 'KGRS',
  es_fertilizante: true, cantidad: 10, costo_usd: 600, costo_lista_usd: null, costo_editado: false, margen: 8,
  precio_usd: 652, flete_usd: 20, total_usd: 6720, con_flete: true, plazo_dias: 0, iva: 10.5, orden: 0, ...o,
});
const reg = (o: Partial<PrecioCompetencia>): PrecioCompetencia => ({
  id: Math.random().toString(), fecha: '2026-10-01', cotizacion_id: null, cliente_id: null, cliente_nombre: null, cod: 'UREA',
  producto: 'Urea', unidad: 'tn', competidor: 'Agro Sur', precio_usd: 640, nuestro_precio_usd: 672, origen: 'manual',
  notas: null, usuario_id: null, usuario_nombre: null, created_at: '2026-10-01T10:00:00Z', ...o,
});

describe('competencia', () => {
  it('filas desde el cierre: solo líneas con precio, con nuestro precio final', () => {
    const ls = [linea({}), linea({ id: 'l2', cod: 'GLI', producto: 'Glifosato', es_fertilizante: false, unid: 'LTS', precio_usd: 4.6, flete_usd: 0 })];
    const f = filasDesdeCierre({ id: 'q1', cliente_id: 'c1', cliente_nombre: 'La Peña' }, ls, ' Agro Sur ', { l1: '640', l2: '' }, 'perdida', '2026-10-08', 'Tomás');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ cod: 'UREA', unidad: 'tn', competidor: 'Agro Sur', precio_usd: 640, nuestro_precio_usd: 672, origen: 'perdida', fecha: '2026-10-08' });
    expect(filasDesdeCierre({ id: 'q1', cliente_id: null, cliente_nombre: null }, ls, '', { l1: '640' }, 'perdida', '2026-10-08', 'T')).toEqual([]);
  });
  it('diferencia %', () => {
    expect(diferenciaPct({ precio_usd: 640, nuestro_precio_usd: 672 })).toBeCloseTo(-4.7619, 3);
    expect(diferenciaPct({ precio_usd: 640, nuestro_precio_usd: null })).toBeNull();
  });
  it('competidores sin repetir y por frecuencia', () => {
    expect(competidoresConocidos([reg({ competidor: 'Agro Sur' }), reg({ competidor: 'agro  sur' }), reg({ competidor: 'Campo Norte' })])).toEqual(['Agro Sur', 'Campo Norte']);
  });
  it('resúmenes', () => {
    const rs = [reg({}), reg({ fecha: '2026-10-05', precio_usd: 660 }), reg({ cod: 'MAP', producto: 'MAP', competidor: 'Campo Norte', nuestro_precio_usd: null })];
    const pc = resumirPorCompetidor(rs);
    expect(pc[0]).toMatchObject({ competidor: 'Agro Sur', registros: 2, productos: 1, ultimo: '2026-10-05' });
    expect(pc[0].difPromedio).toBeCloseTo(((640 - 672) / 672 * 100 + (660 - 672) / 672 * 100) / 2, 6);
    const pp = resumirPorProducto(rs);
    expect(pp.find((p) => p.cod === 'UREA')!.ultimo.precio_usd).toBe(660);
    expect(ultimoPorCod(rs).get('UREA')!.fecha).toBe('2026-10-05');
  });
});
