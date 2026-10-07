import { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { registrarCambio } from '@/lib/historial';
import type { Tarea, Cliente, Cotizacion } from '@/types';
import { CheckSquare, Plus, X, Check, Clock, Calendar, Trash2, Edit2, AlertCircle, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { diasDesde, hoyAR, sumarDias } from '@/lib/fechas';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';

const TIPOS = ['Llamar', 'Visitar', 'Enviar información', 'Cobrar', 'Seguimiento', 'Otro'];
const PRIORIDADES = ['Alta', 'Normal', 'Baja'];

function addDays(days: number): string {
  return sumarDias(hoyAR(), days);
}

function generarICS(tarea: Tarea): string {
  const fecha = tarea.fecha_vencimiento;
  const ymd = fecha.slice(0, 10).replace(/-/g, '');
  let dtStart: string;
  let dtEnd: string;
  if (tarea.hora) {
    // Evento con hora: dura 1 hora; si cruza la medianoche, termina el mismo día a las 23:59.
    const hh = parseInt(tarea.hora.substring(0, 2), 10);
    const mm = tarea.hora.substring(3, 5);
    dtStart = `DTSTART:${ymd}T${String(hh).padStart(2, '0')}${mm}00`;
    dtEnd = hh >= 23
      ? `DTEND:${ymd}T235900`
      : `DTEND:${ymd}T${String(hh + 1).padStart(2, '0')}${mm}00`;
  } else {
    // Sin hora: evento de día completo (DTEND es exclusivo, o sea el día siguiente).
    dtStart = `DTSTART;VALUE=DATE:${ymd}`;
    dtEnd = `DTEND;VALUE=DATE:${sumarDias(fecha.slice(0, 10), 1).replace(/-/g, '')}`;
  }
  const desc = [
    tarea.descripcion || '',
    tarea.cotizacion ? `Cotización N° ${tarea.cotizacion.numero}` : '',
    tarea.cliente ? `Cliente: ${tarea.cliente.nombre}` : '',
  ].filter(Boolean).join('\\n');
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Cotizador Agro//CRM//ES
BEGIN:VEVENT
UID:${tarea.id}@cotizador-agro
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}
${dtStart}
${dtEnd}
SUMMARY:${tarea.titulo}
DESCRIPTION:${desc}
END:VEVENT
END:VCALENDAR`;
}

function descargarICS(tarea: Tarea) {
  const blob = new Blob([generarICS(tarea)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tarea-${tarea.titulo.replace(/\s+/g, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Tareas() {
  const data = useData();
  const { usuario } = useAuth();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroAsignado, setFiltroAsignado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [showHechas, setShowHechas] = useState(false);

  const [modalNueva, setModalNueva] = useState(false);
  const [modalCompletar, setModalCompletar] = useState<Tarea | null>(null);
  const [modalEditar, setModalEditar] = useState<Tarea | null>(null);
  const [modalEliminar, setModalEliminar] = useState<Tarea | null>(null);

  const [form, setForm] = useState({ titulo: '', descripcion: '', tipo: 'Seguimiento', prioridad: 'Normal', fecha_vencimiento: addDays(1), hora: '', asignado_a: '', cotizacion_id: '', cliente_id: '' });
  const [completarForm, setCompletarForm] = useState({ resultado: '', agendarProxima: false, proximaFecha: addDays(3) });

  const hoy = hoyAR();
  const en7dias = addDays(7);

  const cargar = useCallback(async () => {
    const [tars, cls, cotizs] = await Promise.all([data.fetchTareas(), data.fetchClientes(), data.fetchCotizaciones()]);
    setTareas(tars);
    setClientes(cls);
    setCotizaciones(cotizs);
  }, []);

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);

  useEffect(() => { load(); }, [load]);

  const filtradas = useMemo(() => {
    return tareas.filter((t) => {
      if (filtroAsignado && (t.asignado_a || '') !== filtroAsignado) return false;
      if (filtroTipo && t.tipo !== filtroTipo) return false;
      if (filtroCliente) {
        const cli = clientes.find((c) => c.id === t.cliente_id);
        if (!cli || !cli.nombre.toLowerCase().includes(filtroCliente.toLowerCase())) return false;
      }
      if (busqueda && !t.titulo.toLowerCase().includes(busqueda.toLowerCase())) return false;
      return true;
    });
  }, [tareas, filtroAsignado, filtroTipo, filtroCliente, busqueda, clientes]);

  const grupos = useMemo(() => {
    const pendientes = filtradas.filter((t) => t.estado === 'Pendiente');
    const hechas = filtradas.filter((t) => t.estado === 'Hecha');
    return {
      vencidas: pendientes.filter((t) => t.fecha_vencimiento < hoy).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)),
      hoy: pendientes.filter((t) => t.fecha_vencimiento === hoy),
      proximos7: pendientes.filter((t) => t.fecha_vencimiento > hoy && t.fecha_vencimiento <= en7dias).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)),
      masAdelante: pendientes.filter((t) => t.fecha_vencimiento > en7dias).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)),
      hechas: hechas.sort((a, b) => (b.completada_at || '').localeCompare(a.completada_at || '')),
    };
  }, [filtradas, hoy, en7dias]);

  const asignados = useMemo(() => {
    const set = new Set(tareas.map((t) => t.asignado_a).filter(Boolean) as string[]);
    return [...set];
  }, [tareas]);

  async function crearTarea() {
    if (!form.titulo.trim() || !form.fecha_vencimiento) return;
    const tarea: Partial<Tarea> = {
      titulo: form.titulo, descripcion: form.descripcion || null, tipo: form.tipo,
      prioridad: form.prioridad, fecha_vencimiento: form.fecha_vencimiento,
      hora: form.hora || null, asignado_a: form.asignado_a || usuario.nombre,
      creada_por: usuario.nombre,
      cotizacion_id: form.cotizacion_id || null, cliente_id: form.cliente_id || null,
    };
    const created = await data.createTarea(tarea);
    if (created) {
      await registrarCambio({ tipo: 'tarea', cotizacion_id: form.cotizacion_id || undefined, entidad: form.titulo, campo: 'creación', valor_nuevo: form.fecha_vencimiento });
    }
    setModalNueva(false);
    setForm({ titulo: '', descripcion: '', tipo: 'Seguimiento', prioridad: 'Normal', fecha_vencimiento: addDays(1), hora: '', asignado_a: '', cotizacion_id: '', cliente_id: '' });
    load();
  }

  async function completarTarea() {
    if (!modalCompletar) return;
    await data.updateTarea(modalCompletar.id, { estado: 'Hecha', completada_at: new Date().toISOString(), resultado: completarForm.resultado || null });
    await registrarCambio({ tipo: 'tarea', cotizacion_id: modalCompletar.cotizacion_id || undefined, entidad: modalCompletar.titulo, campo: 'finalización', valor_anterior: 'Pendiente', valor_nuevo: 'Hecha', detalle: completarForm.resultado || undefined });
    if (completarForm.agendarProxima) {
      await data.createTarea({
        titulo: `Seguimiento: ${modalCompletar.titulo}`, tipo: 'Seguimiento', prioridad: modalCompletar.prioridad,
        fecha_vencimiento: completarForm.proximaFecha, asignado_a: modalCompletar.asignado_a || usuario.nombre,
        creada_por: usuario.nombre, cotizacion_id: modalCompletar.cotizacion_id, cliente_id: modalCompletar.cliente_id,
      });
    }
    setModalCompletar(null);
    setCompletarForm({ resultado: '', agendarProxima: false, proximaFecha: addDays(3) });
    load();
  }

  async function reprogramar(id: string, nuevaFecha: string) {
    await data.updateTarea(id, { fecha_vencimiento: nuevaFecha });
    await registrarCambio({ tipo: 'tarea', entidad: tareas.find((t) => t.id === id)?.titulo, campo: 'reprogramación', valor_nuevo: nuevaFecha });
    load();
  }

  async function eliminarTarea() {
    if (!modalEliminar) return;
    await data.deleteTarea(modalEliminar.id);
    setModalEliminar(null);
    load();
  }

  async function editarTarea() {
    if (!modalEditar) return;
    await data.updateTarea(modalEditar.id, {
      titulo: modalEditar.titulo, descripcion: modalEditar.descripcion, tipo: modalEditar.tipo,
      prioridad: modalEditar.prioridad, fecha_vencimiento: modalEditar.fecha_vencimiento,
      hora: modalEditar.hora, asignado_a: modalEditar.asignado_a,
    });
    setModalEditar(null);
    load();
  }

  function abrirCompletar(t: Tarea) {
    setModalCompletar(t);
    setCompletarForm({ resultado: '', agendarProxima: false, proximaFecha: addDays(3) });
  }

  function prioridadColor(p: string): string {
    if (p === 'Alta') return 'bg-red-100 text-red-700';
    if (p === 'Baja') return 'bg-gray-100 text-gray-500';
    return 'bg-blue-100 text-blue-700';
  }

  function renderTarea(t: Tarea) {
    return (
      <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow">
        <div className="flex items-start gap-3">
          {t.estado === 'Pendiente' ? (
            <button onClick={() => abrirCompletar(t)} className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-50 transition-colors flex-shrink-0 mt-0.5" title="Marcar como hecha" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5"><Check className="w-3 h-3 text-white" /></div>
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${t.estado === 'Hecha' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{t.titulo}</p>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${prioridadColor(t.prioridad)}`}>{t.prioridad}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{t.tipo}</span>
              {t.cotizacion?.numero && <span className="text-xs text-emerald-600 font-medium">Cot. N° {t.cotizacion.numero}</span>}
              {t.cliente?.nombre && <span className="text-xs text-gray-400">{t.cliente.nombre}</span>}
              <span className="text-xs text-gray-400 flex items-center gap-0.5"><Calendar className="w-3 h-3" /> {formatDate(t.fecha_vencimiento)}</span>
              {t.hora && <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock className="w-3 h-3" /> {t.hora}</span>}
              {t.asignado_a && <span className="text-xs text-gray-400">· {t.asignado_a}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => descargarICS(t)} className="p-1 text-gray-300 hover:text-blue-500" title="Agregar al calendario"><Download className="w-4 h-4" /></button>
            <button onClick={() => setModalEditar(t)} className="p-1 text-gray-300 hover:text-gray-600"><Edit2 className="w-4 h-4" /></button>
            <button onClick={() => setModalEliminar(t)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  function renderGrupo(titulo: string, items: Tarea[], color: string, colapsable?: boolean) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {colapsable && <button onClick={() => setShowHechas(!showHechas)} className="p-0.5 text-gray-400">{showHechas ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>}
          <h3 className={`text-sm font-semibold ${color}`}>{titulo}</h3>
          <span className="text-xs text-gray-400">({items.length})</span>
        </div>
        {(!colapsable || showHechas) && <div className="space-y-2">{items.map(renderTarea)}</div>}
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
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><CheckSquare className="w-7 h-7 text-gray-400" /> Tareas</h1>
        <button onClick={() => setModalNueva(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"><Plus className="w-4 h-4" /> Nueva tarea</button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <select value={filtroAsignado} onChange={(e) => setFiltroAsignado(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">Todos (asignado)</option>
            {asignados.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white">
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="text" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} placeholder="Cliente..." className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar..." className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400"><CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />No hay tareas</div>
      ) : (
        <div className="space-y-4">
          {renderGrupo('Vencidas', grupos.vencidas, 'text-red-600')}
          {renderGrupo('Hoy', grupos.hoy, 'text-emerald-600')}
          {renderGrupo('Próximos 7 días', grupos.proximos7, 'text-blue-600')}
          {renderGrupo('Más adelante', grupos.masAdelante, 'text-gray-600')}
          {renderGrupo('Hechas', grupos.hechas, 'text-gray-400', true)}
        </div>
      )}

      {/* Modal nueva tarea */}
      {modalNueva && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalNueva(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-gray-800">Nueva tarea</h3><button onClick={() => setModalNueva(false)} className="text-gray-400"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Título *</label><input type="text" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label><textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none resize-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label><select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">{PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Vencimiento *</label><input type="date" value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Hora</label><input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setForm({ ...form, fecha_vencimiento: addDays(1) })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">+1 día</button>
                <button onClick={() => setForm({ ...form, fecha_vencimiento: addDays(3) })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">+3 días</button>
                <button onClick={() => setForm({ ...form, fecha_vencimiento: addDays(7) })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">+7 días</button>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Asignado a</label><input type="text" value={form.asignado_a} onChange={(e) => setForm({ ...form, asignado_a: e.target.value })} placeholder={usuario.nombre} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Cotización</label><select value={form.cotizacion_id} onChange={(e) => setForm({ ...form, cotizacion_id: e.target.value, cliente_id: e.target.value ? cotizaciones.find((c) => c.id === e.target.value)?.cliente_id || '' : form.cliente_id })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">Sin cotización</option>{cotizaciones.slice(0, 50).map((c) => <option key={c.id} value={c.id}>N° {c.numero} · {c.cliente_nombre}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label><select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"><option value="">Sin cliente</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
            </div>
            <div className="flex gap-2 justify-end mt-4"><button onClick={() => setModalNueva(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button><button onClick={crearTarea} disabled={!form.titulo.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">Crear</button></div>
          </div>
        </div>
      )}

      {/* Modal completar */}
      {modalCompletar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalCompletar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center"><Check className="w-5 h-5 text-emerald-600" /></div><div><h3 className="font-bold text-gray-800">Marcar como hecha</h3><p className="text-sm text-gray-500">{modalCompletar.titulo}</p></div></div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resultado (opcional)</label>
            <textarea value={completarForm.resultado} onChange={(e) => setCompletarForm({ ...completarForm, resultado: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none mb-3 resize-none" />
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-2"><input type="checkbox" checked={completarForm.agendarProxima} onChange={(e) => setCompletarForm({ ...completarForm, agendarProxima: e.target.checked })} className="w-4 h-4 accent-emerald-600" /> Agendar la próxima tarea</label>
            {completarForm.agendarProxima && (
              <div className="flex gap-2 items-center mb-3">
                <input type="date" value={completarForm.proximaFecha} onChange={(e) => setCompletarForm({ ...completarForm, proximaFecha: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
                <button onClick={() => setCompletarForm({ ...completarForm, proximaFecha: addDays(1) })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600">+1d</button>
                <button onClick={() => setCompletarForm({ ...completarForm, proximaFecha: addDays(3) })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600">+3d</button>
                <button onClick={() => setCompletarForm({ ...completarForm, proximaFecha: addDays(7) })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600">+7d</button>
              </div>
            )}
            <div className="flex gap-2 justify-end"><button onClick={() => setModalCompletar(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button><button onClick={completarTarea} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-2"><Check className="w-4 h-4" /> Confirmar</button></div>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {modalEditar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalEditar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-gray-800">Editar tarea</h3><button onClick={() => setModalEditar(null)} className="text-gray-400"><X className="w-5 h-5" /></button></div>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Título</label><input type="text" value={modalEditar.titulo} onChange={(e) => setModalEditar({ ...modalEditar, titulo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label><textarea value={modalEditar.descripcion || ''} onChange={(e) => setModalEditar({ ...modalEditar, descripcion: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none resize-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <select value={modalEditar.tipo} onChange={(e) => setModalEditar({ ...modalEditar, tipo: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <select value={modalEditar.prioridad} onChange={(e) => setModalEditar({ ...modalEditar, prioridad: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">{PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={modalEditar.fecha_vencimiento} onChange={(e) => setModalEditar({ ...modalEditar, fecha_vencimiento: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
                <input type="time" value={modalEditar.hora || ''} onChange={(e) => setModalEditar({ ...modalEditar, hora: e.target.value })} className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
              </div>
              <input type="text" value={modalEditar.asignado_a || ''} onChange={(e) => setModalEditar({ ...modalEditar, asignado_a: e.target.value })} placeholder="Asignado a" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none" />
            </div>
            <div className="flex gap-2 justify-end mt-4"><button onClick={() => setModalEditar(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button><button onClick={editarTarea} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Guardar</button></div>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {modalEliminar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalEliminar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center"><AlertCircle className="w-5 h-5 text-red-600" /></div><div><h3 className="font-bold text-gray-800">Eliminar tarea</h3><p className="text-sm text-gray-500">{modalEliminar.titulo}</p></div></div>
            <div className="flex gap-2 justify-end"><button onClick={() => setModalEliminar(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button><button onClick={eliminarTarea} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Eliminar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
