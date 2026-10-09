import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import type { GeoJsonObject } from 'geojson';
import { AlertTriangle, Crosshair, Download, FileUp, Layers, Loader2, MapPin, Pencil, PenLine, Plus, Search, Trash2, X } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { formatUSD } from '@/lib/format';
import {
  ARBA_CAPA, ARBA_WMS, ZOOM_CATASTRO, areaM2, centro, formatoPartida, haDe, parcelaEnPunto, parcelaPorPartida, recuadro,
  type ParcelaArba,
} from '@/lib/arba';
import { generarKml, leerArchivoKml, unirGeoms } from '@/lib/kml';
import type { Campo, CampoMapa, Cliente, GeoPoligono, ParcelaInfo, ParcelaMapa } from '@/types';

const INICIO: L.LatLngTuple = [-37.32, -59.13]; // Tandil
const ESTILO_GUARDADA: L.PathOptions = { color: '#10b981', weight: 2, fillColor: '#10b981', fillOpacity: 0.25 };
const ESTILO_PROSPECTO: L.PathOptions = { color: '#f97316', weight: 2, fillColor: '#f97316', fillOpacity: 0.2, dashArray: '5 4' };
/** Parcela de un campo que ya tiene contorno propio: queda como referencia fina */
const ESTILO_PARCELA_REF: L.PathOptions = { color: '#10b981', weight: 1.5, dashArray: '4 4', fillColor: '#10b981', fillOpacity: 0.05 };
const ESTILO_CONTORNO: L.PathOptions = { color: '#059669', weight: 3, fillColor: '#10b981', fillOpacity: 0.3 };
const ESTILO_EDICION: L.PathOptions = { color: '#2563eb', weight: 3, fillColor: '#3b82f6', fillOpacity: 0.2 };
/** Diferencia contorno vs catastro a partir de la cual se avisa */
const DIF_AVISO_PCT = 5;
const ESTILO_SELECCION: L.PathOptions = { color: '#facc15', weight: 3, fillColor: '#facc15', fillOpacity: 0.2 };
const geo = (g: GeoPoligono) => g as unknown as GeoJsonObject;
const ha = (m2: number | null) => `${formatUSD(haDe(m2), 2)} ha`;

type Base = 'satelite' | 'calles';
type Fuente = 'dibujo' | 'KML' | 'ARBA';
interface Edicion { campoId: string; campo: string; cliente: string; fuente: Fuente }
interface CampoElegido { campoId: string; campo: string; cliente: string }

/** GeoJSON → anillos de Leaflet ([lat, lng]) por polígono. */
const aLatLngs = (g: GeoPoligono): L.LatLngTuple[][][] =>
  (g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][])).map((p) => p.map((a) => a.map(([x, y]) => [y, x] as L.LatLngTuple)));

/** Polígonos que está editando geoman (los demás tienen pmIgnore). */
function geomsEdicion(map: L.Map): GeoPoligono[] {
  return map.pm.getGeomanLayers()
    .filter((l): l is L.Polygon => l instanceof L.Polygon)
    .map((l) => l.toGeoJSON().geometry as unknown as GeoPoligono)
    .filter((g) => g.type === 'Polygon' || g.type === 'MultiPolygon');
}

/**
 * Mapa de campos: imagen satelital con la división catastral de ARBA arriba. Tocando una parcela trae sus datos
 * (partida, nomenclatura, rural/urbana, superficie) y se puede asignar al campo de un cliente. Las parcelas ya
 * asignadas se ven en verde.
 */
