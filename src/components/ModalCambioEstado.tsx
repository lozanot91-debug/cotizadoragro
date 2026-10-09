import { useState } from 'react';
import { Check, Loader2, TrendingDown, TrendingUp, Unlock, XCircle } from 'lucide-react';
import type { Cotizacion, CotizacionLinea, EstadoCotizacion } from '@/types';
import { formatUSD, formatInputNumber, parseNumberInput } from '@/lib/format';
import { subtotalGanado, validarGanada, type Reales } from '@/lib/ganadaParcial';
import { MOTIVOS_PERDIDA, esReapertura, motivoFinal } from '@/lib/estados';
import { nombreCotizacion } from '@/lib/nombreCotizacion';
import { MOTIVOS_CON_COMPETENCIA, precioNuestro } from '@/lib/competencia';

export interface DatosConfirmacion {
  motivo: string;
  comentario: string;
  /** Por línea: cantidad y precio reales (texto del formulario) y motivo de lo que no se ganó. */
  cantidadesReales: Record<string, { cantidad: string; precio: string; motivo: string }>;
  /** Precio de la competencia (opcional), cuando se pierde por precio o competencia */
  competencia: { competidor: string; precios: Record<string, string> };
}

interface FilaReal { cantidad: string; precio: string; motivo: string; otro: string }

/** Lo que cargó el usuario, en números, para calcular y validar mientras escribe. */
function aReales(lineas: CotizacionLinea[], filas: Record<string, FilaReal>): Reales {
  const r: Reales = {};
  for (const l of lineas) {
    const f = filas[l.id];
    if (!f) continue;
    r[l.id] = {
      cantidad: f.cantidad.trim() === '' ? l.cantidad : parseNumberInput(f.cantidad),
      precio: f.precio.trim() === '' ? l.precio_usd : parseNumberInput(f.precio),
      motivo: motivoFinal(f.motivo, f.otro) || null,
    };
  }
  return r;
}

interface Props {
  cotiz: Cotizacion;
  hacia: EstadoCotizacion;
  /** Líneas de la cotización (se usan al pasar a Ganada o Perdida). */
  lineas: CotizacionLinea[];
  guardando: boolean;
  onCancelar: () => void;
  onConfirmar: (datos: DatosConfirmacion) => void;
  /** Competidores ya cargados, para sugerir el nombre */
  competidores?: string[];
}

