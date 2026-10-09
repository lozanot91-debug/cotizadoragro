/**
 * Precio a cosecha para el canje: ajuste del futuro de Rosario (Matba-Rofex / A3) de la posición elegida
 * + diferencial de plaza (pizarra de la plaza − disponible Rosario del mismo día). En Quequén suele ser negativo.
 */
import type { FuturoGrano, PizarraGrano } from '@/types';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const norm = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** '2027-05' → 'Mayo 2027'; 'DIS' → 'Disponible'. */
export function etiquetaPosicion(posicion: string): string {
  if (posicion === 'DIS') return 'Disponible';
  const [a, m] = posicion.split('-').map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} ${a}` : posicion;
}

export interface PosicionFutura { posicion: string; etiqueta: string; ajuste: number; fecha: string; simbolo: string }

/** Posiciones del último día con datos de ese cultivo (sin el disponible), de la más cercana a la más lejana. */
export function posicionesVigentes(futuros: FuturoGrano[], cultivo: string): PosicionFutura[] {
  const k = norm(cultivo);
  const del = futuros.filter((f) => norm(f.cultivo) === k && f.posicion !== 'DIS');
  if (!del.length) return [];
  const ultima = del.reduce((m, f) => (f.fecha > m ? f.fecha : m), '');
  return del.filter((f) => f.fecha === ultima)
    .map((f) => ({ posicion: f.posicion, etiqueta: etiquetaPosicion(f.posicion), ajuste: Number(f.ajuste), fecha: f.fecha, simbolo: f.simbolo }))
    .sort((a, b) => a.posicion.localeCompare(b.posicion));
}

/**
 * Posición por defecto para canje a cosecha: la de cosecha gruesa/fina más próxima que tenga precio.
 * Soja → mayo, maíz → abril, trigo → enero, girasol → marzo; si no está, la más lejana disponible.
 */
export function posicionCosecha(posiciones: PosicionFutura[], cultivo: string, hoy: string): PosicionFutura | null {
  if (!posiciones.length) return null;
  const mes: Record<string, number> = { soja: 5, maiz: 4, trigo: 1, girasol: 3, sorgo: 5, cebada: 1 };
  const m = mes[norm(cultivo)];
  const futuras = posiciones.filter((p) => p.posicion > hoy.slice(0, 7));
  const deCosecha = m ? futuras.find((p) => Number(p.posicion.slice(5, 7)) === m) : undefined;
  return deCosecha ?? futuras[futuras.length - 1] ?? posiciones[posiciones.length - 1];
}

/**
 * Diferencial de plaza: pizarra de la plaza − disponible Rosario (futuros, posición DIS), en el día más
 * reciente en que estén los dos (hasta 15 días atrás). null si no hay un día en común.
 */
export function diferencialPlaza(pizarras: PizarraGrano[], futuros: FuturoGrano[], plaza: string, cultivo: string): { usd: number; fecha: string; pizarra: number; disponible: number } | null {
  const k = norm(cultivo);
  const dis = new Map(futuros.filter((f) => norm(f.cultivo) === k && f.posicion === 'DIS').map((f) => [f.fecha, Number(f.ajuste)]));
  const pz = pizarras.filter((p) => p.plaza === plaza && norm(p.cultivo) === k && p.precio_usd && p.precio_usd > 0)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  for (const p of pz) {
    const d = dis.get(p.fecha);
    if (d) return { usd: Math.round((Number(p.precio_usd) - d) * 100) / 100, fecha: p.fecha, pizarra: Number(p.precio_usd), disponible: d };
  }
  return null;
}
