import type { Cotizacion, CotizacionLinea, OpcionPago } from '@/types';
import { financiacionLinea, plazoLinea, totalesDeCotizacion } from '@/lib/export';
import type { TotalesIva } from '@/lib/calculations';

export const ID_PRINCIPAL = 'principal';
/** Máximo de opciones, incluida la principal. */
export const MAX_OPCIONES = 4;

const entero = (n: unknown): number | null =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;

/** Ajusta plazos al largo de las líneas (relleno 0), descarta opciones inválidas y deja 'principal' primera. */
export function normalizarOpciones(opciones: OpcionPago[] | null | undefined, nLineas: number): OpcionPago[] {
  const validas: OpcionPago[] = [];
  for (const o of opciones ?? []) {
    if (!o || typeof o.id !== 'string' || !o.id || !Array.isArray(o.plazos)) continue;
    const plazos = o.plazos.map((p) => entero(p) ?? 0);
    while (plazos.length < nLineas) plazos.push(0);
    validas.push({ id: o.id, nombre: o.nombre ?? '', tasa_mensual: Number(o.tasa_mensual) || 0, plazos: plazos.slice(0, nLineas) });
  }
  const principal = validas.find((o) => o.id === ID_PRINCIPAL);
  const otras = validas.filter((o) => o.id !== ID_PRINCIPAL);
  if (!principal) return otras.length ? [{ id: ID_PRINCIPAL, nombre: 'Contado', tasa_mensual: 0, plazos: Array(nLineas).fill(0) }, ...otras] : [];
  return [principal, ...otras];
}

function conOpcion(cotiz: Cotizacion, lineas: CotizacionLinea[], op: OpcionPago) {
  return {
    c: { ...cotiz, tasa_mensual: op.tasa_mensual } as Cotizacion,
    ls: lineas.map((l, i) => ({ ...l, plazo_dias: op.plazos[i] ?? 0 })),
  };
}

export function calcularOpcion(
  cotiz: Cotizacion,
  lineas: CotizacionLinea[],
  op: OpcionPago
): { totales: TotalesIva; lineas: { plazo: number; pct: number; precioUnit: number; total: number }[] } {
  const { c, ls } = conOpcion(cotiz, lineas, op);
  return {
    totales: totalesDeCotizacion(c, ls),
    lineas: ls.map((l) => {
      const f = financiacionLinea(l, c);
      return { plazo: f.plazo, pct: f.pct, precioUnit: f.precioUnit, total: f.total };
    }),
  };
}

export function aplicarOpcion(cotiz: Cotizacion, lineas: CotizacionLinea[], op: OpcionPago) {
  const { totales } = calcularOpcion(cotiz, lineas, op);
  return {
    cotizPatch: {
      plazo_dias: Math.max(0, ...op.plazos),
      tasa_mensual: op.tasa_mensual,
      recargo_usd: totales.recargo,
      iva_usd: totales.iva,
      total_usd: totales.total,
      total_ars: totales.totalARS,
      opcion_elegida: op.id,
    },
    lineasPatch: op.plazos.slice(0, lineas.length).map((plazo_dias, index) => ({ index, plazo_dias })),
  };
}

/** Opción 'principal' tal como están hoy las líneas y la tasa de la cotización. */
export function opcionPrincipalDesdeLineas(cotiz: Cotizacion, lineas: CotizacionLinea[]): OpcionPago {
  const plazos = lineas.map((l) => plazoLinea(l, cotiz));
  return {
    id: ID_PRINCIPAL,
    nombre: plazos.every((p) => p === 0) ? 'Contado' : 'Principal',
    tasa_mensual: cotiz.tasa_mensual || 0,
    plazos,
  };
}

/** Saca las posiciones indicadas de los plazos de todas las opciones (al duplicar sin algunas líneas). */
export function alinearOpcionesTrasQuitar(opciones: OpcionPago[], indicesQuitados: number[]): OpcionPago[] {
  const quitar = new Set(indicesQuitados);
  return opciones.map((o) => ({ ...o, plazos: o.plazos.filter((_, i) => !quitar.has(i)) }));
}

export function validarOpciones(opciones: OpcionPago[], nLineas: number): string[] {
  const errores: string[] = [];
  if (opciones.length > MAX_OPCIONES) errores.push(`Máximo ${MAX_OPCIONES} opciones`);
  const ids = new Set<string>();
  const principal = opciones.find((o) => o.id === ID_PRINCIPAL);
  for (const o of opciones) {
    if (ids.has(o.id)) errores.push(`Id repetido: ${o.id}`);
    ids.add(o.id);
    if (!o.nombre.trim()) errores.push(`La opción ${o.id} no tiene nombre`);
    if (!(o.tasa_mensual >= 0)) errores.push(`La opción "${o.nombre}" tiene tasa negativa`);
    if (o.plazos.length !== nLineas || o.plazos.some((p) => entero(p) === null)) {
      errores.push(`La opción "${o.nombre}" tiene plazos inválidos`);
    }
    if (
      principal && o !== principal &&
      o.tasa_mensual === principal.tasa_mensual &&
      o.plazos.length === principal.plazos.length &&
      o.plazos.every((p, i) => p === principal.plazos[i])
    ) {
      errores.push(`La opción "${o.nombre}" es igual a la principal`);
    }
  }
  return errores;
}
