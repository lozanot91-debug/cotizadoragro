import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Truck } from 'lucide-react';
import { ALICUOTAS_IVA, fleteGranoUSD, liquidarTn, type ParamsCanje } from '@/lib/canje';
import { conveniosParaElegir, elegirConvenioVigente, etiquetaConvenio } from '@/lib/convenios';
import { formatInputNumber, formatUSD, parseNumberInput } from '@/lib/format';
import type { ConvenioFlete } from '@/types';

const inputCls = 'w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:bg-gray-50';
const selectCls = 'w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50';

/** Campo numérico que deja escribir con coma y avisa el número al cambiar. */
export function CampoNumero({ value, onChange, disabled, label, sufijo, placeholder = '0', ayuda, sinEtiqueta }: {
  value: number; onChange: (n: number) => void; disabled?: boolean; label: string; sufijo?: string; placeholder?: string; ayuda?: string; sinEtiqueta?: boolean;
}) {
  const [txt, setTxt] = useState(formatInputNumber(value, 4));
  useEffect(() => {
    // Si el valor cambió desde afuera (restablecer, cargar), se actualiza el texto
    setTxt((t) => (parseNumberInput(t) === value ? t : formatInputNumber(value, 4)));
  }, [value]);
  return (
    <label className="block min-w-0">
      {!sinEtiqueta && <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>}
      <span className="relative block">
        <input type="text" inputMode="decimal" value={txt} disabled={disabled} placeholder={placeholder} aria-label={label}
          onChange={(e) => { setTxt(e.target.value); onChange(parseNumberInput(e.target.value)); }}
          className={inputCls} style={sufijo ? { paddingRight: `${1.1 + sufijo.length * 0.5}rem` } : undefined} />
        {sufijo && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">{sufijo}</span>}
      </span>
      {ayuda && <span className="block text-[11px] text-gray-400 mt-0.5">{ayuda}</span>}
    </label>
  );
}

function SelectIva({ value, onChange, disabled, label }: { value: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  const opciones = ALICUOTAS_IVA.includes(value) ? ALICUOTAS_IVA : [...ALICUOTAS_IVA, value];
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={label} className={selectCls}>
        {opciones.map((v) => <option key={v} value={v}>{v === 0 ? 'Sin IVA' : `${formatInputNumber(v, 2)} %`}</option>)}
      </select>
    </label>
  );
}

function Seccion({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{titulo}</p>
        {extra}
      </div>
      {children}
    </div>
  );
}

function Retencion({ label, activa, pct, onActiva, onPct, disabled }: {
  label: string; activa: boolean; pct: number; onActiva: (b: boolean) => void; onPct: (n: number) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <label className={`flex items-center gap-2 text-sm text-gray-700 ${disabled ? '' : 'cursor-pointer'}`}>
        <input type="checkbox" checked={activa} disabled={disabled} onChange={(e) => onActiva(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
        Retención {label}
      </label>
      <div className={`w-28 ${activa ? '' : 'invisible'}`}><CampoNumero label={`Alícuota ${label}`} sinEtiqueta sufijo="%" value={pct} onChange={onPct} disabled={disabled || !activa} /></div>
    </div>
  );
}

/** Datos para calcular el flete del grano con un convenio: planillas, TC comprador y campos del cliente para precargar km. */
export interface FleteCanjeCtx {
  convenios: ConvenioFlete[];
  tcCompra: number | null;
  campos?: { id: string; nombre: string; km_puerto: number | null }[];
}

/** Desglose de la liquidación de una tonelada. */
export function DesgloseCanje({ precio, params }: { precio: number; params: ParamsCanje }) {
  const liq = liquidarTn(precio, params);
  return (
    <div>
      <table className="w-full text-sm">
        <tbody>
          {liq.conceptos.map((c) => (
            <tr key={c.clave} className="border-t border-gray-100 first:border-t-0">
              <td className="py-1.5 text-gray-600">{c.concepto}</td>
              <td className="py-1.5 text-right text-xs text-gray-400">{c.tasa !== null ? `${formatInputNumber(c.tasa, 3) || '0'} %` : ''}</td>
              <td className={`py-1.5 text-right tabular-nums ${c.usd < 0 ? 'text-red-700' : 'text-gray-800'}`}>{c.clave === 'precio' ? '' : c.usd < 0 ? '− ' : '+ '}{formatUSD(Math.abs(c.usd))}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-300 font-semibold">
            <td className="py-2">Neto por tn</td>
            <td />
            <td className="py-2 text-right text-emerald-800 tabular-nums">USD {formatUSD(liq.neto)}</td>
          </tr>
        </tbody>
      </table>
      {liq.neto <= 0 && precio > 0 && <p className="text-xs text-red-700 mt-1">Con estos descuentos el neto da cero o negativo: revisá el flete y los porcentajes.</p>}
    </div>
  );
}

/** Solo los parámetros, agrupados (sin encabezado ni desglose). */
export function ParametrosCanje({ params, onChange, defaults, disabled, flete }: {
  params: ParamsCanje;
  onChange: (p: ParamsCanje) => void;
  defaults?: ParamsCanje;
  disabled?: boolean;
  flete?: FleteCanjeCtx;
}) {
  const set = (cambios: Partial<ParamsCanje>) => onChange({ ...params, ...cambios });
  const porConvenio = !!flete && params.flete_modo === 'convenio';
  const convenio = useMemo(() => (flete ? elegirConvenioVigente(flete.convenios, params.flete_convenio_id) : null), [flete, params.flete_convenio_id]);
  const calc = porConvenio && convenio ? fleteGranoUSD(params.flete_km, convenio.tarifas, flete!.tcCompra) : null;
  const usdCalc = porConvenio ? (calc ? Math.round(calc.usdTn * 10000) / 10000 : 0) : null;

  // En modo convenio el USD/tn sale de la planilla: se mantiene al día si cambian km, convenio o TC
  useEffect(() => {
    if (usdCalc !== null && Math.abs(usdCalc - params.flete_usd_tn) > 1e-6) onChange({ ...params, flete_usd_tn: usdCalc });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdCalc]);

  const distintoDeDefault = defaults && JSON.stringify(defaults) !== JSON.stringify(params);

  return (
    <div className="space-y-5">
      <Seccion titulo="Liquidación">
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero label="% pago liquidación" sufijo="%" value={params.pago_pct} onChange={(n) => set({ pago_pct: n })} disabled={disabled} ayuda="Liquidación parcial" />
          <SelectIva label="IVA del grano" value={params.iva_grano_pct} onChange={(n) => set({ iva_grano_pct: n })} disabled={disabled} />
          <label className="block col-span-2">
            <span className="block text-xs font-medium text-gray-600 mb-1">Destino / condición</span>
            <input type="text" value={params.destino} disabled={disabled} onChange={(e) => set({ destino: e.target.value })} placeholder="Necochea, condiciones cámara"
              className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50" />
          </label>
        </div>
      </Seccion>

      <Seccion titulo="Gastos comerciales">
        <div className="grid grid-cols-3 gap-3">
          <CampoNumero label="Comisión" sufijo="%" value={params.comision_pct} onChange={(n) => set({ comision_pct: n })} disabled={disabled} />
          <SelectIva label="IVA comisión" value={params.iva_comision_pct} onChange={(n) => set({ iva_comision_pct: n })} disabled={disabled} />
          <CampoNumero label="Sellos" sufijo="%" value={params.sellos_pct} onChange={(n) => set({ sellos_pct: n })} disabled={disabled} />
        </div>
      </Seccion>

      <Seccion titulo="Flete del grano" extra={flete && !disabled && (
        <div className="inline-flex rounded-md bg-gray-100 p-0.5 text-xs">
          <button type="button" onClick={() => set({ flete_modo: 'convenio' })} className={`px-2 py-1 rounded ${params.flete_modo === 'convenio' ? 'bg-white text-emerald-700 shadow-sm font-medium' : 'text-gray-500'}`}>Por convenio</button>
          <button type="button" onClick={() => set({ flete_modo: 'manual' })} className={`px-2 py-1 rounded ${params.flete_modo === 'manual' ? 'bg-white text-emerald-700 shadow-sm font-medium' : 'text-gray-500'}`}>A mano</button>
        </div>
      )}>
        {porConvenio ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="block col-span-2 min-w-0">
                <span className="block text-xs font-medium text-gray-600 mb-1">Convenio</span>
                <select value={convenio?.id ?? ''} disabled={disabled} onChange={(e) => set({ flete_convenio_id: e.target.value || null })} aria-label="Convenio de flete" className={selectCls}>
                  {conveniosParaElegir(flete!.convenios, params.flete_convenio_id).map((c) => <option key={c.id} value={c.id}>{etiquetaConvenio(c)}</option>)}
                </select>
              </label>
              <CampoNumero label="Distancia" sufijo="km" value={params.flete_km} onChange={(n) => set({ flete_km: n })} disabled={disabled} />
            </div>
            {flete!.campos && flete!.campos.some((c) => c.km_puerto) && !disabled && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-500">Km a puerto del campo:</span>
                {flete!.campos.filter((c) => c.km_puerto).map((c) => (
                  <button key={c.id} type="button" onClick={() => set({ flete_km: Number(c.km_puerto) })}
                    className={`px-2 py-0.5 rounded-full border ${Number(c.km_puerto) === params.flete_km ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {c.nombre} · {formatInputNumber(Number(c.km_puerto), 0)} km
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 items-end">
              <div className="col-span-2 rounded-lg bg-gray-50 px-3 py-1.5 min-h-[2.375rem] flex flex-col justify-center">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500"><Truck className="w-3.5 h-3.5 text-gray-400" /> Flete</span>
                  <span className="text-sm font-semibold text-gray-800 tabular-nums">USD {formatUSD(params.flete_usd_tn)}/tn</span>
                </span>
                <span className={`text-[11px] ${calc ? 'text-gray-400' : 'text-amber-700'}`}>
                  {calc ? <>$ {formatUSD(calc.pesosTn, 0)}/tn · TC comprador $ {formatUSD(flete!.tcCompra || 0)}</>
                    : !(params.flete_km > 0) ? 'Cargá los km' : !flete!.tcCompra ? 'Falta el TC' : `No hay tarifa para ${Math.ceil(params.flete_km)} km en este convenio`}
                </span>
              </div>
              <SelectIva label="IVA flete" value={params.iva_flete_pct} onChange={(n) => set({ iva_flete_pct: n })} disabled={disabled} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <CampoNumero label="Flete" sufijo="USD/tn" value={params.flete_usd_tn} onChange={(n) => set({ flete_usd_tn: n })} disabled={disabled} />
            <SelectIva label="IVA flete" value={params.iva_flete_pct} onChange={(n) => set({ iva_flete_pct: n })} disabled={disabled} />
          </div>
        )}
      </Seccion>

      <Seccion titulo="Almacenaje">
        <div className="grid grid-cols-3 gap-3">
          <CampoNumero label="Costo" sufijo="USD/tn/día" value={params.almacenaje_usd_tn_dia} onChange={(n) => set({ almacenaje_usd_tn_dia: n })} disabled={disabled} />
          <CampoNumero label="Días" value={params.almacenaje_dias} onChange={(n) => set({ almacenaje_dias: Math.round(n) })} disabled={disabled} />
        </div>
      </Seccion>

      <Seccion titulo="Retenciones">
        <div className="divide-y divide-gray-100">
          <Retencion label="IIBB" activa={params.ret_iibb} pct={params.ret_iibb_pct} onActiva={(b) => set({ ret_iibb: b })} onPct={(n) => set({ ret_iibb_pct: n })} disabled={disabled} />
          <Retencion label="IVA" activa={params.ret_iva} pct={params.ret_iva_pct} onActiva={(b) => set({ ret_iva: b })} onPct={(n) => set({ ret_iva_pct: n })} disabled={disabled} />
          <Retencion label="Ganancias" activa={params.ret_ganancias} pct={params.ret_ganancias_pct} onActiva={(b) => set({ ret_ganancias: b })} onPct={(n) => set({ ret_ganancias_pct: n })} disabled={disabled} />
        </div>
      </Seccion>

      {defaults && distintoDeDefault && !disabled && (
        <button type="button" onClick={() => onChange({ ...defaults })} className="text-xs text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
          <RotateCcw className="w-3.5 h-3.5" /> Volver a los valores por defecto
        </button>
      )}
    </div>
  );
}

/**
 * Bloque plegable con los parámetros de la liquidación del grano y su desglose por tonelada.
 * Lo usan la cotización, el pedido de facturación y Configuración.
 */
export default function LiquidacionCanje({ precio, params, onChange, defaults, disabled, abiertoInicial = true, tcCompra, flete }: {
  precio: number;
  params: ParamsCanje;
  onChange: (p: ParamsCanje) => void;
  defaults?: ParamsCanje;
  disabled?: boolean;
  abiertoInicial?: boolean;
  /** TC comprador BNA: muestra el neto en pesos */
  tcCompra?: number | null;
  /** Si viene, el flete se puede calcular por convenio y km */
  flete?: FleteCanjeCtx;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const neto = liquidarTn(precio, params).neto;
  return (
    <div className="rounded-lg border border-gray-200">
      <button type="button" onClick={() => setAbierto((a) => !a)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Liquidación del grano
        </span>
        <span className="text-sm text-gray-600">
          Neto <strong className="text-emerald-800">USD {formatUSD(neto)}/tn</strong>
          {tcCompra ? <span className="text-xs text-gray-400 ml-1.5">≈ $ {formatUSD(neto * tcCompra, 0)}</span> : null}
        </span>
      </button>
      {abierto && (
        <div className="px-3 pb-3 pt-3 border-t border-gray-100 space-y-5">
          <ParametrosCanje params={params} onChange={onChange} defaults={defaults} disabled={disabled} flete={flete} />
          <div className="pt-3 border-t border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Desglose por tn</p>
            <DesgloseCanje precio={precio} params={params} />
          </div>
        </div>
      )}
    </div>
  );
}
