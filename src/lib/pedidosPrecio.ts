import type { PedidoPrecio, PedidoPrecioLinea } from '@/types';

/** Estado tal como lo ve el usuario: un pedido abierto cuyo link ya venció figura como Vencido. */
export type EstadoPedidoVisible = 'Abierto' | 'Respondido' | 'Vencido' | 'Cancelado';

export function estadoPedido(p: Pick<PedidoPrecio, 'estado' | 'vence_el'>, ahora: number = Date.now()): EstadoPedidoVisible {
  if (p.estado === 'Cancelado') return 'Cancelado';
  if (p.estado === 'Respondido') return 'Respondido';
  return new Date(p.vence_el).getTime() < ahora ? 'Vencido' : 'Abierto';
}

/** Pide la atención del usuario: la mesa cargó costos que todavía no se aplicaron, o pidió corregir. */
export function necesitaAtencion(p: Pick<PedidoPrecio, 'estado' | 'aplicado_at' | 'correccion_solicitada'>): boolean {
  if (p.estado === 'Cancelado') return false;
  if (p.estado === 'Respondido' && p.correccion_solicitada) return true;
  return p.estado === 'Respondido' && !p.aplicado_at;
}

export function urlPedido(origen: string, token: string): string {
  return `${origen.replace(/\/+$/, '')}/?mesa=${token}`;
}

/** Texto listo para pegar en WhatsApp. */
/** `nombre`: "Cliente - 001". */
export function textoWhatsAppPedido(o: { url: string; nombre: string; venceEl: string; nota?: string | null }): string {
  const vence = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(o.venceEl));
  const nota = o.nota?.trim() ? `\nNota: ${o.nota.trim()}` : '';
  return `Hola! Necesito costos para la cotización ${o.nombre}.${nota}\nCargalos acá, sin usuario ni clave:\n${o.url}\nEl link vence el ${vence}.`;
}

export function diasRestantes(vence: string, ahora: number = Date.now()): number {
  return Math.ceil((new Date(vence).getTime() - ahora) / 86400000);
}

export interface CostoAplicable {
  key: string;
  costo: number;
  proveedor: string | null;
}

/**
 * Cruza las líneas del pedido con las de la cotización por código de producto.
 * Si un código se repite se asigna en orden, sin usar dos veces la misma línea del pedido.
 * Devuelve lo que se puede aplicar y las líneas de la cotización que quedaron sin costo de la mesa.
 */
export function costosAplicables(
  lineasPedido: Pick<PedidoPrecioLinea, 'cod' | 'costo_usd' | 'proveedor'>[],
  lineasCotiz: { key: string; cod: string }[]
): { aplicar: CostoAplicable[]; sinCosto: string[] } {
  const usadas = new Set<number>();
  const aplicar: CostoAplicable[] = [];
  const sinCosto: string[] = [];
  for (const l of lineasCotiz) {
    const i = lineasPedido.findIndex((p, idx) => !usadas.has(idx) && p.cod === l.cod && p.costo_usd !== null && p.costo_usd > 0);
    if (i === -1) { sinCosto.push(l.key); continue; }
    usadas.add(i);
    aplicar.push({ key: l.key, costo: Number(lineasPedido[i].costo_usd), proveedor: lineasPedido[i].proveedor || null });
  }
  return { aplicar, sinCosto };
}

/** Líneas de la cotización en el formato que recibe el pedido. */
export function lineasParaPedido(
  lineas: { cod: string; producto: string; unid: string; es_fertilizante: boolean; cantidad: number }[]
) {
  return lineas.map((l) => ({ cod: l.cod, producto: l.producto, unidad: l.unid, es_fertilizante: l.es_fertilizante, cantidad: l.cantidad }));
}

/** Etiqueta de la unidad en que la mesa carga el costo. */
export function unidadCosto(l: { es_fertilizante: boolean; unidad: string | null }): string {
  return l.es_fertilizante ? 'USD por tonelada' : `USD por ${l.unidad || 'unidad'}`;
}

/** Fecha de vencimiento (ISO) a tantos días desde ahora. */
export function venceEnDias(dias: number, ahora: number = Date.now()): string {
  return new Date(ahora + dias * 86400000).toISOString();
}

/** Días de vigencia válidos para el link (la base los acota a 1..60). */
export function diasValidos(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 60;
}
