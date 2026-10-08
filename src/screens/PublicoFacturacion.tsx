import { useCallback, useEffect, useState } from 'react';
import { Receipt, Loader2, Lock, FileDown, FileSpreadsheet, CheckCircle2, AlertCircle, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { traducirError } from '@/lib/errores';
import { formatUSD, formatNumber, formatDate } from '@/lib/format';
import { hoyAR } from '@/lib/fechas';
import { describirCondicion, precioFinal, totalLinea, type CondicionPago, type LineaFacturacion, type TotalesFacturacion } from '@/lib/facturacion';
import { facturacionExcel, facturacionPDF, type DocFacturacion } from '@/lib/facturacionExport';
import type { ClienteFacturacion, ExtraFacturacion } from '@/types';
import { nombreCotizacion } from '@/lib/nombreCotizacion';

interface PedidoPublico {
  estado: 'NoExiste' | 'Cancelado' | 'Vencido' | 'Pendiente' | 'Facturado' | 'Observado';
  numero?: number; numero_cliente?: number | null; cliente_nombre?: string | null; vence_el?: string; nota_venta?: string | null; observaciones?: string | null;
  cliente?: ClienteFacturacion; condiciones?: CondicionPago[]; lineas?: LineaFacturacion[]; totales?: TotalesFacturacion;
  extra?: ExtraFacturacion; creado_por?: string | null; enviado_at?: string;
  factura_numero?: string | null; factura_fecha?: string | null; facturado_por?: string | null; facturado_at?: string | null;
  observacion?: string | null; observado_por?: string | null; observado_at?: string | null;
}

const fmt = (n: number, d = 2) => formatUSD(n, d);
const inputCls = 'mt-1 w-full px-3 py-3 border border-gray-300 rounded-lg text-base focus:ring-2 focus:ring-emerald-500 outline-none bg-white';

function fechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-emerald-900 text-white">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-400 rounded-lg flex items-center justify-center"><Receipt className="w-5 h-5 text-emerald-900" /></div>
          <span className="titulo text-xl tracking-wide">Facturación</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4 space-y-4">{children}</main>
    </div>
  );
}

function Mensaje({ icono, titulo, texto }: { icono: React.ReactNode; titulo: string; texto: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <div className="flex justify-center mb-3">{icono}</div>
      <h1 className="text-lg font-semibold text-gray-800">{titulo}</h1>
      <p className="text-sm text-gray-500 mt-1">{texto}</p>
    </div>
  );
}

