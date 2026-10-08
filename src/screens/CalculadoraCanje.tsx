import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Wheat, Loader2, Save, Copy, Trash2, RotateCcw, FileText, Upload, ArrowLeftRight, Eye, Check } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { CampoNumero, DesgloseCanje, ParametrosCanje } from '@/components/LiquidacionCanje';
import {
  CULTIVOS_CANJE, PARAMS_CANJE_BASE, conIvaInsumos, montoPorToneladas, netoPorTn, normalizarParams,
  textoWhatsAppCanje, toneladasPorMonto, type ParamsCanje,
} from '@/lib/canje';
import { montoCanjeDeCotizacion } from '@/lib/export';
import { nombreCotizacion } from '@/lib/nombreCotizacion';
import { PLAZAS_PIZARRA, PLAZA_DEFECTO, precioDelDia, ultimaPizarra } from '@/lib/relacion';
import { diasEntre, hoyAR } from '@/lib/fechas';
import { registrarCambio } from '@/lib/historial';
import { formatDate, formatUSD } from '@/lib/format';
import type { Campo, CanjeGuardado, Cliente, ConvenioFlete, Cotizacion, CotizacionLinea, PizarraGrano, PrecioGrano, TipoCambioBNA } from '@/types';
import VistaPreviaCotizacion from '@/components/VistaPreviaCotizacion';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white';
const fmt = (n: number, d = 2) => formatUSD(n, d);

type Modo = 'monto' | 'tn';
/** IVA de los insumos para pasar el monto a "con IVA": null = ya lo incluye */
type IvaInsumos = null | 10.5 | 21;

/**
 * Calculadora de canje suelta: cuántas tn de grano paga un monto de insumos (o al revés),
 * con la liquidación del grano (misma cuenta que la cotización y la facturación). Guarda historial por cliente.
 */
