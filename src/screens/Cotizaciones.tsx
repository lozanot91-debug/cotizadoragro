import { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '@/hooks/useData';
import { formatUSD, formatDate } from '@/lib/format';
import { registrarCambio } from '@/lib/historial';
import type { Cotizacion, EstadoCotizacion, Cliente, Tarea, Configuracion } from '@/types';
import { FileText, Search, ChevronRight, AlertCircle, Loader2, Pencil, Copy, Lock, Unlock, Trash2 } from 'lucide-react';
import { diasDesde } from '@/lib/fechas';
import { useCambioEstado } from '@/hooks/useCambioEstado';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';

const ESTADOS: EstadoCotizacion[] = ['Borrador', 'Enviada', 'En negociación', 'Ganada', 'Perdida', 'Vencida'];

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
  const [cotizaciones, setCotizaciones] = useState<(Cotizacion & { cliente?: Cliente })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [cotizConCostoEditado, setCotizConCostoEditado] = useState<Set<string>>(new Set());
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [modalEliminar, setModalEliminar] = useState<Cotizacion | null>(null);

  const cargar = useCallback(async () => {
    const [cotizs, conEditado, tars, cfg] = await Promise.all([
      data.fetchCotizaciones(),
      data.fetchCotizacionesConCostoEditado(),
      data.fetchTareas(),
      data.fetchConfig(),
    ]);
    setCotizaciones(cotizs);
    setCotizConCostoEditado(conEditado);
    setTareas(tars);
    setConfig(cfg);
  }, []);

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  const { solicitarCambioEstado, modales } = useCambioEstado({ onCambiado: load });

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

  const esReadOnly = (c: Cotizacion) => c.estado === 'Ganada' || c.estado === 'Perdida';

  async function confirmarEliminar() {
    if (!modalEliminar) return;
    const c = modalEliminar;
    await data.deleteCotizacion(c.id);
    await registrarCambio({ tipo: 'cotizacion', cotizacion_id: null, entidad: `Cotización N° ${c.numero}`, campo: 'eliminación', valor_anterior: `N° ${c.numero}`, valor_nuevo: null, detalle: `Cotización eliminada (${c.cliente_nombre || 'Sin cliente'} · ${formatUSD(c.subtotal_usd)} USD)` });
    setModalEliminar(null);
    load();
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;

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
                    <p className="font-bold text-gray-800">{formatUSD(c.subtotal_usd)} USD</p>
                    <p className="text-xs text-gray-400">$ {formatUSD(c.subtotal_usd * c.tc, 0)}</p>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex gap-1 mt-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {readOnly ? (
                    <button
                      onClick={() => solicitarCambioEstado(c, 'En negociación')}
                      className="text-xs px-3 py-1.5 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors flex items-center gap-1 font-medium"
                    >
                      <Unlock className="w-3 h-3" /> Reabrir
                    </button>
                  ) : (
                    ESTADOS.filter((e) => e !== c.estado).map((e) => (
                      <button key={e} onClick={() => solicitarCambioEstado(c, e)}
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

      {modales}

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
                <p className="text-sm text-gray-500">N° {modalEliminar.numero} · {modalEliminar.cliente_nombre || 'Sin cliente'} · {formatUSD(modalEliminar.subtotal_usd)} USD</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">Esta acción no se puede deshacer. Se borrarán la cotización y sus líneas. El registro de que se eliminó queda en el historial.</p>
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
