import { useState, useEffect, useCallback } from 'react';
import { useData } from '@/hooks/useData';
import { formatUSD, formatDate } from '@/lib/format';
import type { Cliente, Cotizacion, MargenCliente, ProductoConCosto, Tarea, Visita, Configuracion } from '@/types';
import { Users, Plus, Search, X, Trash2, Edit2, Loader2, MapPin, CreditCard, FileText, AlertCircle, CheckSquare, Calendar, Clock, Activity } from 'lucide-react';
import { registrarCambio, fmtMargen } from '@/lib/historial';
import { diasDesde, fechaDeTimestamp } from '@/lib/fechas';

export default function Clientes() {
  const data = useData();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({ nombre: '', cuit: '', zona: '', condiciones_pago: '' });
  const [detalle, setDetalle] = useState<Cliente | null>(null);
  const [cotizsCliente, setCotizsCliente] = useState<Cotizacion[]>([]);
  const [margenes, setMargenes] = useState<MargenCliente[]>([]);
  const [productos, setProductos] = useState<ProductoConCosto[]>([]);
  const [nuevoMargen, setNuevoMargen] = useState({ producto_id: '', familia: '', margen: '' });
  const [tareasCliente, setTareasCliente] = useState<Tarea[]>([]);
  const [visitasCliente, setVisitasCliente] = useState<Visita[]>([]);
  const [configCli, setConfigCli] = useState<Configuracion | null>(null);
  const [tabCli, setTabCli] = useState<'cotizaciones' | 'tareas' | 'visitas' | 'timeline'>('cotizaciones');

  const [modalEliminar, setModalEliminar] = useState<Cliente | null>(null);

  const load = useCallback(async () => {
    const cls = await data.fetchClientes();
    setClientes(cls);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function verDetalle(c: Cliente) {
    setDetalle(c);
    setTabCli('cotizaciones');
    const [todas, margs, lista, tars, viss, cfg] = await Promise.all([
      data.fetchCotizaciones(), data.fetchMargenesCliente(c.id), data.fetchListaVigente(),
      data.fetchTareasByCliente(c.id), data.fetchVisitasByCliente(c.id), data.fetchConfig(),
    ]);
    setCotizsCliente(todas.filter((cot) => cot.cliente_id === c.id));
    setMargenes(margs);
    setTareasCliente(tars);
    setVisitasCliente(viss);
    setConfigCli(cfg);
    if (lista) {
      const prods = await data.fetchProductosConCosto(lista.id);
      setProductos(prods);
    }
  }

  async function guardarCliente() {
    if (!form.nombre.trim()) return;
    if (editando) {
      const prev = editando;
      await data.updateCliente(editando.id, form);
      if (prev.nombre !== form.nombre) await registrarCambio({ tipo: 'margen', entidad: `Cliente ${prev.nombre}`, campo: 'nombre', valor_anterior: prev.nombre, valor_nuevo: form.nombre });
    } else {
      const nuevo = await data.createCliente(form);
      if (nuevo) await registrarCambio({ tipo: 'margen', entidad: `Cliente ${form.nombre}`, campo: 'alta', valor_nuevo: form.nombre });
    }
    setMostrarForm(false);
    setEditando(null);
    setForm({ nombre: '', cuit: '', zona: '', condiciones_pago: '' });
    load();
  }

  async function confirmarEliminarCliente() {
    if (!modalEliminar) return;
    await data.deleteCliente(modalEliminar.id);
    await registrarCambio({ tipo: 'margen', entidad: `Cliente ${modalEliminar.nombre}`, campo: 'baja', valor_anterior: modalEliminar.nombre });
    if (detalle?.id === modalEliminar.id) setDetalle(null);
    setModalEliminar(null);
    load();
  }

  async function agregarMargen() {
    if (!detalle) return;
    const margenNum = parseFloat(nuevoMargen.margen.replace(',', '.')) || 0;
    if (nuevoMargen.producto_id) {
      const prod = productos.find((p) => p.id === nuevoMargen.producto_id);
      const prev = margenes.find((m) => m.producto_id === nuevoMargen.producto_id);
      await data.upsertMargenCliente({ cliente_id: detalle.id, producto_id: nuevoMargen.producto_id, familia: null, margen: margenNum });
      await registrarCambio({ tipo: 'margen', entidad: `Cliente ${detalle.nombre} · Producto ${prod?.cod || ''}`, campo: 'margen', valor_anterior: prev ? fmtMargen(prev.margen) : null, valor_nuevo: fmtMargen(margenNum) });
    } else if (nuevoMargen.familia) {
      const prev = margenes.find((m) => m.familia === nuevoMargen.familia);
      await data.upsertMargenCliente({ cliente_id: detalle.id, producto_id: null, familia: nuevoMargen.familia, margen: margenNum });
      await registrarCambio({ tipo: 'margen', entidad: `Cliente ${detalle.nombre} · Familia ${nuevoMargen.familia}`, campo: 'margen', valor_anterior: prev ? fmtMargen(prev.margen) : null, valor_nuevo: fmtMargen(margenNum) });
    } else return;
    const margs = await data.fetchMargenesCliente(detalle.id);
    setMargenes(margs);
    setNuevoMargen({ producto_id: '', familia: '', margen: '' });
  }

  async function eliminarMargen(id: string) {
    if (!detalle) return;
    const m = margenes.find((x) => x.id === id);
    await data.deleteMargenCliente(id);
    if (m) await registrarCambio({ tipo: 'margen', entidad: `Cliente ${detalle.nombre}`, campo: 'margen', valor_anterior: fmtMargen(m.margen), valor_nuevo: null, detalle: 'Margen eliminado' });
    const margs = await data.fetchMargenesCliente(detalle.id);
    setMargenes(margs);
  }

  const familias = [...new Set(productos.map((p) => p.familia).filter(Boolean))] as string[];

  function ultimoContacto(): string | null {
    let max: string | null = null;
    for (const v of visitasCliente) {
      if (v.estado === 'Realizada') { const d = v.fecha.slice(0, 10); if (!max || d > max) max = d; }
    }
    for (const t of tareasCliente) {
      if (t.estado === 'Hecha' && t.completada_at) { const d = fechaDeTimestamp(t.completada_at); if (!max || d > max) max = d; }
    }
    for (const c of cotizsCliente) {
      if (c.fecha_envio) { const d = fechaDeTimestamp(c.fecha_envio); if (!max || d > max) max = d; }
    }
    return max;
  }

  function timelineItems(): { fecha: string; titulo: string; tipo: string; icon: 'cotizacion' | 'tarea' | 'visita' }[] {
    const items: { fecha: string; titulo: string; tipo: string; icon: 'cotizacion' | 'tarea' | 'visita' }[] = [];
    for (const c of cotizsCliente) items.push({ fecha: c.fecha, titulo: `Cotización N° ${c.numero} · ${c.estado}`, tipo: 'Cotización', icon: 'cotizacion' });
    for (const t of tareasCliente) if (t.estado === 'Hecha') items.push({ fecha: t.completada_at || t.fecha_vencimiento, titulo: t.titulo, tipo: 'Tarea completada', icon: 'tarea' });
    for (const v of visitasCliente) items.push({ fecha: v.fecha, titulo: `${v.tipo} · ${v.estado}`, tipo: 'Visita', icon: 'visita' });
    return items.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20);
  }

  const filtrados = busqueda
    ? clientes.filter((c) => c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (c.cuit || '').includes(busqueda))
    : clientes;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (detalle) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setDetalle(null)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <X className="w-4 h-4" /> Volver
          </button>
          <button
            onClick={() => setModalEliminar(detalle)}
            className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
          >
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>

        {/* Ficha */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-800">{detalle.nombre}</h2>
            {(() => {
              const ult = ultimoContacto();
              if (!ult) return null;
              const dias = diasDesde(ult);
              const alerta = configCli && dias > configCli.ultimo_contacto_dias;
              return <span className={`text-xs px-2 py-1 rounded-full font-medium ${alerta ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>Último contacto: hace {dias}d</span>;
            })()}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {detalle.cuit && (
              <div className="flex items-center gap-2 text-gray-600">
                <CreditCard className="w-4 h-4 text-gray-400" /> CUIT: {detalle.cuit}
              </div>
            )}
            {detalle.zona && (
              <div className="flex items-center gap-2 text-gray-600">
                <MapPin className="w-4 h-4 text-gray-400" /> Zona: {detalle.zona}
              </div>
            )}
            {detalle.condiciones_pago && (
              <div className="flex items-center gap-2 text-gray-600">
                <FileText className="w-4 h-4 text-gray-400" /> Cond. de pago: {detalle.condiciones_pago}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          <button onClick={() => setTabCli('cotizaciones')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'cotizaciones' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Cotizaciones</button>
          <button onClick={() => setTabCli('tareas')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'tareas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Tareas</button>
          <button onClick={() => setTabCli('visitas')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'visitas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Visitas</button>
          <button onClick={() => setTabCli('timeline')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'timeline' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Línea de tiempo</button>
        </div>

        {/* Tab: Cotizaciones (includes márgenes) */}
        {tabCli === 'cotizaciones' && (
          <>
            {/* Márgenes acordados */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-700 mb-3">Márgenes acordados</h3>
              {margenes.length > 0 && (
                <div className="space-y-1 mb-4">
                  {margenes.map((m) => {
                    const prod = productos.find((p) => p.id === m.producto_id);
                    return (
                      <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-600">
                          {prod ? prod.producto : m.familia}
                          <span className="text-xs text-gray-400 ml-2">{prod ? 'Producto' : 'Familia'}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700">{m.margen}%</span>
                          <button onClick={() => eliminarMargen(m.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Producto</label>
                  <select value={nuevoMargen.producto_id} onChange={(e) => setNuevoMargen({ ...nuevoMargen, producto_id: e.target.value, familia: '' })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none bg-white min-w-40"><option value="">—</option>{productos.slice(0, 100).map((p) => <option key={p.id} value={p.id}>{p.producto}</option>)}</select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">o Familia</label>
                  <select value={nuevoMargen.familia} onChange={(e) => setNuevoMargen({ ...nuevoMargen, producto_id: '', familia: e.target.value })} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none bg-white min-w-32"><option value="">—</option>{familias.map((f) => <option key={f} value={f}>{f}</option>)}</select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Margen %</label>
                  <input type="text" value={nuevoMargen.margen} onChange={(e) => setNuevoMargen({ ...nuevoMargen, margen: e.target.value })} className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
                </div>
                <button onClick={agregarMargen} disabled={!nuevoMargen.producto_id && !nuevoMargen.familia} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"><Plus className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Historial de cotizaciones */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-700 mb-3">Cotizaciones</h3>
              {cotizsCliente.length === 0 ? <p className="text-sm text-gray-400">Sin cotizaciones</p> : (
                <div className="space-y-2">
                  {cotizsCliente.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div><span className="text-sm font-medium text-gray-700">N° {c.numero}</span><span className="text-xs text-gray-400 ml-2">{formatDate(c.fecha)} · {c.estado}</span></div>
                      <span className="text-sm font-medium text-gray-700">{formatUSD(c.total_usd)} USD</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab: Tareas */}
        {tabCli === 'tareas' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><CheckSquare className="w-5 h-5 text-gray-400" /> Tareas</h3>
            {tareasCliente.length === 0 ? <p className="text-sm text-gray-400">Sin tareas</p> : (
              <div className="space-y-2">
                {tareasCliente.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="min-w-0">
                      <p className={`text-sm ${t.estado === 'Hecha' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{t.titulo}</p>
                      <p className="text-xs text-gray-400"><Calendar className="w-3 h-3 inline" /> {formatDate(t.fecha_vencimiento)} · {t.estado}{t.cotizacion_id && ' · Cot. vinculada'}</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.prioridad === 'Alta' ? 'bg-red-100 text-red-700' : t.prioridad === 'Baja' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>{t.prioridad}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Visitas */}
        {tabCli === 'visitas' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Calendar className="w-5 h-5 text-gray-400" /> Visitas</h3>
            {visitasCliente.length === 0 ? <p className="text-sm text-gray-400">Sin visitas</p> : (
              <div className="space-y-2">
                {visitasCliente.map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm text-gray-700">{formatDate(v.fecha)} {v.hora && `· ${v.hora}`}</p>
                      <p className="text-xs text-gray-400">{v.tipo} · {v.estado}{v.establecimiento ? ` · ${v.establecimiento}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Timeline */}
        {tabCli === 'timeline' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Activity className="w-5 h-5 text-gray-400" /> Línea de tiempo</h3>
            <div className="space-y-3">
              {timelineItems().map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {item.icon === 'cotizacion' ? <FileText className="w-4 h-4 text-gray-400" /> : item.icon === 'tarea' ? <CheckSquare className="w-4 h-4 text-emerald-500" /> : <Calendar className="w-4 h-4 text-blue-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{item.titulo}</p>
                    <p className="text-xs text-gray-400">{formatDate(item.fecha)} · {item.tipo}</p>
                  </div>
                </div>
              ))}
              {timelineItems().length === 0 && <p className="text-sm text-gray-400">Sin actividad</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        <button
          onClick={() => { setMostrarForm(true); setEditando(null); setForm({ nombre: '', cuit: '', zona: '', condiciones_pago: '' }); }}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo cliente
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o CUIT..."
          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
          {busqueda ? 'No se encontraron clientes' : 'Todavía no hay clientes cargados'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => verDetalle(c)}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-800 truncate">{c.nombre}</h3>
                  {c.cuit && <p className="text-xs text-gray-400">CUIT: {c.cuit}</p>}
                  {c.zona && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.zona}</p>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditando(c); setForm({ nombre: c.nombre, cuit: c.cuit || '', zona: c.zona || '', condiciones_pago: c.condiciones_pago || '' }); setMostrarForm(true); }}
                  className="p-1 text-gray-300 hover:text-gray-600"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal formulario */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setMostrarForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">{editando ? 'Editar cliente' : 'Nuevo cliente'}</h3>
              <button onClick={() => setMostrarForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
                <input
                  type="text"
                  value={form.cuit}
                  onChange={(e) => setForm({ ...form, cuit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zona</label>
                <input
                  type="text"
                  value={form.zona}
                  onChange={(e) => setForm({ ...form, zona: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condiciones de pago</label>
                <input
                  type="text"
                  value={form.condiciones_pago}
                  onChange={(e) => setForm({ ...form, condiciones_pago: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Ej: 30 días, contado, etc."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setMostrarForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button
                onClick={guardarCliente}
                disabled={!form.nombre.trim()}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {editando ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar cliente */}
      {modalEliminar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalEliminar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Eliminar cliente</h3>
                <p className="text-sm text-gray-500">¿Eliminar a {modalEliminar.nombre}?</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalEliminar(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={confirmarEliminarCliente} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
