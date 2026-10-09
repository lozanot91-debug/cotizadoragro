import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, Trophy } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { formatUSD } from '@/lib/format';
import { formatearFecha, hoyAR } from '@/lib/fechas';
import { CULTIVOS_CANJE, PARAMS_CANJE_BASE, type ParamsCanje } from '@/lib/canje';
import { PLAZA_DEFECTO, ultimaPizarra } from '@/lib/relacion';
import {
  PARAMS_FORMAS_PAGO_BASE, compararFormasPago, mejorOpcion, textoWhatsAppFormasPago, type ParamsFormasPago, type TarjetaPago,
} from '@/lib/formasPago';
import type { PizarraGrano } from '@/types';

export interface PropsComparador {
  /** Neto sin IVA ni financiación (USD). Si no viene, se carga a mano (pantalla suelta). */
  netoUSD?: number;
  ivaUSD?: number;
  plazoInicial?: { dias: number; tasa_mensual_pct: number } | null;
  canjeInicial?: { cultivo: string; precioUSD: number } | null;
  /** Para el texto de WhatsApp (ej. número de cotización) */
  titulo?: string;
}

const num = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number, d = 2) => formatUSD(n, d);
const inputCls = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm tabular-nums outline-none focus:ring-2 focus:ring-emerald-500';

function Campo({ label, valor, onChange, sufijo, ancho = 'w-24' }: { label: string; valor: string; onChange: (v: string) => void; sufijo?: string; ancho?: string }) {
  return (
    <label className={`block ${ancho}`}>
      <span className="block text-[11px] text-gray-500 mb-0.5">{label}</span>
      <span className="relative block">
        <input value={valor} onChange={(e) => onChange(e.target.value)} inputMode="decimal" className={`${inputCls} ${sufijo ? 'pr-7' : ''}`} />
        {sufijo && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{sufijo}</span>}
      </span>
    </label>
  );
}

/**
 * Compara contado, plazo, canje y tarjetas para una misma operación: cuánto paga, cuándo, y cuánto vale hoy
 * cada opción en USD (descontando a una tasa de referencia y pasando los pesos al dólar estimado).
 */
