import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { ALICUOTAS_IVA, liquidarTn, type ParamsCanje } from '@/lib/canje';
import { formatInputNumber, formatUSD, parseNumberInput } from '@/lib/format';

const inputCls = 'w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-emerald-500 bg-white disabled:bg-gray-50';

/** Campo numérico que deja escribir con coma y avisa el número al cambiar. */
export function CampoNumero({ value, onChange, disabled, label, sufijo, placeholder = '0' }: {
  value: number; onChange: (n: number) => void; disabled?: boolean; label: string; sufijo?: string; placeholder?: string;
}) {
  const [txt, setTxt] = useState(formatInputNumber(value, 4));
  useEffect(() => {
    // Si el valor cambió desde afuera (restablecer, cargar), se actualiza el texto
    setTxt((t) => (parseNumberInput(t) === value ? t : formatInputNumber(value, 4)));
  }, [value]);
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-0.5">{label}</span>
      <span className="flex items-center gap-1">
        <input type="text" inputMode="decimal" value={txt} disabled={disabled} placeholder={placeholder} aria-label={label}
          onChange={(e) => { setTxt(e.target.value); onChange(parseNumberInput(e.target.value)); }} className={inputCls} />
        {sufijo && <span className="text-xs text-gray-400 whitespace-nowrap">{sufijo}</span>}
      </span>
    </label>
  );
}

function SelectIva({ value, onChange, disabled, label }: { value: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  const opciones = ALICUOTAS_IVA.includes(value) ? ALICUOTAS_IVA : [...ALICUOTAS_IVA, value];
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-0.5">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={label}
        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50">
        {opciones.map((v) => <option key={v} value={v}>{v === 0 ? 'Sin IVA' : `${formatInputNumber(v, 2)} %`}</option>)}
      </select>
    </label>
  );
}

