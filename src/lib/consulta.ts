/** Cálculos de la pantalla de consulta rápida (costo de un insumo y flete por km). */
import type { ProductoConCosto, TarifaFlete } from '@/types';
import { buscarTarifa, calcularFleteUSD, clampMargen, precioConMargen } from '@/lib/calculations';

export interface FleteConsulta {
  /** Km que se usan para buscar la tarifa (redondeado hacia arriba) */
  km: number;
  /** Pesos por tonelada */
  pesosTn: number;
  /** USD por tonelada al TC indicado */
  usdTn: number;
}

/**
 * Flete por tonelada para una distancia. Usa la misma tarifa y fórmula que la cotización
 * (la tabla guarda el valor por 100 kg: × 10 = por tonelada). Null si no hay tarifa para esos km.
 */
export function fleteConsulta(km: number, tarifas: TarifaFlete[], tc: number): FleteConsulta | null {
  if (!(km > 0)) return null;
  const tarifa = buscarTarifa(km, tarifas);
  if (tarifa === null) return null;
  return { km: Math.ceil(km), pesosTn: tarifa * 10, usdTn: calcularFleteUSD(tarifa, tc) };
}

export interface FleteConsultaTramos {
  /** Un resultado por tramo (null si ese tramo no tiene km o no está en su planilla) */
  tramos: (FleteConsulta | null)[];
  /** Suma de los tramos; null si algún tramo falta */
  total: { pesosTn: number; usdTn: number } | null;
}

/** Flete por tonelada sumando tramos (largo + corto), cada uno con su planilla. */
export function fleteConsultaTramos(tramos: { km: number; tarifas: TarifaFlete[] }[], tc: number): FleteConsultaTramos {
  const res = tramos.map((t) => fleteConsulta(t.km, t.tarifas, tc));
  const completos = res.every((r) => r !== null);
  return {
    tramos: res,
    total: completos ? { pesosTn: res.reduce((a, r) => a + r!.pesosTn, 0), usdTn: res.reduce((a, r) => a + r!.usdTn, 0) } : null,
  };
}

/** Costo de lista para mostrar: fertilizantes por tonelada, el resto por unidad, en la moneda de la lista. */
export function costoDeLista(p: Pick<ProductoConCosto, 'costo' | 'es_fertilizante' | 'unid' | 'moneda'>) {
  return {
    valor: p.es_fertilizante ? p.costo * 1000 : p.costo,
    unidad: p.es_fertilizante ? 'tn' : (p.unid || 'unidad').toLowerCase(),
    moneda: p.moneda,
  };
}

/** Busca por código, nombre, proveedor o familia; todas las palabras tienen que aparecer. */
export function buscarProductos<T extends Pick<ProductoConCosto, 'cod' | 'producto' | 'proveedor' | 'familia'>>(
  productos: T[], texto: string, max = 12
): T[] {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const out: T[] = [];
  for (const p of productos) {
    const h = normalizar(`${p.cod} ${p.producto} ${p.proveedor || ''} ${p.familia || ''}`);
    if (palabras.every((w) => h.includes(w))) {
      out.push(p);
      if (out.length >= max) break;
    }
  }
  return out;
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Precio de venta para la consulta, con la misma regla que la cotización: precio = costo / (1 − margen).
 * El margen se limita a 0–95 %. Devuelve null si el costo no es válido.
 */
export function precioConsulta(costo: number, margenPct: number, ivaPct = 0): { precio: number; ganancia: number; conIva: number; margen: number } | null {
  if (!(costo > 0) || !Number.isFinite(margenPct)) return null;
  const margen = clampMargen(margenPct);
  const precio = precioConMargen(costo, margen);
  return { precio, ganancia: precio - costo, conIva: precio * (1 + (ivaPct || 0) / 100), margen };
}
