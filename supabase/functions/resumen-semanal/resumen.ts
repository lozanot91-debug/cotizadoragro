// Resumen semanal del área comercial. Sin dependencias: lo usan la edge function `resumen-semanal`
// (notificación de los lunes) y la pantalla "Resumen semanal" de la app.

export interface CotizResumen {
  id: string;
  fecha: string;
  estado: string;
  subtotal_usd: number;
  ganado_usd?: number | null;
  vigencia_dias: number;
  cliente_nombre: string | null;
  numero: number;
  numero_cliente?: number | null;
  motivo_perdida?: string | null;
}
export interface CambioEstado { cotizacion_id: string | null; valor_nuevo: string | null; created_at: string }
export interface CobroResumen { vencimiento: string; monto_usd: number; estado: string }

export interface ResumenSemanal {
  desde: string;
  hasta: string;
  cotizadas: { n: number; usd: number };
  ganadas: { n: number; usd: number; ids: string[] };
  perdidas: { n: number; usd: number; ids: string[]; motivos: { motivo: string; n: number }[] };
  /** Ganadas / (ganadas + perdidas) de la semana, en %; null si no se cerró ninguna */
  tasaCierre: number | null;
  /** Abiertas que vencen en los próximos 7 días */
  porVencer: { id: string; nombre: string; vence: string; usd: number }[];
  /** Abiertas ya vencidas */
  vencidas: number;
  cobros: { vencidos: { n: number; usd: number }; proximos7: { n: number; usd: number } };
}

const ABIERTAS = ['Borrador', 'Enviada', 'En negociación'];

function sumarDias(f: string, d: number): string {
  return new Date(Date.parse(f + 'T00:00:00Z') + d * 86400_000).toISOString().slice(0, 10);
}
/** Fecha argentina (YYYY-MM-DD) de un timestamp. */
export function fechaAR(iso: string): string {
  return new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);
}
const ganadoDe = (c: CotizResumen) => (c.ganado_usd ?? c.subtotal_usd ?? 0);
export const nombreCot = (c: CotizResumen) => {
  const cli = (c.cliente_nombre || '').trim().replace(/\s+/g, ' ') || 'Sin cliente';
  return c.numero_cliente ? `${cli} - ${String(c.numero_cliente).padStart(3, '0')}` : `${cli} - N° ${c.numero}`;
};

/**
 * Semana = los 7 días anteriores a `hoy` (el lunes, de lunes a domingo pasados).
 * Ganadas/perdidas por la fecha en que cambiaron de estado (historial); cotizadas por su fecha.
 */
export function armarResumen(hoy: string, cotizaciones: CotizResumen[], cambios: CambioEstado[], cobros: CobroResumen[]): ResumenSemanal {
  const desde = sumarDias(hoy, -7), hasta = sumarDias(hoy, -1);
  const enSemana = (f: string) => f >= desde && f <= hasta;
  const porId = new Map(cotizaciones.map((c) => [c.id, c]));

  const cotizadas = cotizaciones.filter((c) => enSemana(c.fecha));
  // Último cambio de estado de la semana por cotización (si se ganó y se reabrió, cuenta el último)
  const ultimo = new Map<string, CambioEstado>();
  for (const ch of cambios) {
    if (!ch.cotizacion_id || !enSemana(fechaAR(ch.created_at))) continue;
    const prev = ultimo.get(ch.cotizacion_id);
    if (!prev || ch.created_at > prev.created_at) ultimo.set(ch.cotizacion_id, ch);
  }
  const ganadas: CotizResumen[] = [], perdidas: CotizResumen[] = [];
  for (const [id, ch] of ultimo) {
    const c = porId.get(id);
    if (!c || c.estado !== ch.valor_nuevo) continue; // ya no está en ese estado
    if (ch.valor_nuevo === 'Ganada') ganadas.push(c);
    if (ch.valor_nuevo === 'Perdida') perdidas.push(c);
  }
  const motivos = new Map<string, number>();
  for (const p of perdidas) { const m = (p.motivo_perdida || 'Sin motivo').trim(); motivos.set(m, (motivos.get(m) || 0) + 1); }

  const abiertas = cotizaciones.filter((c) => ABIERTAS.includes(c.estado));
  const vence = (c: CotizResumen) => sumarDias(c.fecha, c.vigencia_dias || 15);
  const porVencer = abiertas.filter((c) => vence(c) >= hoy && vence(c) <= sumarDias(hoy, 7))
    .map((c) => ({ id: c.id, nombre: nombreCot(c), vence: vence(c), usd: c.subtotal_usd || 0 }))
    .sort((a, b) => a.vence.localeCompare(b.vence));
  const vencidas = abiertas.filter((c) => vence(c) < hoy).length;

  const pend = cobros.filter((c) => c.estado === 'Pendiente');
  const sum = (xs: CobroResumen[]) => ({ n: xs.length, usd: xs.reduce((s, c) => s + (Number(c.monto_usd) || 0), 0) });

  const cerradas = ganadas.length + perdidas.length;
  return {
    desde, hasta,
    cotizadas: { n: cotizadas.length, usd: cotizadas.reduce((s, c) => s + (c.subtotal_usd || 0), 0) },
    ganadas: { n: ganadas.length, usd: ganadas.reduce((s, c) => s + ganadoDe(c), 0), ids: ganadas.map((c) => c.id) },
    perdidas: { n: perdidas.length, usd: perdidas.reduce((s, c) => s + (c.subtotal_usd || 0), 0), ids: perdidas.map((c) => c.id), motivos: [...motivos].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n) },
    tasaCierre: cerradas ? (ganadas.length / cerradas) * 100 : null,
    porVencer, vencidas,
    cobros: { vencidos: sum(pend.filter((c) => c.vencimiento < hoy)), proximos7: sum(pend.filter((c) => c.vencimiento >= hoy && c.vencimiento <= sumarDias(hoy, 7))) },
  };
}

const usd = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n));
const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** Texto corto de la notificación. */
export function textoNotificacion(r: ResumenSemanal): { titulo: string; cuerpo: string } {
  const p: string[] = [];
  p.push(`${r.cotizadas.n} ${r.cotizadas.n === 1 ? 'cotización' : 'cotizaciones'} (USD ${usd(r.cotizadas.usd)})`);
  if (r.ganadas.n) p.push(`ganadas ${r.ganadas.n} (USD ${usd(r.ganadas.usd)})`);
  if (r.perdidas.n) p.push(`perdidas ${r.perdidas.n}`);
  if (r.porVencer.length) p.push(`${r.porVencer.length} vencen esta semana`);
  if (r.cobros.vencidos.n) p.push(`USD ${usd(r.cobros.vencidos.usd)} en cobros vencidos`);
  return { titulo: `Resumen de la semana ${dm(r.desde)} al ${dm(r.hasta)}`, cuerpo: p.join(' · ') + '.' };
}
