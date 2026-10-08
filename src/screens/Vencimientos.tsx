import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, CheckCircle2, ListPlus, CalendarPlus, MessageCircle, Pencil } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { registrarCambio } from '@/lib/historial';
import { vencimientos, vigenciaExtendida, tieneTareaPendiente, tareaDeVencimiento, mensajeRecordatorio, type Vencimiento } from '@/lib/vencimientos';
import { formatUSD, formatDate } from '@/lib/format';
import { hoyAR } from '@/lib/fechas';
import type { Cotizacion, Tarea } from '@/types';
import { nombreCotizacion } from '@/lib/nombreCotizacion';

const SITUACION: Record<string, { txt: (d: number) => string; cls: string }> = {
  vencida: { txt: (d) => `Venció hace ${-d} ${d === -1 ? 'día' : 'días'}`, cls: 'bg-red-100 text-red-700' },
  hoy: { txt: () => 'Vence hoy', cls: 'bg-orange-100 text-orange-700' },
  pronto: { txt: (d) => `Vence en ${d} ${d === 1 ? 'día' : 'días'}`, cls: 'bg-amber-100 text-amber-700' },
};

export default function Vencimientos({ onEdit }: { onEdit: (id: string) => void }) {
  const data = useData();
  const toast = useToast();
  const { usuario } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cotizs, setCotizs] = useState<Cotizacion[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [aviso, setAviso] = useState(7);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [cs, ts] = await Promise.all([data.fetchCotizaciones(), data.fetchTareas()]);
    setCotizs(cs); setTareas(ts);
  }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const hoy = hoyAR();
  const lista = useMemo(() => vencimientos(cotizs, hoy, aviso), [cotizs, hoy, aviso]);
  const sinTarea = lista.filter((v) => !tieneTareaPendiente(v.cotiz.id, tareas));

  async function crearTareas(vs: Vencimiento[], clave: string) {
    if (vs.length === 0) return;
    setTrabajando(clave);
    try {
      for (const v of vs) {
        const t = tareaDeVencimiento(v, hoy);
        const creada = await data.createTarea({ ...t, asignado_a: usuario.nombre });
        if (creada) setTareas((prev) => [...prev, creada]);
        await registrarCambio({ tipo: 'tarea', cotizacion_id: v.cotiz.id, entidad: t.titulo, campo: 'creación', valor_nuevo: hoy, detalle: 'Seguimiento por vencimiento' });
      }
      toast.exito(vs.length === 1 ? 'Tarea de seguimiento creada.' : `${vs.length} tareas de seguimiento creadas.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setTrabajando(null);
    }
  }

  async function extender(v: Vencimiento, dias: number) {
    setTrabajando(`ext-${v.cotiz.id}`);
    try {
      const nueva = vigenciaExtendida(v.cotiz, hoy, dias);
      await data.actualizarVigencia(v.cotiz.id, nueva);
      await registrarCambio({ tipo: 'cotizacion', cotizacion_id: v.cotiz.id, campo: 'vigencia', valor_anterior: `${v.cotiz.vigencia_dias} días`, valor_nuevo: `${nueva} días`, detalle: `Extendida ${dias} días` });
      setCotizs((prev) => prev.map((c) => (c.id === v.cotiz.id ? { ...c, vigencia_dias: nueva } : c)));
      toast.exito(`${nombreCotizacion(v.cotiz)} extendida ${dias} días.`);
    } catch (e) {
      toast.error(e);
    } finally {
      setTrabajando(null);
    }
  }

  async function copiarMensaje(v: Vencimiento) {
    try {
      await navigator.clipboard.writeText(mensajeRecordatorio(v));
      toast.exito('Mensaje copiado, pegalo en WhatsApp.');
    } catch {
      toast.aviso('No se pudo copiar el mensaje. Probá de nuevo.');
    }
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><CalendarClock className="w-6 h-6 text-emerald-600" /> Vencimientos</h1>
        <p className="text-sm text-gray-500">Cotizaciones abiertas que ya vencieron o están por vencer. Extendé la vigencia, mandale un recordatorio al cliente o creá la tarea de seguimiento.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500">Avisar con</span>
          {[3, 7, 15].map((d) => (
            <button key={d} onClick={() => setAviso(d)} className={`px-3 py-1.5 rounded-lg border ${aviso === d ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>{d} días</button>
          ))}
          <span className="text-gray-500">de anticipación</span>
        </div>
        <button onClick={() => crearTareas(sinTarea, 'lote')} disabled={sinTarea.length === 0 || !!trabajando}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
          {trabajando === 'lote' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
          Crear tareas de seguimiento ({sinTarea.length})
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex items-center gap-3 text-emerald-800">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm">No hay cotizaciones vencidas ni por vencer en los próximos {aviso} días.</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <th className="text-left px-3 py-2 font-medium">Cotización</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Monto (USD)</th>
              <th className="text-left px-3 py-2 font-medium">Vigencia</th>
              <th className="text-left px-3 py-2 font-medium">Seguimiento</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {lista.map((v) => {
                const tiene = tieneTareaPendiente(v.cotiz.id, tareas);
                const s = SITUACION[v.situacion];
                const ocupado = trabajando === `ext-${v.cotiz.id}`;
                return (
                  <tr key={v.cotiz.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{nombreCotizacion(v.cotiz)}</td>
                    <td className="px-3 py-2 text-gray-500">{v.cotiz.estado}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{formatUSD(v.cotiz.subtotal_usd || 0, 0)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.txt(v.dias)}</span>
                      <span className="block text-xs text-gray-400 mt-0.5">{formatDate(v.vence)}</span>
                    </td>
                    <td className="px-3 py-2">
                      {tiene ? <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Tarea pendiente</span> : <span className="text-xs text-gray-400">Sin tarea</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button onClick={() => extender(v, 7)} disabled={!!trabajando} title="Extender 7 días" className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1 disabled:opacity-50">
                          {ocupado ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />} +7 días
                        </button>
                        <button onClick={() => extender(v, 15)} disabled={!!trabajando} title="Extender 15 días" className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">+15 días</button>
                        <button onClick={() => copiarMensaje(v)} title="Copiar mensaje para el cliente" className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-gray-100 rounded"><MessageCircle className="w-4 h-4" /></button>
                        {!tiene && <button onClick={() => crearTareas([v], v.cotiz.id)} disabled={!!trabajando} title="Crear tarea de seguimiento" className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-gray-100 rounded disabled:opacity-50"><ListPlus className="w-4 h-4" /></button>}
                        <button onClick={() => onEdit(v.cotiz.id)} title="Abrir cotización" className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-gray-100 rounded"><Pencil className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
