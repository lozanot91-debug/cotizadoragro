import { Truck, MapPin } from 'lucide-react';
import { fleteDeTramos } from '@/lib/calculations';
import { conveniosParaElegir, etiquetaConvenio } from '@/lib/convenios';
import { MODALIDADES, nombreTramoPrincipal, tieneCorto, type KmSugerido } from '@/lib/fleteTramos';
import { formatUSD, parseNumberInput } from '@/lib/format';
import type { Campo, ConvenioFlete, ModalidadFlete } from '@/types';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50';

export interface PropsFlete {
  esReadOnly: boolean;
  tc: number;
  modalidad: ModalidadFlete;
  onModalidad: (m: ModalidadFlete) => void;
  campos: Campo[];
  campoId: string | null;
  onCampo: (id: string | null) => void;
  convenios: ConvenioFlete[];
  principal: { km: string; onKm: (v: string) => void; convenio: ConvenioFlete | null; onConvenio: (id: string) => void; sugerido: KmSugerido | null };
  corto: { km: string; onKm: (v: string) => void; convenio: ConvenioFlete | null; onConvenio: (id: string) => void; sugerido: KmSugerido | null };
  /** Hay fertilizantes con flete tildado (si no, el bloque se ve más tenue) */
  enUso: boolean;
}

function Tramo({ id, titulo, esReadOnly, tc, convenios, t }: {
  id: string; titulo: string; esReadOnly: boolean; tc: number; convenios: ConvenioFlete[]; t: PropsFlete['principal'];
}) {
  const kmNum = parseNumberInput(t.km) || 0;
  const tarifas = t.convenio?.tarifas ?? [];
  const max = tarifas.length ? tarifas[tarifas.length - 1].km : 0;
  const f = fleteDeTramos([{ km: kmNum, tarifas }], tc);
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-sm font-semibold text-gray-700 mb-2">{titulo}</p>
      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
        <div>
          <label htmlFor={`${id}-km`} className="block text-xs text-gray-500 mb-1">Km</label>
          <input id={`${id}-km`} inputMode="decimal" value={t.km} disabled={esReadOnly} onChange={(e) => t.onKm(e.target.value)} className={inputCls} />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-conv`} className="block text-xs text-gray-500 mb-1">Convenio</label>
          <select id={`${id}-conv`} value={t.convenio?.id ?? ''} disabled={esReadOnly || convenios.length === 0} onChange={(e) => t.onConvenio(e.target.value)} className={inputCls + ' bg-white'}>
            {convenios.length === 0 && <option value="">Sin convenios cargados</option>}
            {conveniosParaElegir(convenios, t.convenio?.id).map((c) => <option key={c.id} value={c.id}>{etiquetaConvenio(c)}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-1.5 text-xs space-y-0.5">
        {t.sugerido && Math.abs(t.sugerido.km - kmNum) > 0.001 && (
          <p className="text-gray-500">
            Sugerido: {formatUSD(t.sugerido.km, t.sugerido.km % 1 ? 1 : 0)} km ({t.sugerido.origen})
            {!esReadOnly && <button type="button" onClick={() => t.onKm(String(t.sugerido!.km).replace('.', ','))} className="ml-1.5 font-medium text-emerald-700 hover:text-emerald-800 underline">Usar</button>}
          </p>
        )}
        {t.sugerido && Math.abs(t.sugerido.km - kmNum) <= 0.001 && <p className="text-gray-400">Del {t.sugerido.origen}</p>}
        {max > 0 && kmNum > max && <p className="text-red-600">Fuera de la planilla del convenio (máx. {max} km)</p>}
        {kmNum > 0 && !f.tarifaFaltante && tc > 0 && <p className="text-gray-600">Flete: <span className="font-medium">USD {formatUSD(f.usdTn, 2)}/tn</span></p>}
        {t.convenio && !t.convenio.vigente && <p className="text-amber-700">Este convenio ya no está vigente.</p>}
      </div>
    </div>
  );
}

/** Flete de fertilizantes: campo, modalidad (directo / largo / largo + corto) y km y convenio de cada tramo. */
export default function FleteCotizacion(p: PropsFlete) {
  const conCorto = tieneCorto(p.modalidad);
  const kmP = parseNumberInput(p.principal.km) || 0, kmC = parseNumberInput(p.corto.km) || 0;
  const total = fleteDeTramos(
    conCorto ? [{ km: kmP, tarifas: p.principal.convenio?.tarifas ?? [] }, { km: kmC, tarifas: p.corto.convenio?.tarifas ?? [] }] : [{ km: kmP, tarifas: p.principal.convenio?.tarifas ?? [] }],
    p.tc,
  );
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 ${p.enUso ? '' : 'opacity-90'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Truck className="w-5 h-5 text-gray-400" /> Flete de fertilizantes</h3>
        {conCorto && kmP > 0 && kmC > 0 && !total.tarifaFaltante && p.tc > 0 && (
          <span className="text-sm text-gray-600">Total flete: <span className="font-semibold text-gray-800">USD {formatUSD(total.usdTn, 2)}/tn</span></span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <label htmlFor="flete-campo" className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Campo del cliente</label>
          <select id="flete-campo" value={p.campoId ?? ''} disabled={p.esReadOnly || p.campos.length === 0} onChange={(e) => p.onCampo(e.target.value || null)} className={inputCls + ' bg-white'}>
            <option value="">{p.campos.length === 0 ? 'El cliente no tiene campos cargados' : 'Sin campo (cargo los km a mano)'}</option>
            {p.campos.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.localidad ? ` · ${c.localidad}` : ''}{c.superficie_ha ? ` · ${formatUSD(c.superficie_ha, 0)} ha` : ''}</option>)}
          </select>
        </div>
        <div>
          <p className="block text-xs text-gray-500 mb-1">Modalidad</p>
          <div role="radiogroup" aria-label="Modalidad de flete" className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            {MODALIDADES.map((m) => (
              <button key={m.valor} type="button" role="radio" aria-checked={p.modalidad === m.valor} disabled={p.esReadOnly} title={m.detalle}
                onClick={() => p.onModalidad(m.valor)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap disabled:cursor-not-allowed ${p.modalidad === m.valor ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {m.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`grid gap-3 mt-3 ${conCorto ? 'md:grid-cols-2' : ''}`}>
        <Tramo id="flete-principal" titulo={nombreTramoPrincipal(p.modalidad)} esReadOnly={p.esReadOnly} tc={p.tc} convenios={p.convenios} t={p.principal} />
        {conCorto && <Tramo id="flete-corto" titulo="Corto (planta → campo)" esReadOnly={p.esReadOnly} tc={p.tc} convenios={p.convenios} t={p.corto} />}
      </div>
      <p className="text-xs text-gray-400 mt-2">Se aplica a los fertilizantes con flete tildado. Los km se precargan del campo y la planta, pero siempre los podés cambiar.</p>
    </div>
  );
}
