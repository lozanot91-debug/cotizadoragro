import { useCallback, useEffect, useState } from 'react';
import { Factory, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { registrarCambio } from '@/lib/historial';
import { formatUSD } from '@/lib/format';
import { validarPlanta } from '@/lib/fleteTramos';
import type { Planta } from '@/types';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none';

/** Plantas con su distancia a puerto: con eso se precarga el tramo largo del flete. */
export default function PlantasFlete({ esAdmin }: { esAdmin: boolean }) {
  const data = useData();
  const toast = useToast();
  const [plantas, setPlantas] = useState<Planta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<{ id?: string; nombre: string; km: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aBorrar, setABorrar] = useState<Planta | null>(null);

  const cargar = useCallback(async () => {
    try { setPlantas(await data.fetchPlantasFlete()); } catch (e) { toast.error(e); } finally { setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar() {
    if (!form) return;
    const v = validarPlanta(form.nombre, form.km, plantas, form.id);
    if (!v.ok) { setError(v.error); return; }
    setOcupado(true);
    try {
      const anterior = plantas.find((p) => p.id === form.id);
      await data.guardarPlanta({ id: form.id, nombre: v.nombre, km_puerto: v.km_puerto });
      await registrarCambio({
        tipo: 'lista', entidad: `Planta ${v.nombre}`, campo: 'km a puerto',
        valor_anterior: anterior ? (anterior.km_puerto === null ? 'Sin dato' : `${anterior.km_puerto} km`) : null,
        valor_nuevo: v.km_puerto === null ? 'Sin dato' : `${v.km_puerto} km`,
        detalle: anterior ? 'Planta modificada' : 'Planta creada',
      });
      toast.exito(anterior ? 'Planta guardada' : 'Planta creada');
      setForm(null);
      await cargar();
    } catch (e) { toast.error(e); } finally { setOcupado(false); }
  }

  async function borrar() {
    if (!aBorrar) return;
    setOcupado(true);
    try {
      await data.eliminarPlanta(aBorrar.id);
      await registrarCambio({ tipo: 'lista', entidad: `Planta ${aBorrar.nombre}`, campo: 'planta', valor_anterior: aBorrar.nombre, valor_nuevo: null, detalle: 'Planta eliminada' });
      toast.exito('Planta eliminada');
      setABorrar(null);
      await cargar();
    } catch (e) { toast.error(e); } finally { setOcupado(false); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center"><Factory className="w-5 h-5 text-amber-700" /></div>
          <div>
            <h3 className="font-semibold text-gray-800">Plantas</h3>
            <p className="text-xs text-gray-500">Distancia de cada planta a puerto: se usa para precargar el tramo largo.</p>
          </div>
        </div>
        {esAdmin && (
          <button onClick={() => { setForm({ nombre: '', km: '' }); setError(null); }}
            className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Nueva planta
          </button>
        )}
      </div>

      {cargando ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-emerald-600 animate-spin" /></div>
      ) : plantas.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">Todavía no hay plantas cargadas.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {plantas.map((p) => (
            <li key={p.id} className="py-2.5 flex items-center gap-3">
              <p className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">{p.nombre}</p>
              <p className={`text-sm ${p.km_puerto === null ? 'text-amber-700' : 'text-gray-700'}`}>
                {p.km_puerto === null ? 'Sin km a puerto' : <><span className="font-semibold">{formatUSD(p.km_puerto, p.km_puerto % 1 ? 1 : 0)}</span> km a puerto</>}
              </p>
              {esAdmin && (
                <div className="flex gap-0.5">
                  <button onClick={() => { setForm({ id: p.id, nombre: p.nombre, km: p.km_puerto === null ? '' : String(p.km_puerto).replace('.', ',') }); setError(null); }}
                    aria-label={`Editar planta ${p.nombre}`} className="p-1.5 text-gray-400 hover:text-gray-700 rounded"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setABorrar(p)} aria-label={`Eliminar planta ${p.nombre}`} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-3">La planta de cada campo se elige en la ficha del cliente, pestaña Campos.</p>

      {form && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={ocupado ? undefined : () => setForm(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-4">{form.id ? 'Editar planta' : 'Nueva planta'}</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="planta-nombre" className="block text-sm font-medium text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                <input id="planta-nombre" autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={inputCls} placeholder="Ej.: Tandil" />
              </div>
              <div>
                <label htmlFor="planta-km" className="block text-sm font-medium text-gray-700 mb-1">Km a puerto</label>
                <input id="planta-km" inputMode="decimal" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} className={inputCls} />
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setForm(null)} disabled={ocupado} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => void guardar()} disabled={ocupado} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 flex items-center gap-2">
                {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {aBorrar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={ocupado ? undefined : () => setABorrar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-2">Eliminar planta</h3>
            <p className="text-sm text-gray-600">¿Eliminar <strong>{aBorrar.nombre}</strong>? Los campos que la tienen asignada la conservan como texto, pero ya no se precarga el km a puerto.</p>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setABorrar(null)} disabled={ocupado} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => void borrar()} disabled={ocupado} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center gap-2">
                {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
