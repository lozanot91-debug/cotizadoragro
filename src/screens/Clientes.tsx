import { useState, useEffect, useCallback, type ReactNode } from 'react';
import CamposCliente from '@/components/CamposCliente';
import ContactosCliente from '@/components/ContactosCliente';
import { useAuth } from '@/context/AuthContext';
import { ESTADOS_CLIENTE, filtrarClientes, formClienteVacio, formDeCliente, validarCliente, type FiltroEstado, type FormCliente, type ResumenCliente } from '@/lib/clientes';
import { linkWhatsApp } from '@/lib/contactos';
import { montoGanado } from '@/lib/ganadaParcial';
import { useData } from '@/hooks/useData';
import { formatUSD, formatDate } from '@/lib/format';
import type { Cliente, Cotizacion, MargenCliente, ProductoConCosto, Tarea, Visita, Configuracion, Usuario, EstadoCliente } from '@/types';
import { Users, Plus, Search, X, Trash2, Edit2, Loader2, MapPin, CreditCard, FileText, AlertCircle, CheckSquare, Calendar, Activity, Building2, UserCircle, Phone, MessageCircle, Map as MapIcon, StickyNote } from 'lucide-react';
import { registrarCambio, fmtMargen } from '@/lib/historial';
import { diasDesde, fechaDeTimestamp } from '@/lib/fechas';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { productosDelCliente, type LineaDeCliente } from '@/lib/historialCliente';
import { hoyAR } from '@/lib/fechas';
import { nombreCotizacion } from '@/lib/nombreCotizacion';

