import { describe, expect, it } from 'vitest';
import { buscarProductos, construirComparacionPorFuente, unirProductosDeFuentes, costoDeLista, fleteConsulta, fleteConsultaTramos, precioConsulta } from './consulta';

const tarifas = [{ km: 100, tarifa: 2766.984 }, { km: 101, tarifa: 2780 }] as never;

describe('fleteConsulta', () => {
  it('redondea los km hacia arriba y pasa la tarifa a $/tn y USD/tn', () => {
    const f = fleteConsulta(100.2, tarifas, 1508)!;
    expect(f.km).toBe(101);
    expect(f.pesosTn).toBeCloseTo(27800, 6);
    expect(f.usdTn).toBeCloseTo(27800 / 1508, 6);
  });
  it('sin km o sin tarifa devuelve null', () => {
    expect(fleteConsulta(0, tarifas, 1508)).toBeNull();
    expect(fleteConsulta(900, tarifas, 1508)).toBeNull();
  });
});

describe('costoDeLista', () => {
  it('fertilizantes por tonelada, el resto por unidad', () => {
    expect(costoDeLista({ costo: 0.62, es_fertilizante: true, unid: 'KGRS', moneda: 'USD' })).toEqual({ valor: 620, unidad: 'tn', moneda: 'USD' });
    expect(costoDeLista({ costo: 5.2, es_fertilizante: false, unid: 'LT', moneda: 'USD' })).toEqual({ valor: 5.2, unidad: 'lt', moneda: 'USD' });
  });
});

describe('buscarProductos', () => {
  const ps = [
    { cod: 'GLI-66', producto: 'Glifosato sal potásica 66,2%', proveedor: 'Atanor', familia: 'Herbicidas' },
    { cod: 'ATZ-90', producto: 'Atrazina 90%', proveedor: 'Syngenta', familia: 'Herbicidas' },
    { cod: 'UREA', producto: 'Urea granulada', proveedor: 'Fertilizante', familia: 'Fertilizantes' },
  ];
  it('busca por varias palabras, sin importar tildes ni mayúsculas', () => {
    expect(buscarProductos(ps, 'potasica gli').map((p) => p.cod)).toEqual(['GLI-66']);
    expect(buscarProductos(ps, 'herbicidas').length).toBe(2);
    expect(buscarProductos(ps, 'syngenta 90').map((p) => p.cod)).toEqual(['ATZ-90']);
    expect(buscarProductos(ps, '  ')).toEqual([]);
  });
});

describe('fleteConsultaTramos', () => {
  const largo = [{ km: 165, tarifa: 2650 }];
  const corto = [{ km: 26, tarifa: 1260 }];
  it('suma largo + corto en pesos y en dólares', () => {
    const f = fleteConsultaTramos([{ km: 165, tarifas: largo }, { km: 25.4, tarifas: corto }], 1400);
    expect(f.tramos[1]?.km).toBe(26);
    expect(f.total?.pesosTn).toBe(26500 + 12600);
    expect(f.total?.usdTn).toBeCloseTo(39100 / 1400, 6);
  });
  it('sin total si falta un tramo', () => {
    const f = fleteConsultaTramos([{ km: 165, tarifas: largo }, { km: 0, tarifas: corto }], 1400);
    expect(f.tramos[0]).not.toBeNull();
    expect(f.total).toBeNull();
  });
});

describe('precioConsulta', () => {
  it('precio = costo / (1 − margen), con ganancia e IVA', () => {
    const r = precioConsulta(610, 12, 10.5)!;
    expect(r.precio).toBeCloseTo(693.18, 2);
    expect(r.ganancia).toBeCloseTo(83.18, 2);
    expect(r.conIva).toBeCloseTo(693.18 * 1.105, 2);
  });
  it('margen 0 = costo; se limita a 95 %', () => {
    expect(precioConsulta(100, 0)!.precio).toBe(100);
    expect(precioConsulta(100, 99)!.margen).toBe(95);
    expect(precioConsulta(100, -5)!.precio).toBe(100);
  });
  it('sin costo no hay precio', () => {
    expect(precioConsulta(0, 10)).toBeNull();
  });
});

describe('construirComparacionPorFuente', () => {
  const fu = (id: string, orden = 0) => ({ id, nombre: `F${id}`, descripcion: null, prefijo_cod: null, orden, created_at: '', updated_at: '' });
  const li = (id: string, fuente_id: string, fecha: string) => ({ id, fuente_id, fecha, nombre_archivo: null, uploaded_by: null, created_at: fecha, descripcion: null });

  it('una fuente: actual = la más nueva y anterior = la que sigue (como listas[0] y listas[1])', () => {
    const r = construirComparacionPorFuente([fu('a')], [li('l1', 'a', '2026-10-01'), li('l2', 'a', '2026-09-01'), li('l3', 'a', '2026-08-01')]);
    expect(r).toHaveLength(1);
    expect(r[0].actual.id).toBe('l1');
    expect(r[0].anterior?.id).toBe('l2');
  });
  it('dos fuentes: cada una con sus dos últimas, en orden de fuente', () => {
    const r = construirComparacionPorFuente([fu('a'), fu('b', 1)], [li('b1', 'b', '2026-10-05'), li('a1', 'a', '2026-10-01'), li('a2', 'a', '2026-09-01'), li('b2', 'b', '2026-09-20')]);
    expect(r.map((x) => [x.actual.id, x.anterior?.id])).toEqual([['a1', 'a2'], ['b1', 'b2']]);
  });
  it('fuente con una sola lista: sin anterior; sin listas: no aparece', () => {
    const r = construirComparacionPorFuente([fu('a'), fu('b', 1), fu('c', 2)], [li('a1', 'a', '2026-10-01'), li('b1', 'b', '2026-10-02')]);
    expect(r.map((x) => x.fuente.id)).toEqual(['a', 'b']);
    expect(r[1].anterior).toBeNull();
  });
});

describe('unirProductosDeFuentes', () => {
  const pr = (id: string, cod: string) => ({ id, cod }) as never;
  it('une sin repetir y marca la fuente', () => {
    const r = unirProductosDeFuentes([
      { fuenteNombre: 'A', productos: [pr('1', 'X'), pr('2', 'Y')] },
      { fuenteNombre: 'B', productos: [pr('2', 'Y'), pr('3', 'Z')] },
    ]);
    expect(r.map((p) => [p.cod, p.fuenteNombre])).toEqual([['X', 'A'], ['Y', 'A'], ['Z', 'B']]);
  });
});
