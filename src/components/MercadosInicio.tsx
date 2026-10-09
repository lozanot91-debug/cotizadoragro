import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DollarSign, Wheat, TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { PLAZAS_PIZARRA, PLAZA_DEFECTO, pizarraConVariacion } from '@/lib/relacion';
import { etiquetaPosicion, futuroConVariacion, posicionCosecha, posicionesVigentes } from '@/lib/futuros';
import { diasEntre, hoyAR } from '@/lib/fechas';
import { formatUSD } from '@/lib/format';
import type { FuturoGrano, PizarraGrano, TipoCambioBNA } from '@/types';

const GRANOS = ['Soja', 'Maíz', 'Trigo', 'Girasol', 'Cebada'];
const PLAZA_KEY = 'inicio-mercados-plaza';
const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

function Variacion({ pct }: { pct: number | null }) {
  if (pct === null || Math.abs(pct) < 0.05) return <span className="inline-flex items-center text-[11px] text-gray-400"><Minus className="w-3 h-3" /></span>;
  const sube = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${sube ? 'text-emerald-700' : 'text-red-700'}`}>
      {sube ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{sube ? '+' : ''}{formatUSD(pct, 1)}%
    </span>
  );
}

/**
 * Inicio: dólar BNA (comprador y vendedor) y precios de granos: pizarra de la plaza elegida (Quequén por defecto)
 * y futuros de cosecha de Matba-Rofex. Cada uno con su fecha y la variación contra el dato anterior.
 */
export default function MercadosInicio({ onAbrir }: { onAbrir?: () => void }) {
  const data = useData();
  const [tc, setTc] = useState<TipoCambioBNA | null>(null);
  const [tcHist, setTcHist] = useState<{ fecha: string; compra: number; venta: number }[]>([]);
  const [pizarras, setPizarras] = useState<PizarraGrano[]>([]);
  const [futuros, setFuturos] = useState<FuturoGrano[]>([]);
  const [plaza, setPlaza] = useState<string>(() => {
    try { const p = localStorage.getItem(PLAZA_KEY); return p && (PLAZAS_PIZARRA as readonly string[]).includes(p) ? p : PLAZA_DEFECTO; } catch { return PLAZA_DEFECTO; }
  });

  const montadoRef = useRef(true);
  const cargar = useCallback(async () => {
    const [h, pz, fu] = await Promise.all([
      data.fetchHistoriaTC(5).catch(() => []),
      data.fetchPizarrasRecientes(30).catch(() => []),
      data.fetchFuturosRecientes(10).catch(() => []),
    ]);
    if (!montadoRef.current) return;
    setTcHist(h); setPizarras(pz); setFuturos(fu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    montadoRef.current = true;
    void cargar().catch(() => {});
    void data.fetchTipoCambioBNA().then((t) => {
      if (t && montadoRef.current) {
        setTc(t);
        void data.fetchHistoriaTC(5).then((hh) => { if (montadoRef.current) setTcHist(hh); }).catch(() => {});
      }
    }).catch(() => {});
    void data.actualizarPizarras().then((nuevas) => { if (nuevas && montadoRef.current) void cargar().catch(() => {}); }).catch(() => {});
    return () => { montadoRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirPlaza(p: string) {
    setPlaza(p);
    try { localStorage.setItem(PLAZA_KEY, p); } catch { /* sin almacenamiento */ }
  }

  // Dólar: el de hoy (BNA) contra la lectura anterior guardada
  const dolar = useMemo(() => {
    const actual = tc ? { fecha: tc.fecha, compra: tc.compra, venta: tc.venta } : tcHist[0] ?? null;
    if (!actual) return null;
    const previo = tcHist.find((h) => h.fecha < actual.fecha) ?? null;
    return {
      ...actual,
      desactualizado: !!tc?.desactualizado,
      varCompra: previo && previo.compra > 0 ? ((actual.compra - previo.compra) / previo.compra) * 100 : null,
      varVenta: previo && previo.venta > 0 ? ((actual.venta - previo.venta) / previo.venta) * 100 : null,
    };
  }, [tc, tcHist]);

  const tcHoy = tc?.compra || tcHist[0]?.compra || null;
  const granos = useMemo(() => GRANOS.map((g) => ({ grano: g, pz: pizarraConVariacion(pizarras, plaza, g, tcHoy) })), [pizarras, plaza, tcHoy]);
  const futurosCosecha = useMemo(() => ['Soja', 'Maíz', 'Trigo'].map((g) => {
    const pos = posicionCosecha(posicionesVigentes(futuros, g), g, hoyAR());
    return pos ? { grano: g, etiqueta: etiquetaPosicion(pos.posicion), ...futuroConVariacion(futuros, g, pos.posicion)! } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x), [futuros]);

  if (!dolar && granos.every((g) => !g.pz) && !futurosCosecha.length) return null;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Wheat className="w-5 h-5 text-amber-600" /> Mercados</h2>
        <div className="flex items-center gap-2">
          <select value={plaza} onChange={(e) => elegirPlaza(e.target.value)} aria-label="Plaza de la pizarra"
            className="px-2 py-1 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
            {PLAZAS_PIZARRA.map((p) => <option key={p} value={p}>Pizarra {p}</option>)}
          </select>
          {onAbrir && <button onClick={onAbrir} className="text-sm text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5 whitespace-nowrap">Relación <ChevronRight className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {/* Dólar */}
        {dolar && (
          <div className="rounded-lg bg-emerald-900 text-white px-3 py-2 col-span-2 sm:col-span-1">
            <p className="text-[11px] text-emerald-300 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Dólar BNA divisa</p>
            <div className="flex items-baseline justify-between gap-2 mt-0.5">
              <span className="text-[11px] text-emerald-300">Compra</span>
              <span className="cifra text-lg tabular-nums">{formatUSD(dolar.compra, 2)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-emerald-300">Venta</span>
              <span className="cifra text-lg tabular-nums">{formatUSD(dolar.venta, 2)}</span>
            </div>
            <p className="text-[10px] text-emerald-300 mt-0.5">{dm(dolar.fecha)}{dolar.desactualizado ? ' · sin actualizar' : ''}{dolar.varVenta !== null && Math.abs(dolar.varVenta) >= 0.05 ? ` · ${dolar.varVenta > 0 ? '+' : ''}${formatUSD(dolar.varVenta, 1)}%` : ''}</p>
          </div>
        )}

        {/* Pizarra */}
        {granos.map(({ grano, pz }) => (
          <div key={grano} className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">{grano}</p>
            {pz ? <>
              <p className="cifra text-lg text-gray-900 tabular-nums leading-tight">USD {formatUSD(pz.usd, 0)}</p>
              <p className="flex items-center justify-between gap-1">
                <span className={`text-[10px] ${diasEntre(pz.fecha, hoyAR()) > 7 ? 'text-amber-700' : 'text-gray-400'}`}>{dm(pz.fecha)}{pz.convertido ? ' · de $' : ''}</span>
                <Variacion pct={pz.variacionPct} />
              </p>
            </> : <p className="text-[11px] text-gray-400 mt-1">Sin cotización</p>}
          </div>
        ))}
      </div>

      {futurosCosecha.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
          <span className="text-gray-400">Futuros Matba-Rofex (Rosario):</span>
          {futurosCosecha.map((f) => (
            <span key={f.grano} className="inline-flex items-center gap-1.5">
              {f.grano} {f.etiqueta.toLowerCase()} <strong className="tabular-nums text-gray-800">USD {formatUSD(f.ajuste, 1)}</strong> <Variacion pct={f.variacionPct} />
            </span>
          ))}
          <span className="text-gray-400">· ajuste {dm(futurosCosecha[0].fecha)}</span>
        </div>
      )}
    </section>
  );
}
