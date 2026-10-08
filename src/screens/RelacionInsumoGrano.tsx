import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scale, Loader2, Search, X, Trash2, Save, TrendingDown, TrendingUp } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { BotonFicha } from '@/components/FichaProducto';
import { CampoNumero } from '@/components/LiquidacionCanje';
import { buscarProductos, costoDeLista } from '@/lib/consulta';
import { precioConMargen, resolverMargen } from '@/lib/calculations';
import { serieDeCostos } from '@/lib/costos';
import { CULTIVOS_CANJE, netoPorTn } from '@/lib/canje';
import { precioDelDia, relacion, resumirRelacion, seriePrecioGrano, serieRelacion, ultimosPrecios, type PuntoRelacion } from '@/lib/relacion';
import { hoyAR } from '@/lib/fechas';
import { formatDate, formatInputNumber, formatUSD } from '@/lib/format';
import type { Configuracion, PrecioGrano, ProductoConCosto, TipoCambioBNA } from '@/types';

const fmt = (n: number, d = 2) => formatUSD(n, d);
const inputCls = 'w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500';

function Segmentado<T extends string>({ valor, opciones, onChange }: { valor: T; opciones: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
      {opciones.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} className={`px-2.5 py-1.5 rounded-md ${valor === o.v ? 'bg-white text-emerald-700 shadow-sm font-medium' : 'text-gray-500'}`}>{o.t}</button>
      ))}
    </div>
  );
}