export default function Mapa() {
  const data = useData();
  const toast = useToast();
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const basesRef = useRef<Record<Base, L.Layer[]>>({ satelite: [], calles: [] });
  const catastroRef = useRef<L.TileLayer.WMS | null>(null);
  const guardadasRef = useRef<L.FeatureGroup | null>(null);
  const prospectosRef = useRef<L.FeatureGroup | null>(null);
  const contornosRef = useRef<L.FeatureGroup | null>(null);
  const edicionRef = useRef<L.FeatureGroup | null>(null);
  const editandoRef = useRef(false);
  const kmlRef = useRef<HTMLInputElement>(null);
  const seleccionRef = useRef<L.FeatureGroup | null>(null);
  const ubicacionRef = useRef<L.CircleMarker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const encuadreInicial = useRef(false);

  const [parcelas, setParcelas] = useState<ParcelaMapa[]>([]);
  const [infos, setInfos] = useState<ParcelaInfo[]>([]);
  const [cargado, setCargado] = useState(false);
  const [seleccion, setSeleccion] = useState<ParcelaArba | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [zoom, setZoom] = useState(11);
  const [base, setBase] = useState<Base>('satelite');
  const [catastro, setCatastro] = useState(true);
  const [opacidad, setOpacidad] = useState(0.9);
  const [busqueda, setBusqueda] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [camposMapa, setCamposMapa] = useState<CampoMapa[]>([]);
  const [campoSel, setCampoSel] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [edicionHa, setEdicionHa] = useState(0);
  const [usarSup, setUsarSup] = useState(true);
  const [guardandoEd, setGuardandoEd] = useState(false);
  const [eligiendo, setEligiendo] = useState<{ fuente: Fuente; geom?: GeoPoligono; nombre?: string | null } | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);

  const cargarParcelas = useCallback(async () => {
    try {
      const [ps, is, cs] = await Promise.all([data.fetchParcelasMapa(), data.fetchParcelasInfo(), data.fetchCamposMapa()]);
      setParcelas(ps); setInfos(is); setCamposMapa(cs); setCargado(true);
    } catch (e) { toast.error(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const consultarPunto = useRef<(lat: number, lng: number) => void>(() => {});
  consultarPunto.current = (lat, lng) => {
    const map = mapRef.current;
    if (!map || editandoRef.current) return;
    setCampoSel(null);
    if (map.getZoom() < ZOOM_CATASTRO) { setAviso('Acercate más para tocar una parcela'); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setConsultando(true); setAviso(null);
    parcelaEnPunto(lng, lat, ctrl.signal)
      .then((p) => { if (p) setSeleccion(p); else { setSeleccion(null); setAviso('No hay parcela de ARBA en ese punto'); } })
      .catch((e) => { if ((e as Error).name !== 'AbortError') setAviso('No se pudo consultar ARBA. Probá de nuevo en un rato.'); })
      .finally(() => { if (abortRef.current === ctrl) setConsultando(false); });
  };

  // Crear el mapa una vez
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { center: INICIO, zoom: 11, zoomControl: true, attributionControl: true });
    basesRef.current = {
      satelite: [
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imágenes © Esri' }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
      ],
      calles: [L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' })],
    };
    basesRef.current.satelite.forEach((l) => l.addTo(map));
    catastroRef.current = L.tileLayer.wms(ARBA_WMS, {
      layers: ARBA_CAPA, format: 'image/png', transparent: true, minZoom: ZOOM_CATASTRO, maxZoom: 20, attribution: 'Catastro © ARBA',
    }).addTo(map);
    // ARBA pinta las parcelas con un relleno verde claro opaco: en modo "multiplicar" el relleno casi blanco
    // deja ver la imagen de fondo y las líneas y números (oscuros) siguen bien marcados.
    const cont = catastroRef.current.getContainer();
    if (cont) cont.style.mixBlendMode = 'multiply';
    prospectosRef.current = L.featureGroup().addTo(map);
    guardadasRef.current = L.featureGroup().addTo(map);
    contornosRef.current = L.featureGroup().addTo(map);
    seleccionRef.current = L.featureGroup().addTo(map);
    edicionRef.current = L.featureGroup().addTo(map);
    map.pm.setLang('es');
    const recalcular = () => setEdicionHa(Math.round(areaM2(unirGeoms(geomsEdicion(map)) ?? { type: 'MultiPolygon', coordinates: [] }) / 100) / 100);
    map.on('pm:create pm:remove pm:cut', recalcular);
    edicionRef.current.on('pm:edit pm:dragend pm:markerdragend', recalcular);
    map.on('click', (e: L.LeafletMouseEvent) => consultarPunto.current(e.latlng.lat, e.latlng.lng));
    map.on('zoomend', () => { setZoom(map.getZoom()); setAviso(null); });
    mapRef.current = map;
    void cargarParcelas();
    return () => { abortRef.current?.abort(); map.remove(); mapRef.current = null; };
  }, [cargarParcelas]);

  // Base satelital / calles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const otra: Base = base === 'satelite' ? 'calles' : 'satelite';
    basesRef.current[otra].forEach((l) => map.removeLayer(l));
    basesRef.current[base].forEach((l) => { if (!map.hasLayer(l)) l.addTo(map); });
    (basesRef.current[base][0] as L.TileLayer | undefined)?.bringToBack();
  }, [base]);

  // Capa del catastro
  useEffect(() => {
    const map = mapRef.current, capa = catastroRef.current;
    if (!map || !capa) return;
    if (catastro && !map.hasLayer(capa)) capa.addTo(map);
    if (!catastro && map.hasLayer(capa)) map.removeLayer(capa);
  }, [catastro]);
  useEffect(() => { catastroRef.current?.setOpacity(opacidad); }, [opacidad]);

  // Parcelas guardadas (verde)
  useEffect(() => {
    const capa = guardadasRef.current, map = mapRef.current;
    if (!capa || !map) return;
    capa.clearLayers();
    const conContorno = new Set(camposMapa.map((c) => c.id));
    for (const p of parcelas) {
      L.geoJSON(geo(p.geom), { style: conContorno.has(p.campo_id) ? ESTILO_PARCELA_REF : ESTILO_GUARDADA, pmIgnore: true })
        .bindTooltip(`${p.cliente_nombre} · ${p.campo_nombre}`, { sticky: true })
        .on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (editandoRef.current) return;
          setAviso(null); setCampoSel(null);
          setSeleccion({ partida: p.partida, nomenclatura: p.nomenclatura, tipo: p.tipo, superficie_m2: p.superficie_m2, geom: p.geom });
        })
        .addTo(capa);
    }
  }, [parcelas, camposMapa]);

  // Contornos reales de los campos (verde lleno)
  useEffect(() => {
    const capa = contornosRef.current;
    if (!capa) return;
    capa.clearLayers();
    for (const c of camposMapa) {
      if (edicion?.campoId === c.id) continue;
      L.geoJSON(geo(c.contorno), { style: ESTILO_CONTORNO, pmIgnore: true })
        .bindTooltip(`${c.cliente_nombre} · ${c.nombre}${c.contorno_ha ? ` · ${formatUSD(c.contorno_ha, 1)} ha` : ''}`, { sticky: true })
        .on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (editandoRef.current) return;
          setSeleccion(null); setAviso(null); setConfirmarBorrar(false); setCampoSel(c.id);
        })
        .addTo(capa);
    }
  }, [camposMapa, edicion]);

  const partidasClientes = useMemo(() => new Set(parcelas.map((p) => p.partida).filter(Boolean) as string[]), [parcelas]);
  const infoPorPartida = useMemo(() => new Map(infos.map((i) => [i.partida, i])), [infos]);
  const prospectos = useMemo(() => infos.filter((i) => !partidasClientes.has(i.partida)), [infos, partidasClientes]);

  // Prospectos: parcelas con ficha que no son de ningún cliente (naranja, punteado)
  useEffect(() => {
    const capa = prospectosRef.current;
    if (!capa) return;
    capa.clearLayers();
    for (const i of prospectos) {
      L.geoJSON(geo(i.geom), { style: ESTILO_PROSPECTO, pmIgnore: true })
        .bindTooltip(`Prospecto · ${i.trabaja || i.titular || formatoPartida(i.partida)}`, { sticky: true })
        .on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (editandoRef.current) return;
          setAviso(null); setCampoSel(null);
          setSeleccion({ partida: i.partida, nomenclatura: i.nomenclatura, tipo: i.tipo, superficie_m2: i.superficie_m2, geom: i.geom });
        })
        .addTo(capa);
    }
  }, [prospectos]);

  // Al abrir: encuadrar todo lo cargado
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cargado || encuadreInicial.current) return;
    encuadreInicial.current = true;
    const b = L.latLngBounds([]);
    [guardadasRef.current, prospectosRef.current, contornosRef.current].forEach((c) => { if (c && c.getLayers().length) b.extend(c.getBounds()); });
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
  }, [cargado]);

  // Parcela elegida (amarillo)
  useEffect(() => {
    const capa = seleccionRef.current;
    if (!capa) return;
    capa.clearLayers();
    if (seleccion) L.geoJSON(geo(seleccion.geom), { style: ESTILO_SELECCION, interactive: false, pmIgnore: true }).addTo(capa);
  }, [seleccion]);

  function encuadrar(gs: GeoPoligono[]) {
    const map = mapRef.current;
    if (!map || !gs.length) return;
    const rs = gs.map(recuadro);
    map.fitBounds([[Math.min(...rs.map((r) => r[1])), Math.min(...rs.map((r) => r[0]))], [Math.max(...rs.map((r) => r[3])), Math.max(...rs.map((r) => r[2]))]], { padding: [40, 40], maxZoom: 16 });
  }

  async function buscarPartida(e: React.FormEvent) {
    e.preventDefault();
    if (!busqueda.trim()) return;
    setConsultando(true); setAviso(null);
    try {
      const p = await parcelaPorPartida(busqueda);
      if (!p) { setAviso('No se encontró esa partida en ARBA (formato: partido + partida, ej. 103-063845)'); return; }
      setSeleccion(p);
      encuadrar([p.geom]);
    } catch {
      setAviso('No se pudo consultar ARBA. Probá de nuevo en un rato.');
    } finally { setConsultando(false); }
  }

  function miUbicacion() {
    if (!navigator.geolocation) { toast.aviso('El navegador no da la ubicación'); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const map = mapRef.current;
        if (!map) return;
        const ll: L.LatLngTuple = [coords.latitude, coords.longitude];
        ubicacionRef.current?.remove();
        ubicacionRef.current = L.circleMarker(ll, { pmIgnore: true, radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map);
        map.setView(ll, Math.max(map.getZoom(), 15));
      },
      () => toast.aviso('No se pudo obtener tu ubicación (revisá el permiso del navegador)'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Campos con parcelas, agrupados por cliente, para "Ir a"
  const camposConParcelas = useMemo(() => {
    const m = new Map<string, { campo_id: string; campo: string; cliente: string; geoms: GeoPoligono[]; m2: number }>();
    for (const p of parcelas) {
      const c = m.get(p.campo_id) ?? { campo_id: p.campo_id, campo: p.campo_nombre, cliente: p.cliente_nombre, geoms: [], m2: 0 };
      c.geoms.push(p.geom); c.m2 += Number(p.superficie_m2) || 0;
      m.set(p.campo_id, c);
    }
    return [...m.values()].sort((a, b) => a.cliente.localeCompare(b.cliente) || a.campo.localeCompare(b.campo));
  }, [parcelas]);

  const asignaciones = useMemo(() => (seleccion?.partida ? parcelas.filter((p) => p.partida === seleccion.partida) : []), [seleccion, parcelas]);

  async function quitar(p: ParcelaMapa) {
    try {
      await data.eliminarParcela(p.id);
      const restantes = parcelas.filter((x) => x.campo_id === p.campo_id && x.id !== p.id);
      const ctr = centro(restantes.map((x) => x.geom));
      await data.actualizarCampo(p.campo_id, { lat: ctr?.lat ?? null, lng: ctr?.lng ?? null });
      toast.exito('Parcela quitada del campo');
      await cargarParcelas();
    } catch (e) { toast.error(e); }
  }

  // ---- Contorno del campo: dibujar / editar / importar KML ----
  function iniciarEdicion(c: CampoElegido, fuente: Fuente, geoms: GeoPoligono[]) {
    const map = mapRef.current, grupo = edicionRef.current;
    if (!map || !grupo) return;
    setSeleccion(null); setCampoSel(null); setAviso(null); setConfirmarBorrar(false);
    editandoRef.current = true;
    grupo.clearLayers();
    for (const g of geoms) for (const anillos of aLatLngs(g)) L.polygon(anillos, { ...ESTILO_EDICION }).addTo(grupo);
    map.pm.setGlobalOptions({ layerGroup: grupo, pathOptions: ESTILO_EDICION, allowSelfIntersection: false, snappable: true, snapDistance: 15 });
    map.pm.addControls({
      position: 'topleft', drawMarker: false, drawCircleMarker: false, drawPolyline: false, drawCircle: false, drawText: false, rotateMode: false,
      drawPolygon: true, drawRectangle: true, editMode: true, dragMode: true, cutPolygon: true, removalMode: true,
    });
    setEdicion({ ...c, fuente });
    setUsarSup(true);
    if (grupo.getLayers().length) {
      map.fitBounds(grupo.getBounds(), { paddingTopLeft: [60, 40], paddingBottomRight: [40, 210], maxZoom: 17 }); // deja lugar a la barra de abajo
      map.pm.enableGlobalEditMode();
    } else {
      map.pm.enableDraw('Polygon');
    }
    setEdicionHa(Math.round(areaM2(unirGeoms(geomsEdicion(map)) ?? { type: 'MultiPolygon', coordinates: [] }) / 100) / 100);
  }

  function cerrarEdicion() {
    const map = mapRef.current;
    if (map) {
      map.pm.disableDraw(); map.pm.disableGlobalEditMode(); map.pm.disableGlobalDragMode();
      map.pm.disableGlobalRemovalMode(); map.pm.disableGlobalCutMode(); map.pm.removeControls();
      map.pm.getGeomanLayers().forEach((l) => l.remove());
    }
    edicionRef.current?.clearLayers();
    editandoRef.current = false;
    setEdicion(null);
  }

  async function guardarEdicion() {
    const map = mapRef.current;
    if (!map || !edicion) return;
    map.pm.disableGlobalEditMode();
    const g = unirGeoms(geomsEdicion(map));
    if (!g) { toast.aviso('Dibujá al menos un polígono'); return; }
    const sup = Math.round(areaM2(g) / 100) / 100;
    const ctr = centro([g]);
    setGuardandoEd(true);
    try {
      await data.actualizarCampo(edicion.campoId, {
        contorno: g, contorno_fuente: edicion.fuente, contorno_ha: sup, lat: ctr?.lat ?? null, lng: ctr?.lng ?? null,
        ...(usarSup ? { superficie_ha: sup } : {}),
      });
      toast.exito(`Contorno de ${edicion.campo} guardado · ${formatUSD(sup, 2)} ha`);
      const id = edicion.campoId;
      cerrarEdicion();
      await cargarParcelas();
      setCampoSel(id);
    } catch (e) { toast.error(e); } finally { setGuardandoEd(false); }
  }

  /** Arranca la edición de un campo: su contorno si tiene, si no sus parcelas de ARBA como punto de partida. */
  function editarCampo(c: CampoElegido, fuente: Fuente = 'dibujo', geoms?: GeoPoligono[]) {
    const existente = camposMapa.find((x) => x.id === c.campoId)?.contorno;
    const base = geoms ?? (existente ? [existente] : parcelas.filter((p) => p.campo_id === c.campoId).map((p) => p.geom));
    iniciarEdicion(c, geoms ? fuente : existente ? (camposMapa.find((x) => x.id === c.campoId)?.contorno_fuente ?? 'dibujo') : base.length ? 'ARBA' : 'dibujo', base);
  }

  async function elegirKml(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const polys = await leerArchivoKml(f);
      const g = unirGeoms(polys.map((p) => p.geom));
      if (!g) { toast.aviso('El archivo no tiene polígonos (contornos) para importar'); return; }
      setEligiendo({ fuente: 'KML', geom: g, nombre: polys.length === 1 ? polys[0].nombre : f.name.replace(/\.(kml|kmz)$/i, '') });
    } catch { toast.aviso('No se pudo leer el archivo. Tiene que ser .kml o .kmz'); }
  }

  function exportarKml(c: CampoMapa) {
    const blob = new Blob([generarKml(`${c.cliente_nombre} - ${c.nombre}`, c.contorno)], { type: 'application/vnd.google-earth.kml+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${c.cliente_nombre} - ${c.nombre}.kml`.replace(/[\\/:*?"<>|]/g, '_');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function borrarContorno(c: CampoMapa) {
    try {
      const ctr = centro(parcelas.filter((p) => p.campo_id === c.id).map((p) => p.geom));
      await data.actualizarCampo(c.id, { contorno: null, contorno_fuente: null, contorno_ha: null, lat: ctr?.lat ?? null, lng: ctr?.lng ?? null });
      toast.exito('Contorno borrado');
      setCampoSel(null); setConfirmarBorrar(false);
      await cargarParcelas();
    } catch (e) { toast.error(e); }
  }

  const campoPanel = useMemo(() => {
    const c = camposMapa.find((x) => x.id === campoSel);
    if (!c) return null;
    const ps = parcelas.filter((p) => p.campo_id === c.id);
    const catastroHa = ps.reduce((t, p) => t + haDe(p.superficie_m2), 0);
    const difPct = c.contorno_ha && catastroHa > 0 ? ((c.contorno_ha - catastroHa) / catastroHa) * 100 : null;
    return { c, ps, catastroHa, difPct };
  }, [campoSel, camposMapa, parcelas]);

  const catastroEdicionHa = useMemo(() => (edicion ? parcelas.filter((p) => p.campo_id === edicion.campoId).reduce((t, p) => t + haDe(p.superficie_m2), 0) : 0), [edicion, parcelas]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-600" /> Mapa de campos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={buscarPartida} className="flex items-center">
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Partida ARBA" title="Partido y partida, ej. 103-063845" aria-label="Buscar partida"
              className="w-44 px-3 py-1.5 border border-gray-300 rounded-l-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            <button type="submit" aria-label="Buscar" className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-r-lg hover:bg-emerald-700"><Search className="w-4 h-4" /></button>
          </form>
          {(camposConParcelas.length > 0 || prospectos.length > 0) && (
            <select value="" onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('p:')) {
                  const i = infoPorPartida.get(v.slice(2));
                  if (i) { encuadrar([i.geom]); setSeleccion({ partida: i.partida, nomenclatura: i.nomenclatura, tipo: i.tipo, superficie_m2: i.superficie_m2, geom: i.geom }); }
                  return;
                }
                const c = camposConParcelas.find((x) => x.campo_id === v); if (c) encuadrar(c.geoms);
              }}
              aria-label="Ir a un campo" className="max-w-[14rem] px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">Ir a un campo…</option>
              <optgroup label="Clientes">
                {camposConParcelas.map((c) => <option key={c.campo_id} value={c.campo_id}>{c.cliente} · {c.campo} ({formatUSD(haDe(c.m2), 0)} ha)</option>)}
              </optgroup>
              {prospectos.length > 0 && (
                <optgroup label="Prospectos">
                  {prospectos.map((i) => <option key={i.partida} value={`p:${i.partida}`}>{i.trabaja || i.titular || 'Sin nombre'} · {formatoPartida(i.partida)}</option>)}
                </optgroup>
              )}
            </select>
          )}
          <button onClick={miUbicacion} className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"><Crosshair className="w-4 h-4" /> Mi ubicación</button>
          <button onClick={() => setEligiendo({ fuente: 'dibujo' })} disabled={!!edicion} className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 disabled:opacity-50"><PenLine className="w-4 h-4" /> Dibujar campo</button>
          <button onClick={() => kmlRef.current?.click()} disabled={!!edicion} className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50 disabled:opacity-50"><FileUp className="w-4 h-4" /> Importar KML</button>
          <input ref={kmlRef} type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" onChange={(e) => void elegirKml(e)} className="hidden" />
        </div>
      </div>

      <div className="relative isolate h-[calc(100dvh-11rem)] min-h-[420px] rounded-xl overflow-hidden border border-gray-200 shadow-sm">
        <div ref={divRef} className="absolute inset-0 bg-gray-100" />

        {/* Capas */}
        <div className="absolute top-2 right-2 z-[1000] bg-white/95 rounded-lg shadow p-2 text-xs space-y-1">
          <p className="flex items-center gap-1 font-medium text-gray-600"><Layers className="w-3.5 h-3.5" /> Capas</p>
          <div className="flex rounded-md overflow-hidden border border-gray-200">
            {(['satelite', 'calles'] as Base[]).map((b) => (
              <button key={b} onClick={() => setBase(b)} className={`px-2 py-0.5 ${base === b ? 'bg-emerald-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{b === 'satelite' ? 'Satélite' : 'Calles'}</button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-gray-700"><input type="checkbox" checked={catastro} onChange={(e) => setCatastro(e.target.checked)} className="accent-emerald-600" /> Catastro ARBA</label>
          {catastro && (
            <input type="range" min={0.2} max={1} step={0.1} value={opacidad} onChange={(e) => setOpacidad(Number(e.target.value))}
              aria-label="Intensidad del catastro" title="Intensidad de las líneas del catastro" className="w-full accent-emerald-600" />
          )}
          <p className="flex items-center gap-1.5 text-gray-500"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/40 border-[3px] border-emerald-600" /> Campos (contorno)</p>
          <p className="flex items-center gap-1.5 text-gray-500"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/20 border-2 border-emerald-500" /> Parcelas de clientes</p>
          <p className="flex items-center gap-1.5 text-gray-500"><span className="inline-block w-3 h-3 rounded-sm bg-orange-500/30 border-2 border-dashed border-orange-500" /> Prospectos</p>
        </div>

        {/* Estado */}
        {(consultando || aviso || (catastro && zoom < ZOOM_CATASTRO)) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 rounded-full shadow px-3 py-1 text-xs text-gray-700 flex items-center gap-1.5 max-w-[90%]">
            {consultando ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" /> Consultando ARBA…</>
              : aviso ?? 'Acercate para ver la división catastral y tocar una parcela'}
          </div>
        )}

        {/* Edición del contorno */}
        {edicion && (
          <div className="absolute bottom-2 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[34rem] z-[1000] bg-white rounded-xl shadow-lg border border-blue-200 p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-semibold text-gray-900">Contorno · {edicion.cliente} · {edicion.campo}</p>
              <p className="text-xs text-gray-500">{edicion.fuente === 'KML' ? 'Importado de KML' : edicion.fuente === 'ARBA' ? 'Partiendo del catastro' : 'Dibujo'}</p>
            </div>
            <p className="text-xs text-gray-600">
              Con las herramientas de la izquierda: dibujá polígonos o rectángulos, mové los vértices hasta el alambrado, recortá lo que sobre (bajos, monte, casco) o borrá partes.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="text-gray-500">Superficie dibujada </span><strong className="tabular-nums text-blue-700 text-sm">{formatUSD(edicionHa, 2)} ha</strong>
                {catastroEdicionHa > 0 && <span className="text-gray-500"> · catastro {formatUSD(catastroEdicionHa, 2)} ha</span>}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-700"><input type="checkbox" checked={usarSup} onChange={(e) => setUsarSup(e.target.checked)} className="accent-emerald-600" /> Usar como superficie del campo</label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={cerrarEdicion} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={() => void guardarEdicion()} disabled={guardandoEd} className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                {guardandoEd && <Loader2 className="w-4 h-4 animate-spin" />} Guardar contorno
              </button>
            </div>
          </div>
        )}

        {/* Campo elegido (contorno) */}
        {campoPanel && !edicion && (
          <div className="absolute bottom-2 left-2 right-2 sm:right-auto sm:w-80 max-h-[80%] overflow-y-auto z-[1000] bg-white rounded-xl shadow-lg border border-gray-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-gray-500">{campoPanel.c.cliente_nombre}</p>
                <p className="font-semibold text-gray-900">{campoPanel.c.nombre}</p>
              </div>
              <button onClick={() => setCampoSel(null)} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
              <dt className="text-gray-500">Contorno</dt>
              <dd className="text-gray-900 font-medium tabular-nums">{formatUSD(campoPanel.c.contorno_ha ?? 0, 2)} ha <span className="font-normal text-gray-400">({campoPanel.c.contorno_fuente === 'KML' ? 'KML' : campoPanel.c.contorno_fuente === 'ARBA' ? 'catastro' : 'dibujo'})</span></dd>
              <dt className="text-gray-500">Catastro</dt>
              <dd className="text-gray-900 tabular-nums">{campoPanel.ps.length ? `${formatUSD(campoPanel.catastroHa, 2)} ha · ${campoPanel.ps.length} partida${campoPanel.ps.length === 1 ? '' : 's'}` : 'sin partidas'}</dd>
              <dt className="text-gray-500">Superficie cargada</dt>
              <dd className="text-gray-900 tabular-nums">{campoPanel.c.superficie_ha ? `${formatUSD(campoPanel.c.superficie_ha, 2)} ha` : '—'}</dd>
            </dl>
            {campoPanel.difPct !== null && Math.abs(campoPanel.difPct) > DIF_AVISO_PCT && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 rounded-lg px-2 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                El contorno tiene {formatUSD(Math.abs(campoPanel.difPct), 0)}% {campoPanel.difPct > 0 ? 'más' : 'menos'} que el catastro. Revisá si trabaja sólo parte de la parcela o si falta agregar alguna partida.
              </p>
            )}
            {campoPanel.ps.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {campoPanel.ps.map((p) => (
                  <button key={p.id} onClick={() => { setCampoSel(null); setSeleccion({ partida: p.partida, nomenclatura: p.nomenclatura, tipo: p.tipo, superficie_m2: p.superficie_m2, geom: p.geom }); }}
                    className="px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-[11px] text-gray-700 tabular-nums">{formatoPartida(p.partida)}</button>
                ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => editarCampo({ campoId: campoPanel.c.id, campo: campoPanel.c.nombre, cliente: campoPanel.c.cliente_nombre })}
                className="flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium"><PenLine className="w-3.5 h-3.5" /> Editar contorno</button>
              <button onClick={() => exportarKml(campoPanel.c)} className="flex items-center justify-center gap-1 px-2 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-xs"><Download className="w-3.5 h-3.5" /> Bajar KML</button>
            </div>
            <button onClick={() => (confirmarBorrar ? void borrarContorno(campoPanel.c) : setConfirmarBorrar(true))}
              className={`mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-xs ${confirmarBorrar ? 'bg-red-600 text-white hover:bg-red-700' : 'text-gray-500 hover:text-red-600 hover:bg-red-50'}`}>
              <Trash2 className="w-3.5 h-3.5" /> {confirmarBorrar ? 'Confirmar: borrar el contorno' : 'Borrar contorno'}
            </button>
          </div>
        )}

        {/* Parcela elegida */}
        {seleccion && (
          <div className="absolute bottom-2 left-2 right-2 sm:right-auto sm:w-80 max-h-[80%] overflow-y-auto z-[1000] bg-white rounded-xl shadow-lg border border-gray-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-gray-500">Partida</p>
                <p className="font-semibold text-gray-900 tabular-nums">{formatoPartida(seleccion.partida)}</p>
              </div>
              <button onClick={() => setSeleccion(null)} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
              <dt className="text-gray-500">Superficie</dt><dd className="text-gray-900 font-medium tabular-nums">{ha(seleccion.superficie_m2)}</dd>
              <dt className="text-gray-500">Tipo</dt><dd className="text-gray-900">{seleccion.tipo ?? '—'}</dd>
              <dt className="text-gray-500">Nomenclatura</dt><dd className="text-gray-900 break-all">{seleccion.nomenclatura ?? '—'}</dd>
            </dl>
            {seleccion.partida && (
              <FichaParcela key={seleccion.partida} parcela={seleccion} info={infoPorPartida.get(seleccion.partida) ?? null} esCliente={asignaciones.length > 0}
                onGuardado={(i) => setInfos((xs) => [...xs.filter((x) => x.partida !== seleccion.partida), ...(i ? [i] : [])])} />
            )}
            {asignaciones.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                {asignaciones.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-emerald-800 flex-1"><strong>{a.cliente_nombre}</strong> · {a.campo_nombre}</span>
                    <button onClick={() => editarCampo({ campoId: a.campo_id, campo: a.campo_nombre, cliente: a.cliente_nombre })} title="Dibujar o ajustar el contorno real del campo"
                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-emerald-700 hover:bg-emerald-50"><PenLine className="w-3.5 h-3.5" /> Contorno</button>
                    <button onClick={() => void quitar(a)} aria-label={`Quitar de ${a.campo_nombre}`} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setAgregando(true)} className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
              <Plus className="w-4 h-4" /> Agregar a un campo
            </button>
          </div>
        )}
      </div>

      {eligiendo && (
        <ElegirCampo titulo={eligiendo.fuente === 'KML' ? 'Importar contorno a un campo' : 'Dibujar el contorno de un campo'} nombreSugerido={eligiendo.nombre ?? ''}
          onCerrar={() => setEligiendo(null)}
          onElegido={(c) => { const e = eligiendo; setEligiendo(null); editarCampo(c, e.fuente, e.geom ? [e.geom] : undefined); }} />
      )}

      {agregando && seleccion && (
        <AgregarACampo parcela={seleccion} yaEn={asignaciones.map((a) => a.campo_id)} onCerrar={() => setAgregando(false)}
          onGuardado={async () => { setAgregando(false); await cargarParcelas(); }} />
      )}
    </div>
  );
}

const NUEVO = '__nuevo';

function AgregarACampo({ parcela, yaEn, onCerrar, onGuardado }: { parcela: ParcelaArba; yaEn: string[]; onCerrar: () => void; onGuardado: () => void | Promise<void> }) {
  const data = useData();
  const toast = useToast();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtro, setFiltro] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [campos, setCampos] = useState<Campo[] | null>(null);
  const [campoId, setCampoId] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [actualizarSup, setActualizarSup] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { data.fetchClientes().then(setClientes).catch((e) => toast.error(e)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setCampos(null); setCampoId('');
    if (!clienteId) return;
    let vivo = true;
    data.fetchCampos(clienteId).then((cs) => { if (!vivo) return; setCampos(cs); setCampoId(cs.find((c) => !yaEn.includes(c.id))?.id ?? NUEVO); })
      .catch((e) => toast.error(e));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return f ? clientes.filter((c) => c.nombre.toLowerCase().includes(f) || (c.razon_social ?? '').toLowerCase().includes(f)) : clientes;
  }, [clientes, filtro]);

  const esNuevo = campoId === NUEVO;
  const puede = !!clienteId && !!campoId && (!esNuevo || nombreNuevo.trim().length > 0) && !yaEn.includes(campoId) && !guardando;

  async function guardar() {
    if (!puede) return;
    setGuardando(true);
    try {
      let id = campoId;
      if (esNuevo) {
        const c = await data.guardarCampo({ cliente_id: clienteId, nombre: nombreNuevo.trim(), superficie_ha: null, localidad: null, km_puerto: null, planta: null, km_planta: null });
        id = c.id;
      }
      const [minLng, minLat, maxLng, maxLat] = recuadro(parcela.geom);
      await data.guardarParcela({
        campo_id: id, fuente: 'ARBA', partida: parcela.partida, nomenclatura: parcela.nomenclatura, tipo: parcela.tipo,
        superficie_m2: parcela.superficie_m2, geom: parcela.geom, min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat,
      });
      // Ubicación (y superficie) del campo a partir de todas sus parcelas
      const delCampo = (await data.fetchParcelasMapa()).filter((p) => p.campo_id === id);
      const ctr = centro(delCampo.map((p) => p.geom));
      const totalHa = Math.round(delCampo.reduce((t, p) => t + haDe(p.superficie_m2), 0) * 100) / 100;
      await data.actualizarCampo(id, { lat: ctr?.lat ?? null, lng: ctr?.lng ?? null, ...(actualizarSup ? { superficie_ha: totalHa } : {}) });
      toast.exito(`Parcela agregada${actualizarSup ? ` · el campo quedó con ${formatUSD(totalHa, 2)} ha` : ''}`);
      await onGuardado();
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  const campoElegido = campos?.find((c) => c.id === campoId);

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Agregar parcela a un campo</h2>
            <p className="text-xs text-gray-500">Partida {formatoPartida(parcela.partida)} · {ha(parcela.superficie_m2)}</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Cliente</label>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar cliente…" aria-label="Buscar cliente"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} aria-label="Cliente" size={Math.min(6, Math.max(2, visibles.length + 1))}
            className="w-full px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="" disabled>{clientes.length ? `${visibles.length} cliente${visibles.length === 1 ? '' : 's'}` : 'Cargando…'}</option>
            {visibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        {clienteId && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Campo</label>
            {campos === null ? <p className="text-sm text-gray-400 flex items-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Cargando campos…</p> : (
              <select value={campoId} onChange={(e) => setCampoId(e.target.value)} aria-label="Campo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                {campos.map((c) => <option key={c.id} value={c.id} disabled={yaEn.includes(c.id)}>{c.nombre}{c.superficie_ha ? ` (${formatUSD(c.superficie_ha, 0)} ha)` : ''}{yaEn.includes(c.id) ? ' · ya tiene esta parcela' : ''}</option>)}
                <option value={NUEVO}>+ Campo nuevo</option>
              </select>
            )}
            {esNuevo && (
              <input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Nombre del campo (ej. La Esperanza)" aria-label="Nombre del campo nuevo" autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            )}
            <label className="flex items-start gap-2 text-xs text-gray-700 pt-1">
              <input type="checkbox" checked={actualizarSup} onChange={(e) => setActualizarSup(e.target.checked)} className="mt-0.5 accent-emerald-600" />
              <span>Poner como superficie del campo la suma de sus parcelas{campoElegido?.superficie_ha ? ` (hoy tiene ${formatUSD(campoElegido.superficie_ha, 0)} ha cargadas)` : ''}</span>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCerrar} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => void guardar()} disabled={!puede}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Titular / quién la trabaja / notas de una parcela. Sin ser de un cliente, queda como prospecto. */
function FichaParcela({ parcela, info, esCliente, onGuardado }: { parcela: ParcelaArba; info: ParcelaInfo | null; esCliente: boolean; onGuardado: (i: ParcelaInfo | null) => void }) {
  const data = useData();
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [titular, setTitular] = useState(info?.titular ?? '');
  const [trabaja, setTrabaja] = useState(info?.trabaja ?? '');
  const [notas, setNotas] = useState(info?.notas ?? '');
  const [guardando, setGuardando] = useState(false);

  function abrir() { setTitular(info?.titular ?? ''); setTrabaja(info?.trabaja ?? ''); setNotas(info?.notas ?? ''); setEditando(true); }

  async function guardar() {
    if (!parcela.partida) return;
    setGuardando(true);
    try {
      const [minLng, minLat, maxLng, maxLat] = recuadro(parcela.geom);
      const t = (v: string) => v.trim() || null;
      const r = await data.guardarParcelaInfo({
        partida: parcela.partida, titular: t(titular), trabaja: t(trabaja), notas: t(notas),
        nomenclatura: parcela.nomenclatura, tipo: parcela.tipo, superficie_m2: parcela.superficie_m2, geom: parcela.geom,
        min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat,
      });
      onGuardado(r);
      setEditando(false);
      toast.exito(r ? (esCliente ? 'Datos de la parcela guardados' : 'Guardada como prospecto') : 'Datos de la parcela borrados');
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  const campo = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500';

  if (editando) return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
      <input value={titular} onChange={(e) => setTitular(e.target.value)} maxLength={120} placeholder="Titular (dueño)" aria-label="Titular" className={campo} autoFocus />
      <input value={trabaja} onChange={(e) => setTrabaja(e.target.value)} maxLength={120} placeholder="Quién la trabaja" aria-label="Quién la trabaja" className={campo} />
      <textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} rows={2} placeholder="Notas (cultivo, contrato, contacto…)" aria-label="Notas" className={campo} />
      {!esCliente && <p className="text-[11px] text-orange-700">No está en ningún campo de cliente: queda marcada como prospecto.</p>}
      <div className="flex justify-end gap-2">
        <button onClick={() => setEditando(false)} className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
        <button onClick={() => void guardar()} disabled={guardando} className="px-3 py-1 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">
          {guardando && <Loader2 className="w-3 h-3 animate-spin" />} Guardar
        </button>
      </div>
    </div>
  );

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 text-xs">
      <div className="flex items-start justify-between gap-2">
        {info ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 flex-1">
            <dt className="text-gray-500">Titular</dt><dd className="text-gray-900">{info.titular ?? '—'}</dd>
            <dt className="text-gray-500">La trabaja</dt><dd className="text-gray-900">{info.trabaja ?? '—'}</dd>
            {info.notas && <><dt className="text-gray-500">Notas</dt><dd className="text-gray-700 whitespace-pre-line">{info.notas}</dd></>}
          </dl>
        ) : <p className="text-gray-400 flex-1">Sin titular ni quién la trabaja</p>}
        <button onClick={abrir} aria-label="Editar titular y quién la trabaja" className="p-1 text-gray-400 hover:text-emerald-700"><Pencil className="w-3.5 h-3.5" /></button>
      </div>
      {info && !esCliente && <p className="mt-1 inline-block px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 text-[11px]">Prospecto</p>}
      {info?.usuario_nombre && <p className="mt-1 text-[10px] text-gray-400">Cargó {info.usuario_nombre} · {info.updated_at.slice(8, 10)}/{info.updated_at.slice(5, 7)}/{info.updated_at.slice(0, 4)}</p>}
    </div>
  );
}

/** Elegir (o crear) el campo de un cliente. */
function ElegirCampo({ titulo, nombreSugerido, onCerrar, onElegido }: { titulo: string; nombreSugerido: string; onCerrar: () => void; onElegido: (c: CampoElegido) => void }) {
  const data = useData();
  const toast = useToast();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtro, setFiltro] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [campos, setCampos] = useState<Campo[] | null>(null);
  const [campoId, setCampoId] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState(nombreSugerido);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { data.fetchClientes().then(setClientes).catch((e) => toast.error(e)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setCampos(null); setCampoId('');
    if (!clienteId) return;
    let vivo = true;
    data.fetchCampos(clienteId).then((cs) => {
      if (!vivo) return;
      setCampos(cs);
      const igual = cs.find((c) => nombreSugerido && c.nombre.toLowerCase() === nombreSugerido.toLowerCase());
      setCampoId(igual?.id ?? cs[0]?.id ?? NUEVO);
    }).catch((e) => toast.error(e));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return f ? clientes.filter((c) => c.nombre.toLowerCase().includes(f) || (c.razon_social ?? '').toLowerCase().includes(f)) : clientes;
  }, [clientes, filtro]);
  const cliente = clientes.find((c) => c.id === clienteId);
  const esNuevo = campoId === NUEVO;
  const puede = !!cliente && !!campoId && (!esNuevo || nombreNuevo.trim().length > 0) && !guardando;

  async function seguir() {
    if (!puede || !cliente) return;
    if (!esNuevo) {
      const c = campos?.find((x) => x.id === campoId);
      if (c) onElegido({ campoId: c.id, campo: c.nombre, cliente: cliente.nombre });
      return;
    }
    setGuardando(true);
    try {
      const c = await data.guardarCampo({ cliente_id: cliente.id, nombre: nombreNuevo.trim(), superficie_ha: null, localidad: null, km_puerto: null, planta: null, km_planta: null });
      onElegido({ campoId: c.id, campo: c.nombre, cliente: cliente.nombre });
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  return (
    <div className="fixed inset-0 z-[1100] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-semibold text-gray-900">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Cliente</label>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar cliente…" aria-label="Buscar cliente"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} aria-label="Cliente" size={Math.min(6, Math.max(2, visibles.length + 1))}
            className="w-full px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="" disabled>{clientes.length ? `${visibles.length} cliente${visibles.length === 1 ? '' : 's'}` : 'Cargando…'}</option>
            {visibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        {clienteId && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Campo</label>
            {campos === null ? <p className="text-sm text-gray-400 flex items-center gap-1"><Loader2 className="w-4 h-4 animate-spin" /> Cargando campos…</p> : (
              <select value={campoId} onChange={(e) => setCampoId(e.target.value)} aria-label="Campo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                {campos.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.contorno ? ' · ya tiene contorno (se reemplaza)' : ''}</option>)}
                <option value={NUEVO}>+ Campo nuevo</option>
              </select>
            )}
            {esNuevo && (
              <input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Nombre del campo (ej. La Esperanza)" aria-label="Nombre del campo nuevo" autoFocus
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCerrar} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={() => void seguir()} disabled={!puede}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Seguir al mapa
          </button>
        </div>
      </div>
    </div>
  );
}
