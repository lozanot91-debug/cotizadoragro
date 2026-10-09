import { calcularLinea, calcularTotalesIva, ivaDeLinea, recargoPorcentaje, type TotalesIva } from '@/lib/calculations';
import { tnCargadasConFlete } from '@/lib/fleteAforo';
import { tramosDeCotizacion } from '@/lib/fleteTramos';
import type { Configuracion, Cotizacion, CotizacionLinea, ProductoConCosto, TarifaFlete } from '@/types';

export interface ResultadoRecotizar {
  /** Líneas listas para guardar la cotización nueva (sin id ni cotizacion_id). */
  lineas: Partial<CotizacionLinea>[];
  totales: TotalesIva;
  /** Subtotal de la cotización original, a precio contado y sin IVA. */
  subtotalAnterior: number;
  /** Subtotal con la lista nueva, a precio contado y sin IVA. */
  subtotalNuevo: number;
  variacionPct: number;
  avisos: {
    /** Líneas con costo editado a mano: se mantiene ese costo, hay que revisarlas. */
    costoEditado: number;
    /** Productos que ya no están en la lista nueva: se mantiene su precio anterior. */
    fueraDeLista: string[];
  };
  /** Si no se puede recotizar, el motivo. */
  bloqueada: string | null;
}

const esManual = (l: CotizacionLinea) => !l.producto_id && l.cod.startsWith('MANUAL-');

/**
 * Recalcula una cotización con los costos de la lista vigente.
 * Se mantienen la cantidad, el margen, el flete, el tipo de cambio, los km y el IVA de cada línea.
 * Los costos editados a mano se mantienen (y se avisa); los productos que ya no están en la lista
 * conservan su precio anterior (y se avisa).
 */
export function recotizar(input: {
  cotiz: Cotizacion;
  lineas: CotizacionLinea[];
  productos: ProductoConCosto[];
  tarifas: TarifaFlete[];
  /** Planilla del tramo corto (solo largo + corto) */
  tarifasCorto?: TarifaFlete[];
  config: Pick<Configuracion, 'iva_fertilizantes' | 'iva_agroquimicos'>;
}): ResultadoRecotizar {
  const { cotiz, lineas, productos, tarifas, config } = input;
  const tramos = tramosDeCotizacion({
    modalidad: cotiz.flete_modalidad ?? 'directo', km: cotiz.km, tarifas,
    kmCorto: Number(cotiz.km_corto) || 0, tarifasCorto: input.tarifasCorto ?? [],
    aforoTn: cotiz.aforo_tn, aforoCortoTn: cotiz.aforo_corto_tn,
    tnCargadas: tnCargadasConFlete(lineas.map((l) => ({ cantidad: l.cantidad, conFlete: l.con_flete, producto: { es_fertilizante: l.es_fertilizante } }))),
  });
  const porId = new Map(productos.map((p) => [p.id, p]));
  const porCod = new Map(productos.map((p) => [p.cod, p]));

  const nuevas: Partial<CotizacionLinea>[] = [];
  const fueraDeLista: string[] = [];
  let costoEditado = 0;
  let bloqueada: string | null = null;

  lineas.forEach((l, i) => {
    const iva = ivaDeLinea(l, cotiz, config);
    const plazo = l.plazo_dias ?? cotiz.plazo_dias ?? 0;
    const prod = (l.producto_id && porId.get(l.producto_id)) || porCod.get(l.cod);

    if (!prod) {
      if (!esManual(l)) fueraDeLista.push(`${l.producto} (${l.cod})`);
      nuevas.push({
        producto_id: l.producto_id, cod: l.cod, producto: l.producto, familia: l.familia, proveedor: l.proveedor,
        unid: l.unid, es_fertilizante: l.es_fertilizante, cantidad: l.cantidad, costo_usd: l.costo_usd,
        costo_lista_usd: l.costo_lista_usd, costo_editado: l.costo_editado, margen: l.margen, precio_usd: l.precio_usd,
        flete_usd: l.flete_usd, total_usd: l.total_usd, con_flete: l.con_flete, iva, plazo_dias: plazo, orden: i,
      });
      return;
    }

    const calc = calcularLinea({
      producto: prod, cantidad: l.cantidad, margen: l.margen, conFlete: l.con_flete,
      tc: cotiz.tc, km: cotiz.km, tarifaFlete: tarifas, tramos, tcFlete: cotiz.tc_flete,
      costoOverrideUSD: l.costo_editado ? l.costo_usd : null,
    });
    if (calc.tarifaFaltante && !bloqueada) {
      bloqueada = tramos.length > 1
        ? `Falta la tarifa de flete para ${cotiz.km} km (largo) o ${cotiz.km_corto} km (corto).`
        : `Falta la tarifa de flete para ${cotiz.km} km.`;
    }
    if (l.costo_editado) costoEditado++;

    nuevas.push({
      producto_id: prod.id, cod: prod.cod, producto: prod.producto || l.producto, familia: prod.familia || l.familia,
      proveedor: prod.proveedor || l.proveedor, unid: prod.unid || l.unid, es_fertilizante: prod.es_fertilizante,
      cantidad: l.cantidad, costo_usd: calc.costoUSD, costo_lista_usd: calc.costoListaUSD, costo_editado: calc.costoEditado,
      margen: l.margen, precio_usd: calc.precioUSD, flete_usd: calc.fleteUSD, total_usd: calc.totalUSD,
      con_flete: l.con_flete, iva, plazo_dias: plazo, orden: i,
    });
  });

  const totales = calcularTotalesIva(
    nuevas.map((l) => ({
      totalUSD: l.total_usd || 0,
      ivaPercent: cotiz.con_iva ? l.iva || 0 : 0,
      recargoPct: recargoPorcentaje(l.plazo_dias || 0, cotiz.tasa_mensual || 0),
    })),
    cotiz.tc
  );

  const subtotalAnterior = cotiz.subtotal_usd || 0;
  return {
    lineas: nuevas,
    totales,
    subtotalAnterior,
    subtotalNuevo: totales.subtotal,
    variacionPct: subtotalAnterior > 0 ? ((totales.subtotal - subtotalAnterior) / subtotalAnterior) * 100 : 0,
    avisos: { costoEditado, fueraDeLista },
    bloqueada,
  };
}

