import { sumarEnPesos, type ResumenPesos } from '@/lib/moneda';
import type { ResumenSemanal } from '../../supabase/functions/resumen-semanal/resumen';

type CotBal = { id: string; fecha: string; moneda?: string | null; tc?: number | null; subtotal_usd?: number | null; ganado_usd?: number | null };

/**
 * Parte en pesos (balanceado) de cada bloque del resumen semanal. Usa las mismas cotizaciones y el mismo
 * monto en USD que `armarResumen` (cotizadas: subtotal; ganadas: ganado ?? subtotal; perdidas: subtotal).
 * Ya está incluido en los totales en USD del resumen.
 */
export function balanceadoSemana(r: Pick<ResumenSemanal, 'desde' | 'hasta' | 'ganadas' | 'perdidas'>, cotizaciones: CotBal[]): { cotizadas: ResumenPesos; ganadas: ResumenPesos; perdidas: ResumenPesos } {
  const porId = new Map(cotizaciones.map((c) => [c.id, c]));
  const de = (ids: string[]) => ids.map((id) => porId.get(id)).filter((c): c is CotBal => !!c);
  return {
    cotizadas: sumarEnPesos(cotizaciones.filter((c) => c.fecha >= r.desde && c.fecha <= r.hasta), (c) => c.subtotal_usd || 0),
    ganadas: sumarEnPesos(de(r.ganadas.ids), (c) => c.ganado_usd ?? c.subtotal_usd ?? 0),
    perdidas: sumarEnPesos(de(r.perdidas.ids), (c) => c.subtotal_usd || 0),
  };
}
