import { useEffect, useState } from 'react';
import { X, Loader2, LogOut, KeyRound, Check, Mail, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { validarPasswordNueva, MIN_PASSWORD } from '@/lib/password';

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white';

/** Mi perfil: nombre (editable), mail, rol, cambio de contraseña y salir. Se abre desde arriba a la derecha. */
export default function MiPerfil({ onCerrar }: { onCerrar: () => void }) {
  const { usuario, actualizarNombre, cambiarPassword, signOut } = useAuth();
  const toast = useToast();
  const [nombre, setNombre] = useState(usuario.nombre || '');
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [verPassword, setVerPassword] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [errorPass, setErrorPass] = useState<string | null>(null);
  const [guardandoPass, setGuardandoPass] = useState(false);

  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);

  const nombreCambio = nombre.trim().replace(/\s+/g, ' ') !== (usuario.nombre || '').trim();

  async function guardarNombre() {
    const n = nombre.trim().replace(/\s+/g, ' ');
    if (n.length < 2) { setErrorNombre('El nombre tiene que tener al menos 2 letras.'); return; }
    if (n.length > 60) { setErrorNombre('El nombre es muy largo (máximo 60 caracteres).'); return; }
    setGuardandoNombre(true); setErrorNombre(null);
    const { error } = await actualizarNombre(n);
    setGuardandoNombre(false);
    if (error) { setErrorNombre(error); return; }
    setNombre(n);
    toast.exito('Nombre guardado');
  }

  async function guardarPassword() {
    const err = validarPasswordNueva(pass, pass2);
    if (err) { setErrorPass(err); return; }
    setGuardandoPass(true); setErrorPass(null);
    const { error } = await cambiarPassword(pass);
    setGuardandoPass(false);
    if (error) { setErrorPass(error); return; }
    setPass(''); setPass2(''); setVerPassword(false);
    toast.exito('Contraseña cambiada');
  }

  const inicial = (usuario.nombre || usuario.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Mi perfil">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <aside className="relative bg-white w-full max-w-sm h-full shadow-2xl flex flex-col">
        <header className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Mi perfil</h2>
          <button onClick={onCerrar} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-800 text-amber-300 flex items-center justify-center text-2xl font-bold flex-shrink-0">{inicial}</div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 truncate">{usuario.nombre}</p>
              <p className="text-sm text-gray-500 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> {usuario.rol === 'admin' ? 'Administrador' : 'Vendedor'}</p>
            </div>
          </div>

          <section className="space-y-1.5">
            <label htmlFor="perfil-nombre" className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><User className="w-4 h-4 text-gray-400" /> Nombre</label>
            <div className="flex gap-2">
              <input id="perfil-nombre" value={nombre} maxLength={60} onChange={(e) => { setNombre(e.target.value); setErrorNombre(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && nombreCambio) void guardarNombre(); }} className={inputCls} />
              <button onClick={() => void guardarNombre()} disabled={!nombreCambio || guardandoNombre}
                className="px-3 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-40 flex items-center gap-1.5">
                {guardandoNombre ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Guardar
              </button>
            </div>
            <p className="text-xs text-gray-500">Es el que aparece en las cotizaciones, los comentarios, el historial y los pedidos.</p>
            {errorNombre && <p role="alert" className="text-sm text-red-600">{errorNombre}</p>}
          </section>

          <section className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Mail className="w-4 h-4 text-gray-400" /> Mail</p>
            <p className="text-sm text-gray-800 break-all">{usuario.email}</p>
            <p className="text-xs text-gray-500">Con este mail entrás a la app. Para cambiarlo, pedíselo al administrador.</p>
          </section>

          <section className="space-y-2">
            {!verPassword ? (
              <button onClick={() => setVerPassword(true)} className="text-sm text-emerald-700 hover:text-emerald-800 font-medium flex items-center gap-1.5"><KeyRound className="w-4 h-4" /> Cambiar contraseña</button>
            ) : (
              <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><KeyRound className="w-4 h-4 text-gray-400" /> Contraseña nueva</p>
                <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={`Mínimo ${MIN_PASSWORD} caracteres`} className={inputCls} aria-label="Contraseña nueva" />
                <input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Repetila" className={inputCls} aria-label="Repetir contraseña"
                  onKeyDown={(e) => { if (e.key === 'Enter') void guardarPassword(); }} />
                {errorPass && <p role="alert" className="text-sm text-red-600">{errorPass}</p>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setVerPassword(false); setPass(''); setPass2(''); setErrorPass(null); }} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
                  <button onClick={() => void guardarPassword()} disabled={guardandoPass} className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1.5">
                    {guardandoPass && <Loader2 className="w-4 h-4 animate-spin" />} Cambiar
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="p-5 border-t border-gray-200">
          <button onClick={() => { void signOut(); }} className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </footer>
      </aside>
    </div>
  );
}
