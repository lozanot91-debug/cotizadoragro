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
