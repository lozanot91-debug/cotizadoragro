import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2, ChevronLeft, ChevronRight, BellRing, Trophy, XCircle, Clock, Wallet, RefreshCw, Swords, FileText } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { armarResumen, nombreCot } from '../../supabase/functions/resumen-semanal/resumen';
import { alertasRecompra } from '@/lib/recompras';
import { diferenciaPct } from '@/lib/competencia';
import { hoyAR, sumarDias } from '@/lib/fechas';
import { formatDate, formatUSD } from '@/lib/format';
import type { Cobranza, Cotizacion, PrecioCompetencia } from '@/types';
import type { Screen } from '@/lib/menu';

const fmt = (n: number, d = 0) => formatUSD(n, d);

function Tarjeta({ icono, titulo, valor, detalle, tono = 'gris' }: { icono: React.ReactNode; titulo: string; valor: string; detalle?: React.ReactNode; tono?: 'verde' | 'rojo' | 'ambar' | 'gris' }) {
  const t = { verde: 'border-emerald-200 bg-emerald-50/50', rojo: 'border-red-200 bg-red-50/50', ambar: 'border-amber-200 bg-amber-50/50', gris: 'border-gray-200 bg-white' }[tono];
  return (
    <div className={`rounded-xl border p-4 ${t}`}>
      <p className="text-xs text-gray-500 flex items-center gap-1.5">{icono} {titulo}</p>
      <p className="cifra text-3xl text-gray-900 mt-1">{valor}</p>
      {detalle && <div className="text-xs text-gray-600 mt-1">{detalle}</div>}
    </div>
  );
}

