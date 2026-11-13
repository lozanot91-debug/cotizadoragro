import { calcularLinea } from '@/lib/calculations';
import type { CalcLineaResult, TramoFlete } from '@/lib/calculations';
import type { Moneda } from '@/lib/moneda';
import type { CotizacionLinea, ProductoConCosto, TarifaFlete } from '@/types';

export interface CtxHidratacion {
  tc: number;
  tcFlete?: number | null;
  km: number;
  tarifaFlete: TarifaFlete[];
  tramos?: TramoFlete[];
  /** 'ARS': importes en pesos (`*_ars`). El caller pasa `tc` ya pasado por tcMotor (1). */
  moneda?: Moneda;
}

/**
 * Línea de una cotización GUARDADA al abrirla en el editor: sale siempre de lo guardado, nunca de la
 * lista de costos de hoy (una cotización guardada no cambia sola). El costo guardado entra como override;
 * el costo de lista queda como la foto guardada (`costo_lista_usd`, o el costo si es una cotización vieja),
 * así "restablecer costo" vuelve a esa foto y ni el TC ni la lista de hoy la mueven. Si el producto
 * ya no está en la lista, la línea se conserva con los datos guardados.
 */
export function hidratarLineaGuardada(
  l: CotizacionLinea,
  productoDeLista: ProductoConCosto | null,
  ctx: CtxHidratacion
): { producto: ProductoConCosto; costoOverrideUSD: number; calc: CalcLineaResult } {
  const ars = ctx.moneda === 'ARS';
  const foto = ars ? l.costo_lista_ars ?? l.costo_ars ?? 0 : l.costo_lista_usd ?? l.costo_usd;
  const costoGuardado = ars ? l.costo_ars ?? 0 : l.costo_usd;
  const producto: ProductoConCosto = {
    ...(productoDeLista ?? { margen_default: null, margen_producto: null }),
    id: l.producto_id || productoDeLista?.id || '', cod: l.cod, proveedor: l.proveedor, familia: l.familia,
    producto: l.producto, unid: l.unid, es_fertilizante: l.es_fertilizante,
    costo: l.es_fertilizante ? foto / 1000 : foto, moneda: ars ? 'ARS' : 'USD',
  } as ProductoConCosto;
  const calc = calcularLinea({
    producto, cantidad: l.cantidad, margen: l.margen, conFlete: l.con_flete,
    tc: ctx.tc, km: ctx.km, tarifaFlete: ctx.tarifaFlete, tramos: ctx.tramos, tcFlete: ctx.tcFlete,
    costoOverrideUSD: costoGuardado,
  });
  return { producto, costoOverrideUSD: costoGuardado, calc };
}
