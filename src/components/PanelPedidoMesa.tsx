import { useState } from 'react';
import { ClipboardList, Copy, Link2, Clock, CheckCircle2, AlertTriangle, Lock, Unlock, XCircle } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { formatUSD, formatNumber, formatDate } from '@/lib/format';
import { formatearFechaHora } from '@/lib/fechas';
import { estadoPedido, urlPedido, textoWhatsAppPedido, diasRestantes, venceEnDias, unidadCosto } from '@/lib/pedidosPrecio';
import type { PedidoPrecio } from '@/types';

interface Props {
  pedido: PedidoPrecio;
  /** Si se pasa, aparece el botón para volcar los costos de la mesa en la cotización abierta. */
  onAplicar?: () => void;
  /** Se llama después de cada cambio (extender, cancelar, habilitar) para recargar. */
  onCambio: () => void;
  /** Datos de la cotización cuando el panel se usa fuera de ella (lista de pedidos). */
  numero?: number;
  cliente?: string;
  acciones?: React.ReactNode;
}

export default function PanelPedidoMesa({ pedido, onAplicar, onCambio, numero, cliente, acciones }: Props) {
  const data = useData();
  const toast = useToast();
  const [dias, setDias] = useState('3');
  const [ocupado, setOcupado] = useState(false);
  const estado = estadoPedido(pedido);
  const num = numero ?? pedido.cotizacion?.numero ?? 0;
  const cli = cliente ?? pedido.cotizacion?.cliente_nombre ?? '';
  const link = urlPedido(window.location.origin, pedido.token);
  const quedan = diasRestantes(pedido.vence_el);

  async function copiar(texto: string, ok: string) {
    try { await navigator.clipboard.writeText(texto); toast.exito(ok); } catch { toast.aviso('No se pudo copiar. Probá de nuevo.'); }
  }
  async function correr(fn: () => Promise<void>, ok: string) {
    setOcupado(true);
    try { await fn(); toast.exito(ok); onCambio(); } catch (e) { toast.error(e); } finally { setOcupado(false); }
  }
  const diasN = Math.min(60, Math.max(1, parseInt(dias) || 3));

  const color = estado === 'Respondido' ? 'border-emerald-300 bg-emerald-50' : estado === 'Abierto' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50';

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${color}`}>
      <div className="flex items-start gap-3">
        <ClipboardList className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800">
            {estado === 'Abierto' && 'Esperando los costos de la mesa de insumos'}
            {estado === 'Vencido' && 'El link a la mesa de insumos venció sin respuesta'}
            {estado === 'Cancelado' && 'Pedido a mesa cancelado'}
            {estado === 'Respondido' && (pedido.correccion_solicitada ? 'La mesa pidió corregir los costos' : 'La mesa de insumos cargó los costos')}
          </p>
          {(num > 0 || cli) && <p className="text-sm text-gray-600">Cotización N° {num} · {cli}</p>}
          <p className="text-xs text-gray-500">
            Pedido el {formatDate(pedido.created_at)}{pedido.creado_por ? ` por ${pedido.creado_por}` : ''}
            {estado === 'Abierto' && <> · vence {formatearFechaHora(pedido.vence_el)} ({quedan <= 0 ? 'hoy' : `en ${quedan} día${quedan === 1 ? '' : 's'}`})</>}
          </p>
        </div>
        {acciones}
      </div>

      {estado === 'Respondido' && (
        <div className="space-y-2">
          <p className="text-sm text-emerald-900 flex items-center gap-1.5"><Lock className="w-4 h-4" /> Cargado por <strong>{pedido.respondido_por}</strong>{pedido.respondido_at ? ` el ${formatearFechaHora(pedido.respondido_at)}` : ''} · bloqueado</p>
          {pedido.nota_respuesta && <p className="text-sm text-gray-700 bg-white/70 rounded-lg px-3 py-2">Nota de la mesa: {pedido.nota_respuesta}</p>}
          {pedido.correccion_solicitada && pedido.correccion_mensaje && (
            <p className="text-sm text-amber-900 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> Piden corregir: “{pedido.correccion_mensaje}”</p>
          )}
          {(pedido.lineas || []).length > 0 && (
            <div className="bg-white/70 rounded-lg divide-y divide-emerald-100 text-sm">
              {(pedido.lineas || []).map((l) => (
                <div key={l.id} className="px-3 py-1.5 flex justify-between gap-3">
                  <span className="text-gray-700">{l.producto} <span className="text-xs text-gray-400">· {formatNumber(l.cantidad, l.cantidad % 1 === 0 ? 0 : 2)} {l.es_fertilizante ? 'tn' : l.unidad || 'un'}{l.proveedor ? ` · ${l.proveedor}` : ''}</span></span>
                  <span className="whitespace-nowrap font-medium text-gray-800">USD {formatUSD(l.costo_usd || 0)} <span className="text-xs text-gray-400 font-normal">{unidadCosto(l).replace('USD ', '')}</span></span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 flex items-center gap-1">
            {pedido.aplicado_at ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Costos aplicados a la cotización el {formatearFechaHora(pedido.aplicado_at)}</> : <><Clock className="w-3.5 h-3.5" /> Todavía no se aplicaron a la cotización</>}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {estado === 'Respondido' && onAplicar && (
          <button onClick={onAplicar} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {pedido.aplicado_at ? 'Volver a aplicar los costos' : 'Aplicar costos a la cotización'}</button>
        )}
        {(estado === 'Abierto' || estado === 'Vencido') && (
          <>
            {estado === 'Abierto' && (
              <>
                <button onClick={() => void copiar(link, 'Link copiado')} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Copiar link</button>
                <button onClick={() => void copiar(textoWhatsAppPedido({ url: link, numero: num, cliente: cli, venceEl: pedido.vence_el, nota: pedido.nota }), 'Texto para WhatsApp copiado')} className="px-3 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 flex items-center gap-1.5"><Copy className="w-4 h-4" /> Texto WhatsApp</button>
              </>
            )}
            <span className="flex items-center gap-1 text-sm text-gray-600">
              <input type="number" min={1} max={60} value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Días" className="w-14 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right" /> días
              <button disabled={ocupado} onClick={() => void correr(() => data.extenderPedidoPrecio(pedido.id, venceEnDias(diasN)), 'Vigencia actualizada')} className="ml-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{estado === 'Vencido' ? 'Reactivar' : 'Cambiar vigencia'}</button>
            </span>
            <button disabled={ocupado} onClick={() => { if (window.confirm('¿Cancelar este pedido? El link deja de funcionar.')) void correr(() => data.cancelarPedidoPrecio(pedido.id), 'Pedido cancelado'); }} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5 disabled:opacity-50"><XCircle className="w-4 h-4" /> Cancelar pedido</button>
          </>
        )}
        {estado === 'Respondido' && (
          <span className="flex items-center gap-1 text-sm text-gray-600">
            <button disabled={ocupado} onClick={() => { if (window.confirm('Se vuelve a abrir el mismo link para que la mesa corrija. ¿Habilitar la corrección?')) void correr(() => data.habilitarCorreccionPedido(pedido.id, venceEnDias(diasN)), 'Corrección habilitada: la mesa puede volver a cargar'); }} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"><Unlock className="w-4 h-4" /> Habilitar corrección</button>
            por <input type="number" min={1} max={60} value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Días" className="w-14 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-right" /> días
          </span>
        )}
      </div>
    </div>
  );
}
