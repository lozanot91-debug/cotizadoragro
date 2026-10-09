/**
 * Comparador de formas de pago: contado, plazo con tasa, canje y tarjetas (en dólares o en pesos).
 *
 * Para comparar opciones que se pagan en distintas fechas y monedas, cada una se lleva a "valor hoy" en USD:
 * - lo que se paga en pesos se pasa a dólares con un dólar estimado al vencimiento (TC de hoy + devaluación
 *   mensual estimada);
 * - lo que se paga más adelante se descuenta con una tasa de referencia anual en USD (lo que el productor podría
 *   ganar con esa plata mientras tanto).
 * La opción con menor valor hoy es la más barata para el cliente.
 */
import { netoPorTn, type ParamsCanje } from '@/lib/canje';
import { recargoPorcentaje } from '@/lib/calculations';
import { sumarDias } from '@/lib/fechas';

export type MonedaPago = 'USD' | 'ARS';

export interface TarjetaPago {
  id: string;
  nombre: string;
  moneda: MonedaPago;
  /** Nota de débito de la empresa por operar con tarjeta, % sobre el total con IVA */
  nd_pct: number;
  /** Tasa nominal anual que cobra la tarjeta hasta el vencimiento (0 = tasa cero / promoción) */
  tna_pct: number;
  /** Días hasta el vencimiento */
  dias: number;
}

export interface ParamsFormasPago {
  /** Tasa anual en USD con la que se lleva todo a hoy (costo de oportunidad del productor) */
  tasa_ref_anual_pct: number;
  /** Devaluación mensual estimada del peso, para las opciones en pesos */
  devaluacion_mensual_pct: number;
  /** Descuento por pago contado */
  descuento_contado_pct: number;
  tarjetas: TarjetaPago[];
}

export const PARAMS_FORMAS_PAGO_BASE: ParamsFormasPago = {
  tasa_ref_anual_pct: 8,
  devaluacion_mensual_pct: 2,
  descuento_contado_pct: 0,
  tarjetas: [
    { id: 't-usd', nombre: 'Tarjeta en dólares', moneda: 'USD', nd_pct: 0, tna_pct: 0, dias: 180 },
    { id: 't-ars', nombre: 'Tarjeta en pesos', moneda: 'ARS', nd_pct: 0, tna_pct: 30, dias: 180 },
  ],
};

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

/** Completa y sanea lo guardado en configuración (o lo que venga a medias). */
export function normalizarFormasPago(p: Partial<ParamsFormasPago> | null | undefined): ParamsFormasPago {
  const b = PARAMS_FORMAS_PAGO_BASE;
  const tarjetas = Array.isArray(p?.tarjetas) ? p!.tarjetas : b.tarjetas;
  return {
    tasa_ref_anual_pct: Math.max(0, num(p?.tasa_ref_anual_pct, b.tasa_ref_anual_pct)),
    devaluacion_mensual_pct: num(p?.devaluacion_mensual_pct, b.devaluacion_mensual_pct),
    descuento_contado_pct: Math.min(100, Math.max(0, num(p?.descuento_contado_pct, b.descuento_contado_pct))),
    tarjetas: tarjetas.map((t, i) => ({
      id: String(t?.id || `t-${i}`),
      nombre: String(t?.nombre || `Tarjeta ${i + 1}`).slice(0, 60),
      moneda: t?.moneda === 'ARS' ? 'ARS' : 'USD',
      nd_pct: Math.max(0, num(t?.nd_pct, 0)),
      tna_pct: Math.max(0, num(t?.tna_pct, 0)),
      dias: Math.max(0, Math.round(num(t?.dias, 180))),
    })),
  };
}

export function paramsFormasPagoDesdeConfig(valor: string | null | undefined): ParamsFormasPago {
  if (!valor) return normalizarFormasPago(null);
  try { return normalizarFormasPago(JSON.parse(valor)); } catch { return normalizarFormasPago(null); }
}

export interface EntradaComparador {
  /** Neto de la operación sin IVA ni financiación (USD) */
  netoUSD: number;
  /** IVA de contado (USD) */
  ivaUSD: number;
  hoy: string;
  /** Dólar de hoy para las opciones en pesos (BNA vendedor); sin dato no se calculan las opciones en pesos */
  tcHoy: number | null;
  params: ParamsFormasPago;
  plazo: { dias: number; tasa_mensual_pct: number } | null;
  canje: { cultivo: string; precioUSD: number; params: ParamsCanje; dias: number } | null;
}

