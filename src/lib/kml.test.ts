import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { generarKml, leerArchivoKml, parsearKml, unirGeoms } from './kml';
import type { GeoPoligono } from '@/types';

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name><![CDATA[La Esperanza]]></name><Polygon><outerBoundaryIs><LinearRing><coordinates>
  -59.14,-37.33,0 -59.13,-37.33,0 -59.13,-37.32,0 -59.14,-37.32,0
</coordinates></LinearRing></outerBoundaryIs><innerBoundaryIs><LinearRing><coordinates>-59.136,-37.326 -59.134,-37.326 -59.134,-37.324 -59.136,-37.326</coordinates></LinearRing></innerBoundaryIs></Polygon></Placemark>
<Placemark><name>Dos lotes</name><MultiGeometry>
<Polygon><outerBoundaryIs><LinearRing><coordinates>-59,-37 -58.9,-37 -58.9,-36.9 -59,-37</coordinates></LinearRing></outerBoundaryIs></Polygon>
<Polygon><outerBoundaryIs><LinearRing><coordinates>-58,-37 -57.9,-37 -57.9,-36.9 -58,-37</coordinates></LinearRing></outerBoundaryIs></Polygon>
</MultiGeometry></Placemark>
<Placemark><name>Un punto</name><Point><coordinates>-59,-37</coordinates></Point></Placemark>
</Document></kml>`;

describe('KML', () => {
  it('lee polígonos con hueco y multigeometrías, cerrando anillos', () => {
    const ps = parsearKml(KML);
    expect(ps).toHaveLength(2);
    expect(ps[0].nombre).toBe('La Esperanza');
    expect(ps[0].geom.type).toBe('Polygon');
    const c = ps[0].geom.coordinates as number[][][];
    expect(c).toHaveLength(2);
    expect(c[0][0]).toEqual(c[0][c[0].length - 1]); // se cerró
    expect(ps[1].geom.type).toBe('MultiPolygon');
  });
  it('acepta prefijos de namespace', () => {
    expect(parsearKml(KML.replace(/<(\/?)(Placemark|Polygon|outerBoundaryIs|LinearRing|coordinates)/g, '<$1kml:$2'))).toHaveLength(2);
  });
  it('KMZ', async () => {
    const zip = zipSync({ 'doc.kml': strToU8(KML), 'files/x.png': new Uint8Array([1]) });
    const f = new File([zip], 'campo.kmz');
    expect(await leerArchivoKml(f)).toHaveLength(2);
  });
  it('ida y vuelta con generarKml', () => {
    const g = parsearKml(KML)[0].geom;
    const otra = parsearKml(generarKml('A & B', g));
    expect(otra[0].nombre).toBe('A & B');
    expect(otra[0].geom).toEqual(g);
  });
  it('une geometrías', () => {
    const a: GeoPoligono = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    expect(unirGeoms([a])).toEqual(a);
    expect(unirGeoms([a, a])?.type).toBe('MultiPolygon');
    expect(unirGeoms([])).toBeNull();
  });
});
