import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, Loader2, Lock, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { serieDeCostos, variacionesEntreListas, type PuntoCosto } from '@/lib/costos';
import { formatUSD, formatDate } from '@/lib/format';
import type { ListaCostos, ProductoConCosto } from '@/types';

/** Gráfico de línea de un solo producto: marcas finas, cruz y detalle al pasar el dedo o el mouse. */
function Grafico({ serie, moneda }: { serie: PuntoCosto[]; moneda: string }) {
  const [activo, setActivo] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 640, H = 240, M = { t: 16, r: 56, b: 28, l: 56 };
  const costos = serie.map((p) => p.costo);
  const min = Math.min(...costos), max = Math.max(...costos);
  const pad = (max - min) * 0.15 || max * 0.05 || 1;
  const y0 = Math.max(0, min - pad), y1 = max + pad;
  const x = (i: number) => M.l + (serie.length === 1 ? (W - M.l - M.r) / 2 : (i / (serie.length - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const ticks = [y0, (y0 + y1) / 2, y1];
  const camino = serie.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.costo).toFixed(1)}`).join(' ');

  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let mejor = 0;
    serie.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(mejor) - px)) mejor = i; });
    setActivo(mejor);
  }

  const a = activo !== null ? serie[activo] : null;
  const ultimo = serie.length - 1;
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full max-w-3xl h-auto touch-pan-y" role="img"
        aria-label={`Costo en ${moneda}: de ${formatUSD(serie[0].costo)} a ${formatUSD(serie[ultimo].costo)}`}
        onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setActivo(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#DADDD0" strokeWidth={1} />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#727A67">{formatUSD(t, t >= 100 ? 0 : 2)}</text>
          </g>
        ))}
        {serie.map((p, i) => (serie.length <= 8 || i === 0 || i === ultimo) && (
          <text key={p.fecha} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === ultimo ? 'end' : 'middle'} fontSize={11} fill="#727A67">{formatDate(p.fecha).slice(0, 5)}</text>
        ))}
        {a && <line x1={x(activo!)} x2={x(activo!)} y1={M.t} y2={H - M.b} stroke="#99A08D" strokeWidth={1} strokeDasharray="3 3" />}
        <path d={camino} fill="none" stroke="#2F6030" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {serie.map((p, i) => (
          <circle key={p.fecha} cx={x(i)} cy={y(p.costo)} r={activo === i ? 6 : 4} fill="#2F6030" stroke="#fff" strokeWidth={2} />
        ))}
        <text x={x(ultimo)} y={y(serie[ultimo].costo) + (serie[ultimo].costo >= (min + max) / 2 ? 20 : -12)} fontSize={12} fontWeight={700} fill="#272E22" textAnchor="end">
          {formatUSD(serie[ultimo].costo)}
        </text>
      </svg>
      {a && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
          <p className="font-medium">{formatDate(a.fecha)}</p>
          <p>{formatUSD(a.costo)} {moneda}{a.variacionPct !== null && <span className={a.variacionPct > 0 ? 'text-amber-300' : a.variacionPct < 0 ? 'text-emerald-300' : ''}> ({a.variacionPct > 0 ? '+' : ''}{formatUSD(a.variacionPct, 1)}%)</span>}</p>
        </div>
      )}
    </div>
  );
}

export default function EvolucionCostos() {
  const data = useData();
  const { usuario } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [listas, setListas] = useState<ListaCostos[]>([]);
  const [actuales, setActuales] = useState<ProductoConCosto[]>([]);
  const [anteriores, setAnteriores] = useState<ProductoConCosto[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [sel, setSel] = useState<ProductoConCosto | null>(null);
  const [serie, setSerie] = useState<PuntoCosto[]>([]);
  const [cargandoSerie, setCargandoSerie] = useState(false);

  const cargar = useCallback(async () => {
    const ls = await data.fetchListas();
    setListas(ls);
    if (ls.length === 0) return;
    const [act, ant] = await Promise.all([
      data.fetchProductosConCosto(ls[0].id),
      ls[1] ? data.fetchProductosConCosto(ls[1].id) : Promise.resolve([] as ProductoConCosto[]),
    ]);
    setActuales(act); setAnteriores(ant);
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { if (usuario.puede_ver_costos) void load(); else setLoading(false); }, [load, usuario.puede_ver_costos]);

  const variaciones = useMemo(() => variacionesEntreListas(actuales, anteriores), [actuales, anteriores]);
  const suben = variaciones.filter((v) => v.pct > 0).slice(0, 8);
  const bajan = [...variaciones].filter((v) => v.pct < 0).reverse().slice(0, 8);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q.length < 2) return [];
    return actuales.filter((p) => `${p.cod} ${p.producto} ${p.proveedor} ${p.familia}`.toLowerCase().includes(q)).slice(0, 8);
  }, [busqueda, actuales]);

  async function elegir(p: ProductoConCosto) {
    setSel(p); setBusqueda(''); setCargandoSerie(true);
    try {
      setSerie(serieDeCostos(await data.fetchCostosDeProducto(p.id), p.es_fertilizante));
    } catch (e) { toast.error(e); } finally { setCargandoSerie(false); }
  }
  function elegirPorId(id: string) {
    const p = actuales.find((x) => x.id === id);
    if (p) void elegir(p);
  }

  if (!usuario.puede_ver_costos) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
        <Lock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        Tu usuario no tiene permiso para ver costos.
      </div>
    );
  }
  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  const unidad = sel ? (sel.es_fertilizante ? `${sel.moneda}/tn` : `${sel.moneda}/${sel.unid || 'un.'}`) : '';
  const primero = serie[0], ultimo = serie[serie.length - 1];
  const totalPct = primero && ultimo && serie.length > 1 && primero.costo > 0 ? ((ultimo.costo - primero.costo) / primero.costo) * 100 : null;

  const lista = (items: typeof suben, titulo: string, subida: boolean) => (
    <section className="bg-white rounded-xl border border-gray-200">
      <h2 className="titulo text-lg text-gray-800 px-4 pt-3 pb-1">{titulo}</h2>
      {items.length === 0 ? <p className="px-4 pb-4 text-sm text-gray-400">Sin cambios entre las dos últimas listas.</p> : items.map((v) => (
        <button key={v.productoId} onClick={() => elegirPorId(v.productoId)} className="w-full flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 text-left">
          <span className="min-w-0"><span className="block text-sm font-medium text-gray-800 truncate">{v.producto}</span><span className="block text-xs text-gray-500">{formatUSD(v.anterior)} a {formatUSD(v.actual)} {v.moneda}</span></span>
          <span className={`flex items-center gap-0.5 text-sm font-semibold whitespace-nowrap ${subida ? 'text-red-700' : 'text-emerald-700'}`}>
            {subida ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}{formatUSD(Math.abs(v.pct), 1)}%
          </span>
        </button>
      ))}
    </section>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl titulo text-gray-800 flex items-center gap-2"><LineChart className="w-6 h-6 text-emerald-600" /> Evolución de costos</h1>
        <p className="text-sm text-gray-500">Cómo fue cambiando el costo de cada producto en las listas que cargaste. Para decidir cuándo cotizar o comprar, y para explicar un aumento.</p>
      </div>

      {listas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Todavía no cargaste ninguna lista de costos.</div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar un producto para ver su evolución"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
              {resultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
                  {resultados.map((p) => (
                    <button key={p.id} onClick={() => elegir(p)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                      <span className="block text-sm font-medium text-gray-800">{p.producto}</span>
                      <span className="block text-xs text-gray-500">{p.cod}, {p.familia}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {sel && (
              <div className="mt-4">
                <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
                  <div>
                    <h2 className="titulo text-xl text-gray-800">{sel.producto}</h2>
                    <p className="text-xs text-gray-500">{sel.cod}, {sel.familia}. Costo en {unidad}</p>
                  </div>
                  {totalPct !== null && (
                    <p className="text-sm text-gray-600">Desde {formatDate(primero.fecha)}: <strong className={totalPct > 0 ? 'text-red-700' : totalPct < 0 ? 'text-emerald-700' : ''}>{totalPct > 0 ? '+' : ''}{formatUSD(totalPct, 1)}%</strong></p>
                  )}
                </div>
                {cargandoSerie ? <div className="h-48 flex items-center justify-center"><Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /></div>
                  : serie.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">Este producto no tiene costos cargados.</p>
                  : (
                    <>
                      <Grafico serie={serie} moneda={unidad} />
                      {serie.length === 1 && <p className="text-xs text-gray-500 mt-1">Solo hay una lista cargada con este producto: el gráfico se arma cuando cargues la próxima.</p>}
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-emerald-700 font-medium">Ver en tabla</summary>
                        <table className="w-full mt-2">
                          <thead><tr className="text-gray-500 border-b border-gray-200"><th className="text-left py-1 font-medium">Lista del</th><th className="text-right font-medium">Costo ({unidad})</th><th className="text-right font-medium">Cambio</th></tr></thead>
                          <tbody>
                            {[...serie].reverse().map((p) => (
                              <tr key={p.fecha} className="border-b border-gray-100">
                                <td className="py-1">{formatDate(p.fecha)}</td>
                                <td className="text-right">{formatUSD(p.costo)}</td>
                                <td className={`text-right ${p.variacionPct && p.variacionPct > 0 ? 'text-red-700' : p.variacionPct && p.variacionPct < 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{p.variacionPct === null ? '' : `${p.variacionPct > 0 ? '+' : ''}${formatUSD(p.variacionPct, 1)}%`}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    </>
                  )}
              </div>
            )}
          </div>

          {listas.length < 2 ? (
            <p className="text-sm text-gray-500">Con la segunda lista vas a ver acá qué productos subieron y bajaron.</p>
          ) : (
            <>
              <p className="text-sm text-gray-500">Cambios entre la lista del {formatDate(listas[1].fecha)} y la del {formatDate(listas[0].fecha)}. Tocá un producto para ver su evolución.</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {lista(suben, 'Más aumentos', true)}
                {lista(bajan, 'Más bajas', false)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
