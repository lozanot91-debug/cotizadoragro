import { describe, expect, it } from 'vitest';
import { GRUPOS, SUELTOS, badgeDeGrupo, grupoDe, gruposVisibles, type Screen } from './menu';

const TODAS: Screen[] = ['inicio', 'nueva', 'pipeline', 'cotizaciones', 'tareas', 'visitas', 'clientes', 'listas', 'estadisticas', 'config', 'historial', 'recotizar', 'rentabilidad', 'vencimientos', 'cobranzas', 'costos', 'pedidos', 'consulta', 'facturacion', 'catalogo', 'canje', 'relacion', 'competencia', 'resumen', 'mapa'];

describe('menú', () => {
  it('cada pantalla aparece una sola vez', () => {
    const ids = [...SUELTOS, ...GRUPOS.flatMap((g) => g.items)].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...TODAS].sort());
  });

  it('Configuración solo para el admin', () => {
    const ids = (esAdmin: boolean) => gruposVisibles(esAdmin).flatMap((g) => g.items.map((i) => i.id));
    expect(ids(true)).toContain('config');
    expect(ids(false)).not.toContain('config');
    expect(ids(false)).toContain('historial');
  });

  it('sabe a qué grupo pertenece cada pantalla', () => {
    expect(grupoDe('vencimientos')).toBe('cotizaciones');
    expect(grupoDe('cobranzas')).toBe('clientes');
    expect(grupoDe('listas')).toBe('precios');
    expect(grupoDe('inicio')).toBeNull();
  });

  it('suma los avisos del grupo', () => {
    const cot = GRUPOS.find((g) => g.id === 'cotizaciones')!;
    expect(badgeDeGrupo(cot, { venc: 2, pedido: 1, cobro: 5 })).toBe(3);
    expect(badgeDeGrupo(GRUPOS.find((g) => g.id === 'analisis')!, { venc: 2 })).toBe(0);
  });
});
