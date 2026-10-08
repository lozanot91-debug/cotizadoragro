import { useState, useEffect, useMemo, useCallback } from 'react';
import { montoGanado } from '@/lib/ganadaParcial';
import AvisosPush from '@/components/AvisosPush';
import RecomprasInicio from '@/components/RecomprasInicio';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { formatUSD, formatDate } from '@/lib/format';
import type { Cotizacion, Tarea, Visita, Configuracion } from '@/types';
import type { Screen } from '@/components/Layout';
import { Plus, CheckCircle, Calendar, Clock, AlertCircle, ArrowRight, ClipboardList, ChevronRight } from 'lucide-react';
import { diasDesde, hoyAR, mesActualAR, sumarDias } from '@/lib/fechas';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { resumenCobranzas } from '@/lib/cobranzas';
import type { Cobranza } from '@/types';
import { nombreCotizacion } from '@/lib/nombreCotizacion';

interface Props {
  onNavigate: (s: Screen) => void;
  onEditCotiz: (id: string) => void;
  /** Nueva cotización copiando otra (Recotizar desde las alertas de recompra) */
  onDuplicateCotiz?: (id: string) => void;
  /** Pedidos a mesa de insumos con costos para revisar. */
  pedidoBadge?: number;
}

export default function Inicio({ onNavigate, onEditCotiz, onDuplicateCotiz, pedidoBadge = 0 }: Props) {
  const data = useData();
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [tareasPendientes, setTareasPendientes] = useState<Tarea[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [cobros, setCobros] = useState<Cobranza[]>([]);

  const hoy = useMemo(() => hoyAR(), []);
  const manana = useMemo(() => sumarDias(hoyAR(), 1), []);
  const mesActual = useMemo(() => mesActualAR(), []);

  const cargar = useCallback(async () => {
    const [cfg, cotizs, tareasPend, todasTareas, visitasData, cobrosData] = await Promise.all([
      data.fetchConfig(),
      data.fetchCotizaciones(),
      data.fetchTareasPendientes(),
      data.fetchTareas(),
      data.fetchVisitas(),
      data.fetchCobranzas(),
    ]);
    setConfig(cfg);
    setCotizaciones(cotizs);
    setTareasPendientes(tareasPend);
    setTareas(todasTareas);
    setVisitas(visitasData);
    setCobros(cobrosData);
  }, []);

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);

  useEffect(() => {
    load();
  }, [load]);

  const resumenCobros = useMemo(() => resumenCobranzas(cobros, hoy), [cobros, hoy]);

  // Tareas split: hoy vs vencidas
  const tareasHoy = useMemo(
    () => tareasPendientes.filter((t) => t.fecha_vencimiento === hoy),
    [tareasPendientes, hoy]
  );
  const tareasVencidas = useMemo(
    () => tareasPendientes.filter((t) => t.fecha_vencimiento < hoy),
    [tareasPendientes, hoy]
  );

  // Visitas de hoy y mañana
  const visitasHoyManana = useMemo(
    () =>
      visitas
        .filter((v) => v.fecha === hoy || v.fecha === manana)
        .sort((a, b) => (a.hora || 'zz').localeCompare(b.hora || 'zz')),
    [visitas, hoy, manana]
  );

  // Cotizaciones que vencen en 3 días (solo abiertas)
  const cotizVencen = useMemo(
    () =>
      cotizaciones
        .filter(
          (c) =>
            c.estado === 'Borrador' ||
            c.estado === 'Enviada' ||
            c.estado === 'En negociación'
        )
        .map((c) => ({ c, dr: c.vigencia_dias - diasDesde(c.fecha) }))
        .filter((x) => x.dr <= 3)
        .sort((a, b) => a.dr - b.dr),
    [cotizaciones]
  );

  // Cotizaciones sin respuesta: Enviada/En negociación sin tareas pendientes
  // y sin tareas completadas en los últimos N días
  const sinRespuesta = useMemo(() => {
    if (!config) return [];
    const N = config.sin_respuesta_dias;
    return cotizaciones
      .filter((c) => c.estado === 'Enviada' || c.estado === 'En negociación')
      .filter((c) => {
        const tc = tareas.filter((t) => t.cotizacion_id === c.id);
        if (tc.some((t) => t.estado === 'Pendiente')) return false;
        if (
          tc.some(
            (t) =>
              t.estado === 'Hecha' &&
              t.completada_at &&
              diasDesde(t.completada_at) < N
          )
        )
          return false;
        return true;
      });
  }, [cotizaciones, tareas, config]);

  // Pipeline indicators
  const pipeline = useMemo(() => {
    if (!config)
      return {
        totalAbierto: 0,
        valorPonderado: 0,
        ganadoMes: 0,
        countAbierto: 0,
        countGanado: 0,
      };
    const abiertas = cotizaciones.filter(
      (c) =>
        c.estado === 'Borrador' ||
        c.estado === 'Enviada' ||
        c.estado === 'En negociación'
    );
    const totalAbierto = abiertas.reduce((s, c) => s + c.subtotal_usd, 0);
    const valorPonderado = abiertas.reduce((s, c) => {
      const prob =
        c.probabilidad !== null
          ? c.probabilidad
          : c.estado === 'Borrador'
          ? config.prob_borrador
          : c.estado === 'Enviada'
          ? config.prob_enviada
          : config.prob_negociacion;
      return s + c.subtotal_usd * (prob / 100);
    }, 0);
    const ganadasMes = cotizaciones.filter(
      (c) => c.estado === 'Ganada' && c.fecha.substring(0, 7) === mesActual
    );
    const ganadoMes = ganadasMes.reduce((s, c) => s + montoGanado(c), 0);
    return {
      totalAbierto,
      valorPonderado,
      ganadoMes,
      countAbierto: abiertas.length,
      countGanado: ganadasMes.length,
    };
  }, [cotizaciones, config, mesActual]);

  async function marcarTareaHecha(id: string) {
    await data.updateTarea(id, {
      estado: 'Hecha',
      completada_at: new Date().toISOString(),
    });
    setTareasPendientes((prev) => prev.filter((t) => t.id !== id));
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ===== Tablero: el pipeline abierto es lo primero que se lee ===== */}
      <section className="bg-emerald-900 text-white rounded-xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 flex-wrap px-5 pt-4">
          <p className="text-emerald-200 text-sm">
            Hola, {usuario.nombre}. Hoy es {formatDate(new Date())}.
          </p>
          <button
            onClick={() => onNavigate('nueva')}
            className="bg-amber-400 text-emerald-950 font-semibold px-4 py-2 rounded-lg hover:bg-amber-300 transition-colors flex items-center gap-2 text-sm"
          >
            <Plus className="w-5 h-5" />
            Nueva cotización
          </button>
        </div>
        <button onClick={() => onNavigate('pipeline')} className="block w-full text-left px-5 pt-3 pb-5 group">
          <p className="text-emerald-200 text-sm">En negociación abierta ({pipeline.countAbierto} {pipeline.countAbierto === 1 ? 'cotización' : 'cotizaciones'})</p>
          <p className="cifra text-6xl sm:text-7xl mt-1">
            {formatUSD(pipeline.totalAbierto, 0)}
            <span className="text-2xl sm:text-3xl font-semibold text-amber-300 ml-2">USD</span>
          </p>
        </button>
        <div className="grid grid-cols-3 border-t border-emerald-700/70 bg-emerald-950/40">
          <button onClick={() => onNavigate('pipeline')} className="text-left px-3 sm:px-5 py-3 hover:bg-emerald-950/40 transition-colors">
            <p className="text-emerald-300 text-xs">Ponderado por probabilidad</p>
            <p className="cifra text-xl sm:text-2xl mt-1">{formatUSD(pipeline.valorPonderado, 0)} <span className="text-sm font-semibold text-emerald-300">USD</span></p>
          </button>
          <button onClick={() => onNavigate('cotizaciones')} className="text-left px-3 sm:px-5 py-3 border-l border-emerald-700/70 hover:bg-emerald-950/40 transition-colors">
            <p className="text-emerald-300 text-xs">Ganado este mes ({pipeline.countGanado})</p>
            <p className="cifra text-xl sm:text-2xl mt-1">{formatUSD(pipeline.ganadoMes, 0)} <span className="text-sm font-semibold text-emerald-300">USD</span></p>
          </button>
          <button onClick={() => onNavigate('cobranzas')} className="text-left px-3 sm:px-5 py-3 border-l border-emerald-700/70 hover:bg-emerald-950/40 transition-colors">
            <p className="text-emerald-300 text-xs">Por cobrar{resumenCobros.vencido > 0 ? `, ${formatUSD(resumenCobros.vencido, 0)} vencido` : ''}</p>
            <p className={`cifra text-xl sm:text-2xl mt-1 ${resumenCobros.vencido > 0 ? 'text-amber-300' : ''}`}>{formatUSD(resumenCobros.porCobrar, 0)} <span className="text-sm font-semibold text-emerald-300">USD</span></p>
          </button>
        </div>
      </section>

      {/* ===== Aviso: la mesa de insumos cargó costos ===== */}
      {pedidoBadge > 0 && (
        <button
          onClick={() => onNavigate('pedidos')}
          className="w-full bg-emerald-50 border border-emerald-300 rounded-xl p-3 flex items-center gap-3 hover:bg-emerald-100 transition-colors text-left"
        >
          <ClipboardList className="w-5 h-5 text-emerald-700 flex-shrink-0" />
          <p className="text-sm text-emerald-900 flex-1">
            La mesa de insumos respondió <strong>{pedidoBadge}</strong> {pedidoBadge === 1 ? 'pedido' : 'pedidos'} de precios. Abrilos para aplicar los costos a la cotización.
          </p>
          <ChevronRight className="w-4 h-4 text-emerald-700" />
        </button>
      )}

      <AvisosPush compacto />

      {/* ===== Recompras: compraron el año pasado en esta época y todavía no se les cotizó ===== */}
      <RecomprasInicio cotizaciones={cotizaciones} onDuplicar={onDuplicateCotiz} onEditCotiz={onEditCotiz} />

      {/* ===== Alert bar: tareas de hoy + vencidas ===== */}
      {tareasHoy.length + tareasVencidas.length > 0 && (
        <button
          onClick={() => onNavigate('tareas')}
          className="w-full bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center gap-3 hover:bg-amber-100 transition-colors text-left"
        >
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            Tenés <strong>{tareasHoy.length}</strong>{' '}
            {tareasHoy.length === 1 ? 'tarea' : 'tareas'} para hoy
            {tareasVencidas.length > 0 && (
              <>
                {' '}y <strong>{tareasVencidas.length}</strong> vencida
                {tareasVencidas.length === 1 ? '' : 's'}
              </>
            )}
          </p>
          <span className="text-amber-700 text-sm font-medium flex items-center gap-1 flex-shrink-0">
            Ver tareas <ArrowRight className="w-4 h-4" />
          </span>
        </button>
      )}

      {/* ===== Tareas de hoy y vencidas + Visitas ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tareas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              Tareas de hoy y vencidas
            </h2>
            <button
              onClick={() => onNavigate('tareas')}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {tareasPendientes.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hay tareas para hoy</p>
            </div>
          ) : (
            <div className="space-y-1">
              {tareasPendientes.map((t) => {
                const vencida = t.fecha_vencimiento < hoy;
                const cotizId = t.cotizacion_id;
                return (
                  <div
                    key={t.id}
                    className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0"
                  >
                    <button
                      onClick={() => marcarTareaHecha(t.id)}
                      className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-emerald-500 hover:bg-emerald-50 transition-colors flex-shrink-0 mt-0.5"
                      title="Marcar como hecha"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{t.titulo}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {t.cotizacion && cotizId && (
                          <button
                            onClick={() => onEditCotiz(cotizId)}
                            className="text-xs text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
                          >
                            {nombreCotizacion(t.cotizacion, t.cliente?.nombre)}
                          </button>
                        )}
                        {t.cliente?.nombre && !(t.cotizacion && cotizId) && (
                          <span className="text-xs text-gray-400">
                            · {t.cliente.nombre}
                          </span>
                        )}
                        {t.hora && (
                          <span className="text-xs text-gray-400 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" /> {t.hora}
                          </span>
                        )}
                      </div>
                    </div>
                    {vencida && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex-shrink-0">
                        Vencida
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Visitas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              Visitas de hoy y mañana
            </h2>
            <button
              onClick={() => onNavigate('visitas')}
              className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {visitasHoyManana.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hay visitas programadas</p>
            </div>
          ) : (
            <div className="space-y-1">
              {visitasHoyManana.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">
                      {v.cliente?.nombre || 'Sin cliente'}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {v.tipo}
                      </span>
                      {v.hora && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {v.hora}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium flex-shrink-0 ${
                      v.fecha === hoy ? 'text-emerald-600' : 'text-gray-400'
                    }`}
                  >
                    {v.fecha === hoy ? 'Hoy' : 'Mañana'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== Cotizaciones que vencen en 3 días ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            Cotizaciones por vencer
          </h2>
          <button
            onClick={() => onNavigate('vencimientos')}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
          >
            Ver vencimientos <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {cotizVencen.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No hay cotizaciones por vencer</p>
          </div>
        ) : (
          <div className="space-y-1">
            {cotizVencen.map(({ c, dr }) => (
              <button
                key={c.id}
                onClick={() => onEditCotiz(c.id)}
                className="w-full flex items-center gap-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 truncate min-w-0">
                      {nombreCotizacion(c)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.estado === 'Borrador'
                          ? 'bg-gray-100 text-gray-600'
                          : c.estado === 'Enviada'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {c.estado}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {formatUSD(c.subtotal_usd, 0)} USD
                  </p>
                  <p
                    className={`text-xs font-medium ${
                      dr <= 1 ? 'text-red-600' : 'text-amber-600'
                    }`}
                  >
                    {dr > 0
                      ? `${dr} día${dr === 1 ? '' : 's'}`
                      : dr === 0
                      ? 'Vence hoy'
                      : `Vencida hace ${Math.abs(dr)}d`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ===== Cotizaciones sin respuesta ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Sin respuesta
            {sinRespuesta.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                {sinRespuesta.length}
              </span>
            )}
          </h2>
          <button
            onClick={() => onNavigate('cotizaciones')}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
          >
            Ver todas <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {sinRespuesta.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No hay cotizaciones sin respuesta</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sinRespuesta.map((c) => {
              const dias = c.fecha_envio
                ? diasDesde(c.fecha_envio)
                : diasDesde(c.fecha);
              return (
                <button
                  key={c.id}
                  onClick={() => onEditCotiz(c.id)}
                  className="w-full flex items-center gap-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800 truncate min-w-0">
                        {nombreCotizacion(c)}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.estado === 'Enviada'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {c.estado}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {formatUSD(c.subtotal_usd, 0)} USD
                    </p>
                    <p className="text-xs text-amber-600">
                      hace {dias}d sin actividad
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
