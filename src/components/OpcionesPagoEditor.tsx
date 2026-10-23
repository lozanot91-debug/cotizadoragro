import type { OpcionPago } from '@/types';
import { MAX_OPCIONES, ID_PRINCIPAL, type calcularOpcion } from '@/lib/opcionesPago';
import { nombreOpcionPorDefecto, nuevoIdOpcion, type OpcionEditable } from '@/lib/opcionesEditor';
import { diasDesdeVencimiento, vencimientoDesdeDias } from '@/lib/fechas';
import { textoMesesTasa, esContado } from '@/lib/calculations';
import { formatUSD, formatInputNumber, parseNumberInput } from '@/lib/format';

export interface LineaOpcion { key: string; producto: string; cantidad: number; unidad: string }

interface Props {
  lineas: LineaOpcion[];
  fecha: string;
  conIva: boolean;
  /** Principal: la de las líneas actuales (o la foto guardada si el cliente ya eligió). */
  principal: OpcionPago;
  opciones: OpcionEditable[];
  onChange: (o: OpcionEditable[]) => void;
  tasaPorDefecto: string;
  calcular: (op: OpcionPago) => ReturnType<typeof calcularOpcion>;
  readOnly: boolean;
  /** Id de la opción que eligió el cliente (null = todavía no). */
  elegidaId: string | null;
  onVolver?: () => void;
  onElegir?: (op: OpcionPago) => void;
}

const inputCls = 'px-2 py-1.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50';
const btnCls = 'px-2.5 py-1 rounded-lg text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60';

