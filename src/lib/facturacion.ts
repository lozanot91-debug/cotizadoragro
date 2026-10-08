/**
 * Pedido de facturación: lo que se le manda a quien factura cuando el cliente acepta (todo o parte).
 * Se arma desde una cotización Ganada, con lo ganado. Cada línea va a una condición de pago
 * (contado, financiado, canje o tarjeta) y se pueden mezclar.
 * Se guarda una foto de los datos: si después cambia la cotización o la lista, el pedido no se mueve.
 */
import { calcularTotalesIva, recargoPorcentaje } from '@/lib/calculations';
import { netoGuardado, toneladasPorMonto, type ParamsCanje } from '@/lib/canje';
import { parseNumberInput } from '@/lib/format';
import { lineasGanadas, type Reales } from '@/lib/ganadaParcial';
import type { CotizacionLinea } from '@/types';

export type TipoCondicion = 'contado' | 'financiado' | 'canje' | 'tarjeta';
export type EstadoFacturacion = 'Pendiente' | 'Facturado' | 'Observado' | 'Cancelado';

export const TIPOS_CONDICION: { valor: TipoCondicion; nombre: string }[] = [
  { valor: 'contado', nombre: 'Contado' },
  { valor: 'financiado', nombre: 'Financiado' },
  { valor: 'canje', nombre: 'Canje' },
  { valor: 'tarjeta', nombre: 'Tarjeta' },
];

export interface CondicionPago {
  id: string;
  tipo: TipoCondicion;
  /** Financiado y tarjeta */
  plazo_dias?: number;
  /** Financiado y tarjeta: tasa mensual % (recargo = tasa × días / 30) */
  tasa_mensual?: number;
  /** Canje */
  cultivo?: string;
  precio_cultivo?: number;
  /** Canje: liquidación del grano (neto por tn). Sin parámetros = total / precio (pedidos viejos). */
  canje_params?: ParamsCanje | null;
  /** Tarjeta */
  tarjeta?: string;
  /** Tarjeta: nota de débito, % sobre el total con IVA de esa condición */
  nd_pct?: number;
}

export interface LineaFacturacion {
  cod: string;
  producto: string;
  unidad: string | null;
  es_fertilizante: boolean;
  cantidad: number;
  /** USD/tn en fertilizantes, USD por unidad en el resto */
  costo_usd: number;
  /** Precio sin flete */
  precio_usd: number;
  flete_usd: number;
  margen: number;
  iva: number;
  condicion_id: string;
}

export interface TotalCondicion {
  condicion: CondicionPago;
  /** Contado, sin IVA */
  subtotal: number;
  recargo: number;
  recargoPct: number;
  iva: number;
  total: number;
  /** Canje: toneladas de grano por el total con IVA */
  toneladas: number | null;
  /** Canje: neto por tn usado */
  netoTn: number | null;
  /** Tarjeta: nota de débito en USD */
  ndMonto: number | null;
  lineas: number;
}

export interface TotalesFacturacion {
  porCondicion: TotalCondicion[];
  subtotal: number;
  recargo: number;
  iva: number;
  total: number;
  ndTotal: number;
}

/** Precio unitario final (con flete), contado y sin IVA. */
export const precioFinal = (l: Pick<LineaFacturacion, 'precio_usd' | 'flete_usd'>) => (l.precio_usd || 0) + (l.flete_usd || 0);
export const totalLinea = (l: Pick<LineaFacturacion, 'precio_usd' | 'flete_usd' | 'cantidad'>) => precioFinal(l) * (l.cantidad || 0);

/** Recargo % de la condición (financiado y tarjeta). */
export function recargoDeCondicion(c: CondicionPago): number {
  return c.tipo === 'financiado' || c.tipo === 'tarjeta' ? recargoPorcentaje(c.plazo_dias || 0, c.tasa_mensual || 0) : 0;
}

/** Totales por condición y generales. El IVA va sobre la base financiada, como en la cotización. */
export function calcularTotalesFacturacion(lineas: LineaFacturacion[], condiciones: CondicionPago[]): TotalesFacturacion {
  const porCondicion: TotalCondicion[] = condiciones.map((c) => {
    const ls = lineas.filter((l) => l.condicion_id === c.id);
    const pct = recargoDeCondicion(c);
    const t = calcularTotalesIva(ls.map((l) => ({ totalUSD: totalLinea(l), ivaPercent: l.iva || 0, recargoPct: pct })), 0);
    return {
      condicion: c,
      subtotal: t.subtotal,
      recargo: t.recargo,
      recargoPct: pct,
      iva: t.iva,
      total: t.total,
      toneladas: c.tipo === 'canje' && (c.precio_cultivo || 0) > 0 ? toneladasPorMonto(t.total, netoGuardado(c.precio_cultivo!, c.canje_params)) : null,
      netoTn: c.tipo === 'canje' && (c.precio_cultivo || 0) > 0 ? netoGuardado(c.precio_cultivo!, c.canje_params) : null,
      ndMonto: c.tipo === 'tarjeta' && (c.nd_pct || 0) > 0 ? t.total * (c.nd_pct! / 100) : null,
      lineas: ls.length,
    };
  });
  const sum = (k: 'subtotal' | 'recargo' | 'iva' | 'total') => porCondicion.reduce((a, x) => a + x[k], 0);
  return {
    porCondicion,
    subtotal: sum('subtotal'),
    recargo: sum('recargo'),
    iva: sum('iva'),
    total: sum('total'),
    ndTotal: porCondicion.reduce((a, x) => a + (x.ndMonto || 0), 0),
  };
}