export interface OpcionPago {
  clave: string;
  nombre: string;
  /** Explicación corta de cómo se calcula */
  detalle: string;
  moneda: MonedaPago;
  /** Lo que paga, en su moneda (para canje: USD equivalentes) */
  monto: number;
  dias: number;
  fecha: string;
  /** USD que representa al vencimiento (pesos pasados al dólar estimado) */
  usdAlVencimiento: number;
  valorHoyUSD: number;
  /** % de diferencia del valor hoy contra contado (positivo = más caro) */
  difVsContadoPct: number;
  /** Canje: toneladas a entregar */
  toneladas?: number;
  /** Dólar estimado al vencimiento usado (opciones en pesos) */
  tcVencimiento?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Dólar estimado dentro de `dias` con una devaluación mensual compuesta. */
export function tcEstimado(tcHoy: number, devaluacionMensualPct: number, dias: number): number {
  return tcHoy * Math.pow(1 + devaluacionMensualPct / 100, dias / 30);
}

/** Lleva a hoy un monto en USD que se paga dentro de `dias`, con tasa anual simple. */
export function valorHoy(usd: number, dias: number, tasaAnualPct: number): number {
  return dias > 0 && tasaAnualPct > 0 ? usd / (1 + (tasaAnualPct / 100) * (dias / 365)) : usd;
}

export function compararFormasPago(e: EntradaComparador): OpcionPago[] {
  const { params: p, hoy } = e;
  const totalContado = e.netoUSD + e.ivaUSD;
  if (!(totalContado > 0)) return [];
  const crudas: Omit<OpcionPago, 'difVsContadoPct'>[] = [];

  const contado = totalContado * (1 - p.descuento_contado_pct / 100);
  crudas.push({
    clave: 'contado', nombre: 'Contado', moneda: 'USD', monto: r2(contado), dias: 0, fecha: hoy,
    detalle: p.descuento_contado_pct > 0 ? `Con ${p.descuento_contado_pct}% de descuento` : 'Paga hoy el total con IVA',
    usdAlVencimiento: contado, valorHoyUSD: contado,
  });

  if (e.plazo && e.plazo.dias > 0) {
    const pct = recargoPorcentaje(e.plazo.dias, e.plazo.tasa_mensual_pct);
    const total = totalContado * (1 + pct / 100); // el IVA se calcula sobre el precio financiado
    crudas.push({
      clave: 'plazo', nombre: `A ${e.plazo.dias} días`, moneda: 'USD', monto: r2(total), dias: e.plazo.dias, fecha: sumarDias(hoy, e.plazo.dias),
      detalle: pct > 0 ? `${e.plazo.tasa_mensual_pct}% mensual (+${r2(pct)}%)` : 'Sin interés',
      usdAlVencimiento: total, valorHoyUSD: valorHoy(total, e.plazo.dias, p.tasa_ref_anual_pct),
    });
  }

  if (e.canje && e.canje.precioUSD > 0) {
    const neto = netoPorTn(e.canje.precioUSD, e.canje.params);
    if (neto > 0) {
      const tn = totalContado / neto;
      crudas.push({
        clave: 'canje', nombre: `Canje ${e.canje.cultivo.toLowerCase()}`, moneda: 'USD', monto: r2(totalContado), dias: e.canje.dias,
        fecha: sumarDias(hoy, e.canje.dias), toneladas: Math.round(tn * 100) / 100,
        detalle: `${Math.round(tn * 100) / 100} tn a USD ${r2(neto)} neto/tn`,
        usdAlVencimiento: totalContado, valorHoyUSD: valorHoy(totalContado, e.canje.dias, p.tasa_ref_anual_pct),
      });
    }
  }

  for (const t of p.tarjetas) {
    const conNd = totalContado * (1 + t.nd_pct / 100);
    const totalUSD = conNd * (1 + (t.tna_pct / 100) * (t.dias / 365));
    const partes = [t.nd_pct > 0 ? `ND ${t.nd_pct}%` : null, t.tna_pct > 0 ? `TNA ${t.tna_pct}%` : 'sin interés'].filter(Boolean).join(' + ');
    if (t.moneda === 'USD') {
      crudas.push({
        clave: `tarjeta-${t.id}`, nombre: t.nombre, moneda: 'USD', monto: r2(totalUSD), dias: t.dias, fecha: sumarDias(hoy, t.dias),
        detalle: partes, usdAlVencimiento: totalUSD, valorHoyUSD: valorHoy(totalUSD, t.dias, p.tasa_ref_anual_pct),
      });
    } else if (e.tcHoy && e.tcHoy > 0) {
      // En pesos: se pasa a pesos al dólar de hoy y la tasa corre sobre los pesos
      const pesos = conNd * e.tcHoy * (1 + (t.tna_pct / 100) * (t.dias / 365));
      const tcv = tcEstimado(e.tcHoy, p.devaluacion_mensual_pct, t.dias);
      const usd = pesos / tcv;
      crudas.push({
        clave: `tarjeta-${t.id}`, nombre: t.nombre, moneda: 'ARS', monto: Math.round(pesos), dias: t.dias, fecha: sumarDias(hoy, t.dias),
        detalle: `${partes} · en pesos al dólar ${r2(e.tcHoy)}`, usdAlVencimiento: usd, tcVencimiento: r2(tcv),
        valorHoyUSD: valorHoy(usd, t.dias, p.tasa_ref_anual_pct),
      });
    }
  }

  const base = crudas[0].valorHoyUSD;
  return crudas.map((o) => ({
    ...o,
    usdAlVencimiento: r2(o.usdAlVencimiento),
    valorHoyUSD: r2(o.valorHoyUSD),
    difVsContadoPct: base > 0 ? Math.round(((o.valorHoyUSD - base) / base) * 10000) / 100 : 0,
  }));
}

/** La más barata para el cliente (menor valor hoy). */
export function mejorOpcion(ops: OpcionPago[]): OpcionPago | null {
  return ops.reduce<OpcionPago | null>((m, o) => (!m || o.valorHoyUSD < m.valorHoyUSD ? o : m), null);
}

/** Texto para WhatsApp con las opciones. */
export function textoWhatsAppFormasPago(ops: OpcionPago[], fmt: (n: number, d?: number) => string, fmtFecha: (f: string) => string, titulo?: string): string {
  const lineas = ops.map((o) => {
    const monto = o.moneda === 'ARS' ? `$ ${fmt(o.monto, 0)}` : `USD ${fmt(o.monto)}`;
    const cuando = o.dias > 0 ? ` al ${fmtFecha(o.fecha)}` : ' hoy';
    const extra = o.toneladas ? ` (${fmt(o.toneladas, 2)} tn)` : '';
    return `• *${o.nombre}*: ${monto}${extra}${cuando}`;
  });
  return [`*Formas de pago${titulo ? ` · ${titulo}` : ''}*`, ...lineas, '_Importes con IVA._'].join('\n');
}
