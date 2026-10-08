import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Users, Phone, Mail, MessageCircle, Star } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useToast } from '@/components/Toast';
import { registrarCambio } from '@/lib/historial';
import {
  CARGOS_SUGERIDOS, FORM_CONTACTO_VACIO, formDeContacto, linkMail, linkTelefono, linkWhatsApp,
  ordenarContactos, validarContacto, type FormContacto,
} from '@/lib/contactos';
import type { Cliente, Contacto } from '@/types';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none';
const accionCls = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border';

/** Contactos del cliente: nombre, cargo, teléfono, mail y notas, con uno principal. */
export default function ContactosCliente({ cliente, onCambio }: { cliente: Cliente; onCambio?: () => void }) {
  const data = useData();
  const toast = useToast();
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Contacto | 'nuevo' | null>(null);
  const [form, setForm] = useState<FormContacto>(FORM_CONTACTO_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<Contacto | null>(null);

  const cargar = useCallback(async () => {
    try {
      setContactos(ordenarContactos(await data.fetchContactos(cliente.id)));
    } catch (e) { toast.error(e); } finally { setCargando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  function abrir(c: Contacto | 'nuevo') {
    setEditando(c);
    setForm(c === 'nuevo' ? { ...FORM_CONTACTO_VACIO, principal: contactos.length === 0 } : formDeContacto(c));
    setError(null);
  }

  async function guardar() {
    const v = validarContacto(form);
    if (!v.ok) { setError(v.error); return; }
    setGuardando(true);
    try {
      const esNuevo = editando === 'nuevo';
      await data.guardarContacto({ ...v.datos, cliente_id: cliente.id, id: esNuevo ? undefined : (editando as Contacto).id });
      await registrarCambio({
        tipo: 'cliente', entidad: `Cliente ${cliente.nombre}`, campo: 'contacto',
        valor_anterior: esNuevo ? null : (editando as Contacto).nombre, valor_nuevo: v.datos.nombre,
        detalle: esNuevo ? 'Contacto agregado' : 'Contacto modificado',
      });
      setEditando(null);
      toast.exito(esNuevo ? 'Contacto agregado' : 'Contacto guardado');
      await cargar();
      onCambio?.();
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  async function hacerPrincipal(c: Contacto) {
    try {
      await data.guardarContacto({
        id: c.id, cliente_id: c.cliente_id, nombre: c.nombre, cargo: c.cargo,
        telefono: c.telefono, email: c.email, notas: c.notas, principal: true,
      });
      toast.exito(`${c.nombre} quedó como contacto principal`);
      await cargar();
      onCambio?.();
    } catch (e) { toast.error(e); }
  }

  async function borrar() {
    if (!aBorrar) return;
    setGuardando(true);
    try {
      await data.eliminarContacto(aBorrar.id);
      await registrarCambio({ tipo: 'cliente', entidad: `Cliente ${cliente.nombre}`, campo: 'contacto', valor_anterior: aBorrar.nombre, valor_nuevo: null, detalle: 'Contacto eliminado' });
      setABorrar(null);
      toast.exito('Contacto eliminado');
      await cargar();
      onCambio?.();
    } catch (e) { toast.error(e); } finally { setGuardando(false); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-gray-700 flex items-center gap-2"><Users className="w-5 h-5 text-gray-400" /> Contactos</h3>
          {contactos.length > 0 && <p className="text-xs text-gray-500 mt-0.5">{contactos.length} {contactos.length === 1 ? 'contacto' : 'contactos'}</p>}
        </div>
        <button onClick={() => abrir('nuevo')} className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Agregar contacto
        </button>
      </div>

      {cargando ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-emerald-600 animate-spin" /></div>
      ) : contactos.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">Todavía no hay contactos. Cargá al menos al que le mandás las cotizaciones.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {contactos.map((c) => {
            const wa = linkWhatsApp(c.telefono), tel = linkTelefono(c.telefono), mail = linkMail(c.email);
            return (
              <div key={c.id} className={`rounded-lg border p-3 ${c.principal ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate flex items-center gap-1.5">
                      {c.nombre}
                      {c.principal && <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Principal</span>}
                    </p>
                    <p className="text-xs text-gray-500">{c.cargo || 'Sin cargo'}</p>
                  </div>
                  <div className="flex gap-0.5 flex-shrink-0">
                    {!c.principal && (
                      <button onClick={() => void hacerPrincipal(c)} className="p-1.5 text-gray-400 hover:text-amber-600 rounded" title="Marcar como principal" aria-label={`Marcar a ${c.nombre} como principal`}><Star className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => abrir(c)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded" aria-label={`Editar ${c.nombre}`}><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => setABorrar(c)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" aria-label={`Eliminar ${c.nombre}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 text-sm text-gray-700">
                  {c.telefono && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-gray-400" /> {c.telefono}</p>}
                  {c.email && <p className="flex items-center gap-1.5 break-all"><Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> {c.email}</p>}
                  {c.notas && <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{c.notas}</p>}
                </div>
                {(wa || tel || mail) && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={`${accionCls} border-green-200 text-green-700 bg-green-50 hover:bg-green-100`}><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
                    {tel && <a href={tel} className={`${accionCls} border-gray-200 text-gray-700 hover:bg-gray-50`}><Phone className="w-3.5 h-3.5" /> Llamar</a>}
                    {mail && <a href={mail} className={`${accionCls} border-gray-200 text-gray-700 hover:bg-gray-50`}><Mail className="w-3.5 h-3.5" /> Mail</a>}
                  </div>
                )}
                {c.telefono && !wa && <p className="mt-1.5 text-[11px] text-amber-700">No pude armar el link de WhatsApp con ese número. Revisá que tenga característica.</p>}
              </div>
            );
          })}
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={guardando ? undefined : () => setEditando(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-1">{editando === 'nuevo' ? 'Nuevo contacto' : 'Editar contacto'}</h3>
            <p className="text-sm text-gray-500 mb-4">{cliente.nombre}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cto-nombre" className="block text-sm font-medium text-gray-700 mb-1">Nombre <span className="text-red-500">*</span></label>
                <input id="cto-nombre" autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="cto-cargo" className="block text-sm font-medium text-gray-700 mb-1">Cargo o rol</label>
                <input id="cto-cargo" list="cargos-contacto" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className={inputCls} placeholder="Ej.: Encargado de campo" />
                <datalist id="cargos-contacto">{CARGOS_SUGERIDOS.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label htmlFor="cto-tel" className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input id="cto-tel" type="tel" inputMode="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={inputCls} placeholder="Ej.: 0249 15 412-3456" />
              </div>
              <div>
                <label htmlFor="cto-mail" className="block text-sm font-medium text-gray-700 mb-1">Mail</label>
                <input id="cto-mail" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="cto-notas" className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea id="cto-notas" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} className={inputCls} placeholder="Ej.: atiende después de las 10" />
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.checked })} className="w-4 h-4 accent-emerald-700" />
                Contacto principal (el que aparece en la lista de clientes)
              </label>
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
            <h3 className="font-bold text-gray-800 mb-2">Eliminar contacto</h3>
            <p className="text-sm text-gray-600">¿Eliminar a <strong>{aBorrar.nombre}</strong> de {cliente.nombre}?</p>
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
