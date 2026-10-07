import type { ProductoConCosto, TarifaFlete } from '@/types';

export interface CalcLineaInput {
  producto: ProductoConCosto;
  cantidad: number;
  margen: number;
  conFlete: boolean;
  tc: number;
  km: number;
  tarifaFlete: TarifaFlete[];
  costoOverrideUSD?: number | null;
}

export interface CalcLineaResult {
  costoUSD: number;
  costoListaUSD: number;
  costoEditado: boolean;
  precioUSD: number;
  fleteUSD: number;
  totalUSD: number;
  precioConFlete: number;
  tarifaFaltante: boolean;
  margenEfectivo: number | null;
}

export function clampMargen(margen: number): number {
  if (margen < 0) return 0;
  if (margen > 95) return 95;
  return margen;
}

export function costoAUSD(costo: number, moneda: 'USD' | 'ARS', tc: number): number {
  if (moneda === 'ARS') {
    if (!tc) return 0;
    return costo / tc;
  }
  return costo;
}

export function precioConMargen(costoUSD: number, margen: number): number {
  const m = clampMargen(margen) / 100;
  const denom = 1 - m;
  if (denom <= 0) return 0;
  return costoUSD / denom;
}

export function buscarTarifa(km: number, tarifas: TarifaFlete[]): number | null {
  if (km <= 0) return 0;
  const kmRedondeado = Math.ceil(km);
  const encontrada = tarifas.find((t) => t.km === kmRedondeado);
  if (encontrada) return encontrada.tarifa;
  return null;
}

export function calcularFleteUSD(tarifa: number, tc: number): number {
  if (!tc) return 0;
  return (tarifa * 10) / tc;
}

export function esFertilizante(producto: ProductoConCosto): boolean {
  if (producto.unid?.toUpperCase() !== 'KGRS') return false;
  const prov = (producto.proveedor || '').toUpperCase();
  const fam = (producto.familia || '').toUpperCase();
  return prov === 'FERTILIZANTE' || fam.startsWith('FERTILIZANTE');
}

export function calcularLinea(input: CalcLineaInput): CalcLineaResult {
  const { producto, cantidad, margen, conFlete, tc, km, tarifaFlete, costoOverrideUSD } = input;
  const m = clampMargen(margen);

  if (producto.es_fertilizante) {
    // Fertilizantes: se cotizan por tonelada
    // costo viene en USD/kg (convertido a USD si era ARS)
    // precio USD/tn = (costo por kg / (1 - margen)) * 1000
    const costoPorKgLista = costoAUSD(producto.costo, producto.moneda, tc);
    const costoListaTn = costoPorKgLista * 1000;

    // costoOverrideUSD viene en USD/tn para fertilizantes
    let costoPorKgEfectivo: number;
    let costoEditado = false;
    if (costoOverrideUSD !== null && costoOverrideUSD !== undefined && !isNaN(costoOverrideUSD)) {
      costoPorKgEfectivo = costoOverrideUSD / 1000;
      costoEditado = Math.abs(costoOverrideUSD - costoListaTn) > 0.001;
    } else {
      costoPorKgEfectivo = costoPorKgLista;
    }

    const precioPorTn = precioConMargen(costoPorKgEfectivo, m) * 1000;

    let fleteUsdTn = 0;
    let tarifaFaltante = false;
    if (conFlete && km > 0) {
      const tarifa = buscarTarifa(km, tarifaFlete);
      if (tarifa !== null) {
        fleteUsdTn = calcularFleteUSD(tarifa, tc);
      } else {
        tarifaFaltante = true;
      }
    }

    const precioConFlete = precioPorTn + fleteUsdTn;
    const total = precioConFlete * cantidad;

    // Margen efectivo respecto al costo de lista
    let margenEfectivo: number | null = null;
    if (costoListaTn > 0) {
      margenEfectivo = ((precioPorTn - costoListaTn) / precioPorTn) * 100;
    }

    return {
      costoUSD: costoPorKgEfectivo * 1000,
      costoListaUSD: costoListaTn,
      costoEditado,
      precioUSD: precioPorTn,
      fleteUSD: fleteUsdTn,
      precioConFlete,
      totalUSD: total,
      tarifaFaltante,
      margenEfectivo,
    };
  } else {
    // Resto de productos: precio por unidad
    const costoListaUSD = costoAUSD(producto.costo, producto.moneda, tc);

    // costoOverrideUSD viene en USD por unidad para no-fertilizantes
    let costoUSD: number;
    let costoEditado = false;
    if (costoOverrideUSD !== null && costoOverrideUSD !== undefined && !isNaN(costoOverrideUSD)) {
      costoUSD = costoOverrideUSD;
      costoEditado = Math.abs(costoOverrideUSD - costoListaUSD) > 0.001;
    } else {
      costoUSD = costoListaUSD;
    }

    const precio = precioConMargen(costoUSD, m);
    const total = precio * cantidad;

    let margenEfectivo: number | null = null;
    if (costoListaUSD > 0) {
      margenEfectivo = ((precio - costoListaUSD) / precio) * 100;
    }

    return {
      costoUSD,
      costoListaUSD,
      costoEditado,
      precioUSD: precio,
      fleteUSD: 0,
      precioConFlete: precio,
      totalUSD: total,
      tarifaFaltante: false,
      margenEfectivo,
    };
  }
}