/** "Tarjeta Agro Nación · 180 días · 1,5 % mensual · ND 3 %" */
export function describirCondicion(c: CondicionPago, fmt: (n: number, d?: number) => string): string {
  const p = [TIPOS_CONDICION.find((t) => t.valor === c.tipo)?.nombre ?? c.tipo];
  if (c.tipo === 'tarjeta' && c.tarjeta) p[0] = `Tarjeta ${c.tarjeta}`;
  if (c.tipo === 'financiado' || c.tipo === 'tarjeta') {
    if (c.plazo_dias) p.push(`${c.plazo_dias} días`);
    p.push(c.tasa_mensual ? `${fmt(c.tasa_mensual, 2)} % mensual` : 'sin interés');
  }
  if (c.tipo === 'tarjeta' && c.nd_pct) p.push(`ND ${fmt(c.nd_pct, 2)} %`);
  if (c.tipo === 'canje') {
    p.push(`${c.cultivo || 'grano'}${c.precio_cultivo ? ` a USD ${fmt(c.precio_cultivo, 2)}/tn` : ''}`);
    if (c.canje_params && c.precio_cultivo) p.push(`neto USD ${fmt(netoGuardado(c.precio_cultivo, c.canje_params), 2)}/tn`);
    if (c.canje_params?.destino?.trim()) p.push(c.canje_params.destino.trim());
  }
  return p.join(' · ');
}

let contador = 0;
export function nuevaCondicion(tipo: TipoCondicion, datos: Partial<CondicionPago> = {}): CondicionPago {
  contador++;
  return { id: `c${Date.now().toString(36)}${contador}`, tipo, ...datos };
}

/**
 * Condiciones iniciales a partir de la cotización: si tenía canje, una de canje para todo;
 * si no, contado para lo que va sin plazo y una financiada por cada plazo distinto.
 * Devuelve las condiciones y la condición de cada línea (en el mismo orden).
 */
