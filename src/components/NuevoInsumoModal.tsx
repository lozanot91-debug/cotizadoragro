import { useState } from 'react';
import { Loader2, Truck, X } from 'lucide-react';
import { esFertilizante } from '@/lib/calculations';
import type { ProductoConCosto } from '@/types';

interface Props {
  familias: string[];
  unidades: string[];
  guardando: boolean;
  onGuardar: (d: { producto: string; proveedor: string; familia: string; unid: string }) => void;
  onCerrar: () => void;
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none';

/** Alta de un insumo que no viene en la lista de precios. Queda sin costo: se escribe en cada cotización. */
export default function NuevoInsumoModal({ familias, unidades, guardando, onGuardar, onCerrar }: Props) {
  const [producto, setProducto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [familia, setFamilia] = useState('');
  const [unid, setUnid] = useState(unidades.includes('KGRS') ? 'KGRS' : unidades[0] ?? '');

  const lleva = esFertilizante({ unid, proveedor, familia } as ProductoConCosto);
  const puede = producto.trim().length > 0 && unid.trim().length > 0 && !guardando;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Nuevo insumo">
      <form onSubmit={(e) => { e.preventDefault(); if (puede) onGuardar({ producto: producto.trim(), proveedor: proveedor.trim(), familia: familia.trim(), unid: unid.trim() }); }}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Nuevo insumo</h3>
            <p className="text-xs text-gray-500">Se guarda sin costo: el costo lo escribís en cada cotización. Las listas nuevas no lo tocan.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <label className="block text-sm text-gray-600">Nombre *
          <input value={producto} onChange={(e) => setProducto(e.target.value)} autoFocus className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-gray-600">Familia
            <input list="familias-insumo" value={familia} onChange={(e) => setFamilia(e.target.value)} placeholder="Ej: FERTILIZANTES" className={inputCls} />
            <datalist id="familias-insumo">{familias.map((f) => <option key={f} value={f} />)}</datalist>
          </label>
          <label className="block text-sm text-gray-600">Unidad *
            <select value={unid} onChange={(e) => setUnid(e.target.value)} className={inputCls + ' bg-white'}>
              {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm text-gray-600">Proveedor
          <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className={inputCls} />
        </label>
        <p className={`text-xs flex items-center gap-1.5 ${lleva ? 'text-emerald-700' : 'text-gray-400'}`}>
          <Truck className="w-3.5 h-3.5" />
          {lleva ? 'Es fertilizante: en la cotización lleva flete.' : 'No lleva flete. Para que lo lleve, elegí una familia de fertilizantes y la unidad KGRS.'}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button type="submit" disabled={!puede} className="px-4 py-2 text-sm font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Crear insumo
          </button>
        </div>
      </form>
    </div>
  );
}
