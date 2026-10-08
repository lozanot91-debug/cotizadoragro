import { useCallback, useEffect, useState } from 'react';
import { Loader2, Wheat, FileText } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { HistorialCanjes } from '@/screens/CalculadoraCanje';
import { netoGuardado } from '@/lib/canje';
import { nombreCotizacion } from '@/lib/nombreCotizacion';
import { formatDate, formatUSD } from '@/lib/format';
import type { CanjeGuardado, Cliente, Cotizacion } from '@/types';

/** Ficha del cliente: cálculos de canje guardados y cotizaciones con canje. */
export default function CanjesCliente({ cliente, onCalcular, onEditCotiz }: { cliente: Cliente; onCalcular?: () => void; onEditCotiz?: (id: string) => void }) {
  const data = useData();
  const toast = useToast();
  const { usuario } = useAuth();
  const [canjes, setCanjes] = useState<CanjeGuardado[]>([]);
  const [cotiz, setCotiz] = useState<Cotizacion[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [cs, cots] = await Promise.all([data.fetchCanjes({ clienteId: cliente.id }), data.fetchCotizacionesConCanje(cliente.id)]);
      setCanjes(cs); setCotiz(cots);
    } catch (e) { toast.error(e); } finally { setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function borrar(h: CanjeGuardado) {
    if (!window.confirm('¿Borrar este cálculo del historial?')) return;
    try { await data.eliminarCanje(h.id); setCanjes((x) => x.filter((y) => y.id !== h.id)); } catch (e) { toast.error(e); }
  }

  if (cargando) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-gray-500">{canjes.length ? `${canjes.length} ${canjes.length === 1 ? 'cálculo guardado' : 'cálculos guardados'}` : 'Sin cálculos guardados.'}</p>
        {onCalcular && <button onClick={onCalcular} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-1.5"><Wheat className="w-4 h-4" /> Calcular canje</button>}
      </div>
      {canjes.length > 0 && (
        <HistorialCanjes canjes={canjes} onEditCotiz={onEditCotiz} onBorrar={(h) => void borrar(h)} puedeBorrar={(h) => usuario.rol === 'admin' || h.autor_id === usuario.id} />
      )}
      {cotiz.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Cotizaciones con canje</h4>
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {cotiz.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-gray-800">{nombreCotizacion(c)}</span>
                  <span className="text-gray-500"> · {formatDate(c.fecha)} · {c.estado} · {c.canje_cultivo || 'grano'} a USD {formatUSD(c.canje_precio_usd)}/tn{c.canje_params ? ` (neto ${formatUSD(netoGuardado(c.canje_precio_usd, c.canje_params))})` : ''}</span>
                </span>
                {onEditCotiz && <button onClick={() => onEditCotiz(c.id)} className="p-1.5 text-gray-400 hover:text-emerald-700" aria-label="Abrir cotización"><FileText className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
