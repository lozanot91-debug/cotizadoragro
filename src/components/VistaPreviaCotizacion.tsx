import { useEffect } from 'react';
import { X, FileText, ExternalLink } from 'lucide-react';
import { calcularTotalesIva } from '@/lib/calculations';
import { financiacionLinea, ivaLinea } from '@/lib/export';
import { nombreCotizacion } from '@/lib/nombreCotizacion';
import { formatDate, formatUSD } from '@/lib/format';
import type { Cotizacion, CotizacionLinea } from '@/types';

const fmt = (n: number, d = 2) => formatUSD(n, d);

/**
 * Vista rápida de una cotización (sin salir de la pantalla): insumos, cantidad, precio y totales.
 * Los precios son finales (con flete y financiación), sin IVA; el total es con IVA, que es lo que se paga con grano.
 */
export default function VistaPreviaCotizacion({ cotizacion: c, lineas, onCerrar, onAbrir }: {
  cotizacion: Cotizacion;
  lineas: CotizacionLinea[];
  onCerrar: () => void;
  /** Abrir la cotización completa */
  onAbrir?: () => void;
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);

  const filas = lineas.map((l) => ({ l, fin: financiacionLinea(l, c), iva: ivaLinea(l, c) }));
  const t = calcularTotalesIva(filas.map(({ l, fin, iva }) => ({ totalUSD: l.total_usd, ivaPercent: iva, recargoPct: fin.pct })), c.tc);
  const hayPlazos = filas.some((f) => f.fin.plazo > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={`Vista previa de ${nombreCotizacion(c)}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="relative bg-white w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-xl shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Cotización</p>
            <h3 className="font-semibold text-gray-900 text-lg truncate">{nombreCotizacion(c)}</h3>
            <p className="text-xs text-gray-500">{formatDate(c.fecha)} · {c.estado} · TC {fmt(c.tc)}{c.canje_precio_usd > 0 ? ` · canje ${c.canje_cultivo || 'grano'} a USD ${fmt(c.canje_precio_usd)}/tn` : ''}</p>
          </div>
          <button onClick={onCerrar} className="p-1.5 text-gray-400 hover:text-gray-600 rounded" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-5 py-3">
          {filas.length === 0 ? <p className="text-sm text-gray-500 py-4">La cotización no tiene productos.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="text-left py-2 font-medium">Insumo</th>
                <th className="text-right py-2 font-medium">Cantidad</th>
                <th className="text-right py-2 pl-3 font-medium">Precio</th>
                <th className="text-right py-2 pl-3 font-medium">Total</th>
              </tr></thead>
              <tbody>
                {filas.map(({ l, fin, iva }) => (
                  <tr key={l.id} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-2">
                      <p className="text-gray-800">{l.producto}</p>
                      <p className="text-[11px] text-gray-400">IVA {fmt(iva, 1)} %{hayPlazos ? ` · ${fin.plazo > 0 ? `${fin.plazo} días` : 'contado'}` : ''}{l.flete_usd ? ' · con flete' : ''}</p>
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap">{fmt(l.cantidad, l.cantidad % 1 === 0 ? 0 : 2)} {l.es_fertilizante ? 'tn' : (l.unid || 'un').toLowerCase()}</td>
                    <td className="py-2 pl-3 text-right tabular-nums whitespace-nowrap">{fmt(fin.precioUnit)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums whitespace-nowrap font-medium">{fmt(fin.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] text-gray-400 mt-2">Precios en USD sin IVA, con flete y financiación incluidos.</p>
        </div>

        <div className="border-t border-gray-100 px-5 py-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600"><span>Subtotal{t.recargo > 0 ? ' (con financiación)' : ''}</span><span className="tabular-nums">{fmt(t.subtotal + t.recargo)}</span></div>
          {t.desglose.filter((d) => d.iva > 0).map((d) => (
            <div key={d.tasa} className="flex justify-between text-gray-600"><span>IVA {fmt(d.tasa, 1)} %</span><span className="tabular-nums">{fmt(d.iva)}</span></div>
          ))}
          <div className="flex justify-between items-baseline pt-1">
            <span className="font-semibold text-gray-800">Total con IVA <span className="font-normal text-xs text-gray-400">(se usa para el canje)</span></span>
            <span className="cifra text-2xl text-emerald-800">USD {fmt(t.total)}</span>
          </div>
          {!c.con_iva && <p className="text-[11px] text-gray-400">La cotización se mandó sin IVA (total USD {fmt(t.subtotal + t.recargo)}); para el canje se suma el IVA de cada producto.</p>}
          <div className="flex justify-end gap-2 pt-2">
            {onAbrir && <button onClick={onAbrir} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><ExternalLink className="w-4 h-4" /> Abrir cotización</button>}
            <button onClick={onCerrar} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">Listo</button>
          </div>
        </div>
      </div>
    </div>
  );
}
