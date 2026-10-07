/** Evolución del costo de los productos entre listas. */
import type { ProductoConCosto } from '@/types';

export interface PuntoCosto {
  fecha: string;
  /** Costo en la unidad de cotización (USD o ARS por tn en fertilizantes, por unidad en el resto). */
  costo: number;
  /** Variación % contra el punto anterior; null en el primero. */
  variacionPct: number | null;
}

/** Costo en la unidad en la que se cotiza: los fertilizantes vienen por kg y se cotizan por tn. */
export function costoEnUnidad(costo: number, esFertilizante: boolean): number {
  return esFertilizante ? costo * 1000 : costo;
}

/** Serie ordenada por fecha con la variación contra la lista anterior. */
export function serieDeCostos(filas: { fecha: string; costo: number }[], esFertilizante: boolean): PuntoCosto[] {
  const orden = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return orden.map((f, i) => {
    const costo = costoEnUnidad(f.costo, esFertilizante);
    const prev = i > 0 ? costoEnUnidad(orden[i - 1].costo, esFertilizante) : 0;
    return { fecha: f.fecha, costo, variacionPct: i > 0 && prev > 0 ? ((costo - prev) / prev) * 100 : null };
  });
}

export interface Variacion {
  cod: string;
  producto: string;
  productoId: string;
  moneda: 'USD' | 'ARS';
  anterior: number;
  actual: number;
  pct: number;
}

/** Productos cuyo costo cambió entre dos listas, del mayor aumento a la mayor baja. */
export function variacionesEntreListas(actual: ProductoConCosto[], anterior: ProductoConCosto[]): Variacion[] {
  const prev = new Map(anterior.map((p) => [p.id, p]));
  const out: Variacion[] = [];
  for (const p of actual) {
    const a = prev.get(p.id);
    if (!a || !(a.costo > 0) || !(p.costo > 0) || a.moneda !== p.moneda) continue;
    const pct = ((p.costo - a.costo) / a.costo) * 100;
    if (Math.abs(pct) < 0.005) continue;
    out.push({
      cod: p.cod, producto: p.producto || p.cod, productoId: p.id, moneda: p.moneda,
      anterior: costoEnUnidad(a.costo, p.es_fertilizante), actual: costoEnUnidad(p.costo, p.es_fertilizante), pct,
    });
  }
  return out.sort((x, y) => y.pct - x.pct);
}
