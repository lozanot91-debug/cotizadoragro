/**
 * Vencimiento de las cotizaciones: vence a los `vigencia_dias` de la fecha de la cotización.
 * Solo importan las abiertas (Borrador, Enviada, En negociación).
 */
import type { Cotizacion, Tarea } from '@/types';
import { diasEntre, sumarDias } from '@/lib/fechas';

export const ESTADOS_ABIERTOS = ['Borrador', 'Enviada', 'En negociación'];

export type SituacionVigencia = 'vencida' | 'hoy' | 'pronto' | 'vigente';

export function fechaVencimiento(c: Pick<Cotizacion, 'fecha' | 'vigencia_dias'>): string {
  return sumarDias(c.fecha, c.vigencia_dias || 0);
}

/** Días que faltan para vencer (negativo = ya venció hace N días). */
export function diasParaVencer(c: Pick<Cotizacion, 'fecha' | 'vigencia_dias'>, hoy: string): number {
  return diasEntre(hoy, fechaVencimiento(c));
}

export function situacionVigencia(dias: number, diasAviso: number): SituacionVigencia {
  if (dias < 0) return 'vencida';
  if (dias === 0) return 'hoy';
  if (dias <= diasAviso) return 'pronto';
  return 'vigente';
}

export interface Vencimiento {
  cotiz: Cotizacion;
  dias: number;
  vence: string;
  situacion: SituacionVigencia;
}

/** Cotizaciones abiertas vencidas o que vencen dentro de `diasAviso`, las más urgentes primero. */
export function vencimientos(cotizs: Cotizacion[], hoy: string, diasAviso: number): Vencimiento[] {
  return cotizs
    .filter((c) => ESTADOS_ABIERTOS.includes(c.estado))
    .map((cotiz) => {
      const dias = diasParaVencer(cotiz, hoy);
      return { cotiz, dias, vence: fechaVencimiento(cotiz), situacion: situacionVigencia(dias, diasAviso) };
    })
    .filter((v) => v.situacion !== 'vigente')
    .sort((a, b) => a.dias - b.dias || a.cotiz.numero - b.cotiz.numero);
}

/** Vigencia nueva (en días desde la fecha de la cotización) para que venza `extra` días después de hoy, o de su vencimiento si todavía no venció. */
export function vigenciaExtendida(c: Pick<Cotizacion, 'fecha' | 'vigencia_dias'>, hoy: string, extra: number): number {
  const venc = fechaVencimiento(c);
  const base = venc > hoy ? venc : hoy;
  return diasEntre(c.fecha, sumarDias(base, extra));
}

/** ¿Ya hay una tarea pendiente para esta cotización? Si la hay no se crea otra. */
export function tieneTareaPendiente(cotizId: string, tareas: Pick<Tarea, 'cotizacion_id' | 'estado'>[]): boolean {
  return tareas.some((t) => t.cotizacion_id === cotizId && t.estado === 'Pendiente');
}

/** Tarea de seguimiento para una cotización por vencer. */
export function tareaDeVencimiento(v: Vencimiento, hoy: string): Partial<Tarea> {
  const n = v.cotiz.numero;
  const cliente = v.cotiz.cliente_nombre || 'cliente';
  const cuando = v.dias < 0 ? `venció el ${v.vence.split('-').reverse().join('/')}` : v.dias === 0 ? 'vence hoy' : `vence el ${v.vence.split('-').reverse().join('/')}`;
  return {
    titulo: `Seguimiento cotización N° ${n} — ${cliente}`,
    descripcion: `La cotización ${cuando}. Consultar si la confirman, reajustar o extender la vigencia.`,
    tipo: 'Seguimiento',
    prioridad: v.dias <= 1 ? 'Alta' : 'Normal',
    fecha_vencimiento: hoy,
    estado: 'Pendiente',
    cotizacion_id: v.cotiz.id,
    cliente_id: v.cotiz.cliente_id,
  };
}

/** Mensaje para mandarle al cliente por WhatsApp. */
export function mensajeRecordatorio(v: Vencimiento): string {
  const c = v.cotiz;
  const fecha = v.vence.split('-').reverse().join('/');
  const estado = v.dias < 0 ? `venció el ${fecha}` : v.dias === 0 ? 'vence hoy' : `vence el ${fecha}`;
  return `Hola${c.cliente_nombre ? ` ${c.cliente_nombre}` : ''}, te escribo por la cotización N° ${c.numero}, que ${estado}. ¿La pudiste revisar? Si querés la actualizo o ajusto lo que necesites.`;
}
