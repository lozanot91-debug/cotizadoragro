import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, Truck, Package, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { BotonFicha } from '@/components/FichaProducto';
import { buscarProductos, costoDeLista, fleteConsultaTramos, precioConsulta, type FleteConsulta } from '@/lib/consulta';
import { ivaPorDefecto, resolverMargen } from '@/lib/calculations';
import { MODALIDADES, nombreTramoPrincipal, tieneCorto } from '@/lib/fleteTramos';
import { formatUSD, formatDate, parseNumberInput, formatInputNumber } from '@/lib/format';
import type { Configuracion, ConvenioFlete, ListaCostos, ModalidadFlete, Planta, ProductoConCosto, TipoCambioBNA } from '@/types';
import { elegirConvenioVigente, conveniosParaElegir, etiquetaConvenio } from '@/lib/convenios';

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
  const [config, setConfig] = useState<Configuracion | null>(null);
  // Margen para calcular el precio de venta del insumo elegido (arranca en el sugerido del producto)
  const [margenTxt, setMargenTxt] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [sel, setSel] = useState<ProductoConCosto | null>(null);
  const [kmTxt, setKmTxt] = useState('');
  // Flete por tramos, como en la cotización
  const [modalidad, setModalidad] = useState<ModalidadFlete>('directo');
  const [kmCortoTxt, setKmCortoTxt] = useState('');
  const [convenioCortoId, setConvenioCortoId] = useState<string | null>(null);
  const [plantas, setPlantas] = useState<Planta[]>([]);
  const [plantaId, setPlantaId] = useState('');

  const montado = useRef(true);
  const cargar = useCallback(async () => {
    const [listas, convs, cfg] = await Promise.all([data.fetchListas(), data.fetchConvenios(), data.fetchConfig()]);
    setConvenios(convs);
    setTcRespaldo(cfg.tipo_cambio_default);
    setConfig(cfg);
    setLista(listas[0] ?? null);
    if (listas[0]) {
      const [act, ant] = await Promise.all([
        data.fetchProductosConCosto(listas[0].id),
        listas[1] ? data.fetchProductosConCosto(listas[1].id) : Promise.resolve([] as ProductoConCosto[]),
      ]);
      setProductos(act);
      setAnteriores(new Map(ant.map((p) => [p.cod, p.costo])));
    }
    void data.fetchTipoCambioBNA().then((b) => { if (montado.current) setTcBna(b); }).catch(() => {});
    data.fetchPlantasFlete().then((p) => { if (montado.current) setPlantas(p); }).catch((e) => console.error('No se pudieron cargar las plantas:', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const resultados = useMemo(() => (sel ? [] : buscarProductos(productos, busqueda)), [productos, busqueda, sel]);

  // Para el flete se usa el TC comprador divisa BNA; si no responde, el TC de respaldo de la configuración
  const tc = tcBna?.compra || tcRespaldo;
  const conCorto = tieneCorto(modalidad);
  const km = parseNumberInput(kmTxt);
  const kmCorto = parseNumberInput(kmCortoTxt);
  const convenio = useMemo(() => elegirConvenioVigente(convenios, convenioId), [convenios, convenioId]);
  const convenioCorto = useMemo(() => elegirConvenioVigente(convenios, convenioCortoId), [convenios, convenioCortoId]);
  const flete = useMemo(() => fleteConsultaTramos(
    conCorto
      ? [{ km, tarifas: convenio?.tarifas ?? [] }, { km: kmCorto, tarifas: convenioCorto?.tarifas ?? [] }]
      : [{ km, tarifas: convenio?.tarifas ?? [] }],
    tc,
  ), [conCorto, km, kmCorto, convenio, convenioCorto, tc]);

  /** Elegir planta (largo) precarga sus km a puerto; se pueden cambiar. */
  function elegirPlanta(id: string) {
    setPlantaId(id);
    const p = plantas.find((x) => x.id === id);
    if (p?.km_puerto) setKmTxt(String(p.km_puerto).replace('.', ','));
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  const costo = sel ? costoDeLista(sel) : null;
  const margenSugerido = sel && config ? resolverMargen(sel, config.margen_general, []) : null;
  const margenNum = margenTxt.trim() === '' ? NaN : parseNumberInput(margenTxt);
  const ivaPct = sel && config ? ivaPorDefecto(sel.es_fertilizante, config) : 0;
  const venta = costo ? precioConsulta(costo.valor, margenNum, ivaPct) : null;
  const pre = costo?.moneda === 'ARS' ? '$ ' : 'USD ';
  // Fertilizantes en USD: precio puesto sumando el flete calculado en la sección de al lado
  const fletePuesto = venta && sel?.es_fertilizante && costo?.moneda === 'USD' && flete.total ? flete.total.usdTn : null;
  const costoAnt = sel ? anteriores.get(sel.cod) : undefined;
  const variacion = sel && costoAnt && costoAnt > 0 ? ((sel.costo - costoAnt) / costoAnt) * 100 : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titulo text-3xl text-emerald-900 flex items-center gap-2"><Search className="w-7 h-7" /> Consulta de costos</h1>
        <p className="text-sm text-gray-500 mt-1">Costo de lista de un insumo, precio de venta con el margen que pongas y flete por distancia, sin armar una cotización.</p>
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
                  <p className="font-semibold text-gray-900 flex items-center gap-1">{sel.producto} <BotonFicha cod={sel.cod} producto={sel.producto} /></p>
                  <p className="text-xs text-gray-500">{sel.cod} · {sel.proveedor || 'Sin proveedor'} · {sel.familia || 'Sin familia'}</p>
                </div>
                <button onClick={() => { setSel(null); setBusqueda(''); setMargenTxt(''); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" aria-label="Buscar otro"><X className="w-4 h-4" /></button>
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

              {/* Precio de venta con margen */}
              <div className="mt-4 rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="consulta-margen" className="block text-sm font-medium text-gray-700 mb-1">Margen</label>
                    <div className="flex items-center gap-1.5">
                      <input id="consulta-margen" type="text" inputMode="decimal" value={margenTxt} onChange={(e) => setMargenTxt(e.target.value)} placeholder="0"
                        className="w-24 px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-emerald-500 outline-none" />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  </div>
                  {margenSugerido !== null && Math.abs((Number.isNaN(margenNum) ? -1 : margenNum) - margenSugerido) > 0.001 && (
                    <button onClick={() => setMargenTxt(formatInputNumber(margenSugerido, 2))} className="mb-2 text-xs text-emerald-700 hover:text-emerald-800 underline">
                      Usar el sugerido ({formatUSD(margenSugerido, margenSugerido % 1 ? 1 : 0)} %)
                    </button>
                  )}
                </div>
                {venta ? (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs text-gray-500">Precio de venta (sin IVA)</p>
                    <p className="cifra text-3xl text-gray-900">{pre}{formatUSD(venta.precio, 2)}<span className="text-sm font-semibold text-gray-500 ml-1.5">/{costo.unidad}</span></p>
                    <p className="text-sm text-gray-600">Ganancia {pre}{formatUSD(venta.ganancia, 2)}/{costo.unidad} · con IVA {formatUSD(ivaPct, 1)} %: {pre}{formatUSD(venta.conIva, 2)}</p>
                    {costo.moneda === 'ARS' && tcBna && <p className="text-xs text-gray-500">≈ USD {formatUSD(venta.precio / tcBna.venta, 2)}/{costo.unidad} al TC vendedor BNA</p>}
                    {fletePuesto !== null && (
                      <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2 mt-2">Con el flete de la consulta (USD {formatUSD(fletePuesto, 2)}/tn): <strong>USD {formatUSD(venta.precio + fletePuesto, 2)}/tn</strong> puesto</p>
                    )}
                    {margenNum > 95 && <p className="text-xs text-amber-700">El margen máximo es 95 %.</p>}
                  </div>
                ) : <p className="mt-2 text-sm text-gray-500">Poné un margen para ver el precio de venta.</p>}
              </div>
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
                        <button onClick={() => { setSel(p); setMargenTxt(config ? formatInputNumber(resolverMargen(p, config.margen_general, []), 2) : ''); }} className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center justify-between gap-3">
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
          <p className="block text-sm font-medium text-gray-700 mb-1">Modalidad</p>
          <div role="radiogroup" aria-label="Modalidad de flete" className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit max-w-full mb-3">
            {MODALIDADES.map((m) => (
              <button key={m.valor} type="button" role="radio" aria-checked={modalidad === m.valor} title={m.detalle} onClick={() => setModalidad(m.valor)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${modalidad === m.valor ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {m.nombre}
              </button>
            ))}
          </div>

          <div className="grid gap-3">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">{nombreTramoPrincipal(modalidad)}</p>
              {modalidad !== 'directo' && plantas.length > 0 && (
                <>
                  <label htmlFor="consulta-planta" className="block text-xs text-gray-500 mb-1">Planta</label>
                  <select id="consulta-planta" value={plantaId} onChange={(e) => elegirPlanta(e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white mb-2">
                    <option value="">Cargo los km a mano</option>
                    {plantas.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.km_puerto ? ` · ${formatUSD(p.km_puerto, p.km_puerto % 1 ? 1 : 0)} km a puerto` : ' · sin km a puerto'}</option>)}
                  </select>
                </>
              )}
              <label htmlFor="consulta-convenio" className="block text-xs text-gray-500 mb-1">Convenio</label>
              <select id="consulta-convenio" value={convenio?.id ?? ''} onChange={(e) => setConvenioId(e.target.value)} disabled={convenios.length === 0} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white mb-2">
                {convenios.length === 0 && <option value="">Sin convenios cargados</option>}
                {conveniosParaElegir(convenios).map((c) => <option key={c.id} value={c.id}>{etiquetaConvenio(c)}</option>)}
              </select>
              <label htmlFor="consulta-km" className="block text-xs text-gray-500 mb-1">Distancia (km)</label>
              <input id="consulta-km" type="text" inputMode="decimal" value={kmTxt} onChange={(e) => setKmTxt(e.target.value)} placeholder="Ej.: 120" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              <ResultadoTramo km={km} r={flete.tramos[0]} convenio={convenio} />
            </div>
            {conCorto && (
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-700 mb-2">Corto (planta → campo)</p>
                <label htmlFor="consulta-convenio-corto" className="block text-xs text-gray-500 mb-1">Convenio</label>
                <select id="consulta-convenio-corto" value={convenioCorto?.id ?? ''} onChange={(e) => setConvenioCortoId(e.target.value)} disabled={convenios.length === 0} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white mb-2">
                  {convenios.length === 0 && <option value="">Sin convenios cargados</option>}
                  {conveniosParaElegir(convenios).map((c) => <option key={c.id} value={c.id}>{etiquetaConvenio(c)}</option>)}
                </select>
                <label htmlFor="consulta-km-corto" className="block text-xs text-gray-500 mb-1">Distancia (km)</label>
                <input id="consulta-km-corto" type="text" inputMode="decimal" value={kmCortoTxt} onChange={(e) => setKmCortoTxt(e.target.value)} placeholder="Ej.: 25" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                <ResultadoTramo km={kmCorto} r={flete.tramos[1]} convenio={convenioCorto} />
              </div>
            )}
          </div>

          {flete.total && (
            <div className="mt-4">
              {conCorto && <p className="text-sm font-medium text-gray-700 mb-2">Total largo + corto</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 px-4 py-3">
                  <p className="text-xs text-gray-500">Pesos por tonelada</p>
                  <p className="cifra text-3xl text-gray-900 mt-1">$ {formatUSD(flete.total.pesosTn, 0)}</p>
                </div>
                <div className="rounded-lg bg-emerald-900 text-white px-4 py-3">
                  <p className="text-xs text-emerald-300">USD por tonelada</p>
                  <p className="cifra text-3xl mt-1">{formatUSD(flete.total.usdTn, 2)}</p>
                </div>
              </div>
            </div>
          )}
          <div className="mt-4 text-xs text-gray-500 space-y-0.5">
            <p>
              TC: <strong className="text-gray-700">$ {formatUSD(tc, 2)}</strong>{' '}
              {tcBna ? `· BNA divisa comprador ${formatDate(tcBna.fecha)}` : '· TC de respaldo (no respondió el BNA)'}
              {tcBna?.desactualizado && <span className="text-amber-700"> (no se pudo actualizar)</span>}
            </p>
            <p>Los km se redondean hacia arriba para buscar la tarifa.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function ResultadoTramo({ km, r, convenio }: { km: number; r: FleteConsulta | null; convenio: ConvenioFlete | null }) {
  const tarifas = convenio?.tarifas ?? [];
  const max = tarifas.length ? tarifas[tarifas.length - 1].km : 0;
  if (!(km > 0)) return null;
  if (!r) return <p className="mt-2 text-xs text-amber-700">No hay tarifa para {Math.ceil(km)} km en este convenio{max ? ` (la planilla llega hasta ${max} km)` : ''}.</p>;
  return (
    <p className="mt-2 text-xs text-gray-600">
      {r.km !== km && <span className="text-gray-400">Tarifa de {r.km} km · </span>}
      $ {formatUSD(r.pesosTn, 0)}/tn · <span className="font-medium">USD {formatUSD(r.usdTn, 2)}/tn</span>
    </p>
  );
}
