import { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Loader2, Copy, FileDown, ExternalLink, AlertTriangle } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import { formatUSD, formatDate } from '@/lib/format';
import { formatearFechaHora } from '@/lib/fechas';
import { describirCondicion, estadoFacturacionInfo, textoWhatsAppFacturacion, urlFacturacion } from '@/lib/facturacion';
import { docDePedido, facturacionPDF } from '@/lib/facturacionExport';
import type { PedidoFacturacion } from '@/types';
import { nombreCotizacion } from '@/lib/nombreCotizacion';

type Filtro = 'abiertos' | 'Pendiente' | 'Observado' | 'Facturado' | 'todos';

/** Pedidos enviados a facturar: pendientes, observados (a corregir) y facturados. */
export default function Facturacion({ onEdit }: { onEdit: (cotizacionId: string) => void }) {
  const data = useData();
  const toast = useToast();
  const [pedidos, setPedidos] = useState<PedidoFacturacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('abiertos');

  const cargar = useCallback(async () => { setPedidos(await data.fetchPedidosFacturacion()); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const cuenta = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of pedidos) c[p.estado] = (c[p.estado] || 0) + 1;
    return c;
  }, [pedidos]);
  const visibles = pedidos.filter((p) => filtro === 'todos' ? true : filtro === 'abiertos' ? p.estado === 'Pendiente' || p.estado === 'Observado' : p.estado === filtro);

  async function copiar(texto: string, ok: string) {
    try { await navigator.clipboard.writeText(texto); toast.exito(ok); } catch { toast.aviso('No se pudo copiar. Probá de nuevo.'); }
  }

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  const filtros: { id: Filtro; label: string; n?: number }[] = [
    { id: 'abiertos', label: 'Abiertos', n: (cuenta.Pendiente || 0) + (cuenta.Observado || 0) },
    { id: 'Observado', label: 'Observados', n: cuenta.Observado },
    { id: 'Pendiente', label: 'Pendientes', n: cuenta.Pendiente },
    { id: 'Facturado', label: 'Facturados', n: cuenta.Facturado },
    { id: 'todos', label: 'Todos' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">A facturar</h1>
        <p className="text-sm text-gray-500 mt-1">Pedidos que se mandaron a facturación desde cotizaciones ganadas. Se arman desde la cotización con "Enviar a facturar".</p>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit max-w-full overflow-x-auto">
        {filtros.map((f) => (
          <button key={f.id} onClick={() => setFiltro(f.id)} className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap ${filtro === f.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-500'}`}>
            {f.label}{f.n ? <span className={`ml-1.5 text-xs px-1.5 rounded-full ${f.id === 'Observado' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'}`}>{f.n}</span> : null}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <Receipt className="w-10 h-10 mx-auto mb-2 opacity-40" />
          {pedidos.length === 0 ? 'Todavía no se mandó nada a facturar.' : 'No hay pedidos con este filtro.'}
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((p) => {
            const info = estadoFacturacionInfo(p.estado);
            const ref = p.cotizacion ?? { numero: p.extra?.numero, numero_cliente: p.extra?.numero_cliente, cliente_nombre: p.cliente.nombre };
            const nombre = nombreCotizacion(ref, p.cliente.nombre);
            const link = urlFacturacion(window.location.origin, p.token);
            const vencido = (p.estado === 'Pendiente' || p.estado === 'Observado') && new Date(p.vence_el).getTime() < Date.now();
            const conds = p.condiciones.map((c) => describirCondicion(c, (n, d) => formatUSD(n, d ?? 2)));
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">
                      {nombre}
                      <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded align-middle ${info.clase}`}>{info.texto}</span>
                      {vencido && <span className="ml-1 text-xs font-medium px-2 py-0.5 rounded align-middle bg-gray-200 text-gray-600">Link vencido</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.nota_venta ? `NV ${p.nota_venta} · ` : ''}Enviado {formatearFechaHora(p.enviado_at)}{p.creado_por ? ` por ${p.creado_por}` : ''} · {p.lineas.length} {p.lineas.length === 1 ? 'producto' : 'productos'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{conds.join(' + ')}</p>
                  </div>
                  <p className="cifra text-2xl text-emerald-900 whitespace-nowrap">USD {formatUSD(p.totales.total, 0)}</p>
                </div>
                {p.estado === 'Observado' && (
                  <p className="mt-2 text-sm rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span><strong>{p.observado_por}:</strong> {p.observacion}</span></p>
                )}
                {p.estado === 'Facturado' && (
                  <p className="mt-2 text-sm text-emerald-800">Factura <strong>{p.factura_numero}</strong>{p.factura_fecha ? ` del ${formatDate(p.factura_fecha)}` : ''}{p.facturado_por ? ` · ${p.facturado_por}` : ''}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <button onClick={() => onEdit(p.cotizacion_id)} className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${p.estado === 'Observado' ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    <ExternalLink className="w-4 h-4" /> {p.estado === 'Observado' ? 'Abrir para corregir' : 'Abrir cotización'}
                  </button>
                  {(p.estado === 'Pendiente' || p.estado === 'Observado') && (
                    <button onClick={() => void copiar(textoWhatsAppFacturacion({ url: link, nombre, notaVenta: p.nota_venta }), 'Texto para WhatsApp copiado')}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><Copy className="w-4 h-4" /> Texto WhatsApp</button>
                  )}
                  <button onClick={() => void facturacionPDF(docDePedido(p, ref)).catch((e) => toast.error(e))} className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><FileDown className="w-4 h-4" /> PDF</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
