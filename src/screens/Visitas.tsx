import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { registrarCambio } from '@/lib/historial';
import { supabase } from '@/lib/supabase';
import type { Visita, VisitaFoto, Cliente, Cotizacion } from '@/types';
import { MapPin, Plus, X, Calendar, Clock, Check, Trash2, Edit2, AlertCircle, ChevronLeft, ChevronRight, Camera, MapPinned, Loader2, Image as ImageIcon } from 'lucide-react';
import { armarFecha, diaDeLaSemana, diasDelMes, hoyAR, partesFecha, sumarDias } from '@/lib/fechas';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';

const TIPOS = ['Visita técnica', 'Comercial', 'Entrega', 'Postventa'];
const CULTIVOS = ['Soja', 'Maíz', 'Trigo', 'Cebada', 'Girasol', 'Otro', 'Ninguno'];
const ESTADOS_VISITA = ['Programada', 'Realizada', 'Cancelada'];

function addDays(days: number): string {
  return sumarDias(hoyAR(), days);
}

async function comprimirImagen(file: File, maxDim: number = 1600, calidad: number = 0.8): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', calidad);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export default function Visitas() {
  const data = useData();
  const { usuario } = useAuth();
  const [visitas, setVisitas] = useState<(Visita & { cliente?: { nombre: string } | null })[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<'agenda' | 'calendario' | 'pasadas'>('agenda');
  const [filtroResponsable, setFiltroResponsable] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  const [modalNueva, setModalNueva] = useState(false);
  const [modalDetalle, setModalDetalle] = useState<Visita | null>(null);
  const [modalRealizar, setModalRealizar] = useState<Visita | null>(null);
  const [modalEliminar, setModalEliminar] = useState<Visita | null>(null);

  const [form, setForm] = useState({
    fecha: addDays(1), hora: '', tipo: 'Comercial', cliente_id: '', cotizacion_id: '',
    establecimiento: '', lote: '', ubicacion_texto: '', latitud: '', longitud: '',
    cultivo: 'Ninguno', estadio: '', objetivo: '', observaciones: '', responsable: '',
  });
  const [geoLoading, setGeoLoading] = useState(false);
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [showClienteResults, setShowClienteResults] = useState(false);

  // Fotos
  const [fotos, setFotos] = useState<VisitaFoto[]>([]);
  const [fotoUrls, setFotoUrls] = useState<Record<string, string>>({});
  const [uploadingFotos, setUploadingFotos] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fotoViewer, setFotoViewer] = useState<VisitaFoto | null>(null);
  const [fotoDescripcion, setFotoDescripcion] = useState('');
  const [modalEliminarFoto, setModalEliminarFoto] = useState<VisitaFoto | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Realizar form
  const [realizarForm, setRealizarForm] = useState({ observaciones: '', proximos_pasos: '', problema_detectado: '', recomendacion: '', crearTarea: false, tareaFecha: addDays(3) });

  // Calendario
  const [calMes, setCalMes] = useState(() => { const p = partesFecha(hoyAR()); return { y: p.anio, m: p.mes - 1 }; });
  const [calDiaSel, setCalDiaSel] = useState<string | null>(null);

  const hoy = hoyAR();
  const en14dias = addDays(14);

  const cargar = useCallback(async () => {
    const [vs, cls, cotizs] = await Promise.all([data.fetchVisitas(), data.fetchClientes(), data.fetchCotizaciones()]);
    setVisitas(vs);
    setClientes(cls);
    setCotizaciones(cotizs);
  }, []);

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);

  useEffect(() => { load(); }, [load]);

  const filtradas = useMemo(() => {
    return visitas.filter((v) => {
      if (filtroResponsable && (v.responsable || '') !== filtroResponsable) return false;
      if (filtroCliente) { const cli = clientes.find((c) => c.id === v.cliente_id); if (!cli || !cli.nombre.toLowerCase().includes(filtroCliente.toLowerCase())) return false; }
      if (filtroTipo && v.tipo !== filtroTipo) return false;
      if (filtroEstado && v.estado !== filtroEstado) return false;
      return true;
    });
  }, [visitas, filtroResponsable, filtroCliente, filtroTipo, filtroEstado, clientes]);

  const agenda = useMemo(() => {
    return filtradas.filter((v) => v.fecha >= hoy && v.fecha <= en14dias && v.estado === 'Programada').sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [filtradas, hoy, en14dias]);

  const pasadas = useMemo(() => {
    return filtradas.filter((v) => v.fecha < hoy || v.estado !== 'Programada').sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [filtradas, hoy]);

  const responsables = useMemo(() => [...new Set(visitas.map((v) => v.responsable).filter(Boolean) as string[])], [visitas]);

  function agruparPorDia(items: Visita[]): Record<string, Visita[]> {
    const grupos: Record<string, Visita[]> = {};
    for (const v of items) {
      if (!grupos[v.fecha]) grupos[v.fecha] = [];
      grupos[v.fecha].push(v);
    }
    return grupos;
  }

  async function crearVisita() {
    if (!form.fecha) return;
    const visita: Partial<Visita> = {
      fecha: form.fecha, hora: form.hora || null, tipo: form.tipo, estado: 'Programada',
      cliente_id: form.cliente_id || null, cotizacion_id: form.cotizacion_id || null,
      establecimiento: form.establecimiento || null, lote: form.lote || null,
      ubicacion_texto: form.ubicacion_texto || null,
      latitud: form.latitud ? parseFloat(form.latitud) : null,
      longitud: form.longitud ? parseFloat(form.longitud) : null,
      cultivo: form.cultivo, estadio: form.estadio || null, objetivo: form.objetivo || null,
      responsable: form.responsable || usuario.nombre, creada_por: usuario.nombre,
    };
    const created = await data.createVisita(visita);
    if (created) await registrarCambio({ tipo: 'visita', entidad: `Visita ${form.fecha}`, campo: 'creación', valor_nuevo: form.tipo });
    setModalNueva(false);
    resetForm();
    load();
  }

  function resetForm() {
    setForm({ fecha: addDays(1), hora: '', tipo: 'Comercial', cliente_id: '', cotizacion_id: '', establecimiento: '', lote: '', ubicacion_texto: '', latitud: '', longitud: '', cultivo: 'Ninguno', estadio: '', objetivo: '', observaciones: '', responsable: '' });
    setClienteBusqueda('');
  }

  async function usarUbicacion() {
    setGeoLoading(true);
    if (!navigator.geolocation) { setGeoLoading(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setForm((f) => ({ ...f, latitud: String(pos.coords.latitude), longitud: String(pos.coords.longitude) })); setGeoLoading(false); },
      () => { setGeoLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function abrirDetalle(v: Visita) {
    setModalDetalle(v);
    const fs = await data.fetchFotos(v.id);
    setFotos(fs);
    if (fs.length > 0) {
      const urls = await data.getFotoUrls(fs.map((f) => f.storage_path));
      setFotoUrls(urls);
    }
  }

  async function subirFotos(files: FileList) {
    if (!modalDetalle) return;
    const restantes = 12 - fotos.length;
    if (restantes <= 0) return;
    const archivos = Array.from(files).slice(0, restantes);
    setUploadingFotos(true);
    setUploadProgress(0);
    for (let i = 0; i < archivos.length; i++) {
      const comprimido = await comprimirImagen(archivos[i]);
      const foto = await data.uploadFoto(modalDetalle.id, comprimido, () => setUploadProgress(Math.round(((i + 1) / archivos.length) * 100)));
      if (foto) {
        setFotos((prev) => [...prev, foto]);
        const url = await data.getFotoUrl(foto.storage_path);
        if (url) setFotoUrls((prev) => ({ ...prev, [foto.storage_path]: url }));
      }
    }
    setUploadingFotos(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function eliminarFotoConfirmada() {
    if (!modalEliminarFoto) return;
    await data.deleteFoto(modalEliminarFoto.id, modalEliminarFoto.storage_path);
    setFotos((prev) => prev.filter((f) => f.id !== modalEliminarFoto.id));
    setFotoUrls((prev) => { const cp = { ...prev }; delete cp[modalEliminarFoto.storage_path]; return cp; });
    setModalEliminarFoto(null);
  }

  async function guardarDescripcionFoto() {
    if (!fotoViewer) return;
    await data.updateFotoDescripcion(fotoViewer.id, fotoDescripcion);
    setFotos((prev) => prev.map((f) => f.id === fotoViewer.id ? { ...f, descripcion: fotoDescripcion } : f));
    setFotoViewer(null);
  }

  async function marcarRealizada() {
    if (!modalRealizar) return;
    await data.updateVisita(modalRealizar.id, {
      estado: 'Realizada', observaciones: realizarForm.observaciones || null,
      proximos_pasos: realizarForm.proximos_pasos || null,
      problema_detectado: realizarForm.problema_detectado || null,
      recomendacion: realizarForm.recomendacion || null,
    });
    await registrarCambio({ tipo: 'visita', entidad: `Visita ${modalRealizar.fecha}`, campo: 'estado', valor_anterior: 'Programada', valor_nuevo: 'Realizada' });
    if (realizarForm.crearTarea) {
      await data.createTarea({
        titulo: `Seguimiento visita ${modalRealizar.cliente?.nombre || ''}`.trim(),
        tipo: 'Seguimiento', fecha_vencimiento: realizarForm.tareaFecha,
        asignado_a: usuario.nombre, creada_por: usuario.nombre,
        cliente_id: modalRealizar.cliente_id, cotizacion_id: modalRealizar.cotizacion_id,
      });
    }
    setModalRealizar(null);
    setRealizarForm({ observaciones: '', proximos_pasos: '', problema_detectado: '', recomendacion: '', crearTarea: false, tareaFecha: addDays(3) });
    load();
  }

  async function cancelarVisita(v: Visita) {
    await data.updateVisita(v.id, { estado: 'Cancelada' });
    await registrarCambio({ tipo: 'visita', entidad: `Visita ${v.fecha}`, campo: 'estado', valor_anterior: v.estado, valor_nuevo: 'Cancelada' });
    load();
  }

  async function eliminarVisita() {
    if (!modalEliminar) return;
    await data.deleteVisita(modalEliminar.id);
    setModalEliminar(null);
    load();
  }

  // Calendario helpers
  const calDias = useMemo(() => {
    const diasEnMes = diasDelMes(calMes.y, calMes.m + 1);
    const primerDiaSemana = (diaDeLaSemana(armarFecha(calMes.y, calMes.m + 1, 1)) + 6) % 7; // Lunes = 0
    const dias: (string | null)[] = [];
    for (let i = 0; i < primerDiaSemana; i++) dias.push(null);
    for (let d = 1; d <= diasEnMes; d++) {
      const ds = armarFecha(calMes.y, calMes.m + 1, d);
      dias.push(ds);
    }
    return dias;
  }, [calMes]);

  const visitasPorDia = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of filtradas) { map[v.fecha] = (map[v.fecha] || 0) + 1; }
    return map;
  }, [filtradas]);

  const clientesFiltrados = useMemo(() => {
    if (!clienteBusqueda) return [];
    return clientes.filter((c) => c.nombre.toLowerCase().includes(clienteBusqueda.toLowerCase())).slice(0, 6);
  }, [clientes, clienteBusqueda]);

  function renderVisitaCard(v: Visita) {
    return (
      <div key={v.id} className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">{v.tipo}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${v.estado === 'Programada' ? 'bg-blue-100 text-blue-700' : v.estado === 'Realizada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{v.estado}</span>
              {v.hora && <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock className="w-3 h-3" /> {v.hora}</span>}
            </div>
            <p className="text-sm font-medium text-gray-800 mt-1">{v.cliente?.nombre || 'Sin cliente'}</p>
            {v.establecimiento && <p className="text-xs text-gray-400">{v.establecimiento}{v.lote ? ` · Lote ${v.lote}` : ''}</p>}
            {v.responsable && <p className="text-xs text-gray-400">· {v.responsable}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => abrirDetalle(v)} className="p-1 text-gray-300 hover:text-gray-600"><Edit2 className="w-4 h-4" /></button>
            {v.estado === 'Programada' && <button onClick={() => { setModalRealizar(v); setRealizarForm({ observaciones: v.observaciones || '', proximos_pasos: v.proximos_pasos || '', problema_detectado: v.problema_detectado || '', recomendacion: v.recomendacion || '', crearTarea: false, tareaFecha: addDays(3) }); }} className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">Realizar</button>}
            {v.estado === 'Programada' && <button onClick={() => cancelarVisita(v)} className="text-xs px-2 py-1 rounded text-gray-400 hover:text-red-600">Cancelar</button>}
            <button onClick={() => setModalEliminar(v)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><MapPin className="w-7 h-7 text-gray-400" /> Visitas</h1>
        <button onClick={() => { resetForm(); setModalNueva(true); }} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"><Plus className="w-4 h-4" /> Nueva visita</button>
      </div>

      {/* Vistas */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        <button onClick={() => setVista('agenda')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${vista === 'agenda' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Agenda</button>
        <button onClick={() => setVista('calendario')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${vista === 'calendario' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Calendario</button>
        <button onClick={() => setVista('pasadas')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${vista === 'pasadas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Pasadas</button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <select value={filtroResponsable} onChange={(e) => setFiltroResponsable(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"><option value="">Todos (responsable)</option>{responsables.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          <input type="text" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} placeholder="Cliente..." className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"><option value="">Todos los tipos</option>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"><option value="">Todos los estados</option>{ESTADOS_VISITA.map((e) => <option key={e} value={e}>{e}</option>)}</select>
        </div>
      </div>

      {/* Agenda */}
      {vista === 'agenda' && (
        <div className="space-y-4">
          {agenda.length === 0 ? <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400"><Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />No hay visitas programadas</div> : (
            Object.entries(agruparPorDia(agenda)).map(([dia, items]) => (
              <div key={dia}>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Calendar className="w-4 h-4 text-emerald-600" /> {formatDate(dia)} {dia === hoy && <span className="text-xs text-emerald-600 font-medium">(Hoy)</span>}</h3>
                <div className="space-y-2">{items.map(renderVisitaCard)}</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Calendario */}
      {vista === 'calendario' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCalMes((p) => { const m = p.m - 1; return m < 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m }; })} className="p-1 text-gray-400 hover:text-gray-600"><ChevronLeft className="w-5 h-5" /></button>
            <span className="font-semibold text-gray-700">{new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(calMes.y, calMes.m, 1)))}</span>
            <button onClick={() => setCalMes((p) => { const m = p.m + 1; return m > 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m }; })} className="p-1 text-gray-400 hover:text-gray-600"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calDias.map((ds, i) => {
              if (!ds) return <div key={i} />;
              const count = visitasPorDia[ds] || 0;
              const isHoy = ds === hoy;
              const isSel = ds === calDiaSel;
              return (
                <button key={i} onClick={() => setCalDiaSel(ds)} className={`aspect-square rounded-lg text-sm flex flex-col items-center justify-center relative ${isSel ? 'bg-emerald-100 border border-emerald-400' : isHoy ? 'bg-emerald-50' : 'hover:bg-gray-50'} ${count > 0 ? 'font-bold' : 'text-gray-400'}`}>
                  {parseInt(ds.substring(8))}
                  {count > 0 && <div className="flex gap-0.5 mt-0.5">{Array.from({ length: Math.min(count, 3) }).map((_, j) => <div key={j} className="w-1.5 h-1.5 rounded-full bg-emerald-500" />)}</div>}
                </button>
              );
            })}
          </div>
          {calDiaSel && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{formatDate(calDiaSel)}</h3>
              <div className="space-y-2">{filtradas.filter((v) => v.fecha === calDiaSel).map(renderVisitaCard)}</div>
              {filtradas.filter((v) => v.fecha === calDiaSel).length === 0 && <p className="text-sm text-gray-400">Sin visitas</p>}
            </div>
          )}
        </div>
      )}

      {/* Pasadas */}
      {vista === 'pasadas' && (
        <div className="space-y-4">
          {pasadas.length === 0 ? <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400"><Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />No hay visitas pasadas</div> : (
            Object.entries(agruparPorDia(pasadas)).map(([dia, items]) => (
              <div key={dia}><h3 className="text-sm font-semibold text-gray-500 mb-2">{formatDate(dia)}</h3><div className="space-y-2">{items.map(renderVisitaCard)}</div></div>
            ))
          )}
        </div>
      )}

      {/* Modal nueva visita */}
      {modalNueva && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalNueva(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-gray-800">Nueva visita</h3><button onClick={() => setModalNueva(false)} className="text-gray-400"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Hora</label><input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <input type="text" value={clienteBusqueda} onChange={(e) => { setClienteBusqueda(e.target.value); setShowClienteResults(true); }} placeholder="Buscar cliente..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
                {showClienteResults && clientesFiltrados.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {clientesFiltrados.map((c) => <button key={c.id} onClick={() => { setForm({ ...form, cliente_id: c.id }); setClienteBusqueda(c.nombre); setShowClienteResults(false); }} className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm border-b border-gray-100 last:border-0">{c.nombre}</button>)}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Establecimiento</label><input type="text" value={form.establecimiento} onChange={(e) => setForm({ ...form, establecimiento: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Lote</label><input type="text" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Ubicación (texto)</label><input type="text" value={form.ubicacion_texto} onChange={(e) => setForm({ ...form, ubicacion_texto: e.target.value })} placeholder="Ruta, localidad..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              <div className="flex items-center gap-2">
                <button onClick={usarUbicacion} disabled={geoLoading} className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 flex items-center gap-2 disabled:opacity-50"><MapPinned className="w-4 h-4" /> {geoLoading ? 'Obteniendo...' : 'Usar mi ubicación'}</button>
                {form.latitud && form.longitud && <a href={`https://www.google.com/maps?q=${form.latitud},${form.longitud}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">Ver en mapa</a>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Latitud</label><input type="text" value={form.latitud} onChange={(e) => setForm({ ...form, latitud: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Longitud</label><input type="text" value={form.longitud} onChange={(e) => setForm({ ...form, longitud: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Cultivo</label><select value={form.cultivo} onChange={(e) => setForm({ ...form, cultivo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">{CULTIVOS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Estadio</label><input type="text" value={form.estadio} onChange={(e) => setForm({ ...form, estadio: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Objetivo</label><input type="text" value={form.objetivo} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label><input type="text" value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} placeholder={usuario.nombre} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
            </div>
            <div className="flex gap-2 justify-end mt-4"><button onClick={() => setModalNueva(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button><button onClick={crearVisita} disabled={!form.fecha} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">Crear</button></div>
          </div>
        </div>
      )}

      {/* Modal detalle + fotos */}
      {modalDetalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalDetalle(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-gray-800">Detalle de visita</h3><button onClick={() => setModalDetalle(null)} className="text-gray-400"><X className="w-5 h-5" /></button></div>
            <div className="space-y-2 text-sm">
              <p><span className="text-gray-500">Fecha:</span> <span className="font-medium">{formatDate(modalDetalle.fecha)} {modalDetalle.hora && `· ${modalDetalle.hora}`}</span></p>
              <p><span className="text-gray-500">Tipo:</span> {modalDetalle.tipo} · <span className="text-gray-500">Estado:</span> {modalDetalle.estado}</p>
              {modalDetalle.cliente && <p><span className="text-gray-500">Cliente:</span> {modalDetalle.cliente.nombre}</p>}
              {modalDetalle.establecimiento && <p><span className="text-gray-500">Establecimiento:</span> {modalDetalle.establecimiento}{modalDetalle.lote ? ` · Lote ${modalDetalle.lote}` : ''}</p>}
              {modalDetalle.cultivo && modalDetalle.cultivo !== 'Ninguno' && <p><span className="text-gray-500">Cultivo:</span> {modalDetalle.cultivo} {modalDetalle.estadio ? `· ${modalDetalle.estadio}` : ''}</p>}
              {modalDetalle.objetivo && <p><span className="text-gray-500">Objetivo:</span> {modalDetalle.objetivo}</p>}
              {modalDetalle.observaciones && <p><span className="text-gray-500">Observaciones:</span> {modalDetalle.observaciones}</p>}
              {modalDetalle.proximos_pasos && <p><span className="text-gray-500">Próximos pasos:</span> {modalDetalle.proximos_pasos}</p>}
              {modalDetalle.latitud && modalDetalle.longitud && <a href={`https://www.google.com/maps?q=${modalDetalle.latitud},${modalDetalle.longitud}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline block">Ver en mapa</a>}
            </div>

            {/* Fotos */}
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-700 text-sm">Fotos ({fotos.length}/12)</h4>
                {fotos.length < 12 && modalDetalle.estado !== 'Cancelada' && (
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFotos} className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1 disabled:opacity-50"><Camera className="w-4 h-4" /> Subir</button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) subirFotos(e.target.files); }} />
              {uploadingFotos && <div className="w-full bg-gray-200 rounded-full h-2 mb-2"><div className="bg-emerald-600 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} /></div>}
              {fotos.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4"><ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-30" />Sin fotos</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {fotos.map((f) => (
                    <div key={f.id} className="relative group">
                      {fotoUrls[f.storage_path] ? (
                        <img src={fotoUrls[f.storage_path]} alt={f.descripcion || ''} className="w-full aspect-square object-cover rounded-lg cursor-pointer" onClick={() => { setFotoViewer(f); setFotoDescripcion(f.descripcion || ''); }} />
                      ) : <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>}
                      <button onClick={() => setModalEliminarFoto(f)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              {fotos.length >= 12 && <p className="text-xs text-amber-600 mt-2">Límite de 12 fotos alcanzado</p>}
            </div>

            {modalDetalle.estado === 'Programada' && (
              <div className="flex gap-2 mt-4">
                <button onClick={() => { const v = modalDetalle; setModalDetalle(null); setModalRealizar(v); setRealizarForm({ observaciones: v.observaciones || '', proximos_pasos: v.proximos_pasos || '', problema_detectado: v.problema_detectado || '', recomendacion: v.recomendacion || '', crearTarea: false, tareaFecha: addDays(3) }); }} className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Marcar como realizada</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Foto viewer */}
      {fotoViewer && fotoUrls[fotoViewer.storage_path] && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4" onClick={() => setFotoViewer(null)}>
          <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={fotoUrls[fotoViewer.storage_path]} alt="" className="w-full max-h-[70vh] object-contain rounded-lg" />
            <div className="mt-3 flex items-center gap-2">
              <input type="text" value={fotoDescripcion} onChange={(e) => setFotoDescripcion(e.target.value)} placeholder="Descripción..." className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-white bg-white/10 outline-none" />
              <button onClick={guardarDescripcionFoto} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm">Guardar</button>
            </div>
            <button onClick={() => setFotoViewer(null)} className="mt-3 text-white/60 text-sm">Cerrar</button>
          </div>
        </div>
      )}

      {/* Modal eliminar foto */}
      {modalEliminarFoto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setModalEliminarFoto(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-600" /></div><h3 className="font-bold text-gray-800">Eliminar foto</h3></div>
            <p className="text-sm text-gray-600 mb-4">¿Eliminar esta foto? No se puede deshacer.</p>
            <div className="flex gap-2 justify-end"><button onClick={() => setModalEliminarFoto(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button><button onClick={eliminarFotoConfirmada} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Eliminar</button></div>
          </div>
        </div>
      )}

      {/* Modal realizar */}
      {modalRealizar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalRealizar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Check className="w-5 h-5 text-emerald-600" /></div><div><h3 className="font-bold text-gray-800">Marcar como realizada</h3><p className="text-sm text-gray-500">{modalRealizar.cliente?.nombre || 'Sin cliente'} · {formatDate(modalRealizar.fecha)}</p></div></div>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label><textarea value={realizarForm.observaciones} onChange={(e) => setRealizarForm({ ...realizarForm, observaciones: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none resize-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Problema detectado</label><input type="text" value={realizarForm.problema_detectado} onChange={(e) => setRealizarForm({ ...realizarForm, problema_detectado: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Recomendación</label><input type="text" value={realizarForm.recomendacion} onChange={(e) => setRealizarForm({ ...realizarForm, recomendacion: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Próximos pasos</label><textarea value={realizarForm.proximos_pasos} onChange={(e) => setRealizarForm({ ...realizarForm, proximos_pasos: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none resize-none" /></div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={realizarForm.crearTarea} onChange={(e) => setRealizarForm({ ...realizarForm, crearTarea: e.target.checked })} className="w-4 h-4 accent-emerald-600" /> Crear tarea de seguimiento</label>
              {realizarForm.crearTarea && <div className="flex gap-2 items-center"><input type="date" value={realizarForm.tareaFecha} onChange={(e) => setRealizarForm({ ...realizarForm, tareaFecha: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /><button onClick={() => setRealizarForm({ ...realizarForm, tareaFecha: addDays(1) })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600">+1d</button><button onClick={() => setRealizarForm({ ...realizarForm, tareaFecha: addDays(7) })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600">+7d</button></div>}
            </div>
            <div className="flex gap-2 justify-end mt-4"><button onClick={() => setModalRealizar(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button><button onClick={marcarRealizada} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-2"><Check className="w-4 h-4" /> Confirmar</button></div>
          </div>
        </div>
      )}

      {/* Modal eliminar visita */}
      {modalEliminar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalEliminar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><AlertCircle className="w-5 h-5 text-red-600" /></div><h3 className="font-bold text-gray-800">Eliminar visita</h3></div>
            <div className="flex gap-2 justify-end"><button onClick={() => setModalEliminar(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button><button onClick={eliminarVisita} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Eliminar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
