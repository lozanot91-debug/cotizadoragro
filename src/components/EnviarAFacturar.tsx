import { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Plus, Trash2, Loader2, Copy, Link2, CheckCircle2, AlertTriangle, Clock, FileDown, FileSpreadsheet, XCircle, Pencil, X } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { registrarCambio } from '@/lib/historial';
import { ivaDeLinea } from '@/lib/calculations';
import { textoFlete } from '@/lib/fleteTramos';
import { normalizarParams, PARAMS_CANJE_BASE, type ParamsCanje } from '@/lib/canje';
import LiquidacionCanje from '@/components/LiquidacionCanje';
import { formatUSD, formatNumber, formatDate } from '@/lib/format';
import { formatearFechaHora } from '@/lib/fechas';
import {
  TIPOS_CONDICION, calcularTotalesFacturacion, condicionesIniciales, describirCondicion, estadoFacturacionInfo,
  lineasDesdeCotizacion, nuevaCondicion, numCampo, precioFinal, sinUsar, textoWhatsAppFacturacion, totalLinea,
  urlFacturacion, validarPedidoFacturacion, type CondicionPago, type LineaFacturacion, type TipoCondicion,
} from '@/lib/facturacion';
import { docDePedido, facturacionExcel, facturacionPDF } from '@/lib/facturacionExport';
import type { Cliente, Cotizacion, PedidoFacturacion } from '@/types';
import { nombreCotizacion } from '@/lib/nombreCotizacion';

const inputCls = 'w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white';
const fmt = (n: number, d = 2) => formatUSD(n, d);

/** Condición en el formulario: los números como texto (coma decimal). */
interface CondForm { id: string; tipo: TipoCondicion; plazo: string; tasa: string; cultivo: string; precio: string; tarjeta: string; nd: string; params: ParamsCanje | null }
interface LineaForm extends LineaFacturacion { cantidadStr: string }

const aTexto = (n: number | undefined) => (n === undefined || n === null || Number.isNaN(n) ? '' : String(n).replace('.', ','));
function condAForm(c: CondicionPago): CondForm {
  return { id: c.id, tipo: c.tipo, plazo: aTexto(c.plazo_dias), tasa: aTexto(c.tasa_mensual), cultivo: c.cultivo || '', precio: aTexto(c.precio_cultivo), tarjeta: c.tarjeta || '', nd: aTexto(c.nd_pct), params: c.canje_params ? normalizarParams(c.canje_params) : null };
}
function formACond(f: CondForm): CondicionPago {
  const c: CondicionPago = { id: f.id, tipo: f.tipo };
  if (f.tipo === 'financiado' || f.tipo === 'tarjeta') { c.plazo_dias = Math.round(numCampo(f.plazo) ?? 0); c.tasa_mensual = numCampo(f.tasa) ?? 0; }
  if (f.tipo === 'canje') { c.cultivo = f.cultivo.trim(); c.precio_cultivo = numCampo(f.precio) ?? 0; c.canje_params = f.params; }
  if (f.tipo === 'tarjeta') { c.tarjeta = f.tarjeta.trim(); c.nd_pct = numCampo(f.nd) ?? 0; }
  return c;
}

