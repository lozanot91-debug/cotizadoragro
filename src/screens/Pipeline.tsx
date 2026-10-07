import { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { formatUSD, formatDate } from '@/lib/format';
import { registrarCambio } from '@/lib/historial';
import type { Cotizacion, EstadoCotizacion, Tarea, Configuracion } from '@/types';
import { KanbanSquare, List, Search, TrendingUp, TrendingDown, AlertCircle, Clock, Check, X, Calendar, DollarSign, ChevronRight, GripVertical } from 'lucide-react';
import { diasDesde, mesActualAR } from '@/lib/fechas';

const ESTADOS: EstadoCotizacion[] = ['Borrador', 'Enviada', 'En negociación', 'Ganada', 'Perdida'];
const MOTIVOS = ['Precio', 'Plazo de pago', 'Competencia', 'El cliente no compró', 'Otro'];

const estadoColors: Record<string, string> = {
  'Borrador': 'bg-gray-100 text-gray-600 border-gray-200',
  'Enviada': 'bg-blue-100 text-blue-700 border-blue-200',
  'En negociación': 'bg-amber-100 text-amber-700 border-amber-200',
  'Ganada': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Perdida': 'bg-red-100 text-red-700 border-red-200',
};

const colBg: Record<string, string> = {
  'Borrador': 'bg-gray-50',
  'Enviada': 'bg-blue-50',
  'En negociación': 'bg-amber-50',
  'Ganada': 'bg-emerald-50',
  'Perdida': 'bg-red-50',
};

interface Props {
  onEdit: (id: string) => void;
}

export default function Pipeline({ onEdit }: Props) {
  const data = useData();
  const { usuario } = useAuth();
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [cotizaciones, setCotizaciones] = useState<(Cotizacion & { cliente?: { nombre: string } })[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'tablero' | 'lista'>('tablero');
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroFamilia, setFiltroFamilia] = useState('');
  const [filtroSinRespuesta, setFiltroSinRespuesta] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const [modalEstado, setModalEstado] = useState<{
    cotiz: Cotizacion; nuevoEstado: EstadoCotizacion; motivo: string; otroMotivo: string;
  } | null>(null);

  const load = useCallback(async () => {
    const [cfg, cotizs, tars] = await Promise.all([
      data.fetchConfig(), data.fetchCotizaciones(), data.fetchTareas(),
    ]);
    setConfig(cfg);
    setCotizaciones(cotizs);
    setTareas(tars);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function probabilidad(c: Cotizacion): number {
    if (c.probabilidad !== null && c.probabilidad !== undefined) return c.probabilidad;
    if (!config) return 0;
    if (c.estado === 'Borrador') return config.prob_borrador;
    if (c.estado === 'Enviada') return config.prob_enviada;
    if (c.estado === 'En negociación') return config.prob_negociacion;
    if (c.estado === 'Ganada') return 100;
    return 0;
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

  function vigenciaRestante(c: Cotizacion): number {
    return c.vigencia_dias - diasDesde(c.fecha);
  }

  const filtradas = useMemo(() => {
    return cotizaciones.filter((c) => {
      if (filtroVendedor && (c.vendedor || '') !== filtroVendedor) return false;
      if (filtroCliente && !(c.cliente_nombre || '').toLowerCase().includes(filtroCliente.toLowerCase())) return false;
      if (filtroDesde && c.fecha < filtroDesde) return false;
      if (filtroHasta && c.fecha > filtroHasta) return false;
      if (filtroSinRespuesta && !esSinRespuesta(c)) return false;
      return true;
    });
  }, [cotizaciones, filtroVendedor, filtroCliente, filtroDesde, filtroHasta, filtroSinRespuesta, tareas, config]);

  const indicadores = useMemo(() => {
    const abiertas = filtradas.filter((c) => c.estado === 'Borrador' || c.estado === 'Enviada' || c.estado === 'En negociación');
    const totalAbierto = abiertas.reduce((s, c) => s + c.total_usd, 0);
    const valorPonderado = abiertas.reduce((s, c) => s + c.total_usd * (probabilidad(c) / 100), 0);
    const mesActual = mesActualAR();
    const ganadasMes = filtradas.filter((c) => c.estado === 'Ganada' && c.fecha.substring(0, 7) === mesActual);
    const perdidasMes = filtradas.filter((c) => c.estado === 'Perdida' && c.fecha.substring(0, 7) === mesActual);
    const ganadoMes = ganadasMes.reduce((s, c) => s + c.total_usd, 0);
    const perdidoMes = perdidasMes.reduce((s, c) => s + c.total_usd, 0);
    const tasa = ganadasMes.length + perdidasMes.length > 0
      ? (ganadasMes.length / (ganadasMes.length + perdidasMes.length)) * 100 : 0;
    return { totalAbierto, valorPonderado, ganadoMes, perdidoMes, tasa, countAbierto: abiertas.length };
  }, [filtradas, config]);

  const pronostico = useMemo(() => {
    const abiertas = filtradas.filter((c) => c.estado === 'Borrador' || c.estado === 'Enviada' || c.estado === 'En negociación');
    const porMes: Record<string, number> = {};
    let sinFecha = 0;
    for (const c of abiertas) {
      const ponderado = c.total_usd * (probabilidad(c) / 100);
      if (c.fecha_cierre_estimada) {
        const mes = c.fecha_cierre_estimada.substring(0, 7);
        porMes[mes] = (porMes[mes] || 0) + ponderado;
      } else {
        sinFecha += ponderado;
      }
    }
    return { porMes, sinFecha };
  }, [filtradas, config]);

  function tareasPendientesCount(cotizId: string): number {
    return tareas.filter((t) => t.cotizacion_id === cotizId && t.estado === 'Pendiente').length;
  }

  function onDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: React.DragEvent, col: string) {
    e.preventDefault();
    setDragOverCol(col);
  }
  function onDrop(e: React.DragEvent, col: string) {
    e.preventDefault();
    setDragOverCol(null);
    if (!dragId) return;
    const cotiz = cotizaciones.find((c) => c.id === dragId);
    if (!cotiz || cotiz.estado === col) { setDragId(null); return; }
    setModalEstado({ cotiz, nuevoEstado: col as EstadoCotizacion, motivo: '', otroMotivo: '' });
    setDragId(null);
  }

  async function confirmarCambioEstado() {
    if (!modalEstado) return;
    const { cotiz, nuevoEstado, motivo, otroMotivo } = modalEstado;
    if (nuevoEstado === 'Perdida' && !motivo) return;
    if (nuevoEstado === 'Perdida' && motivo === 'Otro' && !otroMotivo.trim()) return;

    const extra: Record<string, unknown> = {};
    if (nuevoEstado === 'Perdida') {
      extra.motivo_perdida = motivo === 'Otro' ? otroMotivo.trim() : motivo;
    }
    if (nuevoEstado === 'Enviada' && !cotiz.fecha_envio) {
      extra.fecha_envio = new Date().toISOString();
    }

    await data.updateCotizacionEstado(cotiz.id, nuevoEstado, extra);
    await registrarCambio({ tipo: 'estado', cotizacion_id: cotiz.id, campo: 'estado', valor_anterior: cotiz.estado, valor_nuevo: nuevoEstado, detalle: nuevoEstado === 'Perdida' ? `Motivo: ${extra.motivo_perdida}` : undefined });
    setModalEstado(null);
    load();
  }

  async function quickMover(c: Cotizacion, nuevoEstado: EstadoCotizacion) {
    setModalEstado({ cotiz: c, nuevoEstado, motivo: '', otroMotivo: '' });
  }

  async function setProbabilidad(c: Cotizacion, valor: number) {
    await data.updateCotizacionProbabilidad(c.id, valor);
    load();
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><KanbanSquare className="w-7 h-7 text-gray-400" /> Pipeline</h1>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          <button onClick={() => setView('tablero')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1 ${view === 'tablero' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}><KanbanSquare className="w-4 h-4" /> Tablero</button>
          <button onClick={() => setView('lista')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1 ${view === 'lista' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}><List className="w-4 h-4" /> Lista</button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Total abierto</p>
          <p className="text-lg font-bold text-gray-800">{formatUSD(indicadores.totalAbierto, 0)}</p>
          <p className="text-xs text-gray-400">{indicadores.countAbierto} cotiz.</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Valor ponderado</p>
          <p className="text-lg font-bold text-blue-700">{formatUSD(indicadores.valorPonderado, 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Ganado del mes</p>
          <p className="text-lg font-bold text-emerald-700">{formatUSD(indicadores.ganadoMes, 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Perdido del mes</p>
          <p className="text-lg font-bold text-red-700">{formatUSD(indicadores.perdidoMes, 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Tasa conversión</p>
          <p className="text-lg font-bold text-gray-800">{indicadores.tasa.toFixed(0)}%</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <input type="text" value={filtroVendedor} onChange={(e) => setFiltroVendedor(e.target.value)} placeholder="Vendedor" className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
          <input type="text" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} placeholder="Cliente..." className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
          <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
          <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
          <input type="text" value={filtroFamilia} onChange={(e) => setFiltroFamilia(e.target.value)} placeholder="Familia..." className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm outline-none" />
          <label className="flex items-center gap-2 text-sm text-gray-600 px-2">
            <input type="checkbox" checked={filtroSinRespuesta} onChange={(e) => setFiltroSinRespuesta(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            Sin respuesta
          </label>
        </div>
      </div>

      {/* Tablero */}
      {view === 'tablero' ? (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {ESTADOS.map((estado) => {
              const cols = filtradas.filter((c) => c.estado === estado);
              const sum = cols.reduce((s, c) => s + c.total_usd, 0);
              return (
                <div
                  key={estado}
                  className={`w-72 flex-shrink-0 rounded-xl border-2 ${dragOverCol === estado ? 'border-emerald-400' : 'border-gray-200'} ${colBg[estado]} transition-colors`}
                  onDragOver={(e) => onDragOver(e, estado)}
                  onDrop={(e) => onDrop(e, estado)}
                >
                  <div className="p-3 border-b border-gray-200 bg-white/60 rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColors[estado]}`}>{estado}</span>
                      <span className="text-xs text-gray-500">{cols.length}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-700 mt-1">{formatUSD(sum, 0)} USD</p>
                  </div>
                  <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                    {cols.map((c) => {
                      const tp = tareasPendientesCount(c.id);
                      const sr = esSinRespuesta(c);
                      const vr = vigenciaRestante(c);
                      const prob = probabilidad(c);
                      const diasEnv = c.fecha_envio ? diasDesde(c.fecha_envio) : null;
                      return (
                        <div key={c.id} draggable onDragStart={(e) => onDragStart(e, c.id)}
                          onClick={() => onEdit(c.id)}
                          className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:cursor-grabbing">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-gray-800 text-sm">N° {c.numero}</p>
                              <p className="text-xs text-gray-600 truncate">{c.cliente_nombre || 'Sin cliente'}</p>
                            </div>
                            <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                          </div>
                          <p className="text-sm font-semibold text-gray-800 mt-1">{formatUSD(c.total_usd, 0)} USD</p>
                          <div className="flex items-center gap-1 flex-wrap mt-1">
                            <span className="text-xs text-gray-400">Pond: {formatUSD(c.total_usd * prob / 100, 0)}</span>
                            {tp > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">{tp} tarea{tp !== 1 ? 's' : ''}</span>}
                            {sr && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> sin respuesta</span>}
                            {vr <= 3 && vr >= 0 && c.estado !== 'Ganada' && c.estado !== 'Perdida' && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Vence en {vr}d</span>}
                            {vr < 0 && c.estado !== 'Ganada' && c.estado !== 'Perdida' && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">Vencida</span>}
                          </div>
                          {diasEnv !== null && <p className="text-xs text-gray-400 mt-0.5">Enviada hace {diasEnv}d</p>}
                          {c.fecha_cierre_estimada && <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-0.5"><Calendar className="w-3 h-3" /> Cierre: {formatDate(c.fecha_cierre_estimada)}</p>}
                          {/* Mover a... for mobile */}
                          <select
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => { if (e.target.value) quickMover(c, e.target.value as EstadoCotizacion); e.target.value = ''; }}
                            value="" className="mt-2 w-full text-xs px-2 py-1 border border-gray-200 rounded text-gray-500 bg-white lg:hidden"
                          >
                            <option value="">Mover a...</option>
                            {ESTADOS.filter((e) => e !== c.estado).map((e) => <option key={e} value={e}>{e}</option>)}
                          </select>
                        </div>
                      );
                    })}
                    {cols.length === 0 && <p className="text-center text-xs text-gray-300 py-4">Sin cotizaciones</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Lista */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 font-medium text-gray-600">N°</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Cliente</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Estado</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Total USD</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Prob.</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Pond.</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Vence</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Mover</th>
            </tr></thead>
            <tbody>
              {filtradas.map((c) => {
                const vr = vigenciaRestante(c);
                const prob = probabilidad(c);
                return (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onEdit(c.id)}>
                    <td className="px-3 py-2 font-medium text-gray-800">{c.numero}</td>
                    <td className="px-3 py-2 text-gray-600">{c.cliente_nombre || 'Sin cliente'}</td>
                    <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColors[c.estado]}`}>{c.estado}</span></td>
                    <td className="px-3 py-2 text-right font-semibold">{formatUSD(c.total_usd, 0)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{prob}%</td>
                    <td className="px-3 py-2 text-right text-blue-700 font-medium">{formatUSD(c.total_usd * prob / 100, 0)}</td>
                    <td className="px-3 py-2 text-xs"><span className={vr <= 3 ? 'text-red-600 font-medium' : 'text-gray-400'}>{vr > 0 ? `${vr}d` : vr === 0 ? 'Hoy' : 'Vencida'}</span></td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <select onChange={(e) => { if (e.target.value) quickMover(c, e.target.value as EstadoCotizacion); e.target.value = ''; }} value="" className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-500 bg-white">
                        <option value="">Mover...</option>
                        {ESTADOS.filter((e) => e !== c.estado).map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pronóstico por mes */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-500" /> Pronóstico por mes</h3>
        <div className="space-y-1">
          {Object.entries(pronostico.porMes).sort().map(([mes, val]) => (
            <div key={mes} className="flex justify-between py-1 border-b border-gray-100 text-sm">
              <span className="text-gray-600">{mes.substring(5)}/{mes.substring(0, 4)}</span>
              <span className="font-medium text-blue-700">{formatUSD(val, 0)} USD</span>
            </div>
          ))}
          <div className="flex justify-between py-1 text-sm">
            <span className="text-gray-400">Sin fecha estimada</span>
            <span className="font-medium text-gray-500">{formatUSD(pronostico.sinFecha, 0)} USD</span>
          </div>
          {Object.keys(pronostico.porMes).length === 0 && pronostico.sinFecha === 0 && <p className="text-sm text-gray-400">Sin datos</p>}
        </div>
      </div>

      {/* Modal cambio de estado */}
      {modalEstado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalEstado(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${modalEstado.nuevoEstado === 'Perdida' ? 'bg-red-100' : modalEstado.nuevoEstado === 'Ganada' ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                {modalEstado.nuevoEstado === 'Perdida' ? <TrendingDown className="w-5 h-5 text-red-600" /> : modalEstado.nuevoEstado === 'Ganada' ? <Check className="w-5 h-5 text-emerald-600" /> : <Check className="w-5 h-5 text-blue-600" />}
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Cambiar a {modalEstado.nuevoEstado}</h3>
                <p className="text-sm text-gray-500">Cotización N° {modalEstado.cotiz.numero} · {modalEstado.cotiz.cliente_nombre || 'Sin cliente'} · {formatUSD(modalEstado.cotiz.total_usd)} USD</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">¿Cambiar de <strong>{modalEstado.cotiz.estado}</strong> a <strong>{modalEstado.nuevoEstado}</strong>?</p>
            {modalEstado.nuevoEstado === 'Perdida' && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-2">Motivo <span className="text-red-500">*</span></label>
                <select value={modalEstado.motivo} onChange={(e) => setModalEstado({ ...modalEstado, motivo: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 bg-white">
                  <option value="">Seleccionar motivo...</option>
                  {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {modalEstado.motivo === 'Otro' && <input type="text" value={modalEstado.otroMotivo} onChange={(e) => setModalEstado({ ...modalEstado, otroMotivo: e.target.value })} placeholder="Escribí el motivo..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3" />}
              </>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalEstado(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={confirmarCambioEstado} disabled={modalEstado.nuevoEstado === 'Perdida' && (!modalEstado.motivo || (modalEstado.motivo === 'Otro' && !modalEstado.otroMotivo.trim()))} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
