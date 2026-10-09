import { useCallback, useEffect, useMemo, useState } from 'react';
import { Swords, Loader2, Search, Plus, X, Trash2, Save } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { CampoNumero } from '@/components/LiquidacionCanje';
import { buscarProductos, costoDeLista } from '@/lib/consulta';
import { precioConMargen, resolverMargen } from '@/lib/calculations';
import { competidoresConocidos, diferenciaPct, resumirPorCompetidor, resumirPorProducto } from '@/lib/competencia';
import { hoyAR, sumarDias } from '@/lib/fechas';
import { formatDate, formatUSD } from '@/lib/format';
import type { Cliente, Configuracion, PrecioCompetencia, ProductoConCosto } from '@/types';

const fmt = (n: number, d = 2) => formatUSD(n, d);
const inputCls = 'w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500';
const PERIODOS = [{ v: 90, t: '3 meses' }, { v: 365, t: '1 año' }, { v: 0, t: 'Todo' }];

function Dif({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-300">—</span>;
  return <span className={pct < 0 ? 'text-red-700' : 'text-emerald-700'}>{pct > 0 ? '+' : ''}{fmt(pct, 1)} %</span>;
}

/** Precios de la competencia: contra quién se pierde y por cuánto, por producto. */
export default function Competencia() {
  const data = useData();
  const toast = useToast();
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [regs, setRegs] = useState<PrecioCompetencia[]>([]);
  const [productos, setProductos] = useState<ProductoConCosto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [periodo, setPeriodo] = useState(365);
  const [q, setQ] = useState('');
  const [vista, setVista] = useState<'productos' | 'competidores' | 'detalle'>('productos');

  // Carga a mano
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<ProductoConCosto | null>(null);
  const [competidor, setCompetidor] = useState('');
  const [precio, setPrecio] = useState(0);
  const [nuestro, setNuestro] = useState(0);
  const [clienteTxt, setClienteTxt] = useState('');
  const [fecha, setFecha] = useState(hoyAR());
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const [r, prods, cls, cfg] = await Promise.all([data.fetchPreciosCompetencia(), data.fetchProductosVigentes(), data.fetchClientes(), data.fetchConfig()]);
    setRegs(r); setClientes(cls); setConfig(cfg);
    setProductos(prods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const filtrados = useMemo(() => {
    const desde = periodo ? sumarDias(hoyAR(), -periodo) : '';
    const t = q.trim().toLowerCase();
    return regs.filter((r) => (!desde || r.fecha >= desde) && (!t || `${r.producto} ${r.cod || ''} ${r.competidor} ${r.cliente_nombre || ''}`.toLowerCase().includes(t)));
  }, [regs, periodo, q]);
  const porProducto = useMemo(() => resumirPorProducto(filtrados), [filtrados]);
  const porCompetidor = useMemo(() => resumirPorCompetidor(filtrados), [filtrados]);
  const conocidos = useMemo(() => competidoresConocidos(regs), [regs]);
  const resultados = useMemo(() => (sel ? [] : buscarProductos(productos, busca, 8)), [productos, busca, sel]);

  /** Al elegir el producto se sugiere nuestro precio de venta de hoy (costo de lista + margen sugerido). */
  function elegir(p: ProductoConCosto) {
    setSel(p);
    if (config) {
      const c = costoDeLista(p);
      const usd = p.moneda === 'ARS' ? c.valor / (config.tipo_cambio_default || 1) : c.valor;
      setNuestro(Math.round(precioConMargen(usd, resolverMargen(p, config.margen_general, [])) * 100) / 100);
    }
  }

  async function guardar() {
    if (!sel && !busca.trim()) { toast.aviso('Elegí el producto.'); return; }
    if (!competidor.trim()) { toast.aviso('Escribí el competidor.'); return; }
    if (!(precio > 0)) { toast.aviso('Cargá el precio que ofreció.'); return; }
    const cli = clientes.find((c) => c.nombre.trim().toLowerCase() === clienteTxt.trim().toLowerCase()) ?? null;
    setGuardando(true);
    try {
      await data.guardarPreciosCompetencia([{
        fecha, cotizacion_id: null, cliente_id: cli?.id ?? null, cliente_nombre: cli?.nombre ?? (clienteTxt.trim() || null),
        cod: sel?.cod ?? null, producto: sel?.producto || busca.trim(), unidad: sel ? costoDeLista(sel).unidad : null,
        competidor: competidor.trim(), precio_usd: precio, nuestro_precio_usd: nuestro > 0 ? nuestro : null,
        origen: 'manual', notas: notas.trim() || null, usuario_nombre: usuario.nombre || null,
      }]);
      toast.exito('Precio de la competencia guardado');
      setSel(null); setBusca(''); setPrecio(0); setNuestro(0); setNotas('');
      setRegs(await data.fetchPreciosCompetencia());
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  async function borrar(r: PrecioCompetencia) {
    if (!window.confirm(`¿Borrar el precio de ${r.competidor} para ${r.producto}?`)) return;
    try { await data.eliminarPrecioCompetencia(r.id); setRegs((x) => x.filter((y) => y.id !== r.id)); } catch (e) { toast.error(e); }
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titulo text-3xl text-emerald-900 flex items-center gap-2"><Swords className="w-7 h-7" /> Competencia</h1>
          <p className="text-sm text-gray-500 mt-1">Cuánto ofrecieron otros y quién. Se carga al perder por precio o competencia, o a mano cuando un cliente te lo cuenta.</p>
        </div>
        <button onClick={() => setAbierto((a) => !a)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1.5">
          {abierto ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {abierto ? 'Cerrar' : 'Anotar un precio'}
        </button>
      </div>

      {abierto && (
        <section className="bg-white rounded-xl border border-emerald-200 p-5 space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <span className="block text-xs font-medium text-gray-600 mb-1">Producto</span>
              {sel ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50/50 px-3 py-2 text-sm">
                  <span className="truncate">{sel.producto} <span className="text-xs text-gray-400">{sel.cod}</span></span>
                  <button onClick={() => { setSel(null); setBusca(''); }} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Elegir otro"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar en la lista (o escribir el nombre)" className={inputCls + ' pl-9'} />
                  {busca.trim() && resultados.length > 0 && (
                    <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                      {resultados.map((p) => (
                        <li key={p.id}><button onClick={() => elegir(p)} className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-sm"><span className="font-medium text-gray-800">{p.producto}</span> <span className="text-xs text-gray-400">{p.cod}</span></button></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Competidor</span>
              <input list="competidores-lista" value={competidor} onChange={(e) => setCompetidor(e.target.value)} maxLength={120} placeholder="Empresa" className={inputCls} />
              <datalist id="competidores-lista">{conocidos.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <CampoNumero label={`Precio que ofreció${sel ? ` (USD/${costoDeLista(sel).unidad})` : ' (USD)'}`} sufijo="USD" value={precio} onChange={setPrecio} ayuda="Sin IVA" />
            <CampoNumero label="Nuestro precio" sufijo="USD" value={nuestro} onChange={setNuestro} ayuda={sel ? 'Sugerido: costo de lista + margen' : 'Para comparar (opcional)'} />
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Fecha</span>
              <input type="date" value={fecha} max={hoyAR()} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Cliente <span className="font-normal text-gray-400">(opcional)</span></span>
              <input list="competencia-clientes" value={clienteTxt} onChange={(e) => setClienteTxt(e.target.value)} className={inputCls} />
              <datalist id="competencia-clientes">{clientes.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
            </label>
            <label className="block sm:col-span-2">
              <span className="block text-xs font-medium text-gray-600 mb-1">Notas <span className="font-normal text-gray-400">(plazo, condiciones…)</span></span>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} className={inputCls} />
            </label>
          </div>
          <button onClick={() => void guardar()} disabled={guardando} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
          </button>
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
            {([['productos', 'Por producto'], ['competidores', 'Por competidor'], ['detalle', 'Todos']] as const).map(([v, t]) => (
              <button key={v} onClick={() => setVista(v)} className={`px-3 py-1.5 rounded-md text-sm font-medium ${vista === v ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>{t}</button>
            ))}
          </div>
          <select value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))} aria-label="Período" className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            {PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por producto, competidor o cliente" className={inputCls + ' max-w-xs'} />
          <span className="text-xs text-gray-400 ml-auto">{filtrados.length} registros</span>
        </div>

        {filtrados.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">{regs.length ? 'Nada con ese filtro.' : 'Todavía no hay precios de la competencia. Se cargan al pasar una cotización a Perdida por precio o competencia, o con "Anotar un precio".'}</p>
        ) : vista === 'productos' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead><tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="text-left py-2 font-medium">Producto</th>
                <th className="text-right py-2 font-medium">Último de la competencia</th>
                <th className="text-left py-2 pl-3 font-medium">Quién</th>
                <th className="text-right py-2 font-medium">vs nuestro</th>
                <th className="text-right py-2 font-medium">Dif. promedio</th>
                <th className="text-left py-2 pl-3 font-medium">Competidores</th>
              </tr></thead>
              <tbody>
                {porProducto.map((p) => (
                  <tr key={p.clave} className="border-b border-gray-100">
                    <td className="py-2"><p className="text-gray-800">{p.producto}</p><p className="text-[11px] text-gray-400">{p.cod || 'sin código'} · {p.registros} {p.registros === 1 ? 'registro' : 'registros'}</p></td>
                    <td className="py-2 text-right tabular-nums">USD {fmt(p.ultimo.precio_usd)}{p.ultimo.unidad ? <span className="text-xs text-gray-400">/{p.ultimo.unidad}</span> : null}<p className="text-[11px] text-gray-400">{formatDate(p.ultimo.fecha)}</p></td>
                    <td className="py-2 pl-3">{p.ultimo.competidor}</td>
                    <td className="py-2 text-right tabular-nums"><Dif pct={diferenciaPct(p.ultimo)} /></td>
                    <td className="py-2 text-right tabular-nums"><Dif pct={p.difPromedio} /></td>
                    <td className="py-2 pl-3 text-xs text-gray-500">{p.competidores.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-400 mt-2">"vs nuestro": cuánto más barato (rojo) o más caro (verde) estuvo el competidor contra nuestro precio final sin IVA.</p>
          </div>
        ) : vista === 'competidores' ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {porCompetidor.map((c) => (
              <div key={c.competidor} className="rounded-lg border border-gray-200 p-3">
                <p className="font-semibold text-gray-800">{c.competidor}</p>
                <p className="text-xs text-gray-500">{c.registros} {c.registros === 1 ? 'registro' : 'registros'} · {c.productos} {c.productos === 1 ? 'producto' : 'productos'} · último {formatDate(c.ultimo)}</p>
                <p className="text-sm mt-1">Diferencia promedio: <strong><Dif pct={c.difPromedio} /></strong></p>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead><tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="text-left py-2 font-medium">Fecha</th>
                <th className="text-left py-2 font-medium">Producto</th>
                <th className="text-left py-2 font-medium">Competidor</th>
                <th className="text-right py-2 font-medium">Precio</th>
                <th className="text-right py-2 font-medium">Nuestro</th>
                <th className="text-right py-2 font-medium">Dif.</th>
                <th className="text-left py-2 pl-3 font-medium">Cliente</th>
                <th className="w-8" />
              </tr></thead>
              <tbody>
                {filtrados.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 align-top">
                    <td className="py-2 whitespace-nowrap">{formatDate(r.fecha)}</td>
                    <td className="py-2">{r.producto}{r.notas && <p className="text-[11px] text-gray-500 italic">{r.notas}</p>}</td>
                    <td className="py-2">{r.competidor}<p className="text-[11px] text-gray-400">{r.origen === 'perdida' ? 'cotización perdida' : r.origen === 'ganada_parcial' ? 'ganada parcial' : `cargado por ${r.usuario_nombre || '—'}`}</p></td>
                    <td className="py-2 text-right tabular-nums">{fmt(r.precio_usd)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-500">{r.nuestro_precio_usd ? fmt(r.nuestro_precio_usd) : '—'}</td>
                    <td className="py-2 text-right tabular-nums"><Dif pct={diferenciaPct(r)} /></td>
                    <td className="py-2 pl-3 text-gray-600">{r.cliente_nombre || '—'}</td>
                    <td className="py-2">{(usuario.rol === 'admin' || r.usuario_id === usuario.id) && <button onClick={() => void borrar(r)} className="p-1 text-gray-300 hover:text-red-600" aria-label="Borrar"><Trash2 className="w-4 h-4" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
