import { useState, useEffect, useCallback, useMemo } from 'react';
import { montoGanado, motivosDePerdida } from '@/lib/ganadaParcial';
import { useData } from '@/hooks/useData';
import { formatUSD, formatDate } from '@/lib/format';
import type { Cotizacion } from '@/types';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Package, Trophy, AlertCircle, Loader2 } from 'lucide-react';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';

export default function Estadisticas() {
  const data = useData();
  const [cotizaciones, setCotizaciones] = useState<(Cotizacion & { vendedor_email?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<'mes' | 'trimestre' | 'anio' | 'todo'>('todo');

  const cargar = useCallback(async () => {
    const cotizs = await data.fetchCotizaciones();
    setCotizaciones(cotizs);
  }, []);

  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const enviadas = cotizaciones.filter((c) => c.estado === 'Enviada' || c.estado === 'En negociación' || c.estado === 'Ganada' || c.estado === 'Perdida');
    const ganadas = cotizaciones.filter((c) => c.estado === 'Ganada');
    const perdidas = cotizaciones.filter((c) => c.estado === 'Perdida');
    const tasaConversion = enviadas.length > 0 ? (ganadas.length / enviadas.length) * 100 : 0;
    const montoCotizado = cotizaciones.reduce((sum, c) => sum + (c.subtotal_usd || 0), 0);
    // Ganado = lo realmente ganado (en las ganadas parciales, solo la parte ganada)
    const montoGanadoTotal = ganadas.reduce((sum, c) => sum + montoGanado(c), 0);
    const parciales = ganadas.filter((c) => (c.no_ganado || []).length > 0).length;

    // Motivos de pérdida: cotizaciones perdidas + lo no ganado de las ganadas parciales
    const motivos = motivosDePerdida(cotizaciones);

    // Por cliente
    const porCliente: Record<string, { cotizado: number; ganado: number; count: number }> = {};
    cotizaciones.forEach((c) => {
      const nombre = c.cliente_nombre || 'Sin cliente';
      if (!porCliente[nombre]) porCliente[nombre] = { cotizado: 0, ganado: 0, count: 0 };
      porCliente[nombre].cotizado += c.subtotal_usd || 0;
      porCliente[nombre].count++;
      porCliente[nombre].ganado += montoGanado(c);
    });

    // Por mes
    const porMes: Record<string, { cotizado: number; ganado: number }> = {};
    cotizaciones.forEach((c) => {
      const mes = c.fecha?.substring(0, 7) || 'Sin fecha';
      if (!porMes[mes]) porMes[mes] = { cotizado: 0, ganado: 0 };
      porMes[mes].cotizado += c.subtotal_usd || 0;
      porMes[mes].ganado += montoGanado(c);
    });

    return {
      total: cotizaciones.length,
      enviadas: enviadas.length,
      ganadas: ganadas.length,
      perdidas: perdidas.length,
      tasaConversion,
      montoCotizado,
      montoGanado: montoGanadoTotal,
      parciales,
      motivos,
      porCliente: Object.entries(porCliente).sort((a, b) => b[1].cotizado - a[1].cotizado).slice(0, 10),
      porMes: Object.entries(porMes).sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [cotizaciones]);

  const maxMontoMes = Math.max(...stats.porMes.map(([, v]) => v.cotizado), 1);
  const maxMotivo = Math.max(...stats.motivos.map((m) => m.usd), 1);
  const maxMontoCliente = Math.max(...stats.porCliente.map(([, v]) => v.cotizado), 1);

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (cotizaciones.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
        <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" />
        No hay datos para mostrar estadísticas
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Estadísticas</h1>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-xs text-gray-500">Tasa de conversión</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.tasaConversion.toFixed(1)}%</p>
          <p className="text-xs text-gray-400">{stats.ganadas} ganadas / {stats.enviadas} enviadas</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-xs text-gray-500">Cotizado</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{formatUSD(stats.montoCotizado, 0)}</p>
          <p className="text-xs text-gray-400">USD total</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <Trophy className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-xs text-gray-500">Ganado</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{formatUSD(stats.montoGanado, 0)}</p>
          <p className="text-xs text-gray-400">USD total{stats.parciales > 0 && ` · ${stats.parciales} ${stats.parciales === 1 ? 'parcial' : 'parciales'}`}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-xs text-gray-500">Perdidas</span>
          </div>
          <p className="text-2xl font-bold text-gray-800">{stats.perdidas}</p>
          <p className="text-xs text-gray-400">cotizaciones</p>
        </div>
      </div>

      {/* Gráfico por mes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Monto cotizado vs. ganado por mes</h3>
        {stats.porMes.length === 0 ? (
          <p className="text-sm text-gray-400">Sin datos</p>
        ) : (
          <div className="space-y-2">
            {stats.porMes.map(([mes, v]) => (
              <div key={mes} className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{mes}</span>
                  <span>{formatUSD(v.cotizado, 0)} → {formatUSD(v.ganado, 0)} USD</span>
                </div>
                <div className="flex gap-1 h-6">
                  <div
                    className="bg-blue-200 rounded-l flex items-center justify-end px-2"
                    style={{ width: `${(v.cotizado / maxMontoMes) * 50}%` }}
                  />
                  <div
                    className="bg-emerald-500 rounded-r"
                    style={{ width: `${(v.ganado / maxMontoMes) * 50}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ranking por cliente */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Top clientes por monto cotizado</h3>
        <div className="space-y-2">
          {stats.porCliente.map(([nombre, v]) => (
            <div key={nombre} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600 truncate">{nombre}</span>
                <span className="text-gray-400">{formatUSD(v.cotizado, 0)} USD · {v.count} cotiz.</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full"
                  style={{ width: `${(v.cotizado / maxMontoCliente) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Motivos de pérdida */}
      {stats.motivos.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700">Motivos de pérdida</h3>
          <p className="text-xs text-gray-500 mb-4">Cotizaciones perdidas y productos que no se ganaron en ganadas parciales. USD sin IVA.</p>
          <div className="space-y-3">
            {stats.motivos.map((m) => (
              <div key={m.motivo}>
                <div className="flex justify-between gap-3 text-sm mb-1">
                  <span className="font-medium text-gray-800">{m.motivo}</span>
                  <span className="text-gray-700 whitespace-nowrap">USD {formatUSD(m.usd, 0)}</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                  <div className="h-full bg-red-500" style={{ width: `${(m.usdPerdidas / maxMotivo) * 100}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${(m.usdParciales / maxMotivo) * 100}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {[
                    m.perdidas > 0 && `${m.perdidas} ${m.perdidas === 1 ? 'cotización perdida' : 'cotizaciones perdidas'}`,
                    m.productos > 0 && `${m.productos} ${m.productos === 1 ? 'producto no ganado' : 'productos no ganados'} en ganadas parciales`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Cotización perdida</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Parte no ganada</span>
          </div>
        </div>
      )}
    </div>
  );
}