/** Link público para quien factura (?facturar=código): ve el pedido, baja Excel/PDF y lo marca facturado u observado. */
export default function PublicoFacturacion({ token }: { token: string }) {
  const [p, setP] = useState<PedidoPublico | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(hoyAR());
  const [mensaje, setMensaje] = useState('');
  const [modo, setModo] = useState<'facturar' | 'observar'>('facturar');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const { data, error: e } = await supabase.rpc('facturacion_publico_obtener', { p_token: token });
    if (e) { setErrorCarga(traducirError(e)); return; }
    setP(data as PedidoPublico);
  }, [token]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function confirmar() {
    setError(null);
    if (nombre.trim().length < 2) { setError('Poné tu nombre.'); return; }
    let r;
    if (modo === 'facturar') {
      if (!numero.trim()) { setError('Poné el número de factura.'); return; }
      if (!fecha) { setError('Poné la fecha de la factura.'); return; }
      if (!window.confirm(`¿Marcar como facturado con la factura ${numero.trim()}? Después no se puede cambiar.`)) return;
      setGuardando(true);
      r = await supabase.rpc('facturacion_publico_facturar', { p_token: token, p_nombre: nombre.trim(), p_numero: numero.trim(), p_fecha: fecha });
    } else {
      if (mensaje.trim().length < 3) { setError('Contá qué hay que corregir.'); return; }
      setGuardando(true);
      r = await supabase.rpc('facturacion_publico_observar', { p_token: token, p_nombre: nombre.trim(), p_mensaje: mensaje.trim() });
    }
    setGuardando(false);
    if (r.error) { setError(traducirError(r.error)); return; }
    setP(r.data as PedidoPublico);
  }

  if (errorCarga) {
    return <Marco><Mensaje icono={<AlertCircle className="w-10 h-10 text-red-500" />} titulo="No se pudo abrir el pedido" texto={errorCarga} /><button onClick={() => void cargar()} className="w-full py-3 bg-emerald-600 text-white rounded-lg font-medium">Reintentar</button></Marco>;
  }
  if (!p) return <Marco><div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div></Marco>;
  if (p.estado === 'NoExiste') return <Marco><Mensaje icono={<AlertCircle className="w-10 h-10 text-gray-400" />} titulo="El link no es válido" texto="Revisá que esté completo o pedí uno nuevo." /></Marco>;
  if (p.estado === 'Cancelado') return <Marco><Mensaje icono={<AlertCircle className="w-10 h-10 text-gray-400" />} titulo="Este pedido fue cancelado" texto="Ya no hay que facturarlo. Si tenés dudas, consultá al vendedor." /></Marco>;
  if (p.estado === 'Vencido') return <Marco><Mensaje icono={<Clock className="w-10 h-10 text-amber-500" />} titulo="El link venció" texto="Pedile al vendedor que te lo reenvíe." /></Marco>;

  const lineas = p.lineas || [];
  const totales = p.totales!;
  const cli = p.cliente!;
  const nombreCotiz = nombreCotizacion({ numero: p.numero, numero_cliente: p.numero_cliente, cliente_nombre: p.cliente_nombre }, cli.nombre);
  const doc: DocFacturacion = {
    numero: p.numero || 0, nombre: nombreCotiz, estado: p.estado, nota_venta: p.nota_venta ?? null, observaciones: p.observaciones ?? null,
    cliente: cli, condiciones: p.condiciones || [], lineas, totales, extra: p.extra || {},
    enviado_por: p.creado_por ?? null, enviado_at: p.enviado_at || new Date().toISOString(),
    factura_numero: p.factura_numero, factura_fecha: p.factura_fecha,
  };

  return (
    <Marco>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs uppercase tracking-wide text-gray-400">Pedido de facturación</p>
        <h1 className="titulo text-2xl text-emerald-900 mt-0.5">{nombreCotiz}{p.nota_venta && <span className="text-gray-500 text-lg"> · Nota de venta {p.nota_venta}</span>}</h1>
        <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Dato k="Cliente" v={cli.nombre} />
          <Dato k="Razón social" v={cli.razon_social} alerta={!cli.razon_social} />
          <Dato k="CUIT" v={cli.cuit} alerta={!cli.cuit} />
          <Dato k="Domicilio" v={[cli.domicilio, cli.localidad].filter(Boolean).join(', ') || null} />
          <Dato k="Enviado por" v={`${p.creado_por || '-'}${p.enviado_at ? ` · ${fechaHora(p.enviado_at)}` : ''}`} />
          {p.extra?.flete && <Dato k="Flete" v={p.extra.flete} />}
        </dl>
        {p.observaciones && <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2"><strong>Observaciones:</strong> {p.observaciones}</p>}
      </div>

      {p.estado === 'Facturado' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
          <Lock className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <p className="font-semibold">Facturado · factura {p.factura_numero}{p.factura_fecha ? ` del ${formatDate(p.factura_fecha)}` : ''}</p>
            <p>Cargado por {p.facturado_por}{p.facturado_at ? ` el ${fechaHora(p.facturado_at)}` : ''}. Ya no se puede cambiar.</p>
          </div>
        </div>
      )}
      {p.estado === 'Observado' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p><strong>Observado por {p.observado_por}:</strong> "{p.observacion}". Esperá a que el vendedor lo corrija; vas a ver los cambios en este mismo link.</p>
        </div>
      )}

      {totales.porCondicion.filter((t) => t.lineas > 0).map((t, idx) => (
        <section key={t.condicion.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-gray-800">{totales.porCondicion.length > 1 && `${idx + 1}. `}{describirCondicion(t.condicion, fmt)}</p>
            <p className="cifra text-xl text-emerald-900">USD {fmt(t.total)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead><tr className="text-gray-500 text-xs">
                <th className="text-left px-4 py-2 font-medium">Producto</th>
                <th className="text-right px-2 py-2 font-medium">Cantidad</th>
                <th className="text-right px-2 py-2 font-medium">Costo</th>
                <th className="text-right px-2 py-2 font-medium">Precio</th>
                <th className="text-right px-2 py-2 font-medium">Flete</th>
                <th className="text-right px-2 py-2 font-medium">Margen</th>
                <th className="text-right px-2 py-2 font-medium">IVA</th>
                <th className="text-right px-4 py-2 font-medium">Subtotal</th>
              </tr></thead>
              <tbody>
                {lineas.filter((l) => l.condicion_id === t.condicion.id).map((l, i) => (
                  <tr key={`${l.cod}-${i}`} className="border-t border-gray-100">
                    <td className="px-4 py-2"><p className="font-medium text-gray-800">{l.producto}</p><p className="text-xs text-gray-400">{l.cod}</p></td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{formatNumber(l.cantidad, l.cantidad % 1 === 0 ? 0 : 2)} {l.es_fertilizante ? 'tn' : l.unidad || 'un'}</td>
                    <td className="px-2 py-2 text-right text-gray-600">{fmt(l.costo_usd)}</td>
                    <td className="px-2 py-2 text-right">{fmt(precioFinal(l))}</td>
                    <td className="px-2 py-2 text-right text-gray-500">{l.flete_usd ? fmt(l.flete_usd) : '-'}</td>
                    <td className="px-2 py-2 text-right text-gray-600">{fmt(l.margen, 1)} %</td>
                    <td className="px-2 py-2 text-right text-gray-600">{fmt(l.iva, 1)} %</td>
                    <td className="px-4 py-2 text-right font-medium">{fmt(totalLinea(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100 text-sm text-gray-600 flex flex-wrap justify-end gap-x-5 gap-y-1">
            <span>Subtotal {fmt(t.subtotal)}</span>
            {t.recargo > 0 && <span>Financiación {fmt(t.recargoPct)} %: {fmt(t.recargo)}</span>}
            <span>IVA {fmt(t.iva)}</span>
            {t.toneladas !== null && <span className="font-medium text-gray-800">{fmt(t.toneladas)} tn de {t.condicion.cultivo}</span>}
            {t.ndMonto !== null && <span className="font-medium text-gray-800">Nota de débito {fmt(t.condicion.nd_pct || 0)} %: USD {fmt(t.ndMonto)}</span>}
          </div>
        </section>
      ))}

      <div className="rounded-xl bg-emerald-900 text-white px-5 py-4 flex flex-wrap items-end justify-between gap-2">
        <div className="text-xs text-emerald-200">
          <p>Precios en USD. Incluye flete y financiación; IVA aparte por línea.</p>
          {totales.ndTotal > 0 && <p>Notas de débito: USD {fmt(totales.ndTotal)}</p>}
        </div>
        <div className="text-right"><p className="text-xs text-emerald-300">Total a facturar</p><p className="cifra text-3xl">USD {fmt(totales.total)}</p></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => facturacionExcel(doc)} className="py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 flex items-center justify-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Bajar Excel</button>
        <button onClick={() => facturacionPDF(doc)} className="py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 flex items-center justify-center gap-2"><FileDown className="w-4 h-4" /> Bajar PDF</button>
      </div>

      {p.estado === 'Pendiente' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div role="radiogroup" aria-label="Qué querés hacer" className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
            <button role="radio" aria-checked={modo === 'facturar'} onClick={() => { setModo('facturar'); setError(null); }} className={`py-2 rounded-md text-sm font-medium ${modo === 'facturar' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>Ya lo facturé</button>
            <button role="radio" aria-checked={modo === 'observar'} onClick={() => { setModo('observar'); setError(null); }} className={`py-2 rounded-md text-sm font-medium ${modo === 'observar' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-500'}`}>Hay algo para corregir</button>
          </div>
          <label className="block"><span className="text-xs text-gray-500">Tu nombre</span><input value={nombre} maxLength={100} onChange={(e) => setNombre(e.target.value)} className={inputCls} /></label>
          {modo === 'facturar' ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-xs text-gray-500">Número de factura</span><input value={numero} maxLength={40} onChange={(e) => setNumero(e.target.value)} placeholder="Ej.: A-0003-00012345" className={inputCls} /></label>
              <label className="block"><span className="text-xs text-gray-500">Fecha de la factura</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} /></label>
            </div>
          ) : (
            <label className="block"><span className="text-xs text-gray-500">Qué hay que corregir</span><textarea value={mensaje} maxLength={500} rows={3} onChange={(e) => setMensaje(e.target.value)} placeholder="Ej.: falta el CUIT del cliente" className={inputCls} /></label>
          )}
          {error && <p className="text-sm text-red-600 flex gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}</p>}
          <button onClick={() => void confirmar()} disabled={guardando}
            className={`w-full py-3.5 text-white rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50 ${modo === 'facturar' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {guardando ? <Loader2 className="w-5 h-5 animate-spin" /> : modo === 'facturar' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            {modo === 'facturar' ? 'Marcar como facturado' : 'Enviar observación al vendedor'}
          </button>
          {p.vence_el && <p className="text-xs text-gray-400 text-center">El link vence el {fechaHora(p.vence_el)}</p>}
        </div>
      )}
    </Marco>
  );
}

function Dato({ k, v, alerta }: { k: string; v: string | null | undefined; alerta?: boolean }) {
  return (
    <div className="flex gap-2 min-w-0">
      <dt className="text-gray-500 flex-shrink-0">{k}:</dt>
      <dd className={`min-w-0 ${alerta ? 'text-amber-700' : 'text-gray-800'}`}>{v || (alerta ? 'falta' : '-')}</dd>
    </div>
  );
}