export default function ComparadorFormasPago({ netoUSD, ivaUSD, plazoInicial, canjeInicial, titulo }: PropsComparador) {
  const data = useData();
  const toast = useToast();
  const suelto = netoUSD === undefined;

  // Operación
  const [neto, setNeto] = useState(suelto ? '' : String(Math.round((netoUSD ?? 0) * 100) / 100));
  const [ivaPct, setIvaPct] = useState('10.5');
  const [plazoDias, setPlazoDias] = useState(String(plazoInicial?.dias || 90));
  const [tasaMensual, setTasaMensual] = useState(String(plazoInicial?.tasa_mensual_pct || 1.5));
  const [cultivo, setCultivo] = useState(canjeInicial?.cultivo || 'Soja');
  const [precioGrano, setPrecioGrano] = useState(canjeInicial?.precioUSD ? String(canjeInicial.precioUSD) : '');
  const [precioDe, setPrecioDe] = useState<string | null>(canjeInicial?.precioUSD ? 'cotización' : null);
  const [diasCanje, setDiasCanje] = useState('210');

  // Supuestos
  const [params, setParams] = useState<ParamsFormasPago>(PARAMS_FORMAS_PAGO_BASE);
  const [paramsCanje, setParamsCanje] = useState<ParamsCanje>(PARAMS_CANJE_BASE);
  const [tc, setTc] = useState('');
  const [usar, setUsar] = useState<Record<string, boolean>>({});
  const [verSupuestos, setVerSupuestos] = useState(false);
  const [pizarras, setPizarras] = useState<PizarraGrano[]>([]);

  useEffect(() => {
    let vivo = true;
    data.fetchConfigFormasPago().then((c) => { if (!vivo) return; setParams(c.formas); setParamsCanje(c.canje); }).catch(() => {});
    data.fetchTipoCambioBNA().then((t) => { if (vivo && t?.venta) setTc((v) => v || String(t.venta)); }).catch(() => {});
    data.fetchPizarrasRecientes(15).then((p) => { if (vivo) setPizarras(p); }).catch(() => {});
    return () => { vivo = false; };
  }, [data]);

  // Precio del grano: el de la cotización, o la última pizarra de Quequén
  const pizarra = useMemo(() => ultimaPizarra(pizarras, PLAZA_DEFECTO, cultivo, num(tc) || null), [pizarras, cultivo, tc]);
  useEffect(() => {
    if (precioDe === 'cotización' || precioDe === 'mano') return;
    if (pizarra) { setPrecioGrano(String(pizarra.usd)); setPrecioDe(`pizarra ${PLAZA_DEFECTO} ${formatearFecha(pizarra.fecha)}`); }
  }, [pizarra, precioDe]);

  const netoNum = suelto ? num(neto) : (netoUSD ?? 0);
  const ivaNum = suelto ? netoNum * (num(ivaPct) / 100) : (ivaUSD ?? 0);
  const tarjetasActivas = useMemo(() => params.tarjetas.filter((t) => usar[t.id] !== false), [params, usar]);

  const opciones = useMemo(() => compararFormasPago({
    netoUSD: netoNum, ivaUSD: ivaNum, hoy: hoyAR(), tcHoy: num(tc) || null,
    params: { ...params, tarjetas: tarjetasActivas },
    plazo: num(plazoDias) > 0 ? { dias: Math.round(num(plazoDias)), tasa_mensual_pct: num(tasaMensual) } : null,
    canje: num(precioGrano) > 0 ? { cultivo, precioUSD: num(precioGrano), params: paramsCanje, dias: Math.round(num(diasCanje)) } : null,
  }), [netoNum, ivaNum, tc, params, tarjetasActivas, plazoDias, tasaMensual, precioGrano, cultivo, paramsCanje, diasCanje]);
  const mejor = mejorOpcion(opciones);

  function cambiarTarjeta(id: string, campo: keyof TarjetaPago, valor: string) {
    setParams((p) => ({ ...p, tarjetas: p.tarjetas.map((t) => (t.id !== id ? t : { ...t, [campo]: campo === 'moneda' ? (valor === 'ARS' ? 'ARS' : 'USD') : campo === 'nombre' ? valor : num(valor) })) }));
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoWhatsAppFormasPago(opciones, fmt, formatearFecha, titulo));
      toast.exito('Copiado para WhatsApp');
    } catch { toast.aviso('No se pudo copiar'); }
  }

  return (
    <div className="space-y-4">
      {/* Operación */}
      <div className="flex flex-wrap items-end gap-3">
        {suelto ? (
          <>
            <Campo label="Monto neto (sin IVA)" valor={neto} onChange={setNeto} sufijo="USD" ancho="w-40" />
            <label className="block w-24">
              <span className="block text-[11px] text-gray-500 mb-0.5">IVA</span>
              <select value={ivaPct} onChange={(e) => setIvaPct(e.target.value)} className={`${inputCls} bg-white`}>
                {['10.5', '21', '0'].map((v) => <option key={v} value={v}>{v}%</option>)}
              </select>
            </label>
          </>
        ) : (
          <div className="text-sm">
            <span className="block text-[11px] text-gray-500">Total contado con IVA</span>
            <span className="cifra text-lg text-gray-900 tabular-nums">USD {fmt(netoNum + ivaNum)}</span>
          </div>
        )}
        <div className="flex items-end gap-2 pl-3 border-l border-gray-200">
          <Campo label="Plazo" valor={plazoDias} onChange={setPlazoDias} sufijo="días" ancho="w-24" />
          <Campo label="Tasa mensual" valor={tasaMensual} onChange={setTasaMensual} sufijo="%" ancho="w-24" />
        </div>
        <div className="flex items-end gap-2 pl-3 border-l border-gray-200">
          <label className="block w-24">
            <span className="block text-[11px] text-gray-500 mb-0.5">Canje</span>
            <select value={cultivo} onChange={(e) => { setCultivo(e.target.value); if (precioDe !== 'mano') setPrecioDe(null); }} className={`${inputCls} bg-white`}>
              {CULTIVOS_CANJE.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <Campo label="Precio grano" valor={precioGrano} onChange={(v) => { setPrecioGrano(v); setPrecioDe('mano'); }} sufijo="USD" ancho="w-28" />
          <Campo label="Entrega en" valor={diasCanje} onChange={setDiasCanje} sufijo="días" ancho="w-24" />
        </div>
      </div>
      {precioDe && precioDe !== 'mano' && <p className="-mt-2 text-[11px] text-gray-400">Precio del grano: {precioDe}</p>}

      {/* Resultado */}
      {opciones.length === 0 ? (
        <p className="text-sm text-gray-400">Cargá el monto para comparar.</p>
      ) : (
        <div>
          {/* Celular: una tarjeta por opción */}
          <ul className="sm:hidden space-y-2">
            {opciones.map((o) => {
              const esMejor = mejor?.clave === o.clave;
              return (
                <li key={o.clave} className={`rounded-lg border px-3 py-2 ${esMejor ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`font-medium flex items-center gap-1 ${esMejor ? 'text-emerald-800' : 'text-gray-900'}`}>{esMejor && <Trophy className="w-3.5 h-3.5 text-emerald-600" />}{o.nombre}</span>
                    <span className="tabular-nums font-semibold text-gray-900">USD {fmt(o.valorHoyUSD)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-gray-600 mt-0.5">
                    <span>
                      {o.moneda === 'ARS' ? `$ ${formatUSD(o.monto, 0)}` : `USD ${fmt(o.monto)}`}
                      {o.toneladas !== undefined && ` · ${fmt(o.toneladas)} tn`} · {o.dias > 0 ? formatearFecha(o.fecha) : 'hoy'}
                    </span>
                    <span className={o.difVsContadoPct > 0.05 ? 'text-red-700' : o.difVsContadoPct < -0.05 ? 'text-emerald-700' : 'text-gray-400'}>
                      {o.clave === 'contado' ? 'valor hoy' : `${o.difVsContadoPct > 0 ? '+' : ''}${fmt(o.difVsContadoPct, 1)}%`}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">{o.detalle}</p>
                </li>
              );
            })}
          </ul>
          <div className="hidden sm:block overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-2 px-1 font-medium">Forma de pago</th>
                <th className="py-2 px-1 font-medium text-right">Paga</th>
                <th className="py-2 px-1 font-medium">Cuándo</th>
                <th className="py-2 px-1 font-medium text-right">Valor hoy</th>
                <th className="py-2 px-1 font-medium text-right">vs contado</th>
              </tr>
            </thead>
            <tbody>
              {opciones.map((o) => {
                const esMejor = mejor?.clave === o.clave;
                return (
                  <tr key={o.clave} className={`border-b border-gray-100 ${esMejor ? 'bg-emerald-50' : ''}`}>
                    <td className="py-2 px-1">
                      <span className={`font-medium flex items-center gap-1 ${esMejor ? 'text-emerald-800' : 'text-gray-900'}`}>
                        {esMejor && <Trophy className="w-3.5 h-3.5 text-emerald-600" />}{o.nombre}
                      </span>
                      <span className="block text-[11px] text-gray-500">{o.detalle}</span>
                    </td>
                    <td className="py-2 px-1 text-right tabular-nums whitespace-nowrap">
                      {o.moneda === 'ARS' ? `$ ${formatUSD(o.monto, 0)}` : `USD ${fmt(o.monto)}`}
                      {o.toneladas !== undefined && <span className="block text-[11px] text-gray-500">{fmt(o.toneladas)} tn</span>}
                      {o.moneda === 'ARS' && <span className="block text-[11px] text-gray-500">≈ USD {fmt(o.usdAlVencimiento)} a dólar {fmt(o.tcVencimiento ?? 0, 0)}</span>}
                    </td>
                    <td className="py-2 px-1 whitespace-nowrap text-gray-700">{o.dias > 0 ? <>{formatearFecha(o.fecha)}<span className="block text-[11px] text-gray-400">{o.dias} días</span></> : 'Hoy'}</td>
                    <td className="py-2 px-1 text-right tabular-nums font-medium text-gray-900">USD {fmt(o.valorHoyUSD)}</td>
                    <td className={`py-2 px-1 text-right tabular-nums text-xs ${o.difVsContadoPct > 0.05 ? 'text-red-700' : o.difVsContadoPct < -0.05 ? 'text-emerald-700' : 'text-gray-400'}`}>
                      {o.clave === 'contado' ? '—' : `${o.difVsContadoPct > 0 ? '+' : ''}${fmt(o.difVsContadoPct, 1)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            <strong>Valor hoy</strong>: lo que vale cada pago llevado a hoy con una tasa de {fmt(params.tasa_ref_anual_pct, 1)}% anual en USD
            {opciones.some((o) => o.moneda === 'ARS') ? ` y los pesos pasados a un dólar que sube ${fmt(params.devaluacion_mensual_pct, 1)}% por mes` : ''}. El menor es el más barato para el cliente.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setVerSupuestos((v) => !v)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ChevronDown className={`w-4 h-4 transition-transform ${verSupuestos ? 'rotate-180' : ''}`} /> Tarjetas y supuestos
        </button>
        <button onClick={() => void copiar()} disabled={!opciones.length}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
          <Copy className="w-4 h-4" /> Copiar para WhatsApp
        </button>
      </div>

      {verSupuestos && (
        <div className="rounded-xl bg-gray-50 p-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            <Campo label="Tasa de referencia (anual USD)" valor={String(params.tasa_ref_anual_pct)} onChange={(v) => setParams((p) => ({ ...p, tasa_ref_anual_pct: num(v) }))} sufijo="%" ancho="w-44" />
            <Campo label="Devaluación estimada (mensual)" valor={String(params.devaluacion_mensual_pct)} onChange={(v) => setParams((p) => ({ ...p, devaluacion_mensual_pct: num(v) }))} sufijo="%" ancho="w-44" />
            <Campo label="Descuento contado" valor={String(params.descuento_contado_pct)} onChange={(v) => setParams((p) => ({ ...p, descuento_contado_pct: num(v) }))} sufijo="%" ancho="w-32" />
            <Campo label="Dólar hoy (BNA vendedor)" valor={tc} onChange={setTc} sufijo="$" ancho="w-40" />
          </div>
          <div className="space-y-2">
            {params.tarjetas.map((t) => (
              <div key={t.id} className="flex flex-wrap items-end gap-2">
                <label className="flex items-center gap-1.5 pb-2 text-sm">
                  <input type="checkbox" checked={usar[t.id] !== false} onChange={(e) => setUsar((u) => ({ ...u, [t.id]: e.target.checked }))} className="accent-emerald-600" />
                </label>
                <label className="block w-40">
                  <span className="block text-[11px] text-gray-500 mb-0.5">Tarjeta</span>
                  <input value={t.nombre} onChange={(e) => cambiarTarjeta(t.id, 'nombre', e.target.value)} className={inputCls} />
                </label>
                <label className="block w-20">
                  <span className="block text-[11px] text-gray-500 mb-0.5">Moneda</span>
                  <select value={t.moneda} onChange={(e) => cambiarTarjeta(t.id, 'moneda', e.target.value)} className={`${inputCls} bg-white`}>
                    <option value="USD">USD</option><option value="ARS">$</option>
                  </select>
                </label>
                <Campo label="ND empresa" valor={String(t.nd_pct)} onChange={(v) => cambiarTarjeta(t.id, 'nd_pct', v)} sufijo="%" ancho="w-24" />
                <Campo label="TNA tarjeta" valor={String(t.tna_pct)} onChange={(v) => cambiarTarjeta(t.id, 'tna_pct', v)} sufijo="%" ancho="w-24" />
                <Campo label="Vence en" valor={String(t.dias)} onChange={(v) => cambiarTarjeta(t.id, 'dias', v)} sufijo="días" ancho="w-24" />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">Los cambios acá valen para esta comparación. Los valores por defecto (y las tarjetas) se editan en Configuración.</p>
        </div>
      )}
    </div>
  );
}