export default function CalculadoraCanje({ clienteInicial, onEditCotiz }: { clienteInicial?: string; onEditCotiz?: (id: string) => void }) {
  const data = useData();
  const toast = useToast();
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [defaults, setDefaults] = useState<ParamsCanje>(PARAMS_CANJE_BASE);
  const [tcBna, setTcBna] = useState<TipoCambioBNA | null>(null);
  const [tcRespaldo, setTcRespaldo] = useState(0);
  const [historial, setHistorial] = useState<CanjeGuardado[]>([]);
  const [convenios, setConvenios] = useState<ConvenioFlete[]>([]);
  const [preciosGrano, setPreciosGrano] = useState<PrecioGrano[]>([]);
  const [pizarras, setPizarras] = useState<PizarraGrano[]>([]);
  const [plaza, setPlaza] = useState<string>(PLAZA_DEFECTO);
  const [camposCliente, setCamposCliente] = useState<Campo[]>([]);

  // Formulario
  const [clienteTxt, setClienteTxt] = useState('');
  const [cotizacionId, setCotizacionId] = useState('');
  const [cultivo, setCultivo] = useState('Soja');
  const [cultivoOtro, setCultivoOtro] = useState('');
  const [precio, setPrecio] = useState(0);
  const [modo, setModo] = useState<Modo>('monto');
  const [monto, setMonto] = useState(0);
  const [ivaInsumos, setIvaInsumos] = useState<IvaInsumos>(null);
  const [tnIngresadas, setTnIngresadas] = useState(0);
  const [params, setParams] = useState<ParamsCanje>(PARAMS_CANJE_BASE);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargandoCotiz, setCargandoCotiz] = useState(false);
  // Vista previa de la cotización traída
  const [previa, setPrevia] = useState<{ cotizacion: Cotizacion; lineas: CotizacionLinea[] } | null>(null);
  const [verPrevia, setVerPrevia] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(async () => {
    const [cls, cots, cfg, hist, convs] = await Promise.all([data.fetchClientes(), data.fetchCotizaciones(), data.fetchConfig(), data.fetchCanjes(), data.fetchConvenios()]);
    setConvenios(convs);
    data.fetchPreciosGrano(300).then(setPreciosGrano).catch(() => setPreciosGrano([]));
    // Pizarras: se muestran las guardadas y, si tienen más de 4 h, se piden de nuevo
    data.fetchPizarrasRecientes().then(setPizarras).catch(() => setPizarras([]));
    void data.actualizarPizarras().then((nuevas) => { if (nuevas) data.fetchPizarrasRecientes().then(setPizarras).catch(() => {}); });
    setClientes(cls);
    setCotizaciones(cots);
    setDefaults(cfg.canje_parametros);
    setParams(cfg.canje_parametros);
    setTcRespaldo(cfg.tipo_cambio_default);
    setHistorial(hist);
    if (clienteInicial) {
      const c = cls.find((x) => x.id === clienteInicial);
      if (c) { setClienteTxt(c.nombre); setFiltro(c.nombre); }
    }
    void data.fetchTipoCambioBNA().then(setTcBna);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteInicial]);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const cliente = useMemo(() => {
    const t = clienteTxt.trim().toLowerCase();
    return t ? clientes.find((c) => c.nombre.trim().toLowerCase() === t) ?? null : null;
  }, [clientes, clienteTxt]);
  const cotizCliente = useMemo(
    () => (cliente ? cotizaciones.filter((c) => c.cliente_id === cliente.id).sort((a, b) => (b.fecha > a.fecha ? 1 : -1)).slice(0, 30) : []),
    [cotizaciones, cliente],
  );

  const tcCompra = tcBna?.compra || tcRespaldo || null;
  const cotizSel = cotizacionId ? cotizaciones.find((x) => x.id === cotizacionId) ?? null : null;

  // Campos del cliente elegido: sus km a puerto sirven para precargar el flete del grano
  useEffect(() => {
    if (!cliente) { setCamposCliente([]); return; }
    let vivo = true;
    data.fetchCampos(cliente.id).then((cs) => { if (vivo) setCamposCliente(cs); }).catch(() => { if (vivo) setCamposCliente([]); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id]);
  const cultivoNombre = cultivo === 'Otro' ? cultivoOtro.trim() : cultivo;
  // Precio sugerido: la pizarra de la plaza elegida (Quequén por defecto; si el último día salió sin cotización,
  // la última que haya, con su fecha). Si alguien cargó a mano un precio más nuevo para esa plaza, ese.
  const tcHoy = tcBna?.compra || tcRespaldo || null;
  const pizarra = cultivoNombre ? ultimaPizarra(pizarras, plaza, cultivoNombre, tcHoy) : null;
  const manual = cultivoNombre ? precioDelDia(preciosGrano.filter((p) => !p.destino || p.destino === plaza), cultivoNombre) : null;
  const sugerido: { fecha: string; usd: number; origen: string; convertido: boolean } | null =
    manual && (!pizarra || manual.fecha > pizarra.fecha) ? { fecha: manual.fecha, usd: manual.precio_usd, origen: 'cargado a mano', convertido: false }
      : pizarra ? { fecha: pizarra.fecha, usd: pizarra.usd, origen: `pizarra ${plaza}`, convertido: pizarra.convertido } : null;
  // Se carga solo si el precio está vacío o sigue siendo el último que se cargó solo (no lo tocaron a mano)
  const precioAutoRef = useRef<number | null>(null);
  const claveSugerido = sugerido ? `${plaza}|${cultivoNombre}|${sugerido.fecha}|${sugerido.usd}` : `${plaza}|${cultivoNombre}|-`;
  useEffect(() => {
    if (!sugerido) return;
    if (precio === 0 || precio === precioAutoRef.current) { setPrecio(sugerido.usd); precioAutoRef.current = sugerido.usd; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveSugerido]);

  function cambiarPlaza(p: string) {
    setPlaza(p);
    setParams((x) => ({ ...x, destino: `${p}, condiciones cámara` }));
  }
  const neto = netoPorTn(precio, params);
  const montoConIva = modo === 'monto' ? conIvaInsumos(monto, ivaInsumos ?? 0) : montoPorToneladas(tnIngresadas, neto);
  const tn = modo === 'monto' ? toneladasPorMonto(montoConIva, neto) : tnIngresadas;

  /** Trae el total con IVA de una cotización del cliente (y su canje, si tenía). */
  async function usarCotizacion(id: string) {
    setCotizacionId(id);
    const c = cotizaciones.find((x) => x.id === id);
    if (!c) return;
    setCargandoCotiz(true);
    try {
      const lineas = await data.fetchLineas(c.id);
      setPrevia({ cotizacion: c, lineas });
      setVerPrevia(true);
      const p = c.canje_params ? normalizarParams(c.canje_params) : params;
      setModo('monto');
      setIvaInsumos(null);
      setMonto(Math.round(montoCanjeDeCotizacion({ ...c, canje_params: p }, lineas) * 100) / 100);
      if (c.canje_precio_usd > 0) {
        setPrecio(c.canje_precio_usd);
        const cult = c.canje_cultivo || 'Soja';
        if (CULTIVOS_CANJE.includes(cult)) { setCultivo(cult); setCultivoOtro(''); } else { setCultivo('Otro'); setCultivoOtro(cult); }
        setParams(p);
      }
    } catch (e) { toast.error(e); } finally { setCargandoCotiz(false); }
  }

  function limpiar() {
    setCotizacionId(''); setPrecio(sugerido?.usd ?? 0); precioAutoRef.current = sugerido?.usd ?? null; setMonto(0); setTnIngresadas(0); setIvaInsumos(null); setNotas(''); setParams({ ...defaults });
  }

  const errores: string[] = [];
  if (!cultivoNombre) errores.push('Falta el cultivo.');
  if (!(precio > 0)) errores.push('Falta el precio del grano.');
  else if (!(neto > 0)) errores.push('El neto por tn da cero: revisá la liquidación.');
  if (!(montoConIva > 0) || !(tn > 0)) errores.push(modo === 'monto' ? 'Falta el monto de insumos.' : 'Faltan las toneladas.');

  async function guardar() {
    if (errores.length) { toast.aviso(errores[0]); return; }
    if (!cliente && !clienteTxt.trim()) { toast.aviso('Elegí o escribí el cliente para guardarlo en su historial.'); return; }
    setGuardando(true);
    try {
      const g = await data.guardarCanje({
        cliente_id: cliente?.id ?? null,
        cliente_nombre: cliente?.nombre ?? clienteTxt.trim(),
        cotizacion_id: cotizacionId || null,
        cultivo: cultivoNombre,
        precio_usd: precio,
        params,
        neto_usd: Math.round(neto * 1e6) / 1e6,
        monto_usd: Math.round(montoConIva * 100) / 100,
        iva_insumos_pct: modo === 'monto' ? ivaInsumos : null,
        tn: Math.round(tn * 1e4) / 1e4,
        tc_compra: tcCompra,
        notas: notas.trim() || null,
      });
      setHistorial((h) => [g, ...h]);
      toast.exito('Canje guardado en el historial');
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  /** Pasa el canje calculado a la cotización traída (cultivo, precio y liquidación) y lo deja en el historial. */
  async function aplicarACotizacion() {
    const c = cotizaciones.find((x) => x.id === cotizacionId);
    if (!c) return;
    if (!cultivoNombre || !(precio > 0) || !(neto > 0)) { toast.aviso(errores[0] || 'Completá el cultivo y el precio.'); return; }
    const antes = c.canje_precio_usd > 0 ? `${c.canje_cultivo} a USD ${fmt(c.canje_precio_usd)}/tn` : 'Sin canje';
    setAplicando(true);
    try {
      const act = await data.aplicarCanjeACotizacion(c.id, { cultivo: cultivoNombre, precio, params });
      setCotizaciones((cs) => cs.map((x) => (x.id === act.id ? { ...x, ...act } : x)));
      setPrevia((p) => (p && p.cotizacion.id === act.id ? { ...p, cotizacion: { ...p.cotizacion, ...act } } : p));
      await registrarCambio({ tipo: 'cotizacion', cotizacion_id: c.id, campo: 'canje', valor_anterior: antes, valor_nuevo: `${cultivoNombre} a USD ${fmt(precio)}/tn (neto ${fmt(neto)}) desde la calculadora` });
      if (modo === 'monto' && montoConIva > 0) {
        const g = await data.guardarCanje({
          cliente_id: cliente?.id ?? c.cliente_id, cliente_nombre: cliente?.nombre ?? c.cliente_nombre, cotizacion_id: c.id,
          cultivo: cultivoNombre, precio_usd: precio, params, neto_usd: Math.round(neto * 1e6) / 1e6,
          monto_usd: Math.round(montoConIva * 100) / 100, iva_insumos_pct: ivaInsumos, tn: Math.round(tn * 1e4) / 1e4,
          tc_compra: tcCompra, notas: notas.trim() || 'Aplicado a la cotización',
        });
        setHistorial((h) => [g, ...h]);
      }
      toast.exito(`Canje aplicado a ${nombreCotizacion(c)}: el PDF y el WhatsApp ya salen con las toneladas`);
    } catch (e) { toast.error(e); } finally { setAplicando(false); }
  }

  async function copiar() {
    if (errores.length) { toast.aviso(errores[0]); return; }
    const texto = textoWhatsAppCanje({ cliente: cliente?.nombre ?? (clienteTxt.trim() || null), cultivo: cultivoNombre, precio, params, monto: montoConIva, tn, fmt });
    try { await navigator.clipboard.writeText(texto); toast.exito('Copiado para WhatsApp'); } catch { toast.aviso('No se pudo copiar. Probá de nuevo.'); }
  }

  function cargarDelHistorial(h: CanjeGuardado) {
    setClienteTxt(h.cliente_nombre || '');
    setCotizacionId(h.cotizacion_id || '');
    if (CULTIVOS_CANJE.includes(h.cultivo)) { setCultivo(h.cultivo); setCultivoOtro(''); } else { setCultivo('Otro'); setCultivoOtro(h.cultivo); }
    setPrecio(h.precio_usd);
    setParams(normalizarParams(h.params));
    setModo('monto'); setIvaInsumos(null); setMonto(h.monto_usd);
    setNotas(h.notas || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function borrar(h: CanjeGuardado) {
    if (!window.confirm('¿Borrar este cálculo del historial?')) return;
    try { await data.eliminarCanje(h.id); setHistorial((x) => x.filter((y) => y.id !== h.id)); } catch (e) { toast.error(e); }
  }

  const histFiltrado = useMemo(() => {
    const t = filtro.trim().toLowerCase();
    return t ? historial.filter((h) => `${h.cliente_nombre || ''} ${h.cultivo} ${h.autor_nombre || ''}`.toLowerCase().includes(t)) : historial;
  }, [historial, filtro]);

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  const subtitulo = modo === 'monto' ? `tn de ${cultivoNombre || 'grano'}` : 'USD de insumos';
  const sinDatos = !(precio > 0) || !(montoConIva > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titulo text-3xl text-emerald-900 flex items-center gap-2"><Wheat className="w-7 h-7" /> Calculadora de canje</h1>
        <p className="text-sm text-gray-500 mt-1">Cuántas toneladas de grano pagan los insumos, con la liquidación completa del grano.</p>
      </div>

      {/* ===== Resultado: franja compacta ===== */}
      <section className="bg-emerald-900 rounded-xl px-5 py-3.5 text-white lg:sticky lg:top-2 z-10 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          <div>
            <p className="cifra text-4xl leading-none">
              {sinDatos ? '—' : modo === 'monto' ? fmt(tn) : fmt(montoConIva)}
              <span className="text-base font-semibold text-amber-300 ml-1.5">{subtitulo}</span>
            </p>
            {tcCompra && montoConIva > 0 && <p className="text-[11px] text-emerald-300 mt-1">≈ $ {fmt(montoConIva * tcCompra, 0)} al TC comprador {fmt(tcCompra)}</p>}
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div><dt className="text-emerald-300 text-xs">Neto liquidación</dt><dd className="font-semibold">USD {fmt(neto)}/tn</dd></div>
            <div><dt className="text-emerald-300 text-xs">{modo === 'monto' ? 'Insumos con IVA' : 'Toneladas'}</dt><dd>{modo === 'monto' ? `USD ${fmt(montoConIva)}` : `${fmt(tn)} tn`}</dd></div>
            {precio > 0 && neto > 0 && <div title="Gastos, impuestos y retenciones sobre el precio con IVA del grano"><dt className="text-emerald-300 text-xs">Descuentos</dt><dd>{fmt((1 - neto / (precio * (1 + params.iva_grano_pct / 100))) * 100, 1)} %</dd></div>}
          </dl>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => void guardar()} disabled={guardando} className="px-3 py-2 bg-amber-400 text-emerald-950 rounded-lg text-sm font-semibold hover:bg-amber-300 disabled:opacity-60 flex items-center gap-1.5">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
            </button>
            <button onClick={() => void copiar()} className="px-3 py-2 border border-emerald-600 rounded-lg text-sm hover:bg-emerald-800 flex items-center gap-1.5"><Copy className="w-4 h-4" /> WhatsApp</button>
            <button onClick={limpiar} className="p-2 text-emerald-300 hover:text-white" title="Limpiar" aria-label="Limpiar"><RotateCcw className="w-4 h-4" /></button>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* ===== Operación ===== */}
        <div className="space-y-5">
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <h2 className="font-semibold text-gray-800">Operación</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Cliente</span>
                <input list="canje-clientes" value={clienteTxt} onChange={(e) => { setClienteTxt(e.target.value); setCotizacionId(''); }} placeholder="Buscar o escribir" className={inputCls} />
                <datalist id="canje-clientes">{clientes.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
                {clienteTxt.trim() && !cliente && <span className="block text-[11px] text-amber-700 mt-0.5">No está en la lista: se guarda solo con el nombre.</span>}
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Traer total de una cotización</span>
                <div className="flex items-center gap-2">
                  <select value={cotizacionId} disabled={!cliente || cargandoCotiz} onChange={(e) => (e.target.value ? void usarCotizacion(e.target.value) : setCotizacionId(''))} className={inputCls + ' disabled:bg-gray-50 disabled:text-gray-400'}>
                    <option value="">{cliente ? (cotizCliente.length ? 'Elegir…' : 'Sin cotizaciones') : 'Primero elegí el cliente'}</option>
                    {cotizCliente.map((c) => <option key={c.id} value={c.id}>{nombreCotizacion(c)} · {formatDate(c.fecha)} · {c.estado}</option>)}
                  </select>
                  {cargandoCotiz && <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />}
                  {!cargandoCotiz && previa && cotizacionId === previa.cotizacion.id && (
                    <button type="button" onClick={() => setVerPrevia(true)} title="Ver la cotización" aria-label="Ver la cotización"
                      className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:text-emerald-700 hover:border-emerald-400 flex-shrink-0"><Eye className="w-4 h-4" /></button>
                  )}
                </div>
                {cotizSel && (
                  <span className="block mt-1.5">
                    {cotizSel.estado === 'Ganada' || cotizSel.estado === 'Perdida' ? (
                      <span className="text-[11px] text-gray-400">Está {cotizSel.estado}: el canje no se puede aplicar.</span>
                    ) : (
                      <button type="button" onClick={() => void aplicarACotizacion()} disabled={aplicando || !(precio > 0) || !(neto > 0)}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:text-gray-400 flex items-center gap-1">
                        {aplicando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        {cotizSel.canje_precio_usd > 0 ? 'Actualizar el canje de la cotización' : 'Aplicar este canje a la cotización'}
                      </button>
                    )}
                  </span>
                )}
              </label>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Cultivo</span>
                <div className="flex gap-2">
                  <select value={cultivo} onChange={(e) => setCultivo(e.target.value)} className={inputCls}>
                    {CULTIVOS_CANJE.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value="Otro">Otro</option>
                  </select>
                  {cultivo === 'Otro' && <input value={cultivoOtro} onChange={(e) => setCultivoOtro(e.target.value)} placeholder="Cultivo" aria-label="Otro cultivo" className={inputCls} />}
                </div>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">Plaza</span>
                <select value={plaza} onChange={(e) => cambiarPlaza(e.target.value)} className={inputCls} aria-label="Plaza de la pizarra">
                  {PLAZAS_PIZARRA.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <div>
                <CampoNumero label="Precio del grano" sufijo="USD/tn" value={precio} onChange={setPrecio} />
                {sugerido ? (
                  <span className={`block text-[11px] mt-0.5 ${diasEntre(sugerido.fecha, hoyAR()) > 7 ? 'text-amber-700' : 'text-gray-400'}`}>
                    {sugerido.origen === 'cargado a mano' ? 'Cargado a mano' : `Pizarra ${plaza}`} {sugerido.fecha === hoyAR() ? 'de hoy' : `del ${formatDate(sugerido.fecha)}`}: USD {fmt(sugerido.usd)}
                    {sugerido.convertido ? ' (pesos al TC comprador)' : ''}
                    {Math.abs(sugerido.usd - precio) > 0.001 && <button type="button" onClick={() => { setPrecio(sugerido.usd); precioAutoRef.current = sugerido.usd; }} className="ml-1.5 text-emerald-700 font-medium hover:underline">Usar</button>}
                  </span>
                ) : cultivoNombre && (
                  <span className="block text-[11px] text-amber-700 mt-0.5">Sin pizarra de {cultivoNombre.toLowerCase()} en {plaza}: cargalo a mano.</span>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-xs font-medium text-gray-600">¿Qué tenés?</span>
                <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
                  <button type="button" onClick={() => setModo('monto')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${modo === 'monto' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>El monto</button>
                  <button type="button" onClick={() => setModo('tn')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1 ${modo === 'tn' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}><ArrowLeftRight className="w-3.5 h-3.5" /> Las toneladas</button>
                </div>
              </div>
              {modo === 'monto' ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  <CampoNumero label="Monto de insumos" sufijo="USD" value={monto} onChange={(n) => { setMonto(n); setCotizacionId(''); }}
                    ayuda={ivaInsumos !== null && monto > 0 ? `Con IVA: USD ${fmt(montoConIva)}` : undefined} />
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-600 mb-1">IVA de los insumos</span>
                    <select value={ivaInsumos ?? ''} onChange={(e) => setIvaInsumos(e.target.value ? (parseFloat(e.target.value) as 10.5 | 21) : null)} className={inputCls}>
                      <option value="">El monto ya incluye IVA</option>
                      <option value="10.5">Sumar IVA 10,5 %</option>
                      <option value="21">Sumar IVA 21 %</option>
                    </select>
                  </label>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  <CampoNumero label="Toneladas a entregar" sufijo="tn" value={tnIngresadas} onChange={setTnIngresadas} />
                </div>
              )}
            </div>

            <label className="block pt-4 border-t border-gray-100">
              <span className="block text-xs font-medium text-gray-600 mb-1">Notas</span>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={1000} placeholder="Posición, condiciones, lo que se habló…" className={inputCls + ' resize-none'} />
            </label>
            {errores.length > 0 && (precio > 0 || monto > 0 || tnIngresadas > 0) && <p className="text-xs text-amber-700">{errores.join(' ')}</p>}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-2">Desglose por tonelada</h2>
            <DesgloseCanje precio={precio} params={params} />
          </section>
        </div>

        {/* ===== Parámetros de la liquidación ===== */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Liquidación del grano</h2>
          <ParametrosCanje params={params} onChange={setParams} defaults={defaults}
            flete={{ convenios, tcCompra, campos: camposCliente }} />
        </section>
      </div>

      {verPrevia && previa && (
        <VistaPreviaCotizacion cotizacion={previa.cotizacion} lineas={previa.lineas} onCerrar={() => setVerPrevia(false)}
          onAbrir={onEditCotiz ? () => onEditCotiz(previa.cotizacion.id) : undefined} />
      )}

      {/* ===== Historial ===== */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-gray-800">Historial</h2>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por cliente, cultivo o usuario" className={inputCls + ' max-w-xs'} />
        </div>
        {histFiltrado.length === 0 ? (
          <p className="text-sm text-gray-500">{historial.length ? 'Nada coincide con el filtro.' : 'Todavía no hay cálculos guardados.'}</p>
        ) : (
          <HistorialCanjes canjes={histFiltrado} onCargar={cargarDelHistorial} onBorrar={(h) => void borrar(h)} onEditCotiz={onEditCotiz}
            puedeBorrar={(h) => usuario.rol === 'admin' || h.autor_id === usuario.id} conCliente />
        )}
      </section>
    </div>
  );
}

/** Tabla de cálculos guardados; la usa también la ficha del cliente. */
export function HistorialCanjes({ canjes, onCargar, onBorrar, onEditCotiz, puedeBorrar, conCliente }: {
  canjes: CanjeGuardado[];
  onCargar?: (h: CanjeGuardado) => void;
  onBorrar?: (h: CanjeGuardado) => void;
  onEditCotiz?: (id: string) => void;
  puedeBorrar?: (h: CanjeGuardado) => boolean;
  conCliente?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[720px]">
        <thead><tr className="text-xs text-gray-500 border-b border-gray-200">
          <th className="text-left py-2 font-medium">Fecha</th>
          {conCliente && <th className="text-left py-2 font-medium">Cliente</th>}
          <th className="text-left py-2 font-medium">Cultivo</th>
          <th className="text-right py-2 font-medium">Precio</th>
          <th className="text-right py-2 font-medium">Neto/tn</th>
          <th className="text-right py-2 font-medium">Insumos c/IVA</th>
          <th className="text-right py-2 font-medium">Toneladas</th>
          <th className="text-left py-2 font-medium pl-3">Por</th>
          <th className="w-24" />
        </tr></thead>
        <tbody>
          {canjes.map((h) => (
            <tr key={h.id} className="border-b border-gray-100 align-top">
              <td className="py-2 whitespace-nowrap">{formatDate(h.created_at)}</td>
              {conCliente && <td className="py-2">{h.cliente_nombre || '—'}</td>}
              <td className="py-2">
                {h.cultivo}
                {h.params?.destino && <span className="block text-xs text-gray-400">{h.params.destino}</span>}
                {h.notas && <span className="block text-xs text-gray-500 italic">{h.notas}</span>}
              </td>
              <td className="py-2 text-right tabular-nums">{fmt(h.precio_usd)}</td>
              <td className="py-2 text-right tabular-nums">{fmt(h.neto_usd)}</td>
              <td className="py-2 text-right tabular-nums">{fmt(h.monto_usd)}</td>
              <td className="py-2 text-right tabular-nums font-semibold text-emerald-800">{fmt(h.tn)}</td>
              <td className="py-2 pl-3 text-gray-500">{h.autor_nombre || '—'}</td>
              <td className="py-2">
                <div className="flex justify-end gap-1">
                  {h.cotizacion_id && onEditCotiz && <button onClick={() => onEditCotiz(h.cotizacion_id!)} title="Abrir cotización" aria-label="Abrir cotización" className="p-1.5 text-gray-400 hover:text-emerald-700"><FileText className="w-4 h-4" /></button>}
                  {onCargar && <button onClick={() => onCargar(h)} title="Cargar en la calculadora" aria-label="Cargar en la calculadora" className="p-1.5 text-gray-400 hover:text-emerald-700"><Upload className="w-4 h-4" /></button>}
                  {onBorrar && puedeBorrar?.(h) && <button onClick={() => onBorrar(h)} title="Borrar" aria-label="Borrar" className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
