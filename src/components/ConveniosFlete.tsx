import { useCallback, useEffect, useRef, useState } from 'react';
import { Truck, Plus, Upload, Pencil, Trash2, Star, Loader2 } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { registrarCambio } from '@/lib/historial';
import { parsearTarifaFlete } from '@/lib/excel';
import { nombreConvenio, resumenTarifas, validarConvenio } from '@/lib/convenios';
import { formatDate } from '@/lib/format';
import { fechaDeTimestamp } from '@/lib/fechas';
import type { ConvenioFlete } from '@/types';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none';

/** Convenios de flete: cada uno es una planilla de tarifas independiente (número + descripción). */
export default function ConveniosFlete({ esAdmin }: { esAdmin: boolean }) {
  const data = useData();
  const toast = useToast();
  const [convenios, setConvenios] = useState<ConvenioFlete[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [form, setForm] = useState<{ id?: string; numero: string; descripcion: string; archivo: File | null } | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [aBorrar, setABorrar] = useState<ConvenioFlete | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const subirRef = useRef<HTMLInputElement>(null);
  const [subirA, setSubirA] = useState<ConvenioFlete | null>(null);

  const cargar = useCallback(async () => {
    try { setConvenios(await data.fetchConvenios()); } catch (e) { toast.error(e); } finally { setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  /** Lee la planilla y la carga en el convenio (solo ese convenio cambia). */
  async function subirPlanilla(c: Pick<ConvenioFlete, 'id' | 'numero' | 'descripcion'>, file: File): Promise<boolean> {
    const filas = parsearTarifaFlete(await file.arrayBuffer());
    if (filas.length === 0) { toast.aviso('No se pudieron leer tarifas del archivo. Revisá que sea la planilla de flete.'); return false; }
    const n = await data.cargarTarifaConvenio(c.id, filas);
    const r = resumenTarifas(filas);
    await registrarCambio({ tipo: 'lista', entidad: `Convenio ${nombreConvenio(c)}`, campo: 'tarifa de flete', valor_nuevo: `${n} km`, detalle: `De ${r.desde} a ${r.hasta} km · ${file.name}` });
    toast.exito(`Convenio ${c.numero}: ${n} km cargados (de ${r.desde} a ${r.hasta} km)`);
    return true;
  }

  async function guardar() {
    if (!form) return;
    const v = validarConvenio(form.numero, form.descripcion, convenios, form.id);
    if (!v.ok) { setErrorForm(v.error); return; }
    setOcupado('form');
    try {
      const anterior = convenios.find((c) => c.id === form.id);
      const c = await data.guardarConvenio({ id: form.id, numero: v.numero, descripcion: v.descripcion });
      await registrarCambio({
        tipo: 'lista', entidad: `Convenio ${nombreConvenio(c)}`, campo: 'convenio de flete',
        valor_anterior: anterior ? nombreConvenio(anterior) : null, valor_nuevo: nombreConvenio(c),
        detalle: anterior ? 'Convenio modificado' : 'Convenio creado',
      });
      if (form.archivo) await subirPlanilla(c, form.archivo);
      else toast.exito(anterior ? 'Convenio guardado' : 'Convenio creado. Subile la planilla de tarifas.');
      setForm(null);
      await cargar();
    } catch (e) { toast.error(e); } finally { setOcupado(null); }
  }

  async function alElegirArchivo(file: File) {
    if (!subirA) return;
    setOcupado(subirA.id);
    try { if (await subirPlanilla(subirA, file)) await cargar(); } catch (e) { toast.error(e); } finally { setOcupado(null); setSubirA(null); }
  }

  async function predeterminar(c: ConvenioFlete) {
    setOcupado(c.id);
    try {
      await data.predeterminarConvenio(c.id);
      await registrarCambio({ tipo: 'lista', entidad: `Convenio ${nombreConvenio(c)}`, campo: 'convenio predeterminado', valor_nuevo: String(c.numero) });
      toast.exito(`Convenio ${c.numero} es el predeterminado`);
      await cargar();
    } catch (e) { toast.error(e); } finally { setOcupado(null); }
  }

  async function borrar() {
    if (!aBorrar) return;
    setOcupado(aBorrar.id);
    try {
      await data.eliminarConvenio(aBorrar.id);
      await registrarCambio({ tipo: 'lista', entidad: `Convenio ${nombreConvenio(aBorrar)}`, campo: 'convenio de flete', valor_anterior: nombreConvenio(aBorrar), valor_nuevo: null, detalle: 'Convenio eliminado' });
      toast.exito(`Convenio ${aBorrar.numero} eliminado`);
      setABorrar(null);
      await cargar();
    } catch (e) { toast.error(e); } finally { setOcupado(null); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Truck className="w-5 h-5 text-blue-600" /></div>
          <div>
            <h3 className="font-semibold text-gray-800">Convenios de flete</h3>
            <p className="text-xs text-gray-500">Cada convenio tiene su planilla. Cargar una no toca las demás.</p>
          </div>
        </div>
        {esAdmin && (
          <button onClick={() => { setForm({ numero: '', descripcion: '', archivo: null }); setErrorForm(null); }}
            className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Nuevo convenio
          </button>
        )}
      </div>

      <input ref={subirRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void alElegirArchivo(f); e.target.value = ''; }} />

      {cargando ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-emerald-600 animate-spin" /></div>
      ) : convenios.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">Todavía no hay convenios de flete.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {convenios.map((c) => {
            const r = resumenTarifas(c.tarifas);
            return (
              <li key={c.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="w-16 text-center flex-shrink-0">
                  <p className="text-xs text-gray-400">Convenio</p>
                  <p className="cifra text-2xl text-emerald-900">{c.numero}</p>
                </div>
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm font-medium text-gray-800">
                    {c.descripcion}
                    {c.predeterminado && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium align-middle">Predeterminado</span>}
                  </p>
                  <p className={`text-xs mt-0.5 ${r.cantidad ? 'text-gray-500' : 'text-red-600'}`}>
                    {r.cantidad ? `${r.cantidad} km cargados (de ${r.desde} a ${r.hasta} km)` : 'Sin planilla cargada'}
                    {c.actualizado_at && r.cantidad > 0 && ` · actualizado ${formatDate(fechaDeTimestamp(c.actualizado_at))}`}
                  </p>
                </div>
                {esAdmin && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setSubirA(c); subirRef.current?.click(); }} disabled={!!ocupado}
                      className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1">
                      {ocupado === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} {r.cantidad ? 'Actualizar planilla' : 'Subir planilla'}
                    </button>
                    {!c.predeterminado && (
                      <button onClick={() => void predeterminar(c)} disabled={!!ocupado} title="Usar por defecto en las cotizaciones" aria-label={`Predeterminar convenio ${c.numero}`}
                        className="p-1.5 text-gray-400 hover:text-amber-600 rounded disabled:opacity-50"><Star className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => { setForm({ id: c.id, numero: String(c.numero), descripcion: c.descripcion, archivo: null }); setErrorForm(null); }} disabled={!!ocupado}
                      aria-label={`Editar convenio ${c.numero}`} className="p-1.5 text-gray-400 hover:text-gray-700 rounded disabled:opacity-50"><Pencil className="w-4 h-4" /></button>
                    {!c.predeterminado && (
                      <button onClick={() => setABorrar(c)} disabled={!!ocupado} aria-label={`Eliminar convenio ${c.numero}`}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-3">Planilla: tarifa en pesos por 100 kg por km (como la de siempre). En la cotización se elige el convenio; si no, se usa el predeterminado.</p>

      {form && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={ocupado ? undefined : () => setForm(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-4">{form.id ? 'Editar convenio' : 'Nuevo convenio de flete'}</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="conv-numero" className="block text-sm font-medium text-gray-700 mb-1">Número de convenio <span className="text-red-500">*</span></label>
                <input id="conv-numero" inputMode="numeric" autoFocus value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={inputCls} placeholder="Ej.: 625" />
              </div>
              <div>
                <label htmlFor="conv-desc" className="block text-sm font-medium text-gray-700 mb-1">Descripción <span className="text-red-500">*</span></label>
                <input id="conv-desc" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className={inputCls} placeholder="Ej.: Autodescargable entre 8 y 12 tn" />
              </div>
              {!form.id && (
                <div>
                  <p className="block text-sm font-medium text-gray-700 mb-1">Planilla de tarifas</p>
                  <input ref={archivoRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setForm({ ...form, archivo: e.target.files?.[0] ?? null })} />
                  <button type="button" onClick={() => archivoRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 text-sm text-gray-600">
                    <Upload className="w-4 h-4" /> {form.archivo ? form.archivo.name : 'Elegir archivo .xls/.xlsx (podés subirla después)'}
                  </button>
                </div>
              )}
            </div>
            {errorForm && <p role="alert" className="text-sm text-red-600 mt-3">{errorForm}</p>}
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setForm(null)} disabled={!!ocupado} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => void guardar()} disabled={!!ocupado} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 flex items-center gap-2">
                {ocupado === 'form' && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {aBorrar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={ocupado ? undefined : () => setABorrar(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-2">Eliminar convenio {aBorrar.numero}</h3>
            <p className="text-sm text-gray-600">Se borra el convenio y su planilla. Las cotizaciones que lo usaban pasan a calcular el flete con el convenio predeterminado.</p>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setABorrar(null)} disabled={!!ocupado} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => void borrar()} disabled={!!ocupado} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center gap-2">
                {ocupado === aBorrar.id && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
