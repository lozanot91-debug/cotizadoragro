/**
 * Canje de insumos por granos, con la misma cuenta que la planilla CANJES_EDG del equipo:
 * se arma un precio NETO por tonelada (lo que realmente le queda al productor por cada tn que entrega)
 * y el total de la factura de insumos CON IVA se divide por ese neto.
 *
 *   pagado      = precio × % pago (liquidación parcial, 98,5 % por defecto)
 *   + IVA grano = pagado × IVA grano (10,5 %)
 *   − comisión  = pagado × comisión
 *   − flete     = USD/tn
 *   − almacenaje= USD/tn/día × días
 *   − IVA de comisión y almacenaje
 *   − IVA del flete
 *   − sellos    = (pagado + IVA grano) × sellos
 *   − ret. IIBB = pagado × %                         (si se tilda)
 *   − ret. IVA  = (pagado − comisión − almacenaje) × % (si se tilda)
 *   − ret. Gan. = (pagado − comisión − almacenaje) × % (si se tilda)
 *   = neto USD/tn
 *
 * Todo en USD. Los % se guardan como porcentaje (98.5, 10.5), no como fracción.
 */

/** De dónde salió el precio del grano (solo informativo, para mostrarlo en PDF/WhatsApp). */
export interface ReferenciaPrecio {
  tipo: 'pizarra' | 'futuro' | 'manual';
  plaza?: string | null;
  /** Fecha de la pizarra o del ajuste del futuro */
  fecha?: string | null;
  /** Futuro: 'YYYY-MM' de la posición, su ajuste y el diferencial de plaza */
  posicion?: string | null;
  futuro?: number | null;
  diferencial?: number | null;
  /** Precio que dio esta referencia: si después el precio se cambió a mano, la referencia ya no se muestra */
  precio?: number | null;
}

export interface ParamsCanje {
  /** Destino / condición de entrega, solo informativo ("Necochea, condiciones cámara") */
  destino: string;
  /** Origen del precio del grano (opcional) */
  referencia?: ReferenciaPrecio | null;
  pago_pct: number;
  iva_grano_pct: number;
  comision_pct: number;
  iva_comision_pct: number;
  /** Flete del grano en USD/tn (en modo convenio lo calcula la pantalla con la planilla y el TC comprador) */
  flete_usd_tn: number;
  /** 'convenio': planilla del convenio × km; 'manual': USD/tn escrito a mano */
  flete_modo: 'convenio' | 'manual';
  /** Convenio elegido (null = el predeterminado) */
  flete_convenio_id: string | null;
  flete_km: number;
  iva_flete_pct: number;
  almacenaje_usd_tn_dia: number;
  almacenaje_dias: number;
  sellos_pct: number;
  ret_iibb: boolean;
  ret_iibb_pct: number;
  ret_iva: boolean;
  ret_iva_pct: number;
  ret_ganancias: boolean;
  ret_ganancias_pct: number;
}

/** Valores de la planilla del equipo. El admin los cambia en Configuración. */
export const PARAMS_CANJE_BASE: ParamsCanje = {
  destino: 'Necochea, condiciones cámara',
  pago_pct: 98.5,
  iva_grano_pct: 10.5,
  comision_pct: 2.5,
  iva_comision_pct: 10.5,
  flete_usd_tn: 0,
  flete_modo: 'convenio',
  flete_convenio_id: null,
  flete_km: 0,
  iva_flete_pct: 21,
  almacenaje_usd_tn_dia: 0,
  almacenaje_dias: 0,
  sellos_pct: 0.6,
  ret_iibb: true,
  ret_iibb_pct: 1,
  ret_iva: false,
  ret_iva_pct: 0,
  ret_ganancias: false,
  ret_ganancias_pct: 0,
};

/** Alícuotas de IVA para elegir (grano e insumos). */
export const ALICUOTAS_IVA = [10.5, 21, 0];

export const CULTIVOS_CANJE = ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Cebada', 'Sorgo'];

const num = (v: unknown, def: number) => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : def;
};