/** Modal único de confirmación de cambio de estado. Lo usan Cotizaciones y Pipeline. */
export function ModalCambioEstado({ cotiz, hacia, lineas, guardando, onCancelar, onConfirmar, competidores = [] }: Props) {
  const [motivo, setMotivo] = useState('');
  const [otroMotivo, setOtroMotivo] = useState('');
  const [comentario, setComentario] = useState('');
  const [reales, setReales] = useState<Record<string, FilaReal>>(() => {
    const inicial: Record<string, FilaReal> = {};
    lineas.forEach((l) => {
      inicial[l.id] = { cantidad: formatInputNumber(l.cantidad, 2), precio: formatInputNumber(l.precio_usd, 2), motivo: '', otro: '' };
    });
    return inicial;
  });
  const [competidor, setCompetidor] = useState('');
  const [preciosComp, setPreciosComp] = useState<Record<string, string>>({});
  const cambiarFila = (id: string, cambios: Partial<FilaReal>) => setReales((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));

  const esGanada = hacia === 'Ganada' && lineas.length > 0;
  const realesNum = esGanada ? aReales(lineas, reales) : {};
  const errorGanada = esGanada ? validarGanada(lineas, realesNum) : null;
  const totalCotizado = lineas.reduce((s, l) => s + (l.total_usd || 0), 0);
  const totalGanado = esGanada ? subtotalGanado(lineas, realesNum) : 0;
  const pctGanado = totalCotizado > 0 ? (totalGanado / totalCotizado) * 100 : 0;
  const parcial = esGanada && totalGanado < totalCotizado - 0.01;

  // Competencia: al perder por precio/competencia (todas las líneas) o en las líneas no ganadas por ese motivo
  const lineasComp = hacia === 'Perdida'
    ? (MOTIVOS_CON_COMPETENCIA.includes(motivo) ? lineas : [])
    : esGanada ? lineas.filter((l) => {
      const r = realesNum[l.id];
      return r && r.cantidad < l.cantidad - 0.005 && MOTIVOS_CON_COMPETENCIA.includes(reales[l.id]?.motivo || '');
    }) : [];

  const reabre = esReapertura(cotiz.estado, hacia);
  const falta =
    (hacia === 'Perdida' && !motivoFinal(motivo, otroMotivo)) ||
    (reabre && !comentario.trim()) ||
    !!errorGanada;

  const color = hacia === 'Perdida' ? 'bg-red-100' : hacia === 'Ganada' ? 'bg-emerald-100' : hacia === 'En negociación' ? 'bg-amber-100' : 'bg-blue-100';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={guardando ? undefined : onCancelar}>
      <div className={`bg-white rounded-xl shadow-2xl p-6 w-full max-h-[85vh] overflow-y-auto ${esGanada ? 'max-w-2xl' : 'max-w-md'}`} onClick={(e) => e.stopPropagation()}>
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
              {nombreCotizacion(cotiz)} · {formatUSD(cotiz.subtotal_usd)} USD
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          ¿Cambiar la cotización {nombreCotizacion(cotiz)} de <strong>{cotiz.estado}</strong> a <strong>{hacia}</strong>?
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

        {esGanada && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700">¿Qué se ganó?</p>
            <p className="text-xs text-gray-500 mb-3">Si se ganó solo una parte, bajá la cantidad o marcá “No se ganó” y elegí el motivo. Los cobros y la rentabilidad se calculan sobre lo ganado.</p>
            <div className="space-y-2">
              {lineas.map((l) => {
                const f = reales[l.id];
                const r = realesNum[l.id];
                const nada = r.cantidad <= 0.005;
                const falta = r.cantidad < l.cantidad - 0.005;
                const unidad = l.es_fertilizante ? 'tn' : (l.unid || '').toLowerCase();
                return (
                  <div key={l.id} className={`rounded-lg border p-2.5 ${nada ? 'border-red-200 bg-red-50/60' : falta ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[10rem]">
                        <p className={`text-sm font-medium ${nada ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{l.producto}</p>
                        <p className="text-xs text-gray-400">Cotizado {formatUSD(l.cantidad, 2)} {unidad} · USD {formatUSD(l.precio_usd, 2)}</p>
                      </div>
                      <input type="text" inputMode="decimal" value={f.cantidad} aria-label={`Cantidad ganada de ${l.producto}`}
                        onChange={(e) => cambiarFila(l.id, { cantidad: e.target.value })}
                        placeholder="Cant." className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                      <input type="text" inputMode="decimal" value={f.precio} disabled={nada} aria-label={`Precio real de ${l.producto}`}
                        onChange={(e) => cambiarFila(l.id, { precio: e.target.value })}
                        placeholder="Precio" className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm disabled:bg-gray-100 disabled:text-gray-400" />
                      <button type="button"
                        onClick={() => cambiarFila(l.id, { cantidad: nada ? formatInputNumber(l.cantidad, 2) : '0' })}
                        className={`px-2 py-1 rounded text-xs font-medium border flex items-center gap-1 ${nada ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                        <XCircle className="w-3.5 h-3.5" /> No se ganó
                      </button>
                    </div>
                    {falta && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-600">
                          {nada ? 'Motivo' : `No se ganaron ${formatUSD(l.cantidad - r.cantidad, 2)} ${unidad} · motivo`} <span className="text-red-500">*</span>
                        </span>
                        <select value={f.motivo} onChange={(e) => cambiarFila(l.id, { motivo: e.target.value })} aria-label={`Motivo de ${l.producto}`}
                          className="px-2 py-1 border border-gray-300 rounded text-sm bg-white">
                          <option value="">Elegir...</option>
                          {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        {f.motivo === 'Otro' && (
                          <input type="text" value={f.otro} onChange={(e) => cambiarFila(l.id, { otro: e.target.value })}
                            placeholder="Escribí el motivo..." aria-label={`Otro motivo de ${l.producto}`}
                            className="flex-1 min-w-[8rem] px-2 py-1 border border-gray-300 rounded text-sm" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className={`mt-3 rounded-lg px-3 py-2 text-sm flex flex-wrap justify-between gap-2 ${parcial ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
              <span className="font-semibold">{parcial ? `Ganada parcial · ${formatUSD(pctGanado, 0)} %` : 'Ganada completa'}</span>
              <span>USD {formatUSD(totalGanado, 2)} de {formatUSD(totalCotizado, 2)} <span className="text-xs opacity-70">(sin IVA)</span></span>
            </div>
            {errorGanada && <p role="alert" className="text-xs text-red-600 mt-2">{errorGanada}</p>}
          </div>
        )}

        {lineasComp.length > 0 && (
          <div className="mb-4 rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="text-sm font-medium text-gray-700">¿Cuánto ofreció la competencia? <span className="font-normal text-xs text-gray-400">(opcional)</span></p>
            <input list="competidores-conocidos" value={competidor} onChange={(e) => setCompetidor(e.target.value)} maxLength={120}
              placeholder="Competidor (empresa)" aria-label="Competidor"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
            <datalist id="competidores-conocidos">{competidores.map((c) => <option key={c} value={c} />)}</datalist>
            <div className="space-y-1.5">
              {lineasComp.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-gray-700">{l.producto}<span className="text-xs text-gray-400 ml-1">nuestro USD {formatUSD(precioNuestro(l), 2)}/{l.es_fertilizante ? 'tn' : (l.unid || 'un').toLowerCase()}</span></span>
                  <input type="text" inputMode="decimal" value={preciosComp[l.id] || ''} onChange={(e) => setPreciosComp((p) => ({ ...p, [l.id]: e.target.value }))}
                    placeholder="Precio comp." aria-label={`Precio de la competencia para ${l.producto}`}
                    className="w-28 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400">Sin IVA, en la misma unidad. Queda en Análisis › Competencia.</p>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onCancelar} disabled={guardando} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm disabled:opacity-50">Cancelar</button>
          <button
            onClick={() => onConfirmar({
              motivo: motivoFinal(motivo, otroMotivo),
              comentario: comentario.trim(),
              cantidadesReales: Object.fromEntries(Object.entries(reales).map(([id, f]) => [id, { cantidad: f.cantidad, precio: f.precio, motivo: motivoFinal(f.motivo, f.otro) }])),
              competencia: { competidor, precios: Object.fromEntries(lineasComp.map((l) => [l.id, preciosComp[l.id] || ''])) },
            })}
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
  nombre: string;
  dias: number;
  crear: boolean;
  guardando: boolean;
  onCambiar: (v: { crear: boolean; dias: number }) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}

/** Modal que se ofrece después de pasar una cotización a Enviada. */
export function ModalSeguimiento({ nombre, dias, crear, guardando, onCambiar, onCancelar, onConfirmar }: PropsSeguimiento) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={guardando ? undefined : onCancelar}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Check className="w-5 h-5 text-blue-600" /></div>
          <div>
            <h3 className="font-bold text-gray-800">¿Agendar seguimiento?</h3>
            <p className="text-sm text-gray-500">{nombre} enviada</p>
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
