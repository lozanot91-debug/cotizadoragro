/**
 * Alertas de recompra: clientes que el año pasado, en esta misma época, compraron (cotización Ganada)
 * y que este año todavía no tienen ninguna cotización reciente.
 */
import { armarFecha, diasEntre, diasDelMes, partesFecha } from '@/lib/fechas';
import { montoGanado } from '@/lib/ganadaParcial';
import type { Cotizacion } from '@/types';

export type CotizRecompra = Pick<Cotizacion, 'id' | 'cliente_id' | 'cliente_nombre' | 'fecha' | 'estado' | 'subtotal_usd' | 'ganado_usd'>;

export interface OpcionesRecompra {
  /** Se avisa desde X días antes del aniversario de la compra… */
  antesDias: number;
  /** …hasta X días después (si todavía no se cotizó) */
  despuesDias: number;
  /** Una cotización de los últimos X días (cualquier estado) cuenta como "ya se le cotizó" */
  sinCotizarDias: number;
}

export const OPCIONES_RECOMPRA: OpcionesRecompra = { antesDias: 45, despuesDias: 21, sinCotizarDias: 60 };

export interface AlertaRecompra {
  clave: string;
  clienteId: string | null;
  cliente: string;
  /** Compras ganadas del año pasado que caen en la ventana (la más cercana primero) */
  compras: CotizRecompra[];
  montoUsd: number;
  /** Aniversario de la compra más cercana */
  fechaAniversario: string;
  /** Días desde hoy hasta el aniversario (negativo = ya pasó) */
  dias: number;
}

/** Clave del cliente: el id o, si no está cargado como cliente, el nombre normalizado. */
export function claveCliente(c: Pick<Cotizacion, 'cliente_id' | 'cliente_nombre'>): string {
  if (c.cliente_id) return `id:${c.cliente_id}`;
  return `nombre:${(c.cliente_nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

/** La misma fecha un año después (29/02 → 28/02). */
export function aniversario(fecha: string): string {
  const { anio, mes, dia } = partesFecha(fecha);
  return armarFecha(anio + 1, mes, Math.min(dia, diasDelMes(anio + 1, mes)));
}

/**
 * Alertas para hoy. `pospuestas`: clave de cliente → fecha hasta la que no se avisa.
 * Orden: primero las más urgentes (aniversario más cercano o ya pasado).
 */
export function alertasRecompra(
  cotizaciones: CotizRecompra[],
  hoy: string,
  pospuestas: Map<string, string> = new Map(),
  op: OpcionesRecompra = OPCIONES_RECOMPRA,
): AlertaRecompra[] {
  // Clientes a los que ya se les cotizó hace poco (o tienen cotización con fecha futura)
  const recientes = new Set(
    cotizaciones.filter((c) => diasEntre(c.fecha, hoy) <= op.sinCotizarDias).map(claveCliente),
  );
  const porCliente = new Map<string, AlertaRecompra>();
  for (const c of cotizaciones) {
    if (c.estado !== 'Ganada' || !(montoGanado(c) > 0)) continue;
    const aniv = aniversario(c.fecha);
    const dias = diasEntre(hoy, aniv);
    if (dias > op.antesDias || dias < -op.despuesDias) continue;
    const clave = claveCliente(c);
    if (recientes.has(clave)) continue;
    const hasta = pospuestas.get(clave);
    if (hasta && hasta >= hoy) continue;
    const a = porCliente.get(clave);
    if (a) {
      a.compras.push(c);
      a.montoUsd += montoGanado(c);
      if (Math.abs(dias) < Math.abs(a.dias)) { a.dias = dias; a.fechaAniversario = aniv; }
    } else {
      porCliente.set(clave, { clave, clienteId: c.cliente_id, cliente: c.cliente_nombre || 'Sin nombre', compras: [c], montoUsd: montoGanado(c), fechaAniversario: aniv, dias });
    }
  }
  const res = [...porCliente.values()];
  for (const a of res) a.compras.sort((x, y) => Math.abs(diasEntre(hoy, aniversario(x.fecha))) - Math.abs(diasEntre(hoy, aniversario(y.fecha))));
  return res.sort((a, b) => a.dias - b.dias || b.montoUsd - a.montoUsd);
}

/** "en 12 días", "hoy", "hace 5 días" */
export function textoDias(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias > 0) return `en ${dias} días`;
  return dias === -1 ? 'ayer' : `hace ${-dias} días`;
}