export function calcularTotales(
  lineas: { totalUSD: number }[],
  ivaPercent: number,
  tc: number
): { subtotal: number; iva: number; total: number; totalARS: number } {
  const subtotal = lineas.reduce((sum, l) => sum + (l.totalUSD || 0), 0);
  const iva = subtotal * (ivaPercent / 100);
  const total = subtotal + iva;
  const totalARS = total * tc;
  return { subtotal, iva, total, totalARS };
}

export interface DesgloseIva { tasa: number; base: number; iva: number }

export interface TotalesIva {
  /** Suma de las líneas a precio contado, sin IVA. Es el monto que cuentan las estadísticas. */
  subtotal: number;
  /** Recargo por financiación (pago a plazo), sin IVA. */
  recargo: number;
  iva: number;
  total: number;
  totalARS: number;
  /** IVA agrupado por alícuota (ej. 10,5% y 21%), de menor a mayor. La base ya incluye el recargo. */
  desglose: DesgloseIva[];
  /** IVA total / (subtotal + recargo), en %: sirve para mostrar un único número en listados. */
  ivaEfectivo: number;
}

/**
 * Recargo por financiación en %: interés simple, tasa mensual × días / 30.
 * Contado (0 días) o tasa 0 = sin recargo.
 */
export function recargoPorcentaje(plazoDias: number, tasaMensual: number): number {
  if (!(plazoDias > 0) || !(tasaMensual > 0)) return 0;
  return Math.round(((tasaMensual * plazoDias) / 30) * 10000) / 10000;
}

/** Toneladas de grano equivalentes a un monto en USD (canje). 0 si no hay precio. */
export function toneladasCanje(totalUSD: number, precioGranoUSD: number): number {
  if (!(precioGranoUSD > 0)) return 0;
  return totalUSD / precioGranoUSD;
}

/**
 * Totales de una cotización. Cada línea tiene su propia alícuota de IVA y, si corresponde, su propio
 * recargo por financiación (`recargoPct`; si no lo trae se usa `recargoPctGlobal`). El IVA se calcula
 * sobre el precio ya financiado.
 */
