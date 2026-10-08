import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Pencil } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useCargaSegura } from '@/hooks/useCargaSegura';
import ErrorCarga from '@/components/ErrorCarga';
import PanelPedidoMesa from '@/components/PanelPedidoMesa';
import { estadoPedido, necesitaAtencion } from '@/lib/pedidosPrecio';
import type { PedidoPrecio } from '@/types';

export default function PedidosMesa({ onEdit }: { onEdit: (id: string) => void }) {
  const data = useData();
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<PedidoPrecio[]>([]);
  const [verCerrados, setVerCerrados] = useState(false);

  const cargar = useCallback(async () => { setPedidos(await data.fetchPedidosPrecio()); }, []);
  const { load, reintentar, errorCarga } = useCargaSegura(cargar, setLoading);
  useEffect(() => { void load(); }, [load]);

  const grupos = useMemo(() => {
    const vivos = pedidos.filter((p) => p.estado !== 'Cancelado');
    return {
      atencion: vivos.filter((p) => necesitaAtencion(p)),
      esperando: vivos.filter((p) => p.estado === 'Abierto'),
      cerrados: vivos.filter((p) => p.estado === 'Respondido' && !necesitaAtencion(p)),
    };
  }, [pedidos]);

  if (errorCarga && !loading) return <ErrorCarga error={errorCarga} onReintentar={reintentar} />;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /></div>;

  function fila(p: PedidoPrecio) {
    return (
      <PanelPedidoMesa
        key={p.id}
        pedido={p}
        onCambio={() => void load()}
        acciones={<button onClick={() => onEdit(p.cotizacion_id)} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 whitespace-nowrap"><Pencil className="w-3.5 h-3.5" /> Abrir cotización</button>}
      />
    );
  }

  const nada = grupos.atencion.length + grupos.esperando.length + grupos.cerrados.length === 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titulo text-3xl text-emerald-900 flex items-center gap-2"><ClipboardList className="w-7 h-7" /> Pedidos a mesa de insumos</h1>
        <p className="text-sm text-gray-500 mt-1">Pedidos de costos que mandaste por link. Para pedir uno nuevo, abrí una cotización y tocá “Pedir precios a mesa”.</p>
      </div>

      {nada && <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Todavía no pediste precios a la mesa de insumos.</div>}

      {grupos.atencion.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-emerald-900">Para revisar ({grupos.atencion.length})</h2>
          {grupos.atencion.map(fila)}
        </section>
      )}
      {grupos.esperando.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-gray-700">Esperando a la mesa ({grupos.esperando.length})</h2>
          {grupos.esperando.map((p) => (estadoPedido(p) ? fila(p) : null))}
        </section>
      )}
      {grupos.cerrados.length > 0 && (
        <section className="space-y-3">
          <button onClick={() => setVerCerrados(!verCerrados)} className="font-semibold text-gray-500 text-sm hover:text-gray-700">{verCerrados ? 'Ocultar' : 'Ver'} ya aplicados ({grupos.cerrados.length})</button>
          {verCerrados && grupos.cerrados.map(fila)}
        </section>
      )}
    </div>
  );
}