/** En una cotización Ganada: enviar a facturar, ver el estado del pedido y su link. */
export default function EnviarAFacturar({ cotizacion }: { cotizacion: Cotizacion }) {
  const data = useData();
  const toast = useToast();
  const { usuario } = useAuth();
  const [pedido, setPedido] = useState<PedidoFacturacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try { setPedido(await data.fetchFacturacionDeCotizacion(cotizacion.id)); } catch (e) { toast.error(e); } finally { setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizacion.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function copiar(texto: string, ok: string) {
    try { await navigator.clipboard.writeText(texto); toast.exito(ok); } catch { toast.aviso('No se pudo copiar. Probá de nuevo.'); }
  }
  async function cancelar() {
    if (!pedido || !window.confirm('¿Cancelar el pedido de facturación? El link deja de funcionar y vas a poder armar uno nuevo.')) return;
    setOcupado(true);
    try {
      await data.cancelarFacturacion(pedido.id);
      await registrarCambio({ tipo: 'cotizacion', cotizacion_id: cotizacion.id, campo: 'facturación', valor_anterior: pedido.estado, valor_nuevo: 'Cancelado' });
      toast.exito('Pedido de facturación cancelado');
      await cargar();
    } catch (e) { toast.error(e); } finally { setOcupado(false); }
  }

  if (cargando) return null;
  const link = pedido ? urlFacturacion(window.location.origin, pedido.token) : '';
  const info = pedido ? estadoFacturacionInfo(pedido.estado) : null;
  const vencido = pedido && pedido.estado !== 'Facturado' && new Date(pedido.vence_el).getTime() < Date.now();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Receipt className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold text-gray-700">Facturación</h3>
          {info && <span className={`text-xs font-medium px-2 py-0.5 rounded ${info.clase}`}>{info.texto}</span>}
          {vencido && <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-200 text-gray-600">Link vencido</span>}
        </div>
        {!pedido && (
          <button onClick={() => setAbierto(true)} className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 flex items-center gap-1.5">
            <Receipt className="w-4 h-4" /> Enviar a facturar
          </button>
        )}
      </div>

      {!pedido && <p className="text-sm text-gray-500 mt-1">Cuando el cliente confirma, armá el pedido con lo ganado y la condición de pago, y mandale el link a quien factura.</p>}

      {pedido && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-gray-600">
            Enviado {formatearFechaHora(pedido.enviado_at)}{pedido.creado_por ? ` por ${pedido.creado_por}` : ''}
            {pedido.nota_venta && <> · Nota de venta <strong>{pedido.nota_venta}</strong></>}
            {' · '}Total USD <strong>{fmt(pedido.totales.total)}</strong>
          </p>
          {pedido.estado === 'Facturado' && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-900 flex gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>Factura <strong>{pedido.factura_numero}</strong>{pedido.factura_fecha ? ` del ${formatDate(pedido.factura_fecha)}` : ''}{pedido.facturado_por ? ` · cargó ${pedido.facturado_por}` : ''}.</p>
            </div>
          )}
          {pedido.estado === 'Observado' && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-red-800 flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p><strong>{pedido.observado_por || 'Facturación'}</strong> lo observó: "{pedido.observacion}". Corregilo y reenvialo (el link es el mismo).</p>
            </div>
          )}
          {pedido.estado === 'Pendiente' && !vencido && (
            <p className="text-gray-500 flex items-center gap-1.5"><Clock className="w-4 h-4" /> Esperando a facturación. El link vence el {formatearFechaHora(pedido.vence_el)}.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {pedido.estado !== 'Facturado' && (
              <>
                <button onClick={() => void copiar(textoWhatsAppFacturacion({ url: link, nombre: nombreCotizacion(cotizacion), notaVenta: pedido.nota_venta }), 'Texto para WhatsApp copiado')}
                  className="px-3 py-1.5 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 flex items-center gap-1.5"><Copy className="w-4 h-4" /> Texto WhatsApp</button>
                <button onClick={() => void copiar(link, 'Link copiado')} className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Copiar link</button>
                <button onClick={() => setAbierto(true)} className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${pedido.estado === 'Observado' || vencido ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  <Pencil className="w-4 h-4" /> {pedido.estado === 'Observado' ? 'Corregir y reenviar' : vencido ? 'Revisar y reenviar' : 'Modificar'}
                </button>
              </>
            )}
            <button onClick={() => facturacionPDF(docDePedido(pedido, cotizacion))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><FileDown className="w-4 h-4" /> PDF</button>
            <button onClick={() => facturacionExcel(docDePedido(pedido, cotizacion))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
            {pedido.estado !== 'Facturado' && (
              <button onClick={() => void cancelar()} disabled={ocupado} className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5 disabled:opacity-50"><XCircle className="w-4 h-4" /> Cancelar</button>
            )}
          </div>
        </div>
      )}

      {abierto && (
        <ModalFacturar cotizacion={cotizacion} previo={pedido} vendedor={usuario.nombre || ''}
          onCerrar={() => setAbierto(false)}
          onEnviado={async (token) => {
            setAbierto(false);
            await cargar();
            const url = urlFacturacion(window.location.origin, token);
            toast.exito(pedido ? 'Pedido reenviado a facturación' : 'Pedido de facturación creado');
            try { await navigator.clipboard.writeText(url); toast.exito('Link copiado: pegalo en WhatsApp o mandá el texto'); } catch { /* sin portapapeles */ }
          }} />
      )}
    </div>
  );
}

function ModalFacturar({ cotizacion, previo, vendedor, onCerrar, onEnviado }: {
  cotizacion: Cotizacion; previo: PedidoFacturacion | null; vendedor: string; onCerrar: () => void; onEnviado: (token: string) => void | Promise<void>;
}) {
  const data = useData();
  const toast = useToast();
  const [cargando, setCargando] = useState(true);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [conds, setConds] = useState<CondForm[]>([]);
  const [notaVenta, setNotaVenta] = useState(previo?.nota_venta || '');
  const [obs, setObs] = useState(previo?.observaciones || '');
  const [dias, setDias] = useState('15');
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [canjeDefaults, setCanjeDefaults] = useState<ParamsCanje>(PARAMS_CANJE_BASE);

  const armarDesdeCotizacion = useCallback(async () => {
    const [ls, cfg] = await Promise.all([data.fetchLineas(cotizacion.id), data.fetchConfig()]);
    const base = lineasDesdeCotizacion(ls, cotizacion.cantidades_reales, (l) => ivaDeLinea(l, cotizacion, cfg));
    const ini = condicionesIniciales(base, cotizacion);
    setConds(ini.condiciones.map(condAForm));
    setLineas(base.map((l, i) => ({ ...l, condicion_id: ini.asignacion[i], cantidadStr: formatNumber(l.cantidad, l.cantidad % 1 === 0 ? 0 : 2) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizacion]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [cls, cfg] = await Promise.all([data.fetchClientes(), data.fetchConfig()]);
        if (!vivo) return;
        setCanjeDefaults(cfg.canje_parametros);
        setCliente(cls.find((c) => c.id === cotizacion.cliente_id) ?? null);
        if (previo) {
          setConds(previo.condiciones.map(condAForm));
          setLineas(previo.lineas.map((l) => ({ ...l, cantidadStr: formatNumber(l.cantidad, l.cantidad % 1 === 0 ? 0 : 2) })));
        } else {
          await armarDesdeCotizacion();
        }
      } catch (e) { toast.error(e); } finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const condiciones = useMemo(() => conds.map(formACond), [conds]);
  const lineasCalc: LineaFacturacion[] = useMemo(
    () => lineas.map(({ cantidadStr, ...l }) => ({ ...l, cantidad: numCampo(cantidadStr) ?? 0 })),
    [lineas],
  );
  const totales = useMemo(() => calcularTotalesFacturacion(lineasCalc, condiciones), [lineasCalc, condiciones]);

  function setCond(id: string, cambios: Partial<CondForm>) {
    setConds((cs) => cs.map((c) => {
      if (c.id !== id) return c;
      const n = { ...c, ...cambios };
      // Una condición nueva de canje arranca con la liquidación por defecto
      if (n.tipo === 'canje' && !n.params) n.params = { ...canjeDefaults };
      return n;
    }));
  }
  function agregarCond() { const c = condAForm(nuevaCondicion('contado')); setConds((cs) => [...cs, c]); }
  function quitarCond(id: string) {
    const resto = conds.filter((c) => c.id !== id);
    if (resto.length === 0) return;
    setConds(resto);
    setLineas((ls) => ls.map((l) => (l.condicion_id === id ? { ...l, condicion_id: resto[0].id } : l)));
  }

  async function enviar() {
    const usadas = condiciones.filter((c) => !sinUsar([c], lineasCalc).length);
    const errs = validarPedidoFacturacion({ lineas: lineasCalc, condiciones: usadas, nota_venta: notaVenta, observaciones: obs });
    setErrores(errs);
    if (errs.length) return;
    const diasN = Math.min(60, Math.max(1, parseInt(dias) || 15));
    const tot = calcularTotalesFacturacion(lineasCalc, usadas);
    const c = cliente;
    const datos = {
      cliente: { nombre: c?.nombre || cotizacion.cliente_nombre || '', razon_social: c?.razon_social ?? null, cuit: c?.cuit ?? null, domicilio: c?.domicilio ?? null, localidad: c?.localidad ?? null },
      condiciones: usadas, lineas: lineasCalc, totales: tot, nota_venta: notaVenta.trim(), observaciones: obs.trim(), creado_por: vendedor,
      extra: { numero: cotizacion.numero, numero_cliente: cotizacion.numero_cliente ?? null, fecha_cotizacion: cotizacion.fecha, tc: cotizacion.tc, tc_flete: cotizacion.tc_flete ?? null, flete: textoFlete(cotizacion), vendedor },
    };
    setEnviando(true);
    try {
      const token = await data.enviarAFacturar(cotizacion.id, diasN, datos);
      await registrarCambio({
        tipo: 'cotizacion', cotizacion_id: cotizacion.id, campo: 'facturación',
        valor_anterior: previo?.estado ?? null, valor_nuevo: 'Pendiente',
        detalle: `${previo ? 'Reenviado' : 'Enviado'} a facturar · USD ${fmt(tot.total)}${notaVenta.trim() ? ` · NV ${notaVenta.trim()}` : ''}`,
      });
      await onEnviado(token);
    } catch (e) { toast.error(e); } finally { setEnviando(false); }
  }

  const sinAsignar = sinUsar(condiciones, lineasCalc);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-2 sm:p-4" onClick={enviando ? undefined : onCerrar}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h3 className="font-bold text-gray-800">{previo ? 'Corregir y reenviar a facturar' : 'Enviar a facturar'}</h3>
            <p className="text-xs text-gray-500">{nombreCotizacion(cotizacion)}</p>
          </div>
          <button onClick={onCerrar} disabled={enviando} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {cargando ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /></div> : (
          <div className="p-5 space-y-5">
            {cliente && (!cliente.cuit || !cliente.razon_social) && (
              <p className="text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
                Al cliente le falta {[!cliente.razon_social && 'la razón social', !cliente.cuit && 'el CUIT'].filter(Boolean).join(' y ')}. Conviene cargarlo en su ficha antes de enviar.
              </p>
            )}

            {/* Condiciones de pago */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-700">Condiciones de pago</h4>
                {conds.length < 6 && <button onClick={agregarCond} className="text-sm text-emerald-700 hover:text-emerald-800 flex items-center gap-1"><Plus className="w-4 h-4" /> Agregar condición</button>}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {conds.map((c, i) => {
                  const t = totales.porCondicion.find((x) => x.condicion.id === c.id);
                  return (
                    <div key={c.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <select aria-label={`Tipo de la condición ${i + 1}`} value={c.tipo} onChange={(e) => setCond(c.id, { tipo: e.target.value as TipoCondicion })} className={inputCls}>
                          {TIPOS_CONDICION.map((x) => <option key={x.valor} value={x.valor}>{x.nombre}</option>)}
                        </select>
                        {conds.length > 1 && <button onClick={() => quitarCond(c.id)} className="p-1.5 text-gray-400 hover:text-red-600" aria-label={`Quitar condición ${i + 1}`}><Trash2 className="w-4 h-4" /></button>}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {c.tipo === 'tarjeta' && <Campo label="Tarjeta" full><input value={c.tarjeta} onChange={(e) => setCond(c.id, { tarjeta: e.target.value })} placeholder="Ej.: Agro Nación" className={inputCls} /></Campo>}
                        {(c.tipo === 'financiado' || c.tipo === 'tarjeta') && <>
                          <Campo label="Plazo (días)"><input inputMode="numeric" value={c.plazo} onChange={(e) => setCond(c.id, { plazo: e.target.value })} className={inputCls} /></Campo>
                          <Campo label="Tasa mensual %"><input inputMode="decimal" value={c.tasa} onChange={(e) => setCond(c.id, { tasa: e.target.value })} placeholder="0 = sin interés" className={inputCls} /></Campo>
                        </>}
                        {c.tipo === 'tarjeta' && <Campo label="Nota de débito %"><input inputMode="decimal" value={c.nd} onChange={(e) => setCond(c.id, { nd: e.target.value })} placeholder="0 = no tiene" className={inputCls} /></Campo>}
                        {c.tipo === 'canje' && <>
                          <Campo label="Cultivo"><input value={c.cultivo} onChange={(e) => setCond(c.id, { cultivo: e.target.value })} placeholder="Soja" className={inputCls} /></Campo>
                          <Campo label="Precio USD/tn"><input inputMode="decimal" value={c.precio} onChange={(e) => setCond(c.id, { precio: e.target.value })} className={inputCls} /></Campo>
                          {c.params && <div className="col-span-2"><LiquidacionCanje precio={numCampo(c.precio) ?? 0} params={c.params} onChange={(p) => setCond(c.id, { params: p })} defaults={canjeDefaults} abiertoInicial={false} /></div>}
                        </>}
                      </div>
                      {t && t.lineas > 0 ? (
                        <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                          <p>{t.lineas} {t.lineas === 1 ? 'producto' : 'productos'} · Total USD <strong className="text-gray-800">{fmt(t.total)}</strong>{t.recargo > 0 && <> (incluye {fmt(t.recargoPct)} % de financiación)</>}</p>
                          {t.toneladas !== null && <p>Equivale a <strong>{fmt(t.toneladas)} tn</strong> de {t.condicion.cultivo || 'grano'}</p>}
                          {t.ndMonto !== null && <p>Nota de débito: <strong>USD {fmt(t.ndMonto)}</strong> (sobre el total con IVA)</p>}
                        </div>
                      ) : <p className="mt-2 text-xs text-amber-700">Sin productos asignados: no se envía.</p>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Productos */}
            <section>
              <h4 className="font-semibold text-gray-700 mb-2">Productos ({lineas.length})</h4>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm min-w-[760px]">
                  <thead><tr className="bg-gray-50 text-gray-600 text-xs">
                    <th className="text-left px-3 py-2 font-medium">Producto</th>
                    <th className="text-right px-2 py-2 font-medium w-24">Cantidad</th>
                    <th className="text-right px-2 py-2 font-medium">Costo</th>
                    <th className="text-right px-2 py-2 font-medium">Precio final</th>
                    <th className="text-right px-2 py-2 font-medium">Margen</th>
                    <th className="text-right px-2 py-2 font-medium">Subtotal</th>
                    <th className="text-left px-2 py-2 font-medium w-44">Condición</th>
                    <th className="w-8" />
                  </tr></thead>
                  <tbody>
                    {lineas.map((l, i) => (
                      <tr key={`${l.cod}-${i}`} className="border-t border-gray-100">
                        <td className="px-3 py-2"><p className="font-medium text-gray-800">{l.producto}</p><p className="text-xs text-gray-400">{l.cod} · IVA {fmt(l.iva, 1)} %{l.flete_usd ? ` · flete USD ${fmt(l.flete_usd)}` : ''}</p></td>
                        <td className="px-2 py-2"><div className="flex items-center gap-1"><input aria-label={`Cantidad de ${l.producto}`} inputMode="decimal" value={l.cantidadStr} onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, cantidadStr: e.target.value } : x)))} className={inputCls + ' text-right'} /><span className="text-xs text-gray-400">{l.es_fertilizante ? 'tn' : l.unidad || 'un'}</span></div></td>
                        <td className="px-2 py-2 text-right text-gray-600">{fmt(l.costo_usd)}</td>
                        <td className="px-2 py-2 text-right">{fmt(precioFinal(l))}</td>
                        <td className="px-2 py-2 text-right text-gray-600">{fmt(l.margen, 1)} %</td>
                        <td className="px-2 py-2 text-right font-medium">{fmt(totalLinea({ ...l, cantidad: numCampo(l.cantidadStr) ?? 0 }))}</td>
                        <td className="px-2 py-2">
                          <select aria-label={`Condición de ${l.producto}`} value={l.condicion_id} onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, condicion_id: e.target.value } : x)))} className={inputCls}>
                            {condiciones.map((c, k) => <option key={c.id} value={c.id}>{k + 1}. {describirCondicion(c, fmt)}</option>)}
                          </select>
                        </td>
                        <td className="px-1"><button onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="p-1.5 text-gray-300 hover:text-red-600" aria-label={`Sacar ${l.producto}`}><Trash2 className="w-4 h-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previo && <button onClick={() => void armarDesdeCotizacion()} className="mt-2 text-xs text-emerald-700 hover:underline">Volver a armar desde la cotización</button>}
            </section>

            {/* Datos */}
            <section className="grid gap-3 sm:grid-cols-[10rem_1fr_7rem]">
              <Campo label="Nota de venta"><input inputMode="numeric" value={notaVenta} onChange={(e) => setNotaVenta(e.target.value)} placeholder="N°" className={inputCls} /></Campo>
              <Campo label="Observaciones"><textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Para quien factura" className={inputCls} /></Campo>
              <Campo label="Link vence en"><div className="flex items-center gap-1"><input inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} className={inputCls + ' text-right'} /><span className="text-xs text-gray-500">días</span></div></Campo>
            </section>

            {/* Total */}
            <div className="rounded-xl bg-emerald-900 text-white px-4 py-3 flex flex-wrap items-end justify-between gap-3">
              <div className="text-xs text-emerald-200 space-y-0.5">
                <p>Subtotal USD {fmt(totales.subtotal)}{totales.recargo > 0 && ` · Financiación USD ${fmt(totales.recargo)}`} · IVA USD {fmt(totales.iva)}</p>
                {totales.ndTotal > 0 && <p>Notas de débito: USD {fmt(totales.ndTotal)}</p>}
              </div>
              <p className="cifra text-3xl">USD {fmt(totales.total)}</p>
            </div>

            {sinAsignar.length > 0 && sinAsignar.length < conds.length && <p className="text-xs text-gray-500">Las condiciones sin productos no se envían.</p>}
            {errores.length > 0 && (
              <ul role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 list-disc list-inside">
                {errores.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={onCerrar} disabled={enviando} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => void enviar()} disabled={enviando || lineas.length === 0} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2">
                {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} {previo ? 'Reenviar a facturar' : 'Enviar a facturar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
