/**
 * Catastro de ARBA (geoARBA, IDERA). Servicios públicos con CORS abierto: se consultan directo desde el navegador.
 * - WMS: imagen de la división parcelaria (capa idera:Parcela) para dibujar arriba del mapa.
 * - WFS: los datos de una parcela (partida, nomenclatura, rural/urbana, superficie y contorno en GeoJSON).
 */
import type { GeoPoligono } from '@/types';

export const ARBA_WMS = 'https://geo.arba.gov.ar/geoserver/idera/wms';
export const ARBA_WFS = 'https://geo.arba.gov.ar/geoserver/idera/wfs';
export const ARBA_CAPA = 'idera:Parcela';
/** Zoom mínimo para mostrar y consultar el catastro (más lejos son miles de parcelas). */
export const ZOOM_CATASTRO = 13;

export interface ParcelaArba {
  partida: string | null;
  nomenclatura: string | null;
  tipo: string | null;
  superficie_m2: number | null;
  geom: GeoPoligono;
}

type Pos = [number, number];
type Anillo = Pos[];

/** Polígonos de la geometría como lista de [exterior, ...huecos]. */
export function poligonos(g: GeoPoligono): Anillo[][] {
  return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Anillo[][];
}

/**
 * GeoServer puede devolver EPSG:4326 como lat,lng según la versión. En Argentina |lng| (53–74) siempre es mayor
 * que |lat| (21–56 sólo en Tierra del Fuego se cruzan, y ahí no hay ARBA): si viene al revés, se da vuelta.
 */
export function normalizarGeom(g: GeoPoligono): GeoPoligono {
  const primero = poligonos(g)[0]?.[0]?.[0];
  if (!primero || Math.abs(primero[0]) >= Math.abs(primero[1])) return g;
  const vuelta = (a: Anillo): Anillo => a.map(([x, y]) => [y, x]);
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: (g.coordinates as Anillo[]).map(vuelta) }
    : { type: 'MultiPolygon', coordinates: (g.coordinates as Anillo[][]).map((p) => p.map(vuelta)) };
}

/** Recuadro [minLng, minLat, maxLng, maxLat]. */
export function recuadro(g: GeoPoligono): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of poligonos(g)) for (const [x, y] of p[0] ?? []) {
    if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y;
  }
  return [a, b, c, d];
}

function dentroAnillo(lng: number, lat: number, anillo: Anillo): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** ¿El punto cae dentro de la parcela? (respeta huecos) */
export function contiene(g: GeoPoligono, lng: number, lat: number): boolean {
  return poligonos(g).some(([ext, ...huecos]) => !!ext && dentroAnillo(lng, lat, ext) && !huecos.some((h) => dentroAnillo(lng, lat, h)));
}

/** Área de un anillo en m² (aproximación esférica, suficiente para chequear la superficie). */
function areaAnillo(a: Anillo): number {
  const R = 6378137, rad = Math.PI / 180;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const [x1, y1] = a[i], [x2, y2] = a[(i + 1) % a.length];
    s += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return Math.abs((s * R * R) / 2);
}

export function areaM2(g: GeoPoligono): number {
  return poligonos(g).reduce((t, [ext, ...huecos]) => t + (ext ? areaAnillo(ext) : 0) - huecos.reduce((h, x) => h + areaAnillo(x), 0), 0);
}

/** Punto medio (centro del recuadro) de varias geometrías: para ubicar el campo. */
export function centro(gs: GeoPoligono[]): { lat: number; lng: number } | null {
  if (!gs.length) return null;
  const rs = gs.map(recuadro);
  const minX = Math.min(...rs.map((r) => r[0])), minY = Math.min(...rs.map((r) => r[1]));
  const maxX = Math.max(...rs.map((r) => r[2])), maxY = Math.max(...rs.map((r) => r[3]));
  if (!Number.isFinite(minX)) return null;
  return { lng: Math.round(((minX + maxX) / 2) * 1e6) / 1e6, lat: Math.round(((minY + maxY) / 2) * 1e6) / 1e6 };
}

/** Partida tal como la guarda ARBA (sólo dígitos: partido + partida, ej. 103063845). */
export function limpiarPartida(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** '103063845' → '103-063845' (partido-partida), para mostrar. */
export function formatoPartida(p: string | null): string {
  if (!p) return '—';
  return /^\d{9}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

export const haDe = (m2: number | null | undefined) => (m2 && m2 > 0 ? m2 / 10000 : 0);

interface FeatureArba { properties?: Record<string, unknown> | null; geometry?: GeoPoligono | null }

/** Convierte la respuesta del WFS (GeoJSON) en parcelas. */
export function parsearParcelas(json: unknown): ParcelaArba[] {
  const fs = (json as { features?: FeatureArba[] } | null)?.features;
  if (!Array.isArray(fs)) return [];
  const texto = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
  return fs
    .filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map((f) => {
      const p = f.properties ?? {};
      const geom = normalizarGeom(f.geometry as GeoPoligono);
      const sup = Number(p.ara1);
      return {
        partida: texto(p.pda),
        nomenclatura: texto(p.cca),
        tipo: texto(p.tpa),
        superficie_m2: Number.isFinite(sup) && sup > 0 ? sup : Math.round(areaM2(geom)),
        geom,
      };
    });
}

function urlWfs(extra: Record<string, string>): string {
  const q = new URLSearchParams({
    service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: ARBA_CAPA,
    outputFormat: 'application/json', srsName: 'EPSG:4326', count: '20', ...extra,
  });
  return `${ARBA_WFS}?${q}`;
}

/** URL para buscar la parcela en un punto (recuadro chiquito alrededor; después se filtra por contención). */
export function urlParcelaEnPunto(lng: number, lat: number, radio = 0.00005): string {
  return urlWfs({ bbox: [lng - radio, lat - radio, lng + radio, lat + radio].map((n) => n.toFixed(7)).join(',') + ',EPSG:4326' });
}

export function urlParcelaPorPartida(partida: string): string {
  return urlWfs({ cql_filter: `pda='${limpiarPartida(partida)}'` });
}

async function pedir(url: string, signal?: AbortSignal): Promise<ParcelaArba[]> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`ARBA respondió ${r.status}`);
  return parsearParcelas(await r.json());
}

/** La parcela que contiene el punto (o la más cercana del recuadro si ninguna lo contiene). */
export async function parcelaEnPunto(lng: number, lat: number, signal?: AbortSignal): Promise<ParcelaArba | null> {
  const ps = await pedir(urlParcelaEnPunto(lng, lat), signal);
  return ps.find((p) => contiene(p.geom, lng, lat)) ?? ps[0] ?? null;
}

export async function parcelaPorPartida(partida: string, signal?: AbortSignal): Promise<ParcelaArba | null> {
  const limpia = limpiarPartida(partida);
  if (limpia.length < 4) return null;
  return (await pedir(urlParcelaPorPartida(limpia), signal))[0] ?? null;
}
