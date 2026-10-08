import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wheat, Loader2, Save, Copy, Trash2, RotateCcw, FileText, Upload, ArrowLeftRight } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import LiquidacionCanje, { CampoNumero } from '@/components/LiquidacionCanje';
import {
  CULTIVOS_CANJE, PARAMS_CANJE_BASE, conIvaInsumos, montoPorToneladas, netoPorTn, normalizarParams,
  textoWhatsAppCanje, toneladasPorMonto, type ParamsCanje,
} from '@/lib/canje';
import { montoCanjeDeCotizacion } from '@/lib/export';
import { nombreCotizacion } from '@/lib/nombreCotizacion';
import { formatDate, formatUSD } from '@/lib/format';
import type { CanjeGuardado, Cliente, Cotizacion, TipoCambioBNA } from '@/types';

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
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(async () => {
    const [cls, cots, cfg, hist] = await Promise.all([data.fetchClientes(), data.fetchCotizaciones(), data.fetchConfig(), data.fetchCanjes()]);
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
  const cultivoNombre = cultivo === 'Otro' ? cultivoOtro.trim() : cultivo;
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
    setCotizacionId(''); setPrecio(0); setMonto(0); setTnIngresadas(0); setIvaInsumos(null); setNotas(''); setParams({ ...defaults });
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titulo text-3xl text-emerald-900 flex items-center gap-2"><Wheat className="w-7 h-7" /> Calculadora de canje</h1>
        <p className="text-sm text-gray-500 mt-1">Cuántas toneladas de grano pagan los insumos, con la liquidación completa (pago parcial, IVA, comisión, flete, sellos y retenciones).</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* ===== Datos ===== */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Cliente</span>
              <input list="canje-clientes" value={clienteTxt} onChange={(e) => { setClienteTxt(e.target.value); setCotizacionId(''); }} placeholder="Buscar o escribir" className={inputCls} />
              <datalist id="canje-clientes">{clientes.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
              {clienteTxt.trim() && !cliente && <span className="text-xs text-amber-700">No está en la lista de clientes: se guarda solo con el nombre.</span>}
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Traer de una cotización <span className="font-normal text-gray-400">(opcional)</span></span>
              <div className="flex items-center gap-2">
                <select value={cotizacionId} disabled={!cliente || cargandoCotiz} onChange={(e) => (e.target.value ? void usarCotizacion(e.target.value) : setCotizacionId(''))} className={inputCls + ' disabled:bg-gray-50'}>
                  <option value="">{cliente ? (cotizCliente.length ? 'Elegir…' : 'Sin cotizaciones') : 'Primero elegí el cliente'}</option>
                  {cotizCliente.map((c) => <option key={c.id} value={c.id}>{nombreCotizacion(c)} · {formatDate(c.fecha)} · {c.estado}</option>)}
                </select>
                {cargandoCotiz && <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />}
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Cultivo</span>
              <div className="flex gap-2">
                <select value={cultivo} onChange={(e) => setCultivo(e.target.value)} className={inputCls}>
                  {CULTIVOS_CANJE.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="Otro">Otro</option>
                </select>
                {cultivo === 'Otro' && <input value={cultivoOtro} onChange={(e) => setCultivoOtro(e.target.value)} placeholder="Cultivo" aria-label="Otro cultivo" className={inputCls} />}
              </div>
            </label>
            <CampoNumero label="Precio del grano (lo pasa el acopio)" sufijo="USD/tn" value={precio} onChange={setPrecio} />
          </div>

          <div>
            <div className="inline-flex rounded-lg bg-gray-100 p-0.5 mb-2">
              <button type="button" onClick={() => setModo('monto')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${modo === 'monto' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Tengo el monto</button>
              <button type="button" onClick={() => setModo('tn')} className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1 ${modo === 'tn' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}><ArrowLeftRight className="w-3.5 h-3.5" /> Tengo las toneladas</button>
            </div>
            {modo === 'monto' ? (
              <div className="grid grid-cols-2 gap-3">
                <CampoNumero label="Monto de insumos" sufijo="USD" value={monto} onChange={(n) => { setMonto(n); setCotizacionId(''); }} />
                <label className="block">
                  <span className="block text-xs text-gray-500 mb-0.5">IVA de los insumos</span>
                  <select value={ivaInsumos ?? ''} onChange={(e) => setIvaInsumos(e.target.value ? (parseFloat(e.target.value) as 10.5 | 21) : null)} className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">El monto ya incluye IVA</option>
                    <option value="10.5">Sumar IVA 10,5 %</option>
                    <option value="21">Sumar IVA 21 %</option>
                  </select>
                </label>
                {ivaInsumos !== null && monto > 0 && <p className="col-span-2 text-xs text-gray-500">Total con IVA: USD {fmt(montoConIva)}</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <CampoNumero label="Toneladas a entregar" sufijo="tn" value={tnIngresadas} onChange={setTnIngresadas} />
              </div>
            )}
          </div>

          <LiquidacionCanje precio={precio} params={params} onChange={setParams} defaults={defaults} tcCompra={tcCompra} />
        </section>

        {/* ===== Resultado ===== */}
        <section className="space-y-4 lg:sticky lg:top-4">
          <div className="bg-emerald-900 rounded-xl p-5 text-white">
            <p className="text-emerald-200 text-sm">{modo === 'monto' ? `Toneladas de ${cultivoNombre || 'grano'} a entregar` : 'Insumos que se pagan (con IVA)'}</p>
            <p className="cifra text-6xl mt-1">
              {modo === 'monto' ? fmt(tn) : fmt(montoConIva)}
              <span className="text-2xl font-semibold text-amber-300 ml-2">{modo === 'monto' ? 'tn' : 'USD'}</span>
            </p>
            <div className="mt-4 pt-3 border-t border-emerald-700 space-y-1.5 text-sm text-emerald-100">
              <div className="flex justify-between"><span>Precio {cultivoNombre || 'grano'}</span><span>USD {fmt(precio)}/tn</span></div>
              <div className="flex justify-between"><span>Neto liquidación</span><span className="font-semibold text-white">USD {fmt(neto)}/tn</span></div>
              {modo === 'monto'
                ? <div className="flex justify-between"><span>Insumos con IVA</span><span>USD {fmt(montoConIva)}</span></div>
                : <div className="flex justify-between"><span>Toneladas</span><span>{fmt(tn)} tn</span></div>}
              {precio > 0 && neto > 0 && <div className="flex justify-between text-emerald-300 text-xs"><span>Descuentos sobre el precio</span><span>{fmt((1 - neto / precio) * 100, 1)} %</span></div>}
              {tcCompra && montoConIva > 0 && (
                <p className="text-xs text-emerald-300 pt-1">≈ $ {fmt(montoConIva * tcCompra, 0)} · neto $ {fmt(neto * tcCompra, 0)}/tn al TC comprador {tcBna ? 'BNA' : 'de respaldo'} $ {fmt(tcCompra)}</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={1000} placeholder="Notas (posición, condiciones, lo que se habló…)" className={inputCls + ' resize-none'} />
            {errores.length > 0 && (precio > 0 || monto > 0 || tnIngresadas > 0) && <p className="text-xs text-amber-700">{errores.join(' ')}</p>}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void guardar()} disabled={guardando} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5">
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar en historial
              </button>
              <button onClick={() => void copiar()} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><Copy className="w-4 h-4" /> Copiar WhatsApp</button>
              <button onClick={limpiar} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"><RotateCcw className="w-4 h-4" /> Limpiar</button>
            </div>
          </div>
        </section>
      </div>

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
