import type { FuenteLista, ListaCostos } from '@/types';

/** La fuente principal: menor orden y, a igual orden, la más vieja. */
export function fuentePrincipal(fuentes: FuenteLista[]): FuenteLista | null {
  let mejor: FuenteLista | null = null;
  for (const f of fuentes) {
    if (!mejor || f.orden < mejor.orden || (f.orden === mejor.orden && f.created_at < mejor.created_at)) mejor = f;
  }
  return mejor;
}

/** Lista vigente de cada fuente: la de fecha más nueva (a igual fecha, la cargada más tarde). */
export function vigentePorFuente(listas: ListaCostos[]): Map<string, ListaCostos> {
  const m = new Map<string, ListaCostos>();
  for (const l of listas) {
    const v = m.get(l.fuente_id);
    if (!v || l.fecha > v.fecha || (l.fecha === v.fecha && l.created_at > v.created_at)) m.set(l.fuente_id, l);
  }
  return m;
}

/** Las listas vigentes (una por fuente), en el orden en que aparece cada fuente. */
export function listasVigentes(listas: ListaCostos[]): ListaCostos[] {
  return [...vigentePorFuente(listas).values()];
}

/** Antepone el prefijo a los códigos (sin duplicarlo). Prefijo vacío: no cambia nada. */
export function aplicarPrefijoCod<T extends { cod: string }>(filas: T[], prefijo?: string | null): T[] {
  const p = (prefijo ?? '').trim();
  return filas.map((f) => {
    if (!p || !f.cod || f.cod.startsWith(p)) return { ...f };
    return { ...f, cod: p + f.cod };
  });
}