/** Cabecera de la cotización nueva: copia las condiciones de la original con los totales recalculados. */
export function cabeceraRecotizada(
  cotiz: Cotizacion,
  r: ResultadoRecotizar,
  datos: { fecha: string; vigenciaDias: number; listaId: string; convenioFleteId?: string | null; convenioCortoId?: string | null }
): Partial<Cotizacion> {
  return {
    cliente_id: cotiz.cliente_id,
    cliente_nombre: cotiz.cliente_nombre,
    fecha: datos.fecha,
    tc: cotiz.tc,
    km: cotiz.km,
    con_iva: cotiz.con_iva,
    iva: cotiz.con_iva ? r.totales.ivaEfectivo : 0,
    plazo_dias: r.lineas.reduce((m, l) => Math.max(m, l.plazo_dias || 0), 0),
    tasa_mensual: cotiz.tasa_mensual || 0,
    canje_cultivo: cotiz.canje_cultivo,
    canje_precio_usd: cotiz.canje_precio_usd || 0,
    canje_params: cotiz.canje_params ?? null,
    vigencia_dias: datos.vigenciaDias,
    estado: 'Borrador',
    vendedor: null,
    lista_id: datos.listaId,
    subtotal_usd: r.totales.subtotal,
    recargo_usd: r.totales.recargo,
    iva_usd: r.totales.iva,
    total_usd: r.totales.total,
    total_ars: r.totales.totalARS,
    notas: cotiz.notas,
    cotizacion_origen_id: cotiz.id,
    // El convenio con el que se calculó el flete (si el original dejó de estar vigente, el predeterminado)
    convenio_flete_id: datos.convenioFleteId ?? null,
    flete_modalidad: cotiz.flete_modalidad ?? 'directo',
    km_corto: cotiz.flete_modalidad === 'largo_corto' ? Number(cotiz.km_corto) || 0 : 0,
    convenio_corto_id: cotiz.flete_modalidad === 'largo_corto' ? datos.convenioCortoId ?? null : null,
    campo_id: cotiz.campo_id ?? null,
    tc_flete: cotiz.tc_flete ?? null,
    aforo_tn: cotiz.aforo_tn ?? null,
    aforo_corto_tn: cotiz.flete_modalidad === 'largo_corto' ? cotiz.aforo_corto_tn ?? null : null,
  };
}