export function condicionesIniciales(
  lineas: { plazo_dias: number | null }[],
  cotiz: { plazo_dias: number; tasa_mensual: number; canje_cultivo: string | null; canje_precio_usd: number; canje_params?: ParamsCanje | null },
): { condiciones: CondicionPago[]; asignacion: string[] } {
  if ((cotiz.canje_precio_usd || 0) > 0) {
    const c = nuevaCondicion('canje', { cultivo: cotiz.canje_cultivo || 'Soja', precio_cultivo: cotiz.canje_precio_usd, canje_params: cotiz.canje_params ?? null });
    return { condiciones: [c], asignacion: lineas.map(() => c.id) };
  }
  const porPlazo = new Map<number, CondicionPago>();
  const asignacion = lineas.map((l) => {
    const plazo = l.plazo_dias ?? cotiz.plazo_dias ?? 0;
    if (!porPlazo.has(plazo)) {
      porPlazo.set(plazo, plazo > 0
        ? nuevaCondicion('financiado', { plazo_dias: plazo, tasa_mensual: cotiz.tasa_mensual || 0 })
        : nuevaCondicion('contado'));
    }
    return porPlazo.get(plazo)!.id;
  });
  const condiciones = [...porPlazo.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  return { condiciones: condiciones.length ? condiciones : [nuevaCondicion('contado')], asignacion };
}

/** Lo que falta para poder enviar; vacío si está todo bien. */
export function validarPedidoFacturacion(p: { lineas: LineaFacturacion[]; condiciones: CondicionPago[]; nota_venta: string; observaciones: string }): string[] {
  const e: string[] = [];
  if (p.lineas.length === 0) e.push('No hay productos para facturar.');
  if (p.lineas.some((l) => !(l.cantidad > 0))) e.push('Todas las cantidades tienen que ser mayores a cero (sacá la línea si no va).');
  if (p.lineas.some((l) => !(precioFinal(l) > 0))) e.push('Hay productos sin precio.');
  const ids = new Set(p.condiciones.map((c) => c.id));
  if (p.lineas.some((l) => !ids.has(l.condicion_id))) e.push('Cada producto tiene que tener una condición de pago.');
  const usadas = new Set(p.lineas.map((l) => l.condicion_id));
  for (const c of p.condiciones) {
    if (!usadas.has(c.id)) continue;
    const nombre = TIPOS_CONDICION.find((t) => t.valor === c.tipo)?.nombre;
    if ((c.tipo === 'financiado' || c.tipo === 'tarjeta') && !((c.plazo_dias || 0) > 0)) e.push(`${nombre}: falta el plazo.`);
    if ((c.tipo === 'financiado' || c.tipo === 'tarjeta') && (c.tasa_mensual || 0) < 0) e.push(`${nombre}: la tasa no puede ser negativa.`);
    if (c.tipo === 'canje' && !((c.precio_cultivo || 0) > 0)) e.push('Canje: falta el precio del grano.');
    if (c.tipo === 'canje' && !(c.cultivo || '').trim()) e.push('Canje: falta el cultivo.');
    if (c.tipo === 'tarjeta' && !(c.tarjeta || '').trim()) e.push('Tarjeta: falta cuál es.');
    if (c.tipo === 'tarjeta' && ((c.nd_pct || 0) < 0 || (c.nd_pct || 0) > 100)) e.push('Tarjeta: el % de nota de débito tiene que estar entre 0 y 100.');
  }
  if (p.nota_venta.trim().length > 40) e.push('El número de nota de venta es muy largo.');
  if (p.nota_venta.trim() && !/^[\d\s\-/.A-Za-z]+$/.test(p.nota_venta.trim())) e.push('La nota de venta solo puede tener números, letras, guiones o barras.');
  if (p.observaciones.trim().length > 1000) e.push('Las observaciones son muy largas (máximo 1000 caracteres).');
  return [...new Set(e)];
}

/** Condiciones que no tienen ningún producto asignado (se descartan al enviar). */
export function sinUsar(condiciones: CondicionPago[], lineas: Pick<LineaFacturacion, 'condicion_id'>[]): CondicionPago[] {
  const usadas = new Set(lineas.map((l) => l.condicion_id));
  return condiciones.filter((c) => !usadas.has(c.id));
}

/** Número de un campo de texto con coma decimal; vacío = undefined. */
export function numCampo(txt: string): number | undefined {
  const t = txt.trim();
  if (!t) return undefined;
  const n = parseNumberInput(t);
  return Number.isFinite(n) ? n : undefined;
}

export function urlFacturacion(origen: string, token: string): string {
  return `${origen.replace(/\/+$/, '')}/?facturar=${token}`;
}

/** `nombre`: "Cliente - 001". */
export function textoWhatsAppFacturacion(p: { url: string; nombre: string; notaVenta?: string | null }): string {
  return [
    `Pedido de facturación · ${p.nombre}`,
    p.notaVenta ? `Nota de venta: ${p.notaVenta}` : null,
    '',
    'Detalle completo, Excel y PDF, y para marcarlo facturado:',
    p.url,
  ].filter((x) => x !== null).join('\n');
}

export function estadoFacturacionInfo(e: EstadoFacturacion): { texto: string; clase: string } {
  switch (e) {
    case 'Pendiente': return { texto: 'Pendiente de facturar', clase: 'bg-amber-100 text-amber-800' };
    case 'Facturado': return { texto: 'Facturado', clase: 'bg-emerald-100 text-emerald-800' };
    case 'Observado': return { texto: 'Observado', clase: 'bg-red-100 text-red-700' };
    default: return { texto: 'Cancelado', clase: 'bg-gray-200 text-gray-600' };
  }
}

/**
 * Líneas para facturar a partir de la cotización: solo lo ganado (cantidad y precio reales).
 * El margen se recalcula con el precio real: (precio − costo) / precio.
 */
export function lineasDesdeCotizacion(
  lineas: CotizacionLinea[],
  reales: Reales | null | undefined,
  ivaDe: (l: CotizacionLinea) => number,
): (LineaFacturacion & { plazo_dias: number | null })[] {
  return lineasGanadas([...lineas].sort((a, b) => a.orden - b.orden), reales).map((l) => {
    const precio = l.precio_usd || 0;
    const costo = l.costo_usd || 0;
    return {
      cod: l.cod, producto: l.producto, unidad: l.unid || null, es_fertilizante: !!l.es_fertilizante,
      cantidad: l.cantidad, costo_usd: costo, precio_usd: precio, flete_usd: l.con_flete ? l.flete_usd || 0 : 0,
      margen: precio > 0 ? Math.round(((precio - costo) / precio) * 10000) / 100 : 0,
      iva: ivaDe(l), condicion_id: '', plazo_dias: l.plazo_dias ?? null,
    };
  });
}