/** Completa y limpia parámetros que vienen de la base o de la configuración (lo que falte, con la base). */
export function normalizarParams(p: Partial<ParamsCanje> | null | undefined, base: ParamsCanje = PARAMS_CANJE_BASE): ParamsCanje {
  const x = (p || {}) as Partial<Record<keyof ParamsCanje, unknown>>;
  return {
    destino: typeof x.destino === 'string' ? x.destino.slice(0, 120) : base.destino,
    pago_pct: Math.min(num(x.pago_pct, base.pago_pct), 100),
    iva_grano_pct: num(x.iva_grano_pct, base.iva_grano_pct),
    comision_pct: num(x.comision_pct, base.comision_pct),
    iva_comision_pct: num(x.iva_comision_pct, base.iva_comision_pct),
    flete_usd_tn: num(x.flete_usd_tn, base.flete_usd_tn),
    flete_modo: x.flete_modo === 'manual' || x.flete_modo === 'convenio' ? x.flete_modo : base.flete_modo,
    flete_convenio_id: typeof x.flete_convenio_id === 'string' && x.flete_convenio_id ? x.flete_convenio_id : x.flete_convenio_id === null ? null : base.flete_convenio_id,
    flete_km: num(x.flete_km, base.flete_km),
    iva_flete_pct: num(x.iva_flete_pct, base.iva_flete_pct),
    almacenaje_usd_tn_dia: num(x.almacenaje_usd_tn_dia, base.almacenaje_usd_tn_dia),
    almacenaje_dias: Math.round(num(x.almacenaje_dias, base.almacenaje_dias)),
    sellos_pct: num(x.sellos_pct, base.sellos_pct),
    ret_iibb: typeof x.ret_iibb === 'boolean' ? x.ret_iibb : base.ret_iibb,
    ret_iibb_pct: num(x.ret_iibb_pct, base.ret_iibb_pct),
    ret_iva: typeof x.ret_iva === 'boolean' ? x.ret_iva : base.ret_iva,
    ret_iva_pct: num(x.ret_iva_pct, base.ret_iva_pct),
    ret_ganancias: typeof x.ret_ganancias === 'boolean' ? x.ret_ganancias : base.ret_ganancias,
    ret_ganancias_pct: num(x.ret_ganancias_pct, base.ret_ganancias_pct),
    referencia: normalizarReferencia(x.referencia),
  };
}

function normalizarReferencia(r: unknown): ReferenciaPrecio | null {
  if (!r || typeof r !== 'object') return null;
  const x = r as Record<string, unknown>;
  if (x.tipo !== 'pizarra' && x.tipo !== 'futuro' && x.tipo !== 'manual') return null;
  const txt = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { tipo: x.tipo, plaza: txt(x.plaza, 40), fecha: txt(x.fecha, 10), posicion: txt(x.posicion, 7), futuro: n(x.futuro), diferencial: n(x.diferencial), precio: n(x.precio) };
}

const MESES_TXT = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "futuro mayo 2027 (USD 358,80 − 14,50 Quequén)" / "pizarra Quequén del 05/10" */
export function textoReferencia(r: ReferenciaPrecio | null | undefined, fmt: (n: number, d?: number) => string, precio?: number): string | null {
  if (!r) return null;
  if (precio !== undefined && r.precio && Math.abs(r.precio - precio) > 0.005) return null;
  const fecha = r.fecha ? `${r.fecha.slice(8, 10)}/${r.fecha.slice(5, 7)}` : null;
  if (r.tipo === 'futuro' && r.posicion) {
    const [a, m] = r.posicion.split('-').map(Number);
    const pos = `${MESES_TXT[m - 1] ?? r.posicion} ${a}`;
    const dif = r.diferencial ? ` ${r.diferencial < 0 ? '−' : '+'} ${fmt(Math.abs(r.diferencial))} ${r.plaza ?? ''}`.trimEnd() : '';
    return `futuro ${pos}${r.futuro ? ` (Matba-Rofex USD ${fmt(r.futuro)}${dif})` : ''}${fecha ? ` al ${fecha}` : ''}`;
  }
  if (r.tipo === 'pizarra') return `pizarra ${r.plaza ?? ''}${fecha ? ` del ${fecha}` : ''}`.replace(/\s+/g, ' ').trim();
  return null;
}

/** Lee los parámetros por defecto guardados en configuración (texto JSON). */
export function paramsDesdeConfig(valor: string | null | undefined): ParamsCanje {
  if (!valor) return { ...PARAMS_CANJE_BASE };
  try { return normalizarParams(JSON.parse(valor)); } catch { return { ...PARAMS_CANJE_BASE }; }
}

