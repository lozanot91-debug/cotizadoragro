import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Truck, Package, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { buscarProductos, costoDeLista, fleteConsulta } from '@/lib/consulta';
import { formatUSD, formatDate, parseNumberInput } from '@/lib/format';
import type { ConvenioFlete, ListaCostos, ProductoConCosto, TarifaFlete, TipoCambioBNA } from '@/types';
import { elegirConvenio, nombreConvenio } from '@/lib/convenios';

/** Consulta rápida: costo de lista de un insumo y flete por km (en $/tn y USD/tn al TC comprador divisa BNA). */
export default function ConsultaCostos() {
  const data = useData();
  const [loading, setLoading] = useState(true);
  const [lista, setLista] = useState<ListaCostos | null>(null);
  const [productos, setProductos] = useState<ProductoConCosto[]>([]);
  const [anteriores, setAnteriores] = useState<Map<string, number>>(new Map());
  const [convenios, setConvenios] = useState<ConvenioFlete[]>([]);
  const [convenioId, setConvenioId] = useState<string | null>(null);
  const [tcBna, setTcBna] = useState<TipoCambioBNA | null>(null);
  const [tcRespaldo, setTcRespaldo] = useState(0);

  const [busqueda, setBusqueda] = useState('');
  const [sel, setSel] = useState<ProductoConCosto | null>(null);
  const [kmTxt, setKmTxt] = useState('');

  const cargar = useCallback(async () => {
    const [listas, convs, cfg] = await Promise.all([data.fetchListas(), data.fetchConvenios(), data.fetchConfig()]);
    setConvenios(convs);
    setTcRespaldo(cfg.tipo_cambio_default);
    setLista(listas[0] ?? null);
    if (listas[0]) {
      const [act, ant] = await Promise.all([
        data.fetchProductosConCosto(listas[0].id),
        listas[1] ? data.fetchProductosConCosto(listas[1].id) : Promise.resolve([] as ProductoConCosto[]),
      ]);
      setProductos(act);
      setAnteriores(new Map(ant.map((p) => [p.cod, p.costo])));
    }
    void data.fetchTipoCambioBNA().then(setTcBna);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const resultados = useMemo(() => (sel ? [] : buscarProductos(productos, busqueda)), [productos, busqueda, sel]);

  // Para el flete se usa el TC comprador divisa BNA; si no responde, el TC de respaldo de la configuración
  const tc = tcBna?.compra || tcRespaldo;
  const km = parseNumberInput(kmTxt);
  const convenio = useMemo(() => elegirConvenio(convenios, convenioId), [convenios, convenioId]);
  const tarifas = useMemo<TarifaFlete[]>(() => convenio?.tarifas ?? [], [convenio]);
  const flete = useMemo(() => fleteConsulta(km, tarifas, tc), [km, tarifas, tc]);
  const kmMax = tarifas.length ? tarifas[tarifas.length - 1].km : 0;

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  const costo = sel ? costoDeLista(sel) : null;
  const costoAnt = sel ? anteriores.get(sel.cod) : undefined;
  const variacion = sel && costoAnt && costoAnt > 0 ? ((sel.costo - costoAnt) / costoAnt) * 100 : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titulo text-3xl text-emerald-900 flex items-center gap-2"><Search className="w-7 h-7" /> Consulta de costos</h1>
        <p className="text-sm text-gray-500 mt-1">Costo de lista de un insumo y flete por distancia, sin armar una cotización.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* ===== Costo de un insumo ===== */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Package className="w-5 h-5 text-emerald-700" /> Costo de insumo</h2>
            {lista && <span className="text-xs text-gray-500">Lista del {formatDate(lista.fecha)}</span>}
          </div>

          {!lista ? (
            <p className="text-sm text-gray-500">No hay lista de costos cargada.</p>
          ) : sel && costo ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{sel.producto}</p>
                  <p className="text-xs text-gray-500">{sel.cod} · {sel.proveedor || 'Sin proveedor'} · {sel.familia || 'Sin familia'}</p>
                </div>
                <button onClick={() => { setSel(null); setBusqueda(''); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" aria-label="Buscar otro"><X className="w-4 h-4" /></button>
              </div>
              <div className="mt-4 rounded-lg bg-emerald-900 text-white px-4 py-3">
                <p className="text-emerald-300 text-xs">Costo de lista</p>
                <p className="cifra text-4xl mt-1">
                  {costo.moneda === 'ARS' ? '$ ' : ''}{formatUSD(costo.valor, 2)}
                  <span className="text-base font-semibold text-amber-300 ml-1.5">{costo.moneda === 'ARS' ? 'ARS' : 'USD'}/{costo.unidad}</span>
                </p>
                {costo.moneda === 'ARS' && tcBna && (
                  <p className="text-xs text-emerald-200 mt-1">≈ USD {formatUSD(costo.valor / tcBna.venta, 2)}/{costo.unidad} al TC vendedor BNA $ {formatUSD(tcBna.venta, 2)}</p>
                )}
              </div>
              {variacion !== null && Math.abs(variacion) >= 0.05 && costoAnt !== undefined && (
                <p className={`mt-2 text-sm flex items-center gap-1 ${variacion > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {variacion > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                  {variacion > 0 ? '+' : ''}{formatUSD(variacion, 1)} % contra la lista anterior ({formatUSD(sel.es_fertilizante ? costoAnt * 1000 : costoAnt, 2)})
                </p>
              )}
              {variacion !== null && Math.abs(variacion) < 0.05 && <p className="mt-2 text-sm text-gray-500">Igual que en la lista anterior.</p>}
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="search" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscá por nombre, código, proveedor o familia..."
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              {busqueda.trim() && (
                <ul className="mt-2 divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                  {resultados.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">No hay productos que coincidan en la lista vigente.</li>}
                  {resultados.map((p) => {
                    const c = costoDeLista(p);
                    return (
                      <li key={p.id}>
                        <button onClick={() => setSel(p)} className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-800 truncate">{p.producto}</span>
                            <span className="block text-xs text-gray-500 truncate">{p.cod} · {p.proveedor || 'Sin proveedor'}</span>
                          </span>
                          <span className="text-sm text-gray-700 whitespace-nowrap">{c.moneda === 'ARS' ? '$' : 'USD'} {formatUSD(c.valor, 2)}<span className="text-xs text-gray-400">/{c.unidad}</span></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-gray-400 mt-2">{productos.length} productos en la lista vigente.</p>
            </div>
          )}
        </section>

        {/* ===== Flete ===== */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-3"><Truck className="w-5 h-5 text-emerald-700" /> Flete</h2>
          <label htmlFor="consulta-convenio" className="block text-sm font-medium text-gray-700 mb-1">Convenio</label>
          <select id="consulta-convenio" value={convenio?.id ?? ''} onChange={(e) => setConvenioId(e.target.value)} disabled={convenios.length === 0}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white mb-3">
            {convenios.length === 0 && <option value="">Sin convenios cargados</option>}
            {convenios.map((c) => <option key={c.id} value={c.id}>{nombreConvenio(c)}{c.predeterminado ? ' (predet.)' : ''}</option>)}
          </select>
          <label htmlFor="consulta-km" className="block text-sm font-medium text-gray-700 mb-1">Distancia (km)</label>
          <input id="consulta-km" type="text" inputMode="decimal" value={kmTxt} onChange={(e) => setKmTxt(e.target.value)} placeholder="Ej.: 120"
            className="w-full sm:w-40 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />

          {km > 0 && !flete && (
            <p className="mt-3 text-sm text-amber-700">No hay tarifa para {Math.ceil(km)} km en este convenio{kmMax ? ` (la planilla llega hasta ${kmMax} km)` : ''}.</p>
          )}
          {flete && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500">Pesos por tonelada</p>
                <p className="cifra text-3xl text-gray-900 mt-1">$ {formatUSD(flete.pesosTn, 0)}</p>
              </div>
              <div className="rounded-lg bg-emerald-900 text-white px-4 py-3">
                <p className="text-xs text-emerald-300">USD por tonelada</p>
                <p className="cifra text-3xl mt-1">{formatUSD(flete.usdTn, 2)}</p>
              </div>
            </div>
          )}
          <div className="mt-4 text-xs text-gray-500 space-y-0.5">
            <p>
              TC: <strong className="text-gray-700">$ {formatUSD(tc, 2)}</strong>{' '}
              {tcBna ? `· BNA divisa comprador ${formatDate(tcBna.fecha)}` : '· TC de respaldo (no respondió el BNA)'}
              {tcBna?.desactualizado && <span className="text-amber-700"> (no se pudo actualizar)</span>}
            </p>
            {flete && flete.km !== km && <p>Se toma la tarifa de {flete.km} km (se redondea hacia arriba).</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
