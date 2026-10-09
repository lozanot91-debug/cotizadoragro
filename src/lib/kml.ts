/**
 * KML / KMZ: contornos de campos (Google Earth, monitores de rendimiento, sembradoras). Sólo polígonos.
 * Parser a mano (sin DOM) para que funcione igual en el navegador y en los tests.
 */
import { unzipSync, strFromU8 } from 'fflate';
import type { GeoPoligono } from '@/types';

type Pos = [number, number];

export interface PoligonoKml { nombre: string | null; geom: GeoPoligono }

function coordenadas(texto: string): Pos[] {
  return texto.trim().split(/\s+/).map((t) => t.split(',').map(Number)).filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[0], c[1]] as Pos);
}

function cerrar(a: Pos[]): Pos[] {
  if (a.length && (a[0][0] !== a[a.length - 1][0] || a[0][1] !== a[a.length - 1][1])) return [...a, a[0]];
  return a;
}

const sinNs = (xml: string) => xml.replace(/<(\/?)[a-zA-Z0-9]+:/g, '<$1');
const anillos = (bloque: string, tag: string) =>
  [...bloque.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))]
    .map((m) => /<coordinates[^>]*>([\s\S]*?)<\/coordinates>/.exec(m[1])?.[1] ?? '')
    .map((c) => cerrar(coordenadas(c))).filter((a) => a.length >= 4);

/** Polígonos de un KML, agrupados por Placemark (un Placemark con varios polígonos da un MultiPolygon). */
export function parsearKml(xml: string): PoligonoKml[] {
  const limpio = sinNs(xml);
  const placemarks = [...limpio.matchAll(/<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g)].map((m) => m[1]);
  const out: PoligonoKml[] = [];
  for (const pm of placemarks.length ? placemarks : [limpio]) {
    const nombre = /<name[^>]*>([\s\S]*?)<\/name>/.exec(pm)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim() || null;
    const polys = [...pm.matchAll(/<Polygon[^>]*>([\s\S]*?)<\/Polygon>/g)]
      .map((m) => { const ext = anillos(m[1], 'outerBoundaryIs')[0]; return ext ? [ext, ...anillos(m[1], 'innerBoundaryIs')] : null; })
      .filter((p): p is Pos[][] => !!p);
    if (polys.length === 1) out.push({ nombre, geom: { type: 'Polygon', coordinates: polys[0] } });
    else if (polys.length > 1) out.push({ nombre, geom: { type: 'MultiPolygon', coordinates: polys } });
  }
  return out;
}

/** Lee un .kml o .kmz (zip con un .kml adentro). */
export async function leerArchivoKml(archivo: File): Promise<PoligonoKml[]> {
  const buf = new Uint8Array(await archivo.arrayBuffer());
  const esZip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (!esZip) return parsearKml(new TextDecoder().decode(buf));
  const archivos = unzipSync(buf, { filter: (f) => f.name.toLowerCase().endsWith('.kml') });
  return Object.values(archivos).flatMap((d) => parsearKml(strFromU8(d)));
}

/** Une varios polígonos en una sola geometría. */
export function unirGeoms(gs: GeoPoligono[]): GeoPoligono | null {
  const polys = gs.flatMap((g) => (g.type === 'Polygon' ? [g.coordinates as Pos[][]] : (g.coordinates as Pos[][][])));
  if (!polys.length) return null;
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** KML con el contorno del campo, para abrir en Google Earth o cargar en el monitor. */
export function generarKml(nombre: string, g: GeoPoligono): string {
  const polys = g.type === 'Polygon' ? [g.coordinates as Pos[][]] : (g.coordinates as Pos[][][]);
  const anillo = (a: Pos[]) => a.map(([x, y]) => `${x},${y},0`).join(' ');
  const poligono = ([ext, ...huecos]: Pos[][]) =>
    `<Polygon><outerBoundaryIs><LinearRing><coordinates>${anillo(ext)}</coordinates></LinearRing></outerBoundaryIs>` +
    huecos.map((h) => `<innerBoundaryIs><LinearRing><coordinates>${anillo(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('') + '</Polygon>';
  const geom = polys.length === 1 ? poligono(polys[0]) : `<MultiGeometry>${polys.map(poligono).join('')}</MultiGeometry>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(nombre)}</name>` +
    `<Style id="c"><LineStyle><color>ff10b981</color><width>2</width></LineStyle><PolyStyle><color>4010b981</color></PolyStyle></Style>` +
    `<Placemark><name>${esc(nombre)}</name><styleUrl>#c</styleUrl>${geom}</Placemark></Document></kml>\n`;
}