function Retencion({ label, activa, pct, onActiva, onPct, disabled }: {
  label: string; activa: boolean; pct: number; onActiva: (b: boolean) => void; onPct: (n: number) => void; disabled?: boolean;
}) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${activa ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'}`}>
      <label className={`flex items-center gap-2 text-sm text-gray-700 ${disabled ? '' : 'cursor-pointer'}`}>
        <input type="checkbox" checked={activa} disabled={disabled} onChange={(e) => onActiva(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
        {label}
      </label>
      {activa && <div className="mt-1.5"><CampoNumero label="Alícuota" sufijo="%" value={pct} onChange={onPct} disabled={disabled} /></div>}
    </div>
  );
}

/**
 * Parámetros de la liquidación del grano y su desglose por tonelada.
 * Componente controlado: lo usan la calculadora suelta, la cotización y el pedido de facturación.
 */
export default function LiquidacionCanje({ precio, params, onChange, defaults, disabled, abiertoInicial = true, tcCompra }: {
  precio: number;
  params: ParamsCanje;
  onChange: (p: ParamsCanje) => void;
  /** Para el botón "Valores por defecto" */
  defaults?: ParamsCanje;
  disabled?: boolean;
  abiertoInicial?: boolean;
  /** TC comprador BNA: muestra el neto en pesos */
  tcCompra?: number | null;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const liq = liquidarTn(precio, params);
  const set = (cambios: Partial<ParamsCanje>) => onChange({ ...params, ...cambios });
  const distintoDeDefault = defaults && JSON.stringify(defaults) !== JSON.stringify(params);

  return (
    <div className="rounded-lg border border-gray-200">
      <button type="button" onClick={() => setAbierto((a) => !a)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left">
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Liquidación del grano
        </span>
        <span className="text-sm text-gray-600">
          Neto <strong className="text-emerald-800">USD {formatUSD(liq.neto)}/tn</strong>
          {tcCompra ? <span className="text-xs text-gray-400 ml-1.5">≈ $ {formatUSD(liq.neto * tcCompra, 0)}</span> : null}
        </span>
      </button>

      {abierto && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-100 pt-3">
          <label className="block">
            <span className="block text-xs text-gray-500 mb-0.5">Destino / condición</span>
            <input type="text" value={params.destino} disabled={disabled} onChange={(e) => set({ destino: e.target.value })} placeholder="Necochea, condiciones cámara"
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50" />
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <CampoNumero label="% pago liquidación" sufijo="%" value={params.pago_pct} onChange={(n) => set({ pago_pct: n })} disabled={disabled} />
            <SelectIva label="IVA del grano" value={params.iva_grano_pct} onChange={(n) => set({ iva_grano_pct: n })} disabled={disabled} />
            <CampoNumero label="Comisión" sufijo="%" value={params.comision_pct} onChange={(n) => set({ comision_pct: n })} disabled={disabled} />
            <SelectIva label="IVA comisión/almac." value={params.iva_comision_pct} onChange={(n) => set({ iva_comision_pct: n })} disabled={disabled} />
            <CampoNumero label="Flete" sufijo="USD/tn" value={params.flete_usd_tn} onChange={(n) => set({ flete_usd_tn: n })} disabled={disabled} />
            <SelectIva label="IVA flete" value={params.iva_flete_pct} onChange={(n) => set({ iva_flete_pct: n })} disabled={disabled} />
            <CampoNumero label="Almacenaje" sufijo="USD/tn/día" value={params.almacenaje_usd_tn_dia} onChange={(n) => set({ almacenaje_usd_tn_dia: n })} disabled={disabled} />
            <CampoNumero label="Días de almacenaje" value={params.almacenaje_dias} onChange={(n) => set({ almacenaje_dias: Math.round(n) })} disabled={disabled} />
            <CampoNumero label="Sellos" sufijo="%" value={params.sellos_pct} onChange={(n) => set({ sellos_pct: n })} disabled={disabled} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Retenciones</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Retencion label="IIBB" activa={params.ret_iibb} pct={params.ret_iibb_pct} onActiva={(b) => set({ ret_iibb: b })} onPct={(n) => set({ ret_iibb_pct: n })} disabled={disabled} />
              <Retencion label="IVA" activa={params.ret_iva} pct={params.ret_iva_pct} onActiva={(b) => set({ ret_iva: b })} onPct={(n) => set({ ret_iva_pct: n })} disabled={disabled} />
              <Retencion label="Ganancias" activa={params.ret_ganancias} pct={params.ret_ganancias_pct} onActiva={(b) => set({ ret_ganancias: b })} onPct={(n) => set({ ret_ganancias_pct: n })} disabled={disabled} />
            </div>
          </div>

          <table className="w-full text-sm">
            <tbody>
              {liq.conceptos.map((c) => (
                <tr key={c.clave} className="border-t border-gray-100">
                  <td className="py-1 text-gray-600">{c.concepto}</td>
                  <td className="py-1 text-right text-xs text-gray-400">{c.tasa !== null ? `${formatInputNumber(c.tasa, 3) || '0'} %` : ''}</td>
                  <td className={`py-1 text-right tabular-nums ${c.usd < 0 ? 'text-red-700' : 'text-gray-800'}`}>{c.clave === 'precio' ? '' : c.usd < 0 ? '− ' : '+ '}{formatUSD(Math.abs(c.usd))}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 font-semibold">
                <td className="py-1.5">Neto por tn</td>
                <td />
                <td className="py-1.5 text-right text-emerald-800 tabular-nums">USD {formatUSD(liq.neto)}</td>
              </tr>
            </tbody>
          </table>
          {liq.neto <= 0 && precio > 0 && <p className="text-xs text-red-700">Con estos descuentos el neto da cero o negativo: revisá el flete y los porcentajes.</p>}

          {defaults && distintoDeDefault && !disabled && (
            <button type="button" onClick={() => onChange({ ...defaults })} className="text-xs text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> Volver a los valores por defecto
            </button>
          )}
        </div>
      )}
    </div>
  );
}
