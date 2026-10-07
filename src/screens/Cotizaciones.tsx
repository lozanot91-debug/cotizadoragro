import { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '@/hooks/useData';
import { formatUSD, formatDate, formatInputNumber } from '@/lib/format';
import { registrarCambio } from '@/lib/historial';
import type { Cotizacion, EstadoCotizacion, Cliente, CotizacionLinea, Tarea, Configuracion } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { FileText, Search, ChevronRight, X, AlertCircle, Check, TrendingDown, TrendingUp, Loader2, Pencil, Copy, Lock, Unlock, Trash2 } from 'lucide-react';

const ESTADOS: EstadoCotizacion[] = ['Borrador', 'Enviada', 'En negociación', 'Ganada', 'Perdida', 'Vencida'];
const MOTIVOS = ['Precio', 'Plazo de pago', 'Competencia', 'El cliente no compró', 'Otro'];

const estadoColors: Record<EstadoCotizacion, string> = {
  'Borrador': 'bg-gray-100 text-gray-600',
  'Enviada': 'bg-blue-100 text-blue-700',
  'En negociación': 'bg-amber-100 text-amber-700',
  'Ganada': 'bg-emerald-100 text-emerald-700',
  'Perdida': 'bg-red-100 text-red-700',
  'Vencida': 'bg-orange-100 text-orange-700',
};

interface Props {
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export default function Cotizaciones({ onEdit, onDuplicate }: Props) {
  const data = useData();
  const { usuario } = useAuth();
  const [cotizaciones, setCotizaciones] = useState<(Cotizacion & { cliente?: Cliente })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [cotizConCostoEditado, setCotizConCostoEditado] = useState<Set<string>>(new Set());
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [modalSeguimiento, setModalSeguimiento] = useState<{ cotizId: string; numero: number } | null>(null);
  const [segOpt, setSegOpt] = useState({ crear: true, dias: 3 });
  const [modalEliminar, setModalEliminar] = useState<Cotizacion | null>(null);

  // Unified confirmation modal
  const [modalEstado, setModalEstado] = useState<{
    cotiz: Cotizacion;
    nuevoEstado: EstadoCotizacion;
    motivo: string;
    otroMotivo: string;
    comentario: string;
    cantidadesReales: Record<string, { cantidad: string; precio: string }>;
    lineas: CotizacionLinea[];
  } | null>(null);

  const load = useCallback(async () => {
    const cotizs = await data.fetchCotizaciones();
    setCotizaciones(cotizs);

    const conEditado = new Set<string>();
    for (const c of cotizs) {
      const lineas = await data.fetchLineas(c.id);
      if (lineas.some((l) => l.costo_editado)) {
        conEditado.add(c.id);
      }
    }
    setCotizConCostoEditado(conEditado);
    const [tars, cfg] = await Promise.all([data.fetchTareas(), data.fetchConfig()]);
    setTareas(tars);
    setConfig(cfg);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtradas = useMemo(() => {
    return cotizaciones.filter((c) => {
      if (filtroCliente && !(c.cliente_nombre || '').toLowerCase().includes(filtroCliente.toLowerCase())) return false;
      if (filtroEstado && c.estado !== filtroEstado) return false;
      if (filtroFecha) {
        const cFecha = c.fecha?.substring(0, 7);
        if (cFecha !== filtroFecha) return false;
      }
      return true;
    });
  }, [cotizaciones, filtroCliente, filtroEstado, filtroFecha]);

  function diasDesde(fecha: string): number {
    const f = new Date(fecha);
    const hoy = new Date();
    return Math.floor((hoy.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
  }

  function esSinRespuesta(c: Cotizacion): boolean {
    if (c.estado !== 'Enviada' && c.estado !== 'En negociación') return false;
    if (!config) return false;
    const tCot = tareas.filter((t) => t.cotizacion_id === c.id);
    if (tCot.some((t) => t.estado === 'Pendiente')) return false;
    const N = config.sin_respuesta_dias;
    if (tCot.some((t) => t.estado === 'Hecha' && t.completada_at && diasDesde(t.completada_at) < N)) return false;
    const ref = c.fecha_envio || c.fecha;
    return diasDesde(ref) > N;
  }

  function estaVencida(c: Cotizacion): boolean {
    if (c.estado === 'Ganada' || c.estado === 'Perdida' || c.estado === 'Borrador') return false;
    return diasDesde(c.fecha) > c.vigencia_dias;
  }

  async function iniciarCambioEstado(c: Cotizacion, nuevoEstado: EstadoCotizacion) {
    if (nuevoEstado === 'Ganada') {
      const lineas = await data.fetchLineas(c.id);
      const inicial: Record<string, { cantidad: string; precio: string }> = {};
      lineas.forEach((l) => {
        inicial[l.id] = { cantidad: formatInputNumber(l.cantidad, 2), precio: formatInputNumber(l.precio_usd, 2) };
      });
      setModalEstado({ cotiz: c, nuevoEstado, motivo: '', otroMotivo: '', comentario: '', cantidadesReales: inicial, lineas });
    } else {
      setModalEstado({ cotiz: c, nuevoEstado, motivo: '', otroMotivo: '', comentario: '', cantidadesReales: {}, lineas: [] });
    }
  }

  async function confirmarCambioEstado() {
    if (!modalEstado) return;
    const { cotiz, nuevoEstado, motivo, otroMotivo, comentario, cantidadesReales } = modalEstado;

    if (nuevoEstado === 'Perdida' && !motivo) return;
    if (nuevoEstado === 'Perdida' && motivo === 'Otro' && !otroMotivo.trim()) return;

    const estadoAnterior = cotiz.estado;

    // "Reabrir" = change from Ganada/Perdida to En negociación
    if ((estadoAnterior === 'Ganada' || estadoAnterior === 'Perdida') && nuevoEstado === 'En negociación') {
      if (!comentario.trim()) return;
      await data.updateCotizacionEstado(cotiz.id, 'En negociación', { motivo_perdida: null });
      await registrarCambio({
        tipo: 'estado',
        cotizacion_id: cotiz.id,
        campo: 'estado',
        valor_anterior: estadoAnterior,
        valor_nuevo: 'En negociación',
        detalle: `Reabierta: ${comentario}`,
      });
    } else if (nuevoEstado === 'Perdida') {
      const motivoFinal = motivo === 'Otro' ? otroMotivo.trim() : motivo;
      await data.updateCotizacionEstado(cotiz.id, 'Perdida', { motivo_perdida: motivoFinal });
      await registrarCambio({
        tipo: 'estado',
        cotizacion_id: cotiz.id,
        campo: 'estado',
        valor_anterior: estadoAnterior,
        valor_nuevo: 'Perdida',
        detalle: `Motivo: ${motivoFinal}`,
      });
    } else if (nuevoEstado === 'Ganada') {
      const reales: Record<string, { cantidad: number; precio: number }> = {};
      Object.entries(cantidadesReales).forEach(([k, v]) => {
        const cant = parseFloat(v.cantidad.replace(/\./g, '').replace(',', '.')) || 0;
        const prec = parseFloat(v.precio.replace(/\./g, '').replace(',', '.')) || 0;
        reales[k] = { cantidad: cant, precio: prec };
      });
      await data.updateCotizacionEstado(cotiz.id, 'Ganada', { cantidades_reales: reales });
      await registrarCambio({
        tipo: 'estado',
        cotizacion_id: cotiz.id,
        campo: 'estado',
        valor_anterior: estadoAnterior,
        valor_nuevo: 'Ganada',
        detalle: 'Cantidades reales registradas',
      });
    } else {
      const extra: Record<string, unknown> = {};
      if (nuevoEstado === 'Enviada' && !cotiz.fecha_envio) extra.fecha_envio = new Date().toISOString();
      await data.updateCotizacionEstado(cotiz.id, nuevoEstado, extra);
      await registrarCambio({ tipo: 'estado', cotizacion_id: cotiz.id, campo: 'estado', valor_anterior: estadoAnterior, valor_nuevo: nuevoEstado });
      if (nuevoEstado === 'Enviada' && config) {
        setModalSeguimiento({ cotizId: cotiz.id, numero: cotiz.numero });
        setSegOpt({ crear: true, dias: config.seguimiento_dias });
      }
    }

    setModalEstado(null);
    load();
  }

  async function confirmarSeguimiento() {
    if (!modalSeguimiento) return;
    if (segOpt.crear) {
      const d = new Date(); d.setDate(d.getDate() + segOpt.dias);
      await data.createTarea({
        titulo: `Seguimiento cotización N° ${modalSeguimiento.numero}`,
        tipo: 'Seguimiento', fecha_vencimiento: d.toISOString().split('T')[0],
        asignado_a: usuario?.nombre || 'Admin', creada_por: usuario?.nombre || 'Admin',
        cotizacion_id: modalSeguimiento.cotizId,
      });
      await registrarCambio({ tipo: 'tarea', cotizacion_id: modalSeguimiento.cotizId, campo: 'seguimiento', valor_nuevo: `+${segOpt.dias} días` });
    }
    setModalSeguimiento(null);
    load();
  }

  const esReadOnly = (c: Cotizacion) => c.estado === 'Ganada' || c.estado === 'Perdida';

  async function confirmarEliminar() {
    if (!modalEliminar) return;
    const c = modalEliminar;
    await data.deleteCotizacion(c.id);
    await registrarCambio({ tipo: 'cotizacion', cotizacion_id: c.id, campo: 'eliminación', valor_anterior: `N° ${c.numero}`, valor_nuevo: null, detalle: `Cotización eliminada (${c.cliente_nombre || 'Sin cliente'} · ${formatUSD(c.total_usd)} USD)` });
    setModalEliminar(null);
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Cotizaciones</h1>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}
              placeholder="Buscar por cliente..." className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
          </div>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <input type="month" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
        </div>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
          No hay cotizaciones que coincidan con los filtros
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map((c) => {
            const vencida = estaVencida(c);
            const dias = diasDesde(c.fecha);
            const readOnly = esReadOnly(c);
            return (
              <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onEdit(c.id)}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-800">N° {c.numero}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColors[c.estado]}`}>{c.estado}</span>
                      {vencida && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Vencida
                        </span>
                      )}
                      {cotizConCostoEditado.has(c.id) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
                          <Pencil className="w-3 h-3" /> costo editado
                        </span>
                      )}
                      {esSinRespuesta(c) && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> sin respuesta
                        </span>
                      )}
                      {readOnly && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium flex items-center gap-1">
                          <Lock className="w-3 h-3" /> solo lectura
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 truncate">{c.cliente_nombre || 'Sin cliente'}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(c.fecha)} · TC ${c.tc} · {c.km > 0 ? `${c.km} km` : 'Sin flete'}
                      {esSinRespuesta(c) && (
                        <span className="text-amber-600 ml-2">· Sin respuesta</span>
                      )}
                      {c.estado === 'Perdida' && c.motivo_perdida && (
                        <span className="text-red-500 ml-2">· Motivo: {c.motivo_perdida}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-800">{formatUSD(c.total_usd)} USD</p>
                    <p className="text-xs text-gray-400">$ {formatUSD(c.total_ars, 0)}</p>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex gap-1 mt-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {readOnly ? (
                    <button
                      onClick={() => iniciarCambioEstado(c, 'En negociación')}
                      className="text-xs px-3 py-1.5 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-1 font-medium"
                    >
                      <Unlock className="w-3 h-3" /> Reabrir
                    </button>
                  ) : (
                    ESTADOS.filter((e) => e !== c.estado).map((e) => (
                      <button key={e} onClick={() => iniciarCambioEstado(c, e)}
                        className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
                        {e}
                      </button>
                    ))
                  )}
                  <button
                    onClick={() => onDuplicate(c.id)}
                    className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Duplicar
                  </button>
                  <button
                    onClick={() => setModalEliminar(c)}
                    className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300 ml-auto self-center" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal unificado de cambio de estado */}
      {modalEstado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalEstado(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                modalEstado.nuevoEstado === 'Perdida' ? 'bg-red-100' :
                modalEstado.nuevoEstado === 'Ganada' ? 'bg-emerald-100' :
                modalEstado.nuevoEstado === 'En negociación' ? 'bg-amber-100' : 'bg-blue-100'
              }`}>
                {modalEstado.nuevoEstado === 'Perdida' ? <TrendingDown className="w-5 h-5 text-red-600" /> :
                 modalEstado.nuevoEstado === 'Ganada' ? <TrendingUp className="w-5 h-5 text-emerald-600" /> :
                 modalEstado.nuevoEstado === 'En negociación' ? <Unlock className="w-5 h-5 text-amber-600" /> :
                 <Check className="w-5 h-5 text-blue-600" />}
              </div>
              <div>
                <h3 className="font-bold text-gray-800">
                  {modalEstado.nuevoEstado === 'En negociación' && (modalEstado.cotiz.estado === 'Ganada' || modalEstado.cotiz.estado === 'Perdida')
                    ? 'Reabrir cotización' : `Cambiar a ${modalEstado.nuevoEstado}`}
                </h3>
                <p className="text-sm text-gray-500">
                  Cotización N° {modalEstado.cotiz.numero} · {modalEstado.cotiz.cliente_nombre || 'Sin cliente'} · {formatUSD(modalEstado.cotiz.total_usd)} USD
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              ¿Cambiar la cotización N° {modalEstado.cotiz.numero} de <strong>{modalEstado.cotiz.estado}</strong> a <strong>{modalEstado.nuevoEstado}</strong>?
            </p>

            {/* Perdida: motivo obligatorio */}
            {modalEstado.nuevoEstado === 'Perdida' && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">Motivo <span className="text-red-500">*</span></label>
                <select value={modalEstado.motivo} onChange={(e) => setModalEstado({ ...modalEstado, motivo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none mb-3 bg-white">
                  <option value="">Seleccionar motivo...</option>
                  {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {modalEstado.motivo === 'Otro' && (
                  <input type="text" value={modalEstado.otroMotivo}
                    onChange={(e) => setModalEstado({ ...modalEstado, otroMotivo: e.target.value })}
                    placeholder="Escribí el motivo..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none mb-3" />
                )}
              </>
            )}

            {/* Reabrir: comentario obligatorio */}
            {modalEstado.nuevoEstado === 'En negociación' && (modalEstado.cotiz.estado === 'Ganada' || modalEstado.cotiz.estado === 'Perdida') && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">Comentario <span className="text-red-500">*</span></label>
                <textarea value={modalEstado.comentario}
                  onChange={(e) => setModalEstado({ ...modalEstado, comentario: e.target.value })}
                  rows={3} placeholder="¿Por qué se reabre?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none mb-3 resize-none" />
              </>
            )}

            {/* Ganada: cantidades reales opcionales */}
            {modalEstado.nuevoEstado === 'Ganada' && modalEstado.lineas.length > 0 && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cantidades y precios reales (opcional)</label>
                <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                  {modalEstado.lineas.map((l) => (
                    <div key={l.id} className="flex gap-2 items-center">
                      <span className="text-xs text-gray-400 flex-1 truncate">{l.producto}</span>
                      <input type="text"
                        value={modalEstado.cantidadesReales[l.id]?.cantidad || ''}
                        onChange={(e) => setModalEstado({
                          ...modalEstado,
                          cantidadesReales: {
                            ...modalEstado.cantidadesReales,
                            [l.id]: { ...modalEstado.cantidadesReales[l.id], cantidad: e.target.value },
                          },
                        })}
                        placeholder="Cant." className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                      <input type="text"
                        value={modalEstado.cantidadesReales[l.id]?.precio || ''}
                        onChange={(e) => setModalEstado({
                          ...modalEstado,
                          cantidadesReales: {
                            ...modalEstado.cantidadesReales,
                            [l.id]: { ...modalEstado.cantidadesReales[l.id], precio: e.target.value },
                          },
                        })}
                        placeholder="Precio" className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalEstado(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button
                onClick={confirmarCambioEstado}
                disabled={
                  (modalEstado.nuevoEstado === 'Perdida' && (!modalEstado.motivo || (modalEstado.motivo === 'Otro' && !modalEstado.otroMotivo.trim()))) ||
                  (modalEstado.nuevoEstado === 'En negociación' && (modalEstado.cotiz.estado === 'Ganada' || modalEstado.cotiz.estado === 'Perdida') && !modalEstado.comentario.trim())
                }
                className={`px-4 py-2 text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50 ${
                  modalEstado.nuevoEstado === 'Perdida' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal seguimiento post-envío */}
      {modalSeguimiento && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalSeguimiento(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Check className="w-5 h-5 text-blue-600" /></div><div><h3 className="font-bold text-gray-800">¿Agendar seguimiento?</h3><p className="text-sm text-gray-500">Cotización N° {modalSeguimiento.numero} enviada</p></div></div>
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-3"><input type="checkbox" checked={segOpt.crear} onChange={(e) => setSegOpt({ ...segOpt, crear: e.target.checked })} className="w-4 h-4 accent-emerald-600" /> Crear tarea de seguimiento</label>
            {segOpt.crear && (
              <div className="flex gap-2 items-center mb-3"><span className="text-sm text-gray-600">En</span><input type="number" value={segOpt.dias} onChange={(e) => setSegOpt({ ...segOpt, dias: parseInt(e.target.value) || 3 })} className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center" /><span className="text-sm text-gray-600">días</span><button onClick={() => setSegOpt({ ...segOpt, dias: 1 })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600">+1d</button><button onClick={() => setSegOpt({ ...segOpt, dias: 3 })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600">+3d</button><button onClick={() => setSegOpt({ ...segOpt, dias: 7 })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600">+7d</button></div>
            )}
            <div className="flex gap-2 justify-end"><button onClick={() => setModalSeguimiento(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Ahora no</button><button onClick={confirmarSeguimiento} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Confirmar</button></div>
          </div>
        </div>
      )}

      {/* Modal eliminar cotización */}
      {modalEliminar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalEliminar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Eliminar cotización</h3>
                <p className="text-sm text-gray-500">N° {modalEliminar.numero} · {modalEliminar.cliente_nombre || 'Sin cliente'} · {formatUSD(modalEliminar.total_usd)} USD</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">Esta acción no se puede deshacer. Se borrarán la cotización, sus líneas y el historial asociado.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalEliminar(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={confirmarEliminar} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