export interface ConceptoCanje {
  clave: string;
  concepto: string;
  /** "98,5 %", "USD 25/tn", etc. lo arma la pantalla; acá va el valor crudo */
  tasa: number | null;
  /** USD/tn con signo: + suma, − resta */
  usd: number;
}

export interface LiquidacionCanje {
  precio: number;
  pagado: number;
  ivaGrano: number;
  comision: number;
  flete: number;
  almacenaje: number;
  ivaComAlm: number;
  ivaFlete: number;
  /** Después de gastos, antes de impuestos y retenciones */
  subtotal: number;
  sellos: number;
  retIibb: number;
  retIva: number;
  retGanancias: number;
  impuestos: number;
  /** Neto USD/tn: lo que vale cada tn entregada para pagar insumos */
  neto: number;
  /** Renglones para mostrar el desglose (solo los que tienen valor, salvo los fijos) */
  conceptos: ConceptoCanje[];
}

const pct = (v: number) => v / 100;

/** Liquidación de UNA tonelada al precio dado. */
export function liquidarTn(precio: number, params: ParamsCanje): LiquidacionCanje {
  const p = normalizarParams(params);
  const precioOk = precio > 0 ? precio : 0;
  const pagado = precioOk * pct(p.pago_pct);
  const ivaGrano = pagado * pct(p.iva_grano_pct);
  const comision = pagado * pct(p.comision_pct);
  const flete = p.flete_usd_tn;
  const almacenaje = p.almacenaje_usd_tn_dia * p.almacenaje_dias;
  const ivaComAlm = (comision + almacenaje) * pct(p.iva_comision_pct);
  const ivaFlete = flete * pct(p.iva_flete_pct);
  const subtotal = pagado + ivaGrano - comision - flete - almacenaje - ivaComAlm - ivaFlete;
  const sellos = (pagado + ivaGrano) * pct(p.sellos_pct);
  const baseRet = pagado - comision - almacenaje;
  const retIibb = p.ret_iibb ? pagado * pct(p.ret_iibb_pct) : 0;
  const retIva = p.ret_iva ? baseRet * pct(p.ret_iva_pct) : 0;
  const retGanancias = p.ret_ganancias ? baseRet * pct(p.ret_ganancias_pct) : 0;
  const impuestos = sellos + retIibb + retIva + retGanancias;
  const neto = subtotal - impuestos;

  const c: ConceptoCanje[] = [
    { clave: 'precio', concepto: 'Precio', tasa: null, usd: precioOk },
    { clave: 'pagado', concepto: 'Pago liquidación', tasa: p.pago_pct, usd: pagado },
    { clave: 'iva_grano', concepto: 'IVA grano', tasa: p.iva_grano_pct, usd: ivaGrano },
    { clave: 'comision', concepto: 'Comisión', tasa: p.comision_pct, usd: -comision },
  ];
  if (flete) c.push({ clave: 'flete', concepto: p.flete_modo === 'convenio' && p.flete_km > 0 ? `Flete (${Math.ceil(p.flete_km)} km)` : 'Flete', tasa: null, usd: -flete });
  if (almacenaje) c.push({ clave: 'almacenaje', concepto: `Almacenaje (${p.almacenaje_dias} días)`, tasa: null, usd: -almacenaje });
  c.push({ clave: 'iva_com', concepto: almacenaje ? 'IVA comisión y almacenaje' : 'IVA comisión', tasa: p.iva_comision_pct, usd: -ivaComAlm });
  if (flete) c.push({ clave: 'iva_flete', concepto: 'IVA flete', tasa: p.iva_flete_pct, usd: -ivaFlete });
  c.push({ clave: 'sellos', concepto: 'Sellos', tasa: p.sellos_pct, usd: -sellos });
  if (p.ret_iibb) c.push({ clave: 'ret_iibb', concepto: 'Retención IIBB', tasa: p.ret_iibb_pct, usd: -retIibb });
  if (p.ret_iva) c.push({ clave: 'ret_iva', concepto: 'Retención IVA', tasa: p.ret_iva_pct, usd: -retIva });
  if (p.ret_ganancias) c.push({ clave: 'ret_ganancias', concepto: 'Retención Ganancias', tasa: p.ret_ganancias_pct, usd: -retGanancias });

  return { precio: precioOk, pagado, ivaGrano, comision, flete, almacenaje, ivaComAlm, ivaFlete, subtotal, sellos, retIibb, retIva, retGanancias, impuestos, neto, conceptos: c };
}

