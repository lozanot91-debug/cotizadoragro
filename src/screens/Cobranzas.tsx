import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Loader2, Check, CalendarClock, Pencil, ArrowUpRight, Undo2, X, FilePlus2 } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { registrarCambio } from '@/lib/historial';
import { generarCobranzas, resumenCobranzas, situacionCobro, diasParaCobrar, cobroEnGranos, type SituacionCobro } from '@/lib/cobranzas';
import { formatUSD, formatDate, parseNumberInput, formatInputNumber } from '@/lib/format';
import { hoyAR, fechaDeTimestamp } from '@/lib/fechas';
import type { Cobranza, Cotizacion } from '@/types';

const GRUPOS: { id: SituacionCobro; titulo: string; cls: string }[] = [
  { id: 'vencida', titulo: 'Vencidos', cls: 'text-red-700' },
  { id: 'hoy', titulo: 'Para cobrar hoy', cls: 'text-amber-700' },
  { id: 'semana', titulo: 'Próximos 7 días', cls: 'text-gray-800' },
  { id: 'futura', titulo: 'Más adelante', cls: 'text-gray-800' },
];

function cuando(dias: number): string {
  if (dias < 0) return `hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return `en ${dias} días`;
}

export default function Cobranzas({ onEdit }: { onEdit: (cotizId: string) => void }) {
  const data = useData();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [cobros, setCobros] = useState<Cobranza[]>([]);
  const [ganadasSinCobros, setGanadasSinCobros] = useState<Cotizacion[]>([]);
  const [verCobradas, setVerCobradas] = useState(false);
  const [editando, setEditando] = useState<Cobranza | null>(null);
  const [form, setForm] = useState({ fecha: '', monto: '', nota: '' });
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [cs, cotizs] = await Promise.all([data.fetchCobranzas(), data.fetchCotizaciones()]);
    setCobros(cs);
    const conCobro = new Set(cs.map((c) => c.cotizacion_id));
    setGanadasSinCobros(cotizs.filter((c) => c.estado === 'Ganada' && !conCobro.has(c.id)));
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const hoy = hoyAR();
  const resumen = useMemo(() => resumenCobranzas(cobros, hoy), [cobros, hoy]);
  const pendientes = cobros.filter((c) => c.estado === 'Pendiente');
  const cobradas = cobros.filter((c) => c.estado === 'Cobrada').sort((a, b) => (b.cobrada_el || '').localeCompare(a.cobrada_el || ''));

  async function marcarCobrada(c: Cobranza) {
    setTrabajando(c.id);
    try {
      await data.actualizarCobranza(c.id, { estado: 'Cobrada', cobrada_el: hoy });
      await registrarCambio({ tipo: 'cobranza', cotizacion_id: c.cotizacion_id, entidad: `Cobro de la cotización N° ${c.cotizacion?.numero ?? ''}`, campo: 'estado', valor_anterior: 'Pendiente', valor_nuevo: 'Cobrada', detalle: `USD ${formatUSD(c.monto_usd)}` });
      setCobros((prev) => prev.map((x) => (x.id === c.id ? { ...x, estado: 'Cobrada', cobrada_el: hoy } : x)));
      toast.exito('Cobro registrado.');
    } catch (e) { toast.error(e); } finally { setTrabajando(null); }
  }

  async function deshacerCobro(c: Cobranza) {
    setTrabajando(c.id);
    try {
      await data.actualizarCobranza(c.id, { estado: 'Pendiente', cobrada_el: null });
      await registrarCambio({ tipo: 'cobranza', cotizacion_id: c.cotizacion_id, entidad: `Cobro de la cotización N° ${c.cotizacion?.numero ?? ''}`, campo: 'estado', valor_anterior: 'Cobrada', valor_nuevo: 'Pendiente' });
      setCobros((prev) => prev.map((x) => (x.id === c.id ? { ...x, estado: 'Pendiente', cobrada_el: null } : x)));
    } catch (e) { toast.error(e); } finally { setTrabajando(null); }
  }

  function abrirEdicion(c: Cobranza) {
    setEditando(c);
    setForm({ fecha: c.vencimiento, monto: formatInputNumber(c.monto_usd, 2), nota: c.nota || '' });
  }

  async function guardarEdicion() {
    if (!editando) return;
    const monto = parseNumberInput(form.monto);
    if (!form.fecha) { toast.aviso('Poné la fecha de cobro.'); return; }
    if (!(monto > 0)) { toast.aviso('El monto tiene que ser mayor a cero.'); return; }
    setTrabajando(editando.id);
    try {
      await data.actualizarCobranza(editando.id, { vencimiento: form.fecha, monto_usd: monto, nota: form.nota.trim() || null });
      const cambios: string[] = [];
      if (form.fecha !== editando.vencimiento) cambios.push(`fecha ${formatDate(editando.vencimiento)} → ${formatDate(form.fecha)}`);
      if (monto !== editando.monto_usd) cambios.push(`monto USD ${formatUSD(editando.monto_usd)} → ${formatUSD(monto)}`);
      if (cambios.length) await registrarCambio({ tipo: 'cobranza', cotizacion_id: editando.cotizacion_id, entidad: `Cobro de la cotización N° ${editando.cotizacion?.numero ?? ''}`, campo: 'cobro', detalle: cambios.join(', ') });
      setCobros((prev) => prev.map((x) => (x.id === editando.id ? { ...x, vencimiento: form.fecha, monto_usd: monto, nota: form.nota.trim() || null } : x)));
      setEditando(null);
      toast.exito('Cobro actualizado.');
    } catch (e) { toast.error(e); } finally { setTrabajando(null); }
  }

  /** Cotizaciones que ya estaban ganadas antes de existir Cobranzas: se cargan con el plazo desde el día en que se ganaron. */
  async function cargarGanadas() {
    setTrabajando('ganadas');
    try {
      let n = 0;
      for (const c of ganadasSinCobros) {
        const lineas = await data.fetchLineas(c.id);
        const nuevos = generarCobranzas(c, lineas, fechaDeTimestamp(c.updated_at));
        await data.crearCobranzas(nuevos.map((x) => ({ cotizacion_id: c.id, ...x })));
        n += nuevos.length;
      }
      toast.exito(`Se cargaron ${n} cobros de cotizaciones ya ganadas.`);
      await load();
    } catch (e) { toast.error(e); } finally { setTrabajando(null); }
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  const fila = (c: Cobranza) => {
    const dias = diasParaCobrar(c, hoy);
    const sit = situacionCobro(c, hoy);
    const granos = cobroEnGranos(c);
    const ocupado = trabajando === c.id;
    return (
      <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-gray-100 last:border-0">
        <div className="flex-1 min-w-[12rem]">
          <p className="font-medium text-gray-800">{c.cotizacion?.cliente_nombre || 'Sin cliente'}</p>
          <p className="text-xs text-gray-500">
            Cotización N° {c.cotizacion?.numero}{c.plazo_dias > 0 ? `, a ${c.plazo_dias} días` : ', contado'}
            {c.nota ? `. ${c.nota}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="cifra text-xl text-gray-900">{formatUSD(c.monto_usd)} <span className="text-xs font-semibold text-gray-500">USD</span></p>
          {granos && <p className="text-xs text-amber-700">{formatUSD(granos.tn)} tn de {granos.cultivo}</p>}
        </div>
        <div className={`text-sm w-36 text-right ${sit === 'vencida' ? 'text-red-700 font-medium' : sit === 'hoy' ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
          {c.estado === 'Cobrada' ? <>Cobrado el {formatDate(c.cobrada_el || c.vencimiento)}</> : <>{formatDate(c.vencimiento)}<span className="block text-xs">{cuando(dias)}</span></>}
        </div>
        <div className="flex items-center gap-1">
          {c.estado === 'Pendiente' ? (
            <button onClick={() => marcarCobrada(c)} disabled={!!trabajando} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Cobrado
            </button>
          ) : (
            <button onClick={() => deshacerCobro(c)} disabled={!!trabajando} title="Volver a pendiente" className="p-1.5 text-gray-500 hover:bg-gray-100 rounded disabled:opacity-50"><Undo2 className="w-4 h-4" /></button>
          )}
          <button onClick={() => abrirEdicion(c)} title="Cambiar fecha, monto o nota" className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-gray-100 rounded"><Pencil className="w-4 h-4" /></button>
          <button onClick={() => onEdit(c.cotizacion_id)} title="Abrir cotización" className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-gray-100 rounded"><ArrowUpRight className="w-4 h-4" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl titulo text-gray-800 flex items-center gap-2"><Wallet className="w-6 h-6 text-emerald-600" /> Cobranzas</h1>
        <p className="text-sm text-gray-500">Se generan solas cuando marcás una cotización como ganada: un cobro por cada plazo, con la financiación y el IVA incluidos.</p>
      </div>

      <section className="bg-emerald-900 text-white rounded-xl overflow-hidden">
        <div className="px-5 pt-4 pb-5">
          <p className="text-emerald-200 text-sm">Por cobrar ({pendientes.length} {pendientes.length === 1 ? 'cobro' : 'cobros'})</p>
          <p className="cifra text-6xl mt-1">{formatUSD(resumen.porCobrar, 0)}<span className="text-2xl font-semibold text-amber-300 ml-2">USD</span></p>
        </div>
        <div className="grid grid-cols-3 border-t border-emerald-700/70 bg-emerald-950/40">
          <div className="px-4 py-3"><p className="text-emerald-300 text-xs">Vencido</p><p className={`cifra text-xl mt-1 ${resumen.vencido > 0 ? 'text-amber-300' : ''}`}>{formatUSD(resumen.vencido, 0)}</p></div>
          <div className="px-4 py-3 border-l border-emerald-700/70"><p className="text-emerald-300 text-xs">Hoy</p><p className="cifra text-xl mt-1">{formatUSD(resumen.hoy, 0)}</p></div>
          <div className="px-4 py-3 border-l border-emerald-700/70"><p className="text-emerald-300 text-xs">Próximos 30 días</p><p className="cifra text-xl mt-1">{formatUSD(resumen.proximos30, 0)}</p></div>
        </div>
      </section>

      {ganadasSinCobros.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm text-amber-900">
          <span>Hay {ganadasSinCobros.length} {ganadasSinCobros.length === 1 ? 'cotización ganada' : 'cotizaciones ganadas'} sin cobros cargados.</span>
          <button onClick={cargarGanadas} disabled={!!trabajando} className="px-3 py-1.5 bg-amber-400 text-emerald-950 rounded-lg font-medium hover:bg-amber-300 disabled:opacity-50 flex items-center gap-1.5">
            {trabajando === 'ganadas' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />} Cargar sus cobros
          </button>
        </div>
      )}

      {pendientes.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-40" />
          No tenés cobros pendientes. Cuando ganes una cotización aparece acá.
        </div>
      ) : (
        GRUPOS.map((g) => {
          const items = pendientes.filter((c) => situacionCobro(c, hoy) === g.id);
          if (items.length === 0) return null;
          return (
            <section key={g.id} className="bg-white rounded-xl border border-gray-200">
              <h2 className={`px-4 pt-3 pb-1 titulo text-lg ${g.cls}`}>{g.titulo} ({items.length})</h2>
              {items.map(fila)}
            </section>
          );
        })
      )}

      {cobradas.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200">
          <button onClick={() => setVerCobradas(!verCobradas)} className="w-full text-left px-4 py-3 titulo text-lg text-gray-600 flex items-center justify-between">
            Cobrados ({cobradas.length}) <span className="text-sm font-normal text-emerald-700">{verCobradas ? 'Ocultar' : 'Ver'}</span>
          </button>
          {verCobradas && cobradas.map(fila)}
        </section>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-5 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="titulo text-lg text-gray-800">Cobro de la cotización N° {editando.cotizacion?.numero}</h3>
              <button onClick={() => setEditando(null)} aria-label="Cerrar" className="text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-sm text-gray-700">Fecha de cobro
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
            <label className="block text-sm text-gray-700">Monto (USD)
              <input type="text" inputMode="decimal" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-right outline-none focus:ring-2 focus:ring-emerald-500" />
              <span className="text-xs text-gray-400">Ajustalo si se entregó o facturó distinto a lo cotizado.</span>
            </label>
            <label className="block text-sm text-gray-700">Nota
              <input type="text" value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} placeholder="Ej.: cheque a 60, transferencia" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditando(null)} className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarEdicion} disabled={trabajando === editando.id} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
