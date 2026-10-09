import { useState } from 'react';
import { Truck, MapPin, ChevronDown } from 'lucide-react';
import { fleteDeTramos } from '@/lib/calculations';
import { conveniosParaElegir, etiquetaConvenio } from '@/lib/convenios';
import { MODALIDADES, nombreTramoPrincipal, resumenFlete, tieneCorto, type KmSugerido } from '@/lib/fleteTramos';
import { resumenAforo } from '@/lib/fleteAforo';
import { formatDate, formatUSD, parseNumberInput } from '@/lib/format';
import type { Campo, ConvenioFlete, ModalidadFlete, TipoCambioBNA } from '@/types';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-50';

export interface PropsFlete {
  esReadOnly: boolean;
  /** TC con el que se pasa el flete a dólares (comprador) */
  tc: number;
  tcFlete: { valor: string; onChange: (v: string) => void; bna: TipoCambioBNA | null; usarBna: () => void };
  modalidad: ModalidadFlete;
  onModalidad: (m: ModalidadFlete) => void;
  campos: Campo[];
  campoId: string | null;
  onCampo: (id: string | null) => void;
  convenios: ConvenioFlete[];
  principal: { km: string; onKm: (v: string) => void; convenio: ConvenioFlete | null; onConvenio: (id: string) => void; sugerido: KmSugerido | null };
  corto: { km: string; onKm: (v: string) => void; convenio: ConvenioFlete | null; onConvenio: (id: string) => void; sugerido: KmSugerido | null };
  /** Aforo en tn (texto) de cada tramo y toneladas cargadas con flete */
  aforo: { valor: string; onChange: (v: string) => void; tnCargadas: number };
  aforoCorto: { valor: string; onChange: (v: string) => void; tnCargadas: number };
  /** Hay fertilizantes con flete tildado: el bloque arranca abierto (si no, cerrado) */
  enUso: boolean;
  /** Falta algún dato del flete: se abre aunque no haya fertilizantes */
  conAviso?: boolean;
}

function Tramo({ id, titulo, esReadOnly, tc, convenios, t, aforo }: {
  id: string; titulo: string; esReadOnly: boolean; tc: number; convenios: ConvenioFlete[]; t: PropsFlete['principal']; aforo: PropsFlete['aforo'];
}) {
  const kmNum = parseNumberInput(t.km) || 0;
  const tarifas = t.convenio?.tarifas ?? [];
  const max = tarifas.length ? tarifas[tarifas.length - 1].km : 0;
  const f = fleteDeTramos([{ km: kmNum, tarifas }], tc);
  const aforoNum = parseNumberInput(aforo.valor) || 0;
  const usdOk = kmNum > 0 && !f.tarifaFaltante && tc > 0;
  const ra = resumenAforo(aforo.tnCargadas, aforoNum, usdOk ? f.usdTn : 0);
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
      <div className="mt-2 grid gap-2 md:grid-cols-[6.5rem_1fr] items-start">
        <div>
          <label htmlFor={`${id}-aforo`} className="block text-xs text-gray-500 mb-1">Aforo (tn)</label>
          <input id={`${id}-aforo`} inputMode="decimal" value={aforo.valor} placeholder="Sin aforo" disabled={esReadOnly} onChange={(e) => aforo.onChange(e.target.value)} className={inputCls} />
        </div>
        <div className="text-[11px] md:pt-5">
          {aforoNum > 0 && aforo.tnCargadas > 0 && (ra.aplica ? (
            <p className="text-amber-700">
              Carga {formatUSD(aforo.tnCargadas, 2)} tn · aforo {formatUSD(aforoNum, 2)} tn → se cobra el flete de este tramo por {formatUSD(ra.tnFacturadas, 2)} tn ({formatUSD(ra.tnVacias, 2)} tn de espacio vacío = USD {formatUSD(ra.costoVacioUSD, 2)}, repartido: +USD {formatUSD(usdOk ? f.usdTn * (ra.factor - 1) : 0, 2)}/tn)
            </p>
          ) : <p className="text-gray-500">El aforo no supera la carga: se cobra la carga real.</p>)}
          {!(aforoNum > 0) && <p className="text-gray-400">Opcional. Si el camión se cobra por más toneladas de las que lleva, el espacio vacío se reparte en el flete.</p>}
        </div>
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
  // null = automático: abierto si hay fertilizantes con flete (o falta algo); si no, cerrado. Un clic lo fija.
  const [manual, setManual] = useState<boolean | null>(null);
  const abierto = manual ?? (p.enUso || !!p.conAviso);
  const usdOk = kmP > 0 && (!conCorto || kmC > 0) && !total.tarifaFaltante && p.tc > 0;
  const resumen = resumenFlete({ modalidad: p.modalidad, km: kmP, kmCorto: kmC, usdTn: usdOk ? total.usdTn : null, formato: (n) => formatUSD(n, 2) });
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <button type="button" onClick={() => setManual(!abierto)} aria-expanded={abierto} aria-controls="flete-detalle"
        className={`w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-left ${abierto ? 'mb-3' : ''}`}>
        <span className="font-semibold text-gray-700 flex items-center gap-2">
          <Truck className="w-5 h-5 text-gray-400" /> Flete de fertilizantes
          {!p.enUso && <span className="text-xs font-normal text-gray-400">(sin fertilizantes con flete)</span>}
        </span>
        <span className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
          {!abierto && <span className="truncate">{resumen}</span>}
          {abierto && conCorto && usdOk && <span>Total flete: <span className="font-semibold text-gray-800">USD {formatUSD(total.usdTn, 2)}/tn</span></span>}
          <ChevronDown className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {abierto && (<div id="flete-detalle">

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_9.5rem]">
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
        <div>
          <label htmlFor="flete-tc" className="block text-xs text-gray-500 mb-1">TC flete (comprador)</label>
          <input id="flete-tc" inputMode="decimal" value={p.tcFlete.valor} disabled={p.esReadOnly} onChange={(e) => p.tcFlete.onChange(e.target.value)} className={inputCls} />
          {p.tcFlete.bna && (
            <p title="Dólar divisa BNA, comprador" className={`text-xs mt-1 ${p.tcFlete.bna.desactualizado ? 'text-amber-700' : 'text-gray-500'}`}>
              BNA {formatDate(p.tcFlete.bna.fecha).slice(0, 5)}: $ {formatUSD(p.tcFlete.bna.compra, 2)}
              {!p.esReadOnly && Math.abs(p.tc - p.tcFlete.bna.compra) > 0.004 && (
                <button type="button" onClick={p.tcFlete.usarBna} className="ml-1 font-medium text-emerald-700 hover:text-emerald-800 underline">Usar</button>
              )}
            </p>
          )}
        </div>
      </div>

      <div className={`grid gap-3 mt-3 ${conCorto ? 'md:grid-cols-2' : ''}`}>
        <Tramo id="flete-principal" titulo={nombreTramoPrincipal(p.modalidad)} esReadOnly={p.esReadOnly} tc={p.tc} convenios={p.convenios} t={p.principal} aforo={p.aforo} />
        {conCorto && <Tramo id="flete-corto" titulo="Corto (planta → campo)" esReadOnly={p.esReadOnly} tc={p.tc} convenios={p.convenios} t={p.corto} aforo={p.aforoCorto} />}
      </div>
      <p className="text-xs text-gray-400 mt-2">Se aplica a los fertilizantes con flete tildado. La planilla está en pesos y se pasa a dólares con el TC comprador. Los km se precargan del campo y la planta, pero siempre los podés cambiar.</p>
      </div>)}
    </div>
  );
}
