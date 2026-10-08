import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendingUp, Loader2, AlertTriangle } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { calcularRentabilidad, type Agrupar } from '@/lib/rentabilidad';
import { formatUSD } from '@/lib/format';
import { hoyAR, sumarDias, partesFecha, armarFecha } from '@/lib/fechas';
import type { Configuracion, Cotizacion, CotizacionLinea } from '@/types';

type Periodo = 'mes' | '90' | 'anio' | 'todo';
type Vista = 'ganadas' | 'abiertas' | 'perdidas' | 'todas';

const ESTADOS_VISTA: Record<Vista, string[]> = {
  ganadas: ['Ganada'],
  abiertas: ['Borrador', 'Enviada', 'En negociación'],
  perdidas: ['Perdida'],
  todas: ['Borrador', 'Enviada', 'En negociación', 'Ganada', 'Perdida'],
};
const VISTA_TXT: Record<Vista, string> = { ganadas: 'Ganadas', abiertas: 'Abiertas (potencial)', perdidas: 'Perdidas', todas: 'Todas' };
const AGRUPAR_TXT: Record<Agrupar, string> = { producto: 'Producto', proveedor: 'Proveedor', familia: 'Familia', cliente: 'Cliente', cotizacion: 'Cotización' };

function desdeDe(p: Periodo, hoy: string): string | undefined {
  if (p === 'todo') return undefined;
  if (p === '90') return sumarDias(hoy, -90);
  const { anio, mes } = partesFecha(hoy);
  return p === 'mes' ? armarFecha(anio, mes, 1) : armarFecha(anio, 1, 1);
}

export default function Rentabilidad({ onEdit }: { onEdit: (id: string) => void }) {
  const data = useData();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [cotizs, setCotizs] = useState<Cotizacion[]>([]);
  const [lineas, setLineas] = useState<CotizacionLinea[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>('todo');
  const [vista, setVista] = useState<Vista>('ganadas');
  const [agrupar, setAgrupar] = useState<Agrupar>('producto');
  const [umbralTxt, setUmbralTxt] = useState('');

  const cargar = useCallback(async () => {
    const [cfg, cs, ls] = await Promise.all([data.fetchConfig(), data.fetchCotizaciones(), data.fetchTodasLasLineas()]);
    setConfig(cfg); setCotizs(cs); setLineas(ls);
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const hoy = hoyAR();
  const resumen = useMemo(
    () => calcularRentabilidad(cotizs, lineas, { estados: ESTADOS_VISTA[vista], desde: desdeDe(periodo, hoy) }),
    [cotizs, lineas, vista, periodo, hoy]
  );

  // Margen mínimo aceptable: por defecto el margen general de la configuración
  const umbral = umbralTxt.trim() === '' ? (config?.margen_general ?? 8) : parseFloat(umbralTxt.replace(',', '.')) || 0;
  const filas = resumen.filas[agrupar];
  const bajoUmbral = filas.filter((f) => f.venta > 0 && f.margenPct < umbral).length;

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  const chip = (activo: boolean) => `px-3 py-1.5 rounded-lg text-sm border ${activo ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><TrendingUp className="w-6 h-6 text-emerald-600" /> Rentabilidad real</h1>
        <p className="text-sm text-gray-500">Ganancia = (precio − costo) × cantidad. Sin IVA, sin flete y sin el recargo por financiación. En las ganadas se usan las cantidades y precios reales si los cargaste.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 w-16">Estado</span>
          {(Object.keys(VISTA_TXT) as Vista[]).map((v) => <button key={v} onClick={() => setVista(v)} className={chip(vista === v)}>{VISTA_TXT[v]}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 w-16">Período</span>
          {([['mes', 'Este mes'], ['90', 'Últimos 90 días'], ['anio', 'Este año'], ['todo', 'Todo']] as [Periodo, string][]).map(([p, t]) =>
            <button key={p} onClick={() => setPeriodo(p)} className={chip(periodo === p)}>{t}</button>)}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"><p className="text-xs text-gray-500">Venta (sin IVA)</p><p className="text-2xl font-bold text-gray-800">{formatUSD(resumen.venta, 0)}</p><p className="text-xs text-gray-400">USD · {resumen.cotizaciones} cotizaciones</p></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"><p className="text-xs text-gray-500">Costo</p><p className="text-2xl font-bold text-gray-800">{formatUSD(resumen.costo, 0)}</p><p className="text-xs text-gray-400">USD</p></div>
        <div className="bg-emerald-50 rounded-xl shadow-sm border border-emerald-200 p-4"><p className="text-xs text-emerald-700">Ganancia</p><p className="text-2xl font-bold text-emerald-800">{formatUSD(resumen.ganancia, 0)}</p><p className="text-xs text-emerald-600">USD</p></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"><p className="text-xs text-gray-500">Margen real</p><p className="text-2xl font-bold text-gray-800">{formatUSD(resumen.margenPct, 1)}%</p><p className="text-xs text-gray-400">sobre venta</p></div>
      </div>

      {resumen.conCostoEditado > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {resumen.conCostoEditado} de estas cotizaciones tienen costos editados a mano: la ganancia usa el costo que cargaste en cada una.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(AGRUPAR_TXT) as Agrupar[]).map((a) => <button key={a} onClick={() => setAgrupar(a)} className={chip(agrupar === a)}>{AGRUPAR_TXT[a]}</button>)}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Marcar margen menor a
            <input type="text" inputMode="decimal" value={umbralTxt} placeholder={String(config?.margen_general ?? 8)} onChange={(e) => setUmbralTxt(e.target.value)}
              className="w-16 px-2 py-1 border border-gray-300 rounded text-right text-sm outline-none focus:ring-1 focus:ring-emerald-500" />%
          </label>
        </div>
        {filas.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">No hay cotizaciones con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <th className="text-left px-3 py-2 font-medium">{AGRUPAR_TXT[agrupar]}</th>
                <th className="text-right px-3 py-2 font-medium">Venta</th>
                <th className="text-right px-3 py-2 font-medium">Costo</th>
                <th className="text-right px-3 py-2 font-medium">Ganancia</th>
                <th className="text-right px-3 py-2 font-medium">Margen</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Cotiz.</th>
              </tr></thead>
              <tbody>
                {filas.map((f) => {
                  const bajo = f.venta > 0 && f.margenPct < umbral;
                  return (
                    <tr key={f.clave} className={`border-b border-gray-100 hover:bg-gray-50 ${bajo ? 'bg-red-50/50' : ''}`}>
                      <td className="px-3 py-2">
                        {f.cotizacionId
                          ? <button onClick={() => onEdit(f.cotizacionId!)} className="font-medium text-emerald-700 hover:underline">{f.clave}</button>
                          : <span className="font-medium text-gray-800">{f.clave}</span>}
                        {f.detalle && <span className="block text-xs text-gray-400">{f.detalle}</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatUSD(f.venta, 0)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatUSD(f.costo, 0)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${f.ganancia < 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatUSD(f.ganancia, 0)}</td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap ${bajo ? 'text-red-600 font-medium' : 'text-gray-600'}`}>{formatUSD(f.margenPct, 1)}%</td>
                      <td className="px-3 py-2 text-right text-gray-500">{f.cotizaciones}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {bajoUmbral > 0 && <p className="px-4 py-3 text-xs text-red-600 border-t border-gray-100">{bajoUmbral} {bajoUmbral === 1 ? 'fila tiene' : 'filas tienen'} margen real menor al {formatUSD(umbral, 1)}%: ahí estás regalando margen.</p>}
      </div>
    </div>
  );
}
