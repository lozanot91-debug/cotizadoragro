import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoJsonObject } from 'geojson';
import { Crosshair, Layers, Loader2, MapPin, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { formatUSD } from '@/lib/format';
import {
  ARBA_CAPA, ARBA_WMS, ZOOM_CATASTRO, centro, formatoPartida, haDe, parcelaEnPunto, parcelaPorPartida, recuadro,
  type ParcelaArba,
} from '@/lib/arba';
import type { Campo, Cliente, GeoPoligono, ParcelaInfo, ParcelaMapa } from '@/types';

const INICIO: L.LatLngTuple = [-37.32, -59.13]; // Tandil
const ESTILO_GUARDADA: L.PathOptions = { color: '#10b981', weight: 2, fillColor: '#10b981', fillOpacity: 0.25 };
const ESTILO_PROSPECTO: L.PathOptions = { color: '#f97316', weight: 2, fillColor: '#f97316', fillOpacity: 0.2, dashArray: '5 4' };
const ESTILO_SELECCION: L.PathOptions = { color: '#facc15', weight: 3, fillColor: '#facc15', fillOpacity: 0.2 };
const geo = (g: GeoPoligono) => g as unknown as GeoJsonObject;
const ha = (m2: number | null) => `${formatUSD(haDe(m2), 2)} ha`;

type Base = 'satelite' | 'calles';

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

  const cargarParcelas = useCallback(async () => {
    try {
      const [ps, is] = await Promise.all([data.fetchParcelasMapa(), data.fetchParcelasInfo()]);
      setParcelas(ps); setInfos(is); setCargado(true);
    } catch (e) { toast.error(e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const consultarPunto = useRef<(lat: number, lng: number) => void>(() => {});
  consultarPunto.current = (lat, lng) => {
    const map = mapRef.current;
    if (!map) return;
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
    seleccionRef.current = L.featureGroup().addTo(map);
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
    for (const p of parcelas) {
      L.geoJSON(geo(p.geom), { style: ESTILO_GUARDADA })
        .bindTooltip(`${p.cliente_nombre} · ${p.campo_nombre}`, { sticky: true })
        .on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          setAviso(null);
          setSeleccion({ partida: p.partida, nomenclatura: p.nomenclatura, tipo: p.tipo, superficie_m2: p.superficie_m2, geom: p.geom });
        })
        .addTo(capa);
    }
  }, [parcelas]);

  const partidasClientes = useMemo(() => new Set(parcelas.map((p) => p.partida).filter(Boolean) as string[]), [parcelas]);
  const infoPorPartida = useMemo(() => new Map(infos.map((i) => [i.partida, i])), [infos]);
  const prospectos = useMemo(() => infos.filter((i) => !partidasClientes.has(i.partida)), [infos, partidasClientes]);

  // Prospectos: parcelas con ficha que no son de ningún cliente (naranja, punteado)
  useEffect(() => {
    const capa = prospectosRef.current;
    if (!capa) return;
    capa.clearLayers();
    for (const i of prospectos) {
      L.geoJSON(geo(i.geom), { style: ESTILO_PROSPECTO })
        .bindTooltip(`Prospecto · ${i.trabaja || i.titular || formatoPartida(i.partida)}`, { sticky: true })
        .on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          setAviso(null);
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
    [guardadasRef.current, prospectosRef.current].forEach((c) => { if (c && c.getLayers().length) b.extend(c.getBounds()); });
    if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
  }, [cargado]);

  // Parcela elegida (amarillo)
  useEffect(() => {
    const capa = seleccionRef.current;
    if (!capa) return;
    capa.clearLayers();
    if (seleccion) L.geoJSON(geo(seleccion.geom), { style: ESTILO_SELECCION, interactive: false }).addTo(capa);
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
        ubicacionRef.current = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map);
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
          <p className="flex items-center gap-1.5 text-gray-500"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/40 border-2 border-emerald-500" /> Campos de clientes</p>
          <p className="flex items-center gap-1.5 text-gray-500"><span className="inline-block w-3 h-3 rounded-sm bg-orange-500/30 border-2 border-dashed border-orange-500" /> Prospectos</p>
        </div>

        {/* Estado */}
        {(consultando || aviso || (catastro && zoom < ZOOM_CATASTRO)) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 rounded-full shadow px-3 py-1 text-xs text-gray-700 flex items-center gap-1.5 max-w-[90%]">
            {consultando ? <><Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" /> Consultando ARBA…</>
              : aviso ?? 'Acercate para ver la división catastral y tocar una parcela'}
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
                    <span className="text-emerald-800"><strong>{a.cliente_nombre}</strong> · {a.campo_nombre}</span>
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
