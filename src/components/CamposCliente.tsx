import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Map as MapIcon, MapPin, Anchor, Factory } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { registrarCambio } from '@/lib/historial';
import { FORM_CAMPO_VACIO, formDeCampo, superficieTotal, validarCampo, type FormCampo } from '@/lib/campos';
import { formatUSD } from '@/lib/format';
import type { Campo, Cliente } from '@/types';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none';

function num(v: number | null, dec = 0): string {
  return v === null || v === undefined ? '—' : formatUSD(v, v % 1 === 0 ? 0 : dec);
}

/** Campos del cliente: nombre, superficie, localidad, km a puerto, planta asignada y km a planta. */
export default function CamposCliente({ cliente, onCambio }: { cliente: Cliente; onCambio?: () => void }) {
  const data = useData();
  const toast = useToast();
  const [campos, setCampos] = useState<Campo[]>([]);
  const [plantas, setPlantas] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Campo | 'nuevo' | null>(null);
  const [form, setForm] = useState<FormCampo>(FORM_CAMPO_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<Campo | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [cs, ps] = await Promise.all([data.fetchCampos(cliente.id), data.fetchPlantas()]);
      setCampos(cs); setPlantas(ps);
    } catch (e) { toast.error(e); } finally { setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  function abrir(c: Campo | 'nuevo') {
    setEditando(c);
    setForm(c === 'nuevo' ? FORM_CAMPO_VACIO : formDeCampo(c));
    setError(null);
  }

  async function guardar() {
    const v = validarCampo(form);
    if (!v.ok) { setError(v.error); return; }
    setGuardando(true);
    try {
      const esNuevo = editando === 'nuevo';
      await data.guardarCampo({ ...v.datos, cliente_id: cliente.id, id: esNuevo ? undefined : (editando as Campo).id });
      await registrarCambio({
        tipo: 'cliente', entidad: `Cliente ${cliente.nombre}`, campo: 'campo',
        valor_anterior: esNuevo ? null : (editando as Campo).nombre, valor_nuevo: v.datos.nombre,
        detalle: esNuevo ? 'Campo agregado' : 'Campo modificado',
      });
      setEditando(null);
      toast.exito(esNuevo ? 'Campo agregado' : 'Campo guardado');
      await cargar();
      onCambio?.();
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  async function borrar() {
    if (!aBorrar) return;
    setGuardando(true);
    try {
      await data.eliminarCampo(aBorrar.id);
      await registrarCambio({ tipo: 'cliente', entidad: `Cliente ${cliente.nombre}`, campo: 'campo', valor_anterior: aBorrar.nombre, valor_nuevo: null, detalle: 'Campo eliminado' });
      setABorrar(null);
      toast.exito('Campo eliminado');
      await cargar();
      onCambio?.();
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  const total = superficieTotal(campos);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><MapIcon className="w-5 h-5 text-gray-400" /> Campos</h3>
          {campos.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">{campos.length} {campos.length === 1 ? 'campo' : 'campos'}{total > 0 && ` · ${formatUSD(total, 0)} ha en total`}</p>
          )}
        </div>
        <button onClick={() => abrir('nuevo')} className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Agregar campo
        </button>
      </div>

      {cargando ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-emerald-600 animate-spin" /></div>
      ) : campos.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">Todavía no hay campos cargados para este cliente.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {campos.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{c.nombre}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.localidad || 'Sin localidad'}</p>
                </div>
                <div className="flex gap-0.5 flex-shrink-0">
                  <button onClick={() => abrir(c)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded" aria-label={`Editar ${c.nombre}`}><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setABorrar(c)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" aria-label={`Eliminar ${c.nombre}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-gray-400">Superficie</dt><dd className="font-medium text-gray-800">{num(c.superficie_ha, 1)} <span className="text-xs text-gray-400">ha</span></dd></div>
                <div><dt className="text-xs text-gray-400 flex items-center gap-1"><Anchor className="w-3 h-3" /> A puerto</dt><dd className="font-medium text-gray-800">{num(c.km_puerto)} <span className="text-xs text-gray-400">km</span></dd></div>
                <div><dt className="text-xs text-gray-400 flex items-center gap-1"><Factory className="w-3 h-3" /> A planta</dt><dd className="font-medium text-gray-800">{num(c.km_planta)} <span className="text-xs text-gray-400">km</span></dd></div>
              </dl>
              <p className="mt-1.5 text-xs text-gray-500">Planta asignada: <span className="text-gray-700 font-medium">{c.planta || '—'}</span></p>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={guardando ? undefined : () => setEditando(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-1">{editando === 'nuevo' ? 'Nuevo campo' : 'Editar campo'}</h3>
            <p className="text-sm text-gray-500 mb-4">{cliente.nombre}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="campo-nombre" className="block text-sm font-medium text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                <input id="campo-nombre" autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={inputCls} placeholder="Ej.: La Esperanza" />
              </div>
              <div>
                <label htmlFor="campo-sup" className="block text-sm font-medium text-gray-700 mb-1">Superficie (ha)</label>
                <input id="campo-sup" inputMode="decimal" value={form.superficie} onChange={(e) => setForm({ ...form, superficie: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="campo-loc" className="block text-sm font-medium text-gray-700 mb-1">Localidad</label>
                <input id="campo-loc" value={form.localidad} onChange={(e) => setForm({ ...form, localidad: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="campo-planta" className="block text-sm font-medium text-gray-700 mb-1">Planta asignada</label>
                <input id="campo-planta" list="plantas-campos" value={form.planta} onChange={(e) => setForm({ ...form, planta: e.target.value })} className={inputCls} />
                <datalist id="plantas-campos">{plantas.map((p) => <option key={p} value={p} />)}</datalist>
              </div>
              <div>
                <label htmlFor="campo-kmplanta" className="block text-sm font-medium text-gray-700 mb-1">Km a planta asignada</label>
                <input id="campo-kmplanta" inputMode="decimal" value={form.kmPlanta} onChange={(e) => setForm({ ...form, kmPlanta: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="campo-kmpuerto" className="block text-sm font-medium text-gray-700 mb-1">Km a puerto</label>
                <input id="campo-kmpuerto" inputMode="decimal" value={form.kmPuerto} onChange={(e) => setForm({ ...form, kmPuerto: e.target.value })} className={inputCls} />
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setEditando(null)} disabled={guardando} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => void guardar()} disabled={guardando} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 flex items-center gap-2">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {aBorrar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={guardando ? undefined : () => setABorrar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-2">Eliminar campo</h3>
            <p className="text-sm text-gray-600">¿Eliminar <strong>{aBorrar.nombre}</strong> de {cliente.nombre}?</p>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setABorrar(null)} disabled={guardando} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => void borrar()} disabled={guardando} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center gap-2">
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