/** Neto USD/tn; 0 si no hay precio o los descuentos se comen todo. */
export function netoPorTn(precio: number, params: ParamsCanje): number {
  const n = liquidarTn(precio, params).neto;
  return n > 0 ? n : 0;
}

/** Toneladas a entregar para cubrir un monto (total CON IVA de los insumos). 0 si no hay neto. */
export function toneladasPorMonto(montoUSD: number, neto: number): number {
  if (!(neto > 0) || !(montoUSD > 0)) return 0;
  return montoUSD / neto;
}

/** Cuenta inversa: cuánto insumo (con IVA) se paga con tantas tn. */
export function montoPorToneladas(tn: number, neto: number): number {
  if (!(neto > 0) || !(tn > 0)) return 0;
  return tn * neto;
}

/** Monto con IVA a partir de uno sin IVA y la alícuota de los insumos. */
export function conIvaInsumos(montoSinIva: number, ivaPct: number): number {
  return (montoSinIva || 0) * (1 + (ivaPct || 0) / 100);
}

/**
 * Neto a usar en una cotización/condición guardada:
 * - con parámetros (cuenta nueva) → neto de la liquidación;
 * - sin parámetros (cotizaciones anteriores) → el precio tal cual, como se calculaba antes.
 */
export function netoGuardado(precio: number, params: Partial<ParamsCanje> | null | undefined): number {
  if (!(precio > 0)) return 0;
  return params ? netoPorTn(precio, normalizarParams(params)) : precio;
}

/** "Necochea, condiciones cámara · neto USD 323,19/tn" (para textos) */
export function resumenLiquidacion(precio: number, params: Partial<ParamsCanje> | null | undefined, fmt: (n: number, d?: number) => string): string {
  if (!params) return `precio de referencia USD ${fmt(precio)}/tn`;
  const p = normalizarParams(params);
  const ref = textoReferencia(p.referencia, fmt, precio);
  const partes = [`precio USD ${fmt(precio)}/tn${ref ? ` (${ref})` : ''}`, `neto liquidación USD ${fmt(netoPorTn(precio, p))}/tn`];
  if (p.destino.trim()) partes.push(`puesto ${p.destino.trim()}`);
  return partes.join(' · ');
}

/** Texto para copiar a WhatsApp desde la calculadora. */
export function textoWhatsAppCanje(d: {
  cliente?: string | null;
  cultivo: string;
  precio: number;
  params: ParamsCanje;
  monto: number;
  tn: number;
  fmt: (n: number, d?: number) => string;
}): string {
  const liq = liquidarTn(d.precio, d.params);
  let m = `*Canje ${d.cultivo}*${d.cliente ? ` · ${d.cliente}` : ''}\n`;
  m += `Insumos (total con IVA): USD ${d.fmt(d.monto)}\n`;
  const ref = textoReferencia(d.params.referencia, d.fmt, d.precio);
  m += `Precio ${d.cultivo}: USD ${d.fmt(d.precio)}/tn${ref ? ` · ${ref}` : ''}${d.params.destino ? ` (${d.params.destino})` : ''}\n`;
  m += `Neto liquidación: USD ${d.fmt(liq.neto)}/tn\n`;
  m += `*Toneladas a entregar: ${d.fmt(d.tn)} tn*\n`;
  return m;
}

/**
 * Flete del grano por convenio: tarifa de la planilla (por 100 kg, en pesos) × 10 / TC comprador.
 * Devuelve null si no hay km, TC o tarifa para esos km.
 */
export function fleteGranoUSD(km: number, tarifas: { km: number; tarifa: number }[], tcCompra: number | null | undefined): { usdTn: number; pesosTn: number; km: number } | null {
  if (!(km > 0) || !(tcCompra && tcCompra > 0)) return null;
  const kmR = Math.ceil(km);
  const t = tarifas.find((x) => x.km === kmR);
  if (!t) return null;
  return { km: kmR, pesosTn: t.tarifa * 10, usdTn: (t.tarifa * 10) / tcCompra };
}
