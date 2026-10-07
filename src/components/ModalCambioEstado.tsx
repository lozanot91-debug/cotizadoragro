import { useState } from 'react';
import { Check, Loader2, TrendingDown, TrendingUp, Unlock } from 'lucide-react';
import type { Cotizacion, CotizacionLinea, EstadoCotizacion } from '@/types';
import { formatUSD, formatInputNumber } from '@/lib/format';
import { MOTIVOS_PERDIDA, esReapertura, motivoFinal } from '@/lib/estados';

export interface DatosConfirmacion {
  motivo: string;
  comentario: string;
  cantidadesReales: Record<string, { cantidad: string; precio: string }>;
}

interface Props {
  cotiz: Cotizacion;
  hacia: EstadoCotizacion;
  /** Líneas de la cotización (solo se usan al pasar a Ganada). */
  lineas: CotizacionLinea[];
  guardando: boolean;
  onCancelar: () => void;
  onConfirmar: (datos: DatosConfirmacion) => void;
}

/** Modal único de confirmación de cambio de estado. Lo usan Cotizaciones y Pipeline. */
export function ModalCambioEstado({ cotiz, hacia, lineas, guardando, onCancelar, onConfirmar }: Props) {
  const [motivo, setMotivo] = useState('');
  const [otroMotivo, setOtroMotivo] = useState('');
  const [comentario, setComentario] = useState('');
  const [reales, setReales] = useState<Record<string, { cantidad: string; precio: string }>>(() => {
    const inicial: Record<string, { cantidad: string; precio: string }> = {};
    lineas.forEach((l) => {
      inicial[l.id] = { cantidad: formatInputNumber(l.cantidad, 2), precio: formatInputNumber(l.precio_usd, 2) };
    });
    return inicial;
  });

  const reabre = esReapertura(cotiz.estado, hacia);
  const falta =
    (hacia === 'Perdida' && !motivoFinal(motivo, otroMotivo)) ||
    (reabre && !comentario.trim());

  const color = hacia === 'Perdida' ? 'bg-red-100' : hacia === 'Ganada' ? 'bg-emerald-100' : hacia === 'En negociación' ? 'bg-amber-100' : 'bg-blue-100';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={guardando ? undefined : onCancelar}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
            {hacia === 'Perdida' ? <TrendingDown className="w-5 h-5 text-red-600" /> :
             hacia === 'Ganada' ? <TrendingUp className="w-5 h-5 text-emerald-600" /> :
             hacia === 'En negociación' ? <Unlock className="w-5 h-5 text-amber-600" /> :
             <Check className="w-5 h-5 text-blue-600" />}
          </div>
          <div>
            <h3 className="font-bold text-gray-800">{reabre ? 'Reabrir cotización' : `Cambiar a ${hacia}`}</h3>
            <p className="text-sm text-gray-500">
              Cotización N° {cotiz.numero} · {cotiz.cliente_nombre || 'Sin cliente'} · {formatUSD(cotiz.subtotal_usd)} USD
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          ¿Cambiar la cotización N° {cotiz.numero} de <strong>{cotiz.estado}</strong> a <strong>{hacia}</strong>?
        </p>

        {hacia === 'Perdida' && (
          <>
            <label htmlFor="estado-motivo" className="block text-sm font-medium text-gray-700 mb-2">Motivo <span className="text-red-500">*</span></label>
            <select id="estado-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none mb-3 bg-white">
              <option value="">Seleccionar motivo...</option>
              {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {motivo === 'Otro' && (
              <input type="text" value={otroMotivo} onChange={(e) => setOtroMotivo(e.target.value)}
                placeholder="Escribí el motivo..." aria-label="Otro motivo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none mb-3" />
            )}
          </>
        )}

        {reabre && (
          <>
            {cotiz.estado === 'Perdida' && cotiz.motivo_perdida && (
              <p className="text-xs text-gray-500 mb-2">Motivo de pérdida anterior: {cotiz.motivo_perdida} (queda guardado en el historial).</p>
            )}
            <label htmlFor="estado-comentario" className="block text-sm font-medium text-gray-700 mb-2">Comentario <span className="text-red-500">*</span></label>
            <textarea id="estado-comentario" value={comentario} onChange={(e) => setComentario(e.target.value)}
              rows={3} placeholder="¿Por qué se reabre?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none mb-3 resize-none" />
          </>
        )}

        {hacia === 'Ganada' && lineas.length > 0 && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cantidades y precios reales (opcional)</label>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {lineas.map((l) => (
                <div key={l.id} className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400 flex-1 truncate">{l.producto}</span>
                  <input type="text" value={reales[l.id]?.cantidad || ''} aria-label={`Cantidad real de ${l.producto}`}
                    onChange={(e) => setReales({ ...reales, [l.id]: { ...reales[l.id], cantidad: e.target.value } })}
                    placeholder="Cant." className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                  <input type="text" value={reales[l.id]?.precio || ''} aria-label={`Precio real de ${l.producto}`}
                    onChange={(e) => setReales({ ...reales, [l.id]: { ...reales[l.id], precio: e.target.value } })}
                    placeholder="Precio" className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onCancelar} disabled={guardando} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm disabled:opacity-50">Cancelar</button>
          <button
            onClick={() => onConfirmar({ motivo: motivoFinal(motivo, otroMotivo), comentario: comentario.trim(), cantidadesReales: reales })}
            disabled={falta || guardando}
            className={`px-4 py-2 text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2 ${hacia === 'Perdida' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

interface PropsSeguimiento {
  numero: number;
  dias: number;
  crear: boolean;
  guardando: boolean;
  onCambiar: (v: { crear: boolean; dias: number }) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}

/** Modal que se ofrece después de pasar una cotización a Enviada. */
export function ModalSeguimiento({ numero, dias, crear, guardando, onCambiar, onCancelar, onConfirmar }: PropsSeguimiento) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={guardando ? undefined : onCancelar}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Check className="w-5 h-5 text-blue-600" /></div>
          <div>
            <h3 className="font-bold text-gray-800">¿Agendar seguimiento?</h3>
            <p className="text-sm text-gray-500">Cotización N° {numero} enviada</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" checked={crear} onChange={(e) => onCambiar({ crear: e.target.checked, dias })} className="w-4 h-4 accent-emerald-600" />
          Crear tarea de seguimiento
        </label>
        {crear && (
          <div className="flex gap-2 items-center mb-3 flex-wrap">
            <span className="text-sm text-gray-600">En</span>
            <input type="number" min={1} value={dias} aria-label="Días hasta el seguimiento"
              onChange={(e) => onCambiar({ crear, dias: parseInt(e.target.value) || 3 })}
              className="w-16 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center" />
            <span className="text-sm text-gray-600">días</span>
            {[1, 3, 7].map((d) => (
              <button key={d} onClick={() => onCambiar({ crear, dias: d })} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">+{d}d</button>
            ))}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onCancelar} disabled={guardando} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm disabled:opacity-50">Ahora no</button>
          <button onClick={onConfirmar} disabled={guardando} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