export default function Clientes() {
  const data = useData();
  const { usuario } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumen, setResumen] = useState<Record<string, ResumenCliente>>({});
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('vigentes');
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [guardandoCli, setGuardandoCli] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<FormCliente>(formClienteVacio());
  const [detalle, setDetalle] = useState<Cliente | null>(null);
  const [cotizsCliente, setCotizsCliente] = useState<Cotizacion[]>([]);
  const [lineasCliente, setLineasCliente] = useState<LineaDeCliente[]>([]);
  const [margenes, setMargenes] = useState<MargenCliente[]>([]);
  const [productos, setProductos] = useState<ProductoConCosto[]>([]);
  const [nuevoMargen, setNuevoMargen] = useState({ producto_id: '', familia: '', margen: '' });
  const [tareasCliente, setTareasCliente] = useState<Tarea[]>([]);
  const [visitasCliente, setVisitasCliente] = useState<Visita[]>([]);
  const [configCli, setConfigCli] = useState<Configuracion | null>(null);
  const [tabCli, setTabCli] = useState<'cotizaciones' | 'contactos' | 'campos' | 'productos' | 'tareas' | 'visitas' | 'timeline'>('cotizaciones');

  const [modalEliminar, setModalEliminar] = useState<Cliente | null>(null);

  const cargar = useCallback(async () => {
    const [cls, res, us] = await Promise.all([data.fetchClientes(), data.fetchResumenClientes(), data.fetchUsuarios()]);
    setClientes(cls);
    setResumen(res);
    setUsuarios(us);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Recarga contactos y hectáreas de la lista (después de tocar contactos o campos). */
  async function recargarResumen() {
    try { setResumen(await data.fetchResumenClientes()); } catch { /* se ve en la próxima carga */ }
  }

  const nombreUsuario = (id: string | null) => (id ? usuarios.find((u) => u.id === id)?.nombre || 'Usuario dado de baja' : null);

  function abrirForm(c: Cliente | null) {
    setEditando(c);
    setForm(c ? formDeCliente(c) : formClienteVacio(usuario.id));
    setFormError(null);
    setMostrarForm(true);
  }

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);

  useEffect(() => { load(); }, [load]);

  async function verDetalle(c: Cliente) {
    setDetalle(c);
    setTabCli('cotizaciones');
    const [todas, margs, lista, tars, viss, cfg, lineas] = await Promise.all([
      data.fetchCotizaciones(), data.fetchMargenesCliente(c.id), data.fetchListaVigente(),
      data.fetchTareasByCliente(c.id), data.fetchVisitasByCliente(c.id), data.fetchConfig(),
      data.fetchLineasDeCliente(c.id),
    ]);
    setLineasCliente(lineas);
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
    const v = validarCliente(form);
    if (!v.ok) { setFormError(v.error); return; }
    setGuardandoCli(true);
    try {
      if (editando) {
        const prev = editando;
        await data.updateCliente(editando.id, v.datos);
        const ent = `Cliente ${v.datos.nombre}`;
        if (prev.nombre !== v.datos.nombre) await registrarCambio({ tipo: 'margen', entidad: `Cliente ${prev.nombre}`, campo: 'nombre', valor_anterior: prev.nombre, valor_nuevo: v.datos.nombre });
        if (prev.estado !== v.datos.estado) await registrarCambio({ tipo: 'cliente', entidad: ent, campo: 'estado', valor_anterior: prev.estado, valor_nuevo: v.datos.estado });
        if ((prev.vendedor_id || null) !== v.datos.vendedor_id) await registrarCambio({ tipo: 'cliente', entidad: ent, campo: 'vendedor', valor_anterior: nombreUsuario(prev.vendedor_id), valor_nuevo: nombreUsuario(v.datos.vendedor_id) });
        if (detalle?.id === editando.id) setDetalle({ ...detalle, ...v.datos });
      } else {
        const nuevo = await data.createCliente(v.datos);
        if (nuevo) await registrarCambio({ tipo: 'margen', entidad: `Cliente ${v.datos.nombre}`, campo: 'alta', valor_nuevo: v.datos.nombre });
      }
      setMostrarForm(false);
      setEditando(null);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No se pudo guardar el cliente.');
    } finally {
      setGuardandoCli(false);
    }
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
    for (const c of cotizsCliente) items.push({ fecha: c.fecha, titulo: `Cotización ${nombreCotizacion(c)} · ${c.estado}`, tipo: 'Cotización', icon: 'cotizacion' });
    for (const t of tareasCliente) if (t.estado === 'Hecha') items.push({ fecha: t.completada_at || t.fecha_vencimiento, titulo: t.titulo, tipo: 'Tarea completada', icon: 'tarea' });
    for (const v of visitasCliente) items.push({ fecha: v.fecha, titulo: `${v.tipo} · ${v.estado}`, tipo: 'Visita', icon: 'visita' });
    return items.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20);
  }

  const filtrados = filtrarClientes(clientes, resumen, { busqueda, estado: filtroEstado, vendedor: filtroVendedor });
  const hayFiltros = !!busqueda || filtroEstado !== 'vigentes' || !!filtroVendedor;

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  const modales = (
    <>
      {/* Modal formulario */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={guardandoCli ? undefined : () => setMostrarForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">{editando ? 'Editar cliente' : 'Nuevo cliente'}</h3>
              <button onClick={() => setMostrarForm(false)} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Campo id="cli-nombre" label="Nombre" requerido>
                <input id="cli-nombre" autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={INPUT} placeholder="Como lo conocen" />
              </Campo>
              <Campo id="cli-razon" label="Razón social">
                <input id="cli-razon" value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} className={INPUT} placeholder="Ej.: El Ombú S.A." />
              </Campo>
              <Campo id="cli-cuit" label="CUIT">
                <input id="cli-cuit" inputMode="numeric" value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} className={INPUT} />
              </Campo>
              <Campo id="cli-estado" label="Estado">
                <select id="cli-estado" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoCliente })} className={INPUT + ' bg-white'}>
                  {ESTADOS_CLIENTE.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </Campo>
              <Campo id="cli-dom" label="Domicilio fiscal">
                <input id="cli-dom" value={form.domicilio} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} className={INPUT} />
              </Campo>
              <Campo id="cli-loc" label="Localidad">
                <input id="cli-loc" value={form.localidad} onChange={(e) => setForm({ ...form, localidad: e.target.value })} className={INPUT} />
              </Campo>
              <Campo id="cli-zona" label="Zona">
                <input id="cli-zona" value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })} className={INPUT} />
              </Campo>
              <Campo id="cli-vend" label="Vendedor asignado">
                <select id="cli-vend" value={form.vendedor_id} onChange={(e) => setForm({ ...form, vendedor_id: e.target.value })} className={INPUT + ' bg-white'}>
                  <option value="">Sin asignar</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}{u.id === usuario.id ? ' (vos)' : ''}</option>)}
                  {form.vendedor_id && !usuarios.some((u) => u.id === form.vendedor_id) && <option value={form.vendedor_id}>Usuario dado de baja</option>}
                </select>
              </Campo>
              <div className="sm:col-span-2">
                <Campo id="cli-pago" label="Condiciones de pago">
                  <input id="cli-pago" value={form.condiciones_pago} onChange={(e) => setForm({ ...form, condiciones_pago: e.target.value })} className={INPUT} placeholder="Ej: 30 días, contado, etc." />
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <Campo id="cli-obs" label="Observaciones">
                  <textarea id="cli-obs" rows={3} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className={INPUT} placeholder="Lo que conviene saber antes de llamarlo o cotizarle" />
                </Campo>
              </div>
            </div>
            {!editando && <p className="text-xs text-gray-500 mt-3">Los contactos y los campos se cargan desde la ficha, después de crear el cliente.</p>}
            {formError && <p role="alert" className="text-sm text-red-600 mt-3">{formError}</p>}
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setMostrarForm(false)} disabled={guardandoCli} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button
                onClick={() => void guardarCliente()}
                disabled={!form.nombre.trim() || guardandoCli}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
              >
                {guardandoCli && <Loader2 className="w-4 h-4 animate-spin" />}
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
    </>
  );

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
        {(() => {
          const res = resumen[detalle.id];
          const principal = res?.contacto;
          const wa = linkWhatsApp(principal?.telefono);
          const vendedor = nombreUsuario(detalle.vendedor_id);
          const lugar = [detalle.domicilio, detalle.localidad].filter(Boolean).join(', ');
          return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-800">{detalle.nombre}</h2>
                    <BadgeEstado estado={detalle.estado} />
                  </div>
                  {detalle.razon_social && detalle.razon_social !== detalle.nombre && <p className="text-sm text-gray-500">{detalle.razon_social}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const ult = ultimoContacto();
                    if (!ult) return null;
                    const dias = diasDesde(ult);
                    const alerta = configCli && dias > configCli.ultimo_contacto_dias;
                    return <span className={`text-xs px-2 py-1 rounded-full font-medium ${alerta ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>Último contacto: hace {dias}d</span>;
                  })()}
                  <button onClick={() => abrirForm(detalle)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><Edit2 className="w-3.5 h-3.5" /> Editar datos</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {detalle.cuit && <Dato icon={<CreditCard className="w-4 h-4" />} label="CUIT">{detalle.cuit}</Dato>}
                {lugar && <Dato icon={<Building2 className="w-4 h-4" />} label="Domicilio">{lugar}</Dato>}
                {detalle.zona && <Dato icon={<MapPin className="w-4 h-4" />} label="Zona">{detalle.zona}</Dato>}
                {detalle.condiciones_pago && <Dato icon={<FileText className="w-4 h-4" />} label="Cond. de pago">{detalle.condiciones_pago}</Dato>}
                <Dato icon={<UserCircle className="w-4 h-4" />} label="Vendedor">{vendedor || <span className="text-gray-400">Sin asignar</span>}</Dato>
                <Dato icon={<MapIcon className="w-4 h-4" />} label="Superficie">
                  {res?.hectareas ? `${formatUSD(res.hectareas, 0)} ha` : <button onClick={() => setTabCli('campos')} className="text-emerald-700 hover:underline">Cargar campos</button>}
                </Dato>
                <Dato icon={<Phone className="w-4 h-4" />} label="Contacto">
                  {principal ? (
                    <span className="inline-flex flex-wrap items-center gap-x-2">
                      {principal.nombre}{principal.cargo && <span className="text-gray-400">({principal.cargo})</span>}
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-green-700 font-medium hover:underline"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
                    </span>
                  ) : <button onClick={() => setTabCli('contactos')} className="text-emerald-700 hover:underline">Agregar contacto</button>}
                </Dato>
              </div>
              {detalle.observaciones && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 flex gap-2">
                  <StickyNote className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                  <p className="whitespace-pre-line">{detalle.observaciones}</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Resumen comercial */}
        {(() => {
          const cotizado = cotizsCliente.reduce((s, c) => s + (c.subtotal_usd || 0), 0);
          const ganadas = cotizsCliente.filter((c) => c.estado === 'Ganada');
          const ganado = ganadas.reduce((s, c) => s + montoGanado(c), 0);
          const ultima = ganadas.map((c) => c.fecha).sort().pop();
          const tasa = cotizsCliente.length > 0 ? (ganadas.length / cotizsCliente.length) * 100 : 0;
          return (
            <div className="bg-emerald-900 text-white rounded-xl grid grid-cols-2 sm:grid-cols-4">
              <div className="px-4 py-3"><p className="text-emerald-300 text-xs">Ganado</p><p className="cifra text-3xl mt-1">{formatUSD(ganado, 0)}<span className="text-sm font-semibold text-amber-300 ml-1">USD</span></p></div>
              <div className="px-4 py-3 sm:border-l border-emerald-700/70"><p className="text-emerald-300 text-xs">Cotizado</p><p className="cifra text-2xl mt-1">{formatUSD(cotizado, 0)}</p></div>
              <div className="px-4 py-3 border-t sm:border-t-0 sm:border-l border-emerald-700/70"><p className="text-emerald-300 text-xs">Cotizaciones ganadas</p><p className="cifra text-2xl mt-1">{ganadas.length} de {cotizsCliente.length}<span className="text-sm font-semibold text-emerald-300 ml-1">({formatUSD(tasa, 0)}%)</span></p></div>
              <div className="px-4 py-3 border-t sm:border-t-0 border-l sm:border-l border-emerald-700/70"><p className="text-emerald-300 text-xs">Última compra</p><p className="cifra text-2xl mt-1">{ultima ? formatDate(ultima) : 'Todavía no'}</p></div>
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit max-w-full overflow-x-auto [&>button]:whitespace-nowrap">
          <button onClick={() => setTabCli('cotizaciones')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'cotizaciones' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Cotizaciones</button>
          <button onClick={() => setTabCli('contactos')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'contactos' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Contactos</button>
          <button onClick={() => setTabCli('campos')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'campos' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Campos</button>
          <button onClick={() => setTabCli('productos')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'productos' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Productos</button>
          <button onClick={() => setTabCli('tareas')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'tareas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Tareas</button>
          <button onClick={() => setTabCli('visitas')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'visitas' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Visitas</button>
          <button onClick={() => setTabCli('timeline')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tabCli === 'timeline' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Línea de tiempo</button>
        </div>

        {tabCli === 'contactos' && <ContactosCliente cliente={detalle} onCambio={() => void recargarResumen()} />}
        {tabCli === 'campos' && <CamposCliente cliente={detalle} onCambio={() => void recargarResumen()} />}

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
                      <div><span className="text-sm font-medium text-gray-700">{nombreCotizacion(c)}</span><span className="text-xs text-gray-400 ml-2">{formatDate(c.fecha)} · {c.estado}</span></div>
                      <span className="text-sm font-medium text-gray-700">{formatUSD(c.subtotal_usd)} USD</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab: Productos */}
        {tabCli === 'productos' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            {(() => {
              const prods = productosDelCliente(lineasCliente, hoyAR());
              if (prods.length === 0) return <p className="p-5 text-sm text-gray-400">Todavía no le cotizaste productos.</p>;
              return (
                <>
                  <p className="px-4 pt-3 text-sm text-gray-500">Primero lo que ya compró, del que hace más tiempo no repone al más reciente. Después lo que solo se cotizó.</p>
                  <table className="w-full text-sm mt-2">
                    <thead><tr className="bg-gray-50 border-y border-gray-200 text-gray-600">
                      <th className="text-left px-3 py-2 font-medium">Producto</th>
                      <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Cotizaciones</th>
                      <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Última cotización</th>
                      <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Última compra</th>
                    </tr></thead>
                    <tbody>
                      {prods.map((p) => (
                        <tr key={p.cod} className="border-b border-gray-100">
                          <td className="px-3 py-2"><span className="font-medium text-gray-800">{p.producto}</span><span className="block text-xs text-gray-400">{p.cod}</span></td>
                          <td className="px-3 py-2 text-right text-gray-600">{p.veces}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">USD {formatUSD(p.ultima.precio)}<span className="block text-xs text-gray-400">{formatDate(p.ultima.fecha)}, {p.ultima.estado.toLowerCase()}</span></td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {p.ultimaCompra ? (<>{formatDate(p.ultimaCompra.fecha)}<span className={`block text-xs ${p.diasDesdeCompra! > 60 ? 'text-amber-700 font-medium' : 'text-gray-400'}`}>hace {p.diasDesdeCompra} días, {formatUSD(p.ultimaCompra.cantidad, 2)} a USD {formatUSD(p.ultimaCompra.precio)}</span></>) : <span className="text-gray-400">Nunca</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            })()}
          </div>
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
        {modales}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        <button
          onClick={() => abrirForm(null)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo cliente
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, CUIT, localidad, contacto o teléfono..."
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
          />
        </div>
        <div className="flex gap-2">
          <select aria-label="Estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)} className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500 flex-1 min-w-0 w-full sm:w-auto sm:flex-none">
            <option value="vigentes">Activos y prospectos</option>
            {ESTADOS_CLIENTE.map((e) => <option key={e} value={e}>{e === 'Activo' ? 'Solo activos' : e === 'Prospecto' ? 'Solo prospectos' : 'Inactivos'}</option>)}
            <option value="todos">Todos</option>
          </select>
          <select aria-label="Vendedor" value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)} className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500 flex-1 min-w-0 w-full sm:w-auto sm:flex-none">
            <option value="">Todos los vendedores</option>
            <option value={usuario.id}>Mis clientes</option>
            {usuarios.filter((u) => u.id !== usuario.id).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            <option value="sin">Sin vendedor</option>
          </select>
        </div>
      </div>
      {hayFiltros && <p className="text-xs text-gray-500 -mt-2">{filtrados.length} de {clientes.length} clientes</p>}

      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
          {clientes.length === 0 ? 'Todavía no hay clientes cargados' : 'No se encontraron clientes con esos filtros'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map((c) => {
            const res = resumen[c.id];
            const vendedor = nombreUsuario(c.vendedor_id);
            const wa = linkWhatsApp(res?.contacto?.telefono);
            return (
              <div
                key={c.id}
                className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer ${c.estado === 'Inactivo' ? 'opacity-70' : ''}`}
                onClick={() => verDetalle(c)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">{c.nombre}</h3>
                      <BadgeEstado estado={c.estado} />
                    </div>
                    <p className="text-xs text-gray-400 flex items-center gap-1 truncate">
                      {(c.localidad || c.zona) && <><MapPin className="w-3 h-3 flex-shrink-0" /> {c.localidad || c.zona}</>}
                      {(c.localidad || c.zona) && res?.hectareas ? ' · ' : ''}
                      {res?.hectareas ? `${formatUSD(res.hectareas, 0)} ha` : ''}
                      {!c.localidad && !c.zona && !res?.hectareas && c.cuit && `CUIT ${c.cuit}`}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); abrirForm(c); }}
                    className="p-1 text-gray-300 hover:text-gray-600"
                    aria-label={`Editar ${c.nombre}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2 text-xs">
                  <div className="min-w-0 text-gray-600">
                    {res?.contacto
                      ? <p className="truncate"><span className="font-medium text-gray-700">{res.contacto.nombre}</span>{res.contacto.cargo && <span className="text-gray-400"> · {res.contacto.cargo}</span>}</p>
                      : <p className="text-gray-400">Sin contacto</p>}
                    <p className="text-gray-400 truncate">{vendedor ? `Vendedor: ${vendedor}` : 'Sin vendedor asignado'}</p>
                  </div>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex-shrink-0 p-2 rounded-lg bg-green-50 text-green-700 hover:bg-green-100" aria-label={`WhatsApp a ${res?.contacto?.nombre}`} title={`WhatsApp a ${res?.contacto?.nombre}`}>
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modales}
    </div>
  );
}

function BadgeEstado({ estado }: { estado: EstadoCliente | null | undefined }) {
  if (!estado || estado === 'Activo') return null;
  const cls = estado === 'Prospecto' ? 'bg-sky-100 text-sky-800' : 'bg-gray-200 text-gray-600';
  return <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>{estado}</span>;
}

function Dato({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-gray-700 min-w-0">
      <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
      <span className="min-w-0"><span className="text-gray-500">{label}: </span>{children}</span>
    </div>
  );
}

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none';

function Campo({ id, label, requerido, children }: { id: string; label: string; requerido?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}{requerido && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  );
}