/** Línea de la relación en el tiempo, con el promedio de referencia y detalle al pasar el dedo. */
function GraficoRelacion({ serie, promedio, unidad }: { serie: PuntoRelacion[]; promedio: number; unidad: string }) {
  const [activo, setActivo] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 640, H = 220, M = { t: 14, r: 52, b: 26, l: 48 };
  const vals = serie.map((p) => p.relacion);
  const min = Math.min(...vals, promedio), max = Math.max(...vals, promedio);
  const pad = (max - min) * 0.15 || max * 0.05 || 1;
  const y0 = Math.max(0, min - pad), y1 = max + pad;
  const x = (i: number) => M.l + (serie.length === 1 ? (W - M.l - M.r) / 2 : (i / (serie.length - 1)) * (W - M.l - M.r));
  const y = (v: number) => M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const camino = serie.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.relacion).toFixed(1)}`).join(' ');
  const ult = serie.length - 1;
  function mover(e: React.PointerEvent<SVGSVGElement>) {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let m = 0;
    serie.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(m) - px)) m = i; });
    setActivo(m);
  }
  const a = activo !== null ? serie[activo] : null;
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-pan-y" role="img" aria-label={`Relación de ${fmt(serie[0].relacion)} a ${fmt(serie[ult].relacion)} ${unidad}`}
        onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setActivo(null)}>
        {[y0, (y0 + y1) / 2, y1].map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#DADDD0" strokeWidth={1} />
            <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#727A67">{fmt(t, t >= 100 ? 0 : 2)}</text>
          </g>
        ))}
        <line x1={M.l} x2={W - M.r} y1={y(promedio)} y2={y(promedio)} stroke="#C0900F" strokeWidth={1} strokeDasharray="5 4" />
        <text x={W - M.r + 4} y={y(promedio) + 4} fontSize={10} fill="#C0900F">prom.</text>
        {[0, ult].filter((v, i, arr) => arr.indexOf(v) === i).map((i) => (
          <text key={i} x={x(i)} y={H - 7} textAnchor={i === 0 ? 'start' : 'end'} fontSize={11} fill="#727A67">{formatDate(serie[i].fecha)}</text>
        ))}
        {a && <line x1={x(activo!)} x2={x(activo!)} y1={M.t} y2={H - M.b} stroke="#99A08D" strokeWidth={1} strokeDasharray="3 3" />}
        <path d={camino} fill="none" stroke="#2F6030" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {serie.map((p, i) => (serie.length <= 40 || i === ult || activo === i) && (
          <circle key={p.fecha} cx={x(i)} cy={y(p.relacion)} r={activo === i ? 5.5 : 3.5} fill="#2F6030" stroke="#fff" strokeWidth={1.5} />
        ))}
      </svg>
      {a && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
          <p className="font-medium">{formatDate(a.fecha)}: {fmt(a.relacion)} {unidad}</p>
          <p className="text-gray-300">Insumo USD {fmt(a.insumo)} · grano USD {fmt(a.grano)}/tn</p>
        </div>
      )}
    </div>
  );
}

/** Precio del grano del día y relación insumo/grano (hoy y su historia). */
export default function RelacionInsumoGrano() {
  const data = useData();
  const toast = useToast();
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [precios, setPrecios] = useState<PrecioGrano[]>([]);
  const [productos, setProductos] = useState<ProductoConCosto[]>([]);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [tcBna, setTcBna] = useState<TipoCambioBNA | null>(null);

  // Carga del precio del día
  const [fCultivo, setFCultivo] = useState('Soja');
  const [fPrecio, setFPrecio] = useState(0);
  const [fFecha, setFFecha] = useState(hoyAR());
  const [fDestino, setFDestino] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Relación
  const [busqueda, setBusqueda] = useState('');
  const [sel, setSel] = useState<ProductoConCosto | null>(null);
  const [cultivo, setCultivo] = useState('Soja');
  const [baseInsumo, setBaseInsumo] = useState<'venta' | 'costo'>('venta');
  const [baseGrano, setBaseGrano] = useState<'lleno' | 'neto'>('lleno');
  const [historiaInsumo, setHistoriaInsumo] = useState<{ fecha: string; costo: number }[] | null>(null);

  const cargar = useCallback(async () => {
    const [ps, listas, cfg] = await Promise.all([data.fetchPreciosGrano(), data.fetchListas(), data.fetchConfig()]);
    setPrecios(ps);
    setConfig(cfg);
    if (listas[0]) setProductos(await data.fetchProductosConCosto(listas[0].id));
    void data.fetchTipoCambioBNA().then(setTcBna);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  // Al elegir un insumo, se trae la historia de su costo
  useEffect(() => {
    setHistoriaInsumo(null);
    if (!sel) return;
    let vivo = true;
    data.fetchCostosDeProducto(sel.id).then((h) => { if (vivo) setHistoriaInsumo(h); }).catch(() => { if (vivo) setHistoriaInsumo([]); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  const resultados = useMemo(() => (sel ? [] : buscarProductos(productos, busqueda, 10)), [productos, busqueda, sel]);
  const ultimos = useMemo(() => [...ultimosPrecios(precios).values()].sort((a, b) => a.cultivo.localeCompare(b.cultivo, 'es')), [precios]);
  const tcVenta = tcBna?.venta || config?.tipo_cambio_default || 0;
  const margen = sel && config ? resolverMargen(sel, config.margen_general, []) : 0;

  /** Pasa un costo de lista (en su unidad y moneda) al precio de insumo que se compara. */
  const precioInsumo = useCallback((costoUnidad: number) => {
    if (!sel) return 0;
    const usd = sel.moneda === 'ARS' ? (tcVenta > 0 ? costoUnidad / tcVenta : 0) : costoUnidad;
    return baseInsumo === 'venta' ? precioConMargen(usd, margen) : usd;
  }, [sel, tcVenta, baseInsumo, margen]);
  /** Precio del grano que se compara (lleno o neto de la liquidación por defecto). */
  const precioGrano = useCallback((p: number) => (baseGrano === 'neto' && config ? netoPorTn(p, config.canje_parametros) : p), [baseGrano, config]);

  const granoHoy = precioDelDia(precios, cultivo);
  const costoHoy = sel ? costoDeLista(sel) : null;
  const insumoHoy = costoHoy ? precioInsumo(costoHoy.valor) : 0;
  const relHoy = sel && granoHoy ? relacion(insumoHoy, precioGrano(granoHoy.precio_usd), sel.es_fertilizante) : 0;
  const unidad = sel ? (sel.es_fertilizante ? `tn de ${cultivo.toLowerCase()} por tn` : `kg de ${cultivo.toLowerCase()} por ${(costoHoy?.unidad || 'unidad')}`) : '';

  const serie = useMemo(() => {
    if (!sel || !historiaInsumo) return [];
    const ins = serieDeCostos(historiaInsumo, sel.es_fertilizante).map((p) => ({ fecha: p.fecha, valor: precioInsumo(p.costo) }));
    const gra = seriePrecioGrano(precios, cultivo).map((p) => ({ fecha: p.fecha, valor: precioGrano(p.valor) }));
    return serieRelacion(ins, gra, sel.es_fertilizante);
  }, [sel, historiaInsumo, precios, cultivo, precioInsumo, precioGrano]);
  const resumen = resumirRelacion(serie);

  async function guardarPrecio() {
    if (!(fPrecio > 0)) { toast.aviso('Cargá el precio del grano.'); return; }
    if (fFecha > hoyAR()) { toast.aviso('La fecha no puede ser futura.'); return; }
    setGuardando(true);
    try {
      const r = await data.cargarPrecioGrano(fFecha, fCultivo, fPrecio, fDestino.trim() || null);
      setPrecios((ps) => [r, ...ps.filter((p) => p.id !== r.id)]);
      toast.exito(`Precio de ${fCultivo} del ${formatDate(fFecha)} guardado`);
      setFPrecio(0);
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  async function borrarPrecio(p: PrecioGrano) {
    if (!window.confirm(`¿Borrar el precio de ${p.cultivo} del ${formatDate(p.fecha)}?`)) return;
    try { await data.eliminarPrecioGrano(p.id); setPrecios((ps) => ps.filter((x) => x.id !== p.id)); } catch (e) { toast.error(e); }
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titulo text-3xl text-emerald-900 flex items-center gap-2"><Scale className="w-7 h-7" /> Relación insumo/grano</h1>
        <p className="text-sm text-gray-500 mt-1">Cuánto grano hace falta para pagar un insumo, hoy y en el tiempo. Se arma con el precio del grano que cargan ustedes y la lista de costos.</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-5 items-start">
        {/* ===== Precio del grano del día ===== */}
        <section className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Precio del grano</h2>
          {ultimos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {ultimos.map((p) => (
                <div key={p.id} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">{p.cultivo}</p>
                  <p className="font-semibold text-gray-800 tabular-nums">USD {fmt(p.precio_usd)}</p>
                  <p className={`text-[11px] ${p.fecha === hoyAR() ? 'text-emerald-700' : 'text-gray-400'}`}>{p.fecha === hoyAR() ? 'hoy' : formatDate(p.fecha)}</p>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg border border-gray-200 p-3 space-y-3">
            <p className="text-xs font-medium text-gray-600">Cargar precio</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Cultivo</span>
                <select value={fCultivo} onChange={(e) => setFCultivo(e.target.value)} className={inputCls}>
                  {CULTIVOS_CANJE.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <CampoNumero label="Precio" sufijo="USD/tn" value={fPrecio} onChange={setFPrecio} />
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Fecha</span>
                <input type="date" value={fFecha} max={hoyAR()} onChange={(e) => setFFecha(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Destino <span className="font-normal text-gray-400">(opcional)</span></span>
                <input value={fDestino} onChange={(e) => setFDestino(e.target.value)} placeholder="Necochea" maxLength={120} className={inputCls} />
              </label>
            </div>
            <button onClick={() => void guardarPrecio()} disabled={guardando} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </button>
            <p className="text-[11px] text-gray-400">Uno por cultivo y día: si ya hay uno ese día, se corrige.</p>
          </div>
          {precios.length > 0 && (
            <details>
              <summary className="text-sm text-emerald-700 cursor-pointer">Últimos cargados</summary>
              <ul className="mt-2 divide-y divide-gray-100 text-sm">
                {precios.slice(0, 20).map((p) => (
                  <li key={p.id} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="text-gray-600">{formatDate(p.fecha)} · {p.cultivo}{p.destino ? ` · ${p.destino}` : ''}</span>
                    <span className="flex items-center gap-1">
                      <span className="tabular-nums text-gray-800">{fmt(p.precio_usd)}</span>
                      {usuario.rol === 'admin' && <button onClick={() => void borrarPrecio(p)} className="p-1 text-gray-300 hover:text-red-600" aria-label="Borrar precio"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* ===== Relación ===== */}
        <section className="lg:col-span-3 bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Relación</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <span className="block text-xs font-medium text-gray-600 mb-1">Insumo</span>
              {sel ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50/50 px-3 py-2">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-sm font-medium text-gray-800 truncate">{sel.producto} <BotonFicha cod={sel.cod} producto={sel.producto} /></span>
                    <span className="block text-xs text-gray-500">{sel.cod} · costo {sel.moneda === 'ARS' ? '$' : 'USD'} {fmt(costoHoy!.valor)}/{costoHoy!.unidad}</span>
                  </span>
                  <button onClick={() => { setSel(null); setBusqueda(''); }} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Elegir otro insumo"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Urea, MAP, glifosato…" className={inputCls + ' pl-9'} />
                  {busqueda.trim() && (
                    <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                      {resultados.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No hay productos que coincidan.</li>}
                      {resultados.map((p) => (
                        <li key={p.id}><button onClick={() => setSel(p)} className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm">
                          <span className="block font-medium text-gray-800 truncate">{p.producto}</span>
                          <span className="block text-xs text-gray-500">{p.cod} · {p.familia || 'Sin familia'}</span>
                        </button></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Grano</span>
              <select value={cultivo} onChange={(e) => setCultivo(e.target.value)} className={inputCls}>
                {CULTIVOS_CANJE.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-2 text-xs text-gray-500">Insumo
              <Segmentado valor={baseInsumo} onChange={setBaseInsumo} opciones={[{ v: 'venta', t: `Precio de venta${sel ? ` (${formatInputNumber(margen, 1)} %)` : ''}` }, { v: 'costo', t: 'Costo' }]} />
            </span>
            <span className="flex items-center gap-2 text-xs text-gray-500">Grano
              <Segmentado valor={baseGrano} onChange={setBaseGrano} opciones={[{ v: 'lleno', t: 'Precio lleno' }, { v: 'neto', t: 'Neto liquidación' }]} />
            </span>
          </div>

          {!sel ? (
            <p className="text-sm text-gray-500 py-6 text-center">Elegí un insumo para ver cuánto {cultivo.toLowerCase()} hace falta para pagarlo.</p>
          ) : !granoHoy ? (
            <p className="text-sm text-amber-700 py-6 text-center">No hay precio de {cultivo.toLowerCase()} cargado. Cargalo a la izquierda.</p>
          ) : (
            <>
              <div className="rounded-xl bg-emerald-900 text-white px-5 py-4">
                <p className="text-emerald-300 text-xs">Hoy, con {cultivo.toLowerCase()} a USD {fmt(precioGrano(granoHoy.precio_usd))}/tn{baseGrano === 'neto' ? ' neto' : ''} ({granoHoy.fecha === hoyAR() ? 'precio de hoy' : `precio del ${formatDate(granoHoy.fecha)}`})</p>
                <p className="cifra text-5xl mt-1">{fmt(relHoy)} <span className="text-lg font-semibold text-amber-300">{unidad}</span></p>
                <p className="text-sm text-emerald-100 mt-1">
                  {sel.es_fertilizante
                    ? <>Con 100 tn de {cultivo.toLowerCase()} se pagan <strong>{fmt(relHoy > 0 ? 100 / relHoy : 0, 1)} tn</strong> de {sel.producto}.</>
                    : <>Con 1 tn de {cultivo.toLowerCase()} se pagan <strong>{fmt(relHoy > 0 ? 1000 / relHoy : 0, 0)} {costoHoy!.unidad}</strong> de {sel.producto}.</>}
                  {' '}Insumo a USD {fmt(insumoHoy)}/{costoHoy!.unidad} sin IVA.
                </p>
              </div>

              {historiaInsumo === null ? (
                <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /></div>
              ) : resumen && serie.length >= 2 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div className={`rounded-lg px-3 py-2 ${resumen.vsPromedioPct <= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <p className="text-xs text-gray-500">Contra el promedio</p>
                      <p className={`font-semibold flex items-center gap-1 ${resumen.vsPromedioPct <= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
                        {resumen.vsPromedioPct <= 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                        {resumen.vsPromedioPct > 0 ? '+' : ''}{fmt(resumen.vsPromedioPct, 1)} %
                      </p>
                      <p className="text-[11px] text-gray-500">{resumen.vsPromedioPct <= 0 ? 'hoy está más barato en grano' : 'hoy está más caro en grano'}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2"><p className="text-xs text-gray-500">Promedio</p><p className="font-semibold text-gray-800">{fmt(resumen.promedio)}</p></div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2"><p className="text-xs text-gray-500">Mínimo</p><p className="font-semibold text-gray-800">{fmt(resumen.minimo.relacion)}</p><p className="text-[11px] text-gray-400">{formatDate(resumen.minimo.fecha)}</p></div>
                    <div className="rounded-lg bg-gray-50 px-3 py-2"><p className="text-xs text-gray-500">Máximo</p><p className="font-semibold text-gray-800">{fmt(resumen.maximo.relacion)}</p><p className="text-[11px] text-gray-400">{formatDate(resumen.maximo.fecha)}</p></div>
                  </div>
                  <GraficoRelacion serie={serie} promedio={resumen.promedio} unidad={unidad} />
                  <p className="text-[11px] text-gray-400">Cada punto usa el último costo de lista y el último precio del grano conocidos a esa fecha{baseInsumo === 'venta' ? `, con el margen de hoy (${formatInputNumber(margen, 1)} %)` : ''}.</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Para ver la historia hacen falta precios del grano de varios días. Cargando el precio cada día (o cada vez que cambie), el gráfico se arma solo.</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