export function calcularTotalesIva(
  lineas: { totalUSD: number; ivaPercent: number; recargoPct?: number }[],
  tc: number,
  recargoPctGlobal = 0
): TotalesIva {
  const porTasa = new Map<number, DesgloseIva>();
  let subtotal = 0;
  let recargo = 0;
  let iva = 0;
  for (const l of lineas) {
    const base = l.totalUSD || 0;
    const recargoLinea = base * ((l.recargoPct ?? recargoPctGlobal) / 100);
    const baseFinanciada = base + recargoLinea;
    const tasa = Math.round((l.ivaPercent || 0) * 100) / 100;
    const ivaLinea = baseFinanciada * (tasa / 100);
    subtotal += base;
    recargo += recargoLinea;
    iva += ivaLinea;
    const g = porTasa.get(tasa) || { tasa, base: 0, iva: 0 };
    g.base += baseFinanciada;
    g.iva += ivaLinea;
    porTasa.set(tasa, g);
  }
  const total = subtotal + recargo + iva;
  const baseTotal = subtotal + recargo;
  return {
    subtotal,
    recargo,
    iva,
    total,
    totalARS: total * tc,
    desglose: [...porTasa.values()].sort((a, b) => a.tasa - b.tasa),
    ivaEfectivo: baseTotal > 0 ? Math.round((iva / baseTotal) * 10000) / 100 : 0,
  };
}

/**
 * IVA de una línea guardada. En cotizaciones viejas (sin IVA por línea) se usa el de la cabecera,
 * salvo que sea absurdo (hubo un error que guardaba 105% en vez de 10,5%): ahí se usa el sugerido.
 */
export function ivaDeLinea(
  l: { iva: number | null | undefined; es_fertilizante: boolean },
  cotiz: { iva: number },
  cfg: { iva_fertilizantes: number; iva_agroquimicos: number }
): number {
  if (l.iva !== null && l.iva !== undefined) return l.iva;
  if (cotiz.iva > 0 && cotiz.iva <= 30) return cotiz.iva;
  return l.es_fertilizante ? cfg.iva_fertilizantes : cfg.iva_agroquimicos;
}

/** Alícuota de IVA sugerida según el tipo de producto (se puede editar en cada línea). */
export function ivaPorDefecto(
  esFertilizante: boolean,
  cfg: { iva_fertilizantes: number; iva_agroquimicos: number }
): number {
  return esFertilizante ? cfg.iva_fertilizantes : cfg.iva_agroquimicos;
}

export function resolverMargen(
  producto: ProductoConCosto,
  margenGeneral: number,
  margenesCliente: { producto_id: string | null; familia: string | null; margen: number }[],
  margenManual?: number | null
): number {
  if (margenManual !== null && margenManual !== undefined && !isNaN(margenManual)) {
    return clampMargen(margenManual);
  }
  // Margen del cliente para ese producto
  const margenClienteProd = margenesCliente.find(
    (m) => m.producto_id === producto.id
  );
  if (margenClienteProd) return clampMargen(margenClienteProd.margen);

  // Margen del cliente para esa familia
  const margenClienteFam = margenesCliente.find(
    (m) => m.familia && m.familia === producto.familia
  );
  if (margenClienteFam) return clampMargen(margenClienteFam.margen);

  // Margen del producto
  if (producto.margen_producto !== null && producto.margen_producto !== undefined) {
    return clampMargen(producto.margen_producto);
  }

  // Margen de la familia (null = usar general)
  if (producto.margen_default !== null && producto.margen_default !== undefined) {
    return clampMargen(producto.margen_default);
  }

  // Margen general
  return clampMargen(margenGeneral);
}

export function validarCotizacion(
  tc: number,
  km: number,
  iva: number,
  lineas: { cantidad: number }[]
): string[] {
  const errores: string[] = [];
  if (!tc || tc <= 0) errores.push('El tipo de cambio es obligatorio');
  if (km < 0) errores.push('Los km de destino no pueden ser negativos');
  if (km > 1200) errores.push('Los km de destino están fuera de tabla de flete (> 1200)');
  if (iva < 0 || iva > 100) errores.push('El IVA debe estar entre 0 y 100');
  if (lineas.length === 0) errores.push('Debe agregar al menos una línea');
  if (lineas.some((l) => l.cantidad <= 0))
    errores.push('Todas las líneas deben tener cantidad mayor a 0');
  return errores;
}
