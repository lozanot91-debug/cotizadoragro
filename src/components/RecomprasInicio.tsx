import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Copy, BellOff, ChevronDown, ChevronUp, Loader2, FileText } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { alertasRecompra, textoDias, type AlertaRecompra } from '@/lib/recompras';
import { hoyAR, sumarDias } from '@/lib/fechas';
import { formatDate, formatUSD } from '@/lib/format';
import { registrarCambio } from '@/lib/historial';
import type { Cotizacion } from '@/types';

const VISIBLES = 5;

/**
 * Inicio: clientes que el año pasado compraron en esta época y este año todavía no tienen cotización.
 * Desde acá se recotiza la compra del año pasado o se pospone el aviso.
 */
export default function RecomprasInicio({ cotizaciones, onDuplicar, onEditCotiz }: {
  cotizaciones: Cotizacion[];
  onDuplicar?: (id: string) => void;
  onEditCotiz: (id: string) => void;
}) {
  const data = useData();
  const toast = useToast();
  const hoy = useMemo(() => hoyAR(), []);
  const [pospuestas, setPospuestas] = useState<Map<string, string> | null>(null);
  const [productos, setProductos] = useState<Record<string, string[]>>({});
  const [verTodas, setVerTodas] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargarPospuestas = useCallback(async () => {
    try { setPospuestas(await data.fetchRecomprasPospuestas()); } catch { setPospuestas(new Map()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void cargarPospuestas(); }, [cargarPospuestas]);

  const alertas = useMemo(() => (pospuestas ? alertasRecompra(cotizaciones, hoy, pospuestas) : []), [cotizaciones, hoy, pospuestas]);
  const visibles = verTodas ? alertas : alertas.slice(0, VISIBLES);

  // Qué compró cada uno (de las compras que se muestran)
  useEffect(() => {
    const ids = visibles.flatMap((a) => a.compras.map((c) => c.id)).filter((id) => !(id in productos));
    if (!ids.length) return;
    data.fetchProductosDeCotizaciones(ids).then((r) => setProductos((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, r[id] || []])) }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles]);

  async function posponer(a: AlertaRecompra, dias: number, motivo: string) {
    setOcupado(a.clave);
    try {
      const hasta = sumarDias(hoy, dias);
      await data.posponerRecompra(a.clave, a.clienteId, hasta, motivo);
      await registrarCambio({ tipo: 'cliente', entidad: `Cliente ${a.cliente}`, campo: 'aviso de recompra', valor_nuevo: `${motivo} hasta ${formatDate(hasta)}` });
      setPospuestas((p) => new Map(p).set(a.clave, hasta));
      toast.exito(`${a.cliente}: ${motivo.toLowerCase()} hasta el ${formatDate(hasta)}`);
    } catch (e) { toast.error(e); } finally { setOcupado(null); }
  }

  if (!pospuestas || alertas.length === 0) return null;

  return (
    <section className="bg-white rounded-xl shadow-sm border border-amber-300 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><RefreshCw className="w-5 h-5 text-amber-600" /> Recompras de la campaña</h2>
          <p className="text-xs text-gray-500 mt-0.5">Compraron el año pasado en esta época y este año todavía no tienen cotización.</p>
        </div>
        <span className="text-sm font-semibold text-amber-700 whitespace-nowrap">{alertas.length} {alertas.length === 1 ? 'cliente' : 'clientes'}</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {visibles.map((a) => {
          const prods = [...new Set(a.compras.flatMap((c) => productos[c.id] || []))];
          const ref = a.compras[0];
          return (
            <li key={a.clave} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">
                  <strong>{a.cliente}</strong>
                  <span className={`ml-2 text-xs font-medium ${a.dias < 0 ? 'text-red-700' : a.dias <= 14 ? 'text-amber-700' : 'text-gray-500'}`}>
                    {a.dias < 0 ? `se cumplió el año ${textoDias(a.dias)}` : `se cumple el año ${textoDias(a.dias)}`}
                  </span>
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {formatDate(ref.fecha)} · USD {formatUSD(a.montoUsd, 0)}{a.compras.length > 1 ? ` en ${a.compras.length} compras` : ''}
                  {prods.length > 0 && <> · {prods.slice(0, 4).join(', ')}{prods.length > 4 ? ` y ${prods.length - 4} más` : ''}</>}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {onDuplicar && (
                  <button onClick={() => onDuplicar(ref.id)} className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 flex items-center gap-1" title="Nueva cotización con los mismos productos y los precios de hoy">
                    <Copy className="w-3.5 h-3.5" /> Recotizar
                  </button>
                )}
                <button onClick={() => onEditCotiz(ref.id)} className="p-1.5 text-gray-400 hover:text-emerald-700" title="Ver la compra del año pasado" aria-label="Ver la compra del año pasado"><FileText className="w-4 h-4" /></button>
                <details className="relative">
                  <summary className="list-none p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer" title="Posponer o descartar" aria-label="Posponer o descartar">
                    {ocupado === a.clave ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
                  </summary>
                  <div className="absolute right-0 mt-1 z-20 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
                    <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; void posponer(a, 7, 'Pospuesto'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50">Recordar en 7 días</button>
                    <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; void posponer(a, 21, 'Pospuesto'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50">Recordar en 3 semanas</button>
                    <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; void posponer(a, 300, 'Descartado esta campaña'); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-600">No aplica esta campaña</button>
                  </div>
                </details>
              </div>
            </li>
          );
        })}
      </ul>
      {alertas.length > VISIBLES && (
        <button onClick={() => setVerTodas((v) => !v)} className="mt-1 text-sm text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
          {verTodas ? <><ChevronUp className="w-4 h-4" /> Ver menos</> : <><ChevronDown className="w-4 h-4" /> Ver las {alertas.length}</>}
        </button>
      )}
    </section>
  );
}