/** Resumen de una semana: lo cotizado, ganado y perdido, lo que vence, cobros, recompras y competencia. */
export default function ResumenSemanal({ onEditCotiz, onNavigate }: { onEditCotiz: (id: string) => void; onNavigate: (s: Screen) => void }) {
  const data = useData();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [cambios, setCambios] = useState<{ cotizacion_id: string | null; valor_nuevo: string | null; created_at: string }[]>([]);
  const [cobros, setCobros] = useState<Cobranza[]>([]);
  const [competencia, setCompetencia] = useState<PrecioCompetencia[]>([]);
  const [pospuestas, setPospuestas] = useState<Map<string, string>>(new Map());
  // La semana se define por el día siguiente a su domingo: por defecto hoy (los 7 días anteriores)
  const [ref, setRef] = useState(hoyAR());
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    const [cots, chs, cbs, comp, pos] = await Promise.all([
      data.fetchCotizaciones(),
      data.fetchCambiosEstado(new Date(Date.now() - 400 * 86400000).toISOString()),
      data.fetchCobranzas(),
      data.fetchPreciosCompetencia(sumarDias(hoyAR(), -400)),
      data.fetchRecomprasPospuestas().catch(() => new Map<string, string>()),
    ]);
    setCotizaciones(cots); setCambios(chs); setCobros(cbs); setCompetencia(comp); setPospuestas(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const r = useMemo(() => armarResumen(ref, cotizaciones.map((c) => ({ ...c })), cambios, cobros.map((c) => ({ vencimiento: c.vencimiento, monto_usd: c.monto_usd, estado: c.estado }))), [ref, cotizaciones, cambios, cobros]);
  const porId = useMemo(() => new Map(cotizaciones.map((c) => [c.id, c])), [cotizaciones]);
  const perdidas = useMemo(() => r.perdidas.ids.map((id) => porId.get(id)).filter((c): c is Cotizacion => !!c), [r, porId]);
  const recompras = useMemo(() => alertasRecompra(cotizaciones, ref, pospuestas), [cotizaciones, ref, pospuestas]);
  const compSemana = useMemo(() => competencia.filter((c) => c.fecha >= r.desde && c.fecha <= r.hasta), [competencia, r.desde, r.hasta]);
  const esActual = ref === hoyAR();

  async function enviarme() {
    setEnviando(true);
    try {
      const res = await data.enviarmeResumen();
      if (res.enviados > 0) toast.exito('Te mandamos el resumen. Revisá las notificaciones del celular.');
      else toast.aviso(res.motivo || 'No se pudo mandar: activá los avisos en este dispositivo (Pedidos a mesa o Inicio).');
    } catch (e) { toast.error(e); } finally { setEnviando(false); }
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titulo text-3xl text-emerald-900 flex items-center gap-2"><CalendarDays className="w-7 h-7" /> Resumen semanal</h1>
          <p className="text-sm text-gray-500 mt-1">Llega solo los lunes a las 8 como notificación a quienes tienen los avisos activados.</p>
        </div>
        <button onClick={() => void enviarme()} disabled={enviando} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-60">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />} Mandármelo ahora
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setRef(sumarDias(ref, -7))} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50" aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
        <p className="font-semibold text-gray-800 min-w-[13rem] text-center">{formatDate(r.desde)} al {formatDate(r.hasta)}</p>
        <button onClick={() => setRef(sumarDias(ref, 7) > hoyAR() ? hoyAR() : sumarDias(ref, 7))} disabled={esActual} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40" aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></button>
        {!esActual && <button onClick={() => setRef(hoyAR())} className="text-sm text-emerald-700 hover:underline ml-1">Últimos 7 días</button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta icono={<FileText className="w-4 h-4" />} titulo="Cotizado" valor={`USD ${fmt(r.cotizadas.usd)}`} detalle={`${r.cotizadas.n} ${r.cotizadas.n === 1 ? 'cotización' : 'cotizaciones'}`} />
        <Tarjeta icono={<Trophy className="w-4 h-4" />} titulo="Ganado" tono="verde" valor={`USD ${fmt(r.ganadas.usd)}`}
          detalle={<>{r.ganadas.n} {r.ganadas.n === 1 ? 'cotización' : 'cotizaciones'}{r.tasaCierre !== null ? ` · cierre ${fmt(r.tasaCierre)} %` : ''}</>} />
        <Tarjeta icono={<XCircle className="w-4 h-4" />} titulo="Perdido" tono={r.perdidas.n ? 'rojo' : 'gris'} valor={`USD ${fmt(r.perdidas.usd)}`}
          detalle={r.perdidas.n ? r.perdidas.motivos.map((m) => `${m.motivo} (${m.n})`).join(' · ') : 'Ninguna'} />
        <Tarjeta icono={<Wallet className="w-4 h-4" />} titulo="Cobros vencidos" tono={r.cobros.vencidos.n ? 'ambar' : 'gris'} valor={`USD ${fmt(r.cobros.vencidos.usd)}`}
          detalle={`${r.cobros.vencidos.n} ${r.cobros.vencidos.n === 1 ? 'cobro vencido' : 'cobros vencidos'} · USD ${fmt(r.cobros.proximos7.usd)} en los próximos 7 días`} />
      </div>
      {!esActual && <p className="text-[11px] text-gray-400 -mt-2">Cobros, vencimientos y recompras se muestran siempre a hoy.</p>}

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-2"><Trophy className="w-5 h-5 text-emerald-600" /> Ganadas</h2>
          {r.ganadas.ids.length === 0 ? <p className="text-sm text-gray-500">Ninguna esta semana.</p> : (
            <ul className="divide-y divide-gray-100">
              {r.ganadas.ids.map((id) => porId.get(id)).filter((c): c is Cotizacion => !!c).map((c) => (
                <li key={c.id}><button onClick={() => onEditCotiz(c.id)} className="w-full text-left py-2 flex justify-between gap-3 text-sm hover:text-emerald-700">
                  <span>{nombreCot(c)}</span><span className="tabular-nums">USD {fmt(c.ganado_usd ?? c.subtotal_usd)}</span>
                </button></li>
              ))}
            </ul>
          )}
          {perdidas.length > 0 && <>
            <h3 className="font-semibold text-gray-700 flex items-center gap-2 mt-4 mb-2 text-sm"><XCircle className="w-4 h-4 text-red-600" /> Perdidas</h3>
            <ul className="divide-y divide-gray-100">
              {perdidas.map((c) => (
                <li key={c.id}><button onClick={() => onEditCotiz(c.id)} className="w-full text-left py-2 flex justify-between gap-3 text-sm hover:text-emerald-700">
                  <span>{nombreCot(c)} <span className="text-xs text-gray-400">{c.motivo_perdida}</span></span><span className="tabular-nums">USD {fmt(c.subtotal_usd)}</span>
                </button></li>
              ))}
            </ul>
          </>}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-2"><Clock className="w-5 h-5 text-amber-600" /> Vencen en los próximos 7 días</h2>
          {r.porVencer.length === 0 ? <p className="text-sm text-gray-500">Ninguna.{r.vencidas ? ` Hay ${r.vencidas} abiertas ya vencidas.` : ''}</p> : (
            <>
              <ul className="divide-y divide-gray-100">
                {r.porVencer.map((p) => (
                  <li key={p.id}><button onClick={() => onEditCotiz(p.id)} className="w-full text-left py-2 flex justify-between gap-3 text-sm hover:text-emerald-700">
                    <span>{p.nombre} <span className="text-xs text-gray-400">vence {formatDate(p.vence)}</span></span><span className="tabular-nums">USD {fmt(p.usd)}</span>
                  </button></li>
                ))}
              </ul>
              {r.vencidas > 0 && <button onClick={() => onNavigate('vencimientos')} className="text-xs text-amber-700 hover:underline mt-2">Y {r.vencidas} abiertas ya vencidas →</button>}
            </>
          )}
          <h3 className="font-semibold text-gray-700 flex items-center gap-2 mt-4 mb-1 text-sm"><RefreshCw className="w-4 h-4 text-amber-600" /> Recompras de la campaña</h3>
          {recompras.length === 0 ? <p className="text-sm text-gray-500">Ningún cliente para recomprar ahora.</p> : (
            <p className="text-sm text-gray-700">{recompras.length} {recompras.length === 1 ? 'cliente compró' : 'clientes compraron'} el año pasado en esta época y no tienen cotización: {recompras.slice(0, 4).map((a) => a.cliente).join(', ')}{recompras.length > 4 ? '…' : ''} <button onClick={() => onNavigate('inicio')} className="text-emerald-700 hover:underline">Ver en Inicio</button></p>
          )}
        </section>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-2"><Swords className="w-5 h-5 text-gray-500" /> Competencia en la semana</h2>
        {compSemana.length === 0 ? <p className="text-sm text-gray-500">No se cargaron precios de la competencia.</p> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {compSemana.map((c) => {
              const d = diferenciaPct(c);
              return (
                <li key={c.id} className="py-2 flex justify-between gap-3">
                  <span>{c.producto} · <strong>{c.competidor}</strong>{c.cliente_nombre ? <span className="text-xs text-gray-400"> · {c.cliente_nombre}</span> : null}</span>
                  <span className="tabular-nums whitespace-nowrap">USD {formatUSD(c.precio_usd, 2)}{d !== null && <span className={`ml-2 text-xs ${d < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{d > 0 ? '+' : ''}{formatUSD(d, 1)} %</span>}</span>
                </li>
              );
            })}
          </ul>
        )}
        <button onClick={() => onNavigate('competencia')} className="text-sm text-emerald-700 hover:underline mt-2">Ver todo en Competencia →</button>
      </section>
    </div>
  );
}