export default function OpcionesPagoEditor({
  lineas, fecha, conIva, principal, opciones, onChange, tasaPorDefecto, calcular, readOnly, elegidaId, onVolver, onElegir,
}: Props) {
  const tasaOf = (o: OpcionEditable) => parseNumberInput(o.tasa);
  const aOpcionPago = (o: OpcionEditable): OpcionPago => ({
    id: o.id, nombre: o.nombre.trim() || '(sin nombre)', tasa_mensual: tasaOf(o), plazos: lineas.map((l) => o.plazoPorKey[l.key] ?? 0),
  });
  const todas: OpcionPago[] = [principal, ...opciones.map(aOpcionPago)];
  const elegida = elegidaId ? todas.find((o) => o.id === elegidaId) : null;

  const cambiar = (id: string, patch: Partial<OpcionEditable>) => onChange(opciones.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const todosA = (o: OpcionEditable, dias: number) => cambiar(o.id, { plazoPorKey: Object.fromEntries(lineas.map((l) => [l.key, dias])) });
  const agregar = () => onChange([...opciones, {
    id: nuevoIdOpcion([ID_PRINCIPAL, ...opciones.map((o) => o.id)]),
    nombre: nombreOpcionPorDefecto([principal.nombre, ...opciones.map((o) => o.nombre)]),
    tasa: tasaPorDefecto,
    plazoPorKey: Object.fromEntries(lineas.map((l) => [l.key, 0])),
  }]);
  const copiarDelPrincipal = (o: OpcionEditable) => cambiar(o.id, {
    tasa: formatInputNumber(principal.tasa_mensual, 2),
    plazoPorKey: Object.fromEntries(lineas.map((l, i) => [l.key, principal.plazos[i] ?? 0])),
  });
  const quitar = (o: OpcionEditable) => {
    if (!window.confirm(`¿Quitar "${o.nombre || 'esta opción'}"?`)) return;
    onChange(opciones.filter((x) => x.id !== o.id));
  };

  if (lineas.length === 0 && opciones.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Opciones de pago</h3>

      {elegida && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-emerald-800">El cliente eligió: <strong>{elegida.nombre}</strong>. La cotización ya está con esa forma de pago.</p>
          {onVolver && <button type="button" onClick={onVolver} className="px-3 py-1.5 bg-white border border-emerald-400 text-emerald-800 rounded-lg text-sm hover:bg-emerald-100">Volver a las opciones</button>}
        </div>
      )}

      {opciones.length === 0 ? (
        !readOnly && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Cargá otra forma de pago para los mismos artículos. Mientras el cliente no elija, la cotización se muestra de contado.</p>
            <button type="button" onClick={agregar} disabled={lineas.length === 0} className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50">+ Agregar opción de pago</button>
          </div>
        )
      ) : (
        <>
          <p className="text-xs text-gray-500">Cargá otra forma de pago para los mismos artículos. Mientras el cliente no elija, la cotización se muestra de contado.</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700" aria-label="Comparación de totales">
            {todas.map((o, i) => (
              <span key={o.id} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-300">·</span>}
                <span>{o.id === ID_PRINCIPAL ? 'Principal' : o.nombre} <strong>USD {formatUSD(calcular(o).totales.total)}</strong></span>
                {o.id === elegidaId && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Elegida</span>}
                {onElegir && <button type="button" onClick={() => onElegir(o)} className={btnCls}>El cliente eligió esta</button>}
              </span>
            ))}
          </div>

          {opciones.map((o) => {
            const op = aOpcionPago(o);
            const c = calcular(op);
            const plazosIguales = lineas.length > 0 && op.plazos.every((p) => p === op.plazos[0]);
            return (
              <div key={o.id} className="border border-gray-200 rounded-lg p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="text" value={o.nombre} disabled={readOnly} aria-label="Nombre de la opción" onChange={(e) => cambiar(o.id, { nombre: e.target.value })} className={`w-40 ${inputCls}`} />
                  <label className="text-sm text-gray-600" htmlFor={`tasa-${o.id}`}>Tasa mensual</label>
                  <input id={`tasa-${o.id}`} type="text" inputMode="decimal" value={o.tasa} disabled={readOnly} onChange={(e) => cambiar(o.id, { tasa: e.target.value })} placeholder="0" className={`w-20 text-right ${inputCls}`} />
                  <span className="text-xs text-gray-400">%</span>
                </div>
                {!readOnly && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => todosA(o, 0)} className={btnCls}>Todo contado</button>
                    <label className="flex items-center gap-1 text-xs text-gray-600">Todo a la fecha…
                      <input type="date" min={fecha} aria-label="Fecha de vencimiento (todos los artículos)"
                        value={plazosIguales ? vencimientoDesdeDias(fecha, op.plazos[0]) : ''}
                        onChange={(e) => todosA(o, diasDesdeVencimiento(fecha, e.target.value))}
                        className={`${inputCls} py-1`} />
                    </label>
                    <button type="button" onClick={() => copiarDelPrincipal(o)} className={btnCls}>Copiar del principal</button>
                    <button type="button" onClick={() => quitar(o)} className={`${btnCls} text-red-600 border-red-200 hover:bg-red-50`}>Quitar opción</button>
                    {onElegir && <button type="button" onClick={() => onElegir(op)} className={btnCls}>El cliente eligió esta</button>}
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Producto</th>
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Cant.</th>
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Vencimiento</th>
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Precio USD</th>
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap">Total USD</th>
                    </tr></thead>
                    <tbody>
                      {lineas.map((l, i) => {
                        const dias = op.plazos[i] ?? 0;
                        const r = c.lineas[i];
                        return (
                          <tr key={l.key} className="border-b border-gray-100">
                            <td className="px-3 py-2 font-medium text-gray-800">{l.producto}</td>
                            <td className="px-2 py-2 text-right whitespace-nowrap">{formatInputNumber(l.cantidad, 2) || '0'} <span className="text-xs text-gray-400">{l.unidad}</span></td>
                            <td className="px-2 py-2 text-right">
                              <input type="date" min={fecha} value={vencimientoDesdeDias(fecha, dias)} disabled={readOnly} aria-label={`Vencimiento de ${l.producto} en ${o.nombre}`}
                                onChange={(e) => cambiar(o.id, { plazoPorKey: { ...o.plazoPorKey, [l.key]: diasDesdeVencimiento(fecha, e.target.value) } })}
                                className={`w-36 px-2 py-1 border rounded text-sm focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-50 ${dias > 0 ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300'}`} />
                              <span className="block text-xs text-gray-400">{dias === 0 ? 'contado' : `(${dias} días${op.tasa_mensual > 0 || esContado(dias) ? ` · ${textoMesesTasa(dias)}` : ''})`}</span>
                            </td>
                            <td className="px-2 py-2 text-right whitespace-nowrap">{r ? formatUSD(r.precioUnit) : '-'}<span className="text-xs text-gray-400"> /{l.unidad}</span></td>
                            <td className="px-2 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">{r ? formatUSD(r.total) : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-1 text-sm text-gray-600 sm:max-w-xs sm:ml-auto">
                  <div className="flex justify-between"><span>{c.totales.recargo > 0 ? 'Subtotal contado' : 'Subtotal'}</span><span>{formatUSD(c.totales.subtotal)}</span></div>
                  {c.totales.recargo > 0 && <div className="flex justify-between"><span>Financiación</span><span>{formatUSD(c.totales.recargo)}</span></div>}
                  {conIva && <div className="flex justify-between"><span>IVA</span><span>{formatUSD(c.totales.iva)}</span></div>}
                  <div className="flex justify-between font-semibold text-gray-800 pt-1 border-t border-gray-200"><span>TOTAL USD</span><span>{formatUSD(c.totales.total)}</span></div>
                </div>
              </div>
            );
          })}

          {!readOnly && opciones.length < MAX_OPCIONES - 1 && (
            <button type="button" onClick={agregar} className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ Agregar opción de pago</button>
          )}
        </>
      )}
    </div>
  );
}
