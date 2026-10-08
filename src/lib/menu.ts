/** Estructura del menú lateral: dos accesos sueltos arriba y grupos que se abren y cierran. */

export type Screen = 'inicio' | 'nueva' | 'pipeline' | 'cotizaciones' | 'tareas' | 'visitas' | 'clientes' | 'listas' | 'estadisticas' | 'config' | 'historial' | 'recotizar' | 'rentabilidad' | 'vencimientos' | 'cobranzas' | 'costos' | 'pedidos' | 'consulta' | 'facturacion' | 'catalogo' | 'canje';

export type Badge = 'venc' | 'pedido' | 'cobro' | 'tarea' | 'factura';

export interface ItemMenu {
  id: Screen;
  label: string;
  badge?: Badge;
  soloAdmin?: boolean;
}

export interface GrupoMenu {
  id: string;
  label: string;
  items: ItemMenu[];
}

export const SUELTOS: ItemMenu[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'nueva', label: 'Nueva cotización' },
];

export const GRUPOS: GrupoMenu[] = [
  { id: 'cotizaciones', label: 'Cotizaciones', items: [
    { id: 'cotizaciones', label: 'Cotizaciones' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'vencimientos', label: 'Vencimientos', badge: 'venc' },
    { id: 'recotizar', label: 'Recotizar' },
    { id: 'pedidos', label: 'Pedidos a mesa', badge: 'pedido' },
    { id: 'facturacion', label: 'A facturar', badge: 'factura' },
  ] },
  { id: 'clientes', label: 'Clientes', items: [
    { id: 'clientes', label: 'Clientes' },
    { id: 'tareas', label: 'Tareas', badge: 'tarea' },
    { id: 'visitas', label: 'Visitas' },
    { id: 'cobranzas', label: 'Cobranzas', badge: 'cobro' },
  ] },
  { id: 'precios', label: 'Precios', items: [
    { id: 'consulta', label: 'Consulta de costos' },
    { id: 'canje', label: 'Calculadora de canje' },
    { id: 'catalogo', label: 'Catálogo' },
    { id: 'listas', label: 'Listas y fletes' },
    { id: 'costos', label: 'Evolución de costos' },
  ] },
  { id: 'analisis', label: 'Análisis', items: [
    { id: 'estadisticas', label: 'Estadísticas' },
    { id: 'rentabilidad', label: 'Rentabilidad' },
  ] },
  { id: 'admin', label: 'Administración', items: [
    { id: 'config', label: 'Configuración', soloAdmin: true },
    { id: 'historial', label: 'Historial' },
  ] },
];

/** Grupos que ve este usuario (sin los ítems de admin si no lo es, y sin grupos vacíos). */
export function gruposVisibles(esAdmin: boolean): GrupoMenu[] {
  return GRUPOS
    .map((g) => ({ ...g, items: g.items.filter((i) => esAdmin || !i.soloAdmin) }))
    .filter((g) => g.items.length > 0);
}

/** Grupo al que pertenece una pantalla (null para Inicio y Nueva cotización). */
export function grupoDe(screen: Screen): string | null {
  return GRUPOS.find((g) => g.items.some((i) => i.id === screen))?.id ?? null;
}

/** Suma de los avisos de un grupo, para mostrarla en el título cuando está cerrado. */
export function badgeDeGrupo(g: GrupoMenu, badges: Partial<Record<Badge, number>>): number {
  return g.items.reduce((s, i) => s + (i.badge ? badges[i.badge] || 0 : 0), 0);
}
