import { useState } from 'react';
import { useSesion } from '@/context/AuthContext';
import { linkRecuperacionVencido } from '@/lib/supabase';
import { MIN_PASSWORD, validarPasswordNueva } from '@/lib/password';
import { Loader2, ArrowLeft, MailCheck, Eye, EyeOff } from 'lucide-react';
import LogoCotizador from '@/components/LogoCotizador';

type Modo = 'ingresar' | 'olvido' | 'enviado' | 'nueva';

const inputCls =
  'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all';
const botonCls =
  'w-full py-2.5 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-green-800 transition-all disabled:opacity-60 flex items-center justify-center gap-2';

export default function AuthScreen({ modoInicial = 'ingresar' }: { modoInicial?: Modo }) {
  const { signIn, signOut, pedirRecuperacion, cambiarPassword } = useSesion();
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    modoInicial === 'ingresar' && linkRecuperacionVencido
      ? 'El link para cambiar la contraseña venció o ya se usó. Pedí uno nuevo.'
      : null
  );
  const [loading, setLoading] = useState(false);

  function irA(m: Modo) {
    setModo(m);
    setError(null);
    setPassword('');
    setRepetida('');
  }

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  }

  async function enviarLink(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    const { error } = await pedirRecuperacion(email);
    setLoading(false);
    // Por seguridad Supabase no avisa si el mail no existe: se muestra lo mismo en ambos casos
    if (error) setError(error);
    else setModo('enviado');
  }

  async function guardarNueva(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const invalida = validarPasswordNueva(password, repetida);
    if (invalida) { setError(invalida); return; }
    setError(null);
    setLoading(true);
    const { error } = await cambiarPassword(password);
    setLoading(false);
    if (error) setError(error);
    // Si salió bien, el contexto deja de estar "recuperando" y se entra directo a la app
  }

  const subtitulo = {
    ingresar: 'Ingresá con tu usuario',
    olvido: 'Te mandamos un link a tu mail para elegir una contraseña nueva',
    enviado: 'Revisá tu mail',
    nueva: 'Elegí tu contraseña nueva',
  }[modo];

  const campoPassword = (id: string, valor: string, setValor: (v: string) => void, autoComplete: string, label: string) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input id={id} type={verPassword ? 'text' : 'password'} autoComplete={autoComplete} required value={valor}
          onChange={(e) => setValor(e.target.value)} className={`${inputCls} pr-11`} placeholder="••••••••" />
        <button type="button" onClick={() => setVerPassword((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
          aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {verPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-green-800 to-teal-900 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl flex items-center justify-center shadow-lg mb-4">
              {modo === 'enviado' ? <MailCheck className="w-9 h-9 text-white" /> : <LogoCotizador className="w-10 h-10 text-white" colorHoja="#fcd34d" titulo="Cotizador Agro" />}
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Cotizador Agro</h1>
            <p className="text-sm text-gray-500 mt-1">{subtitulo}</p>
          </div>

          {modo === 'ingresar' && (
            <form onSubmit={ingresar} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input id="login-email" type="email" autoComplete="username" required value={email}
                  onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="tu@email.com" />
              </div>
              {campoPassword('login-password', password, setPassword, 'current-password', 'Contraseña')}
              {error && <div role="alert" className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200">{error}</div>}
              <button type="submit" disabled={loading} className={botonCls}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Ingresar
              </button>
              <button type="button" onClick={() => irA('olvido')} className="w-full text-sm text-emerald-700 hover:text-emerald-800 font-medium">
                Olvidé mi contraseña
              </button>
            </form>
          )}

          {modo === 'olvido' && (
            <form onSubmit={enviarLink} className="space-y-4">
              <div>
                <label htmlFor="olvido-email" className="block text-sm font-medium text-gray-700 mb-1">Email de tu usuario</label>
                <input id="olvido-email" type="email" autoComplete="username" required value={email}
                  onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="tu@email.com" />
              </div>
              {error && <div role="alert" className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200">{error}</div>}
              <button type="submit" disabled={loading} className={botonCls}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Mandarme el link
              </button>
              <button type="button" onClick={() => irA('ingresar')} className="w-full flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                <ArrowLeft className="w-4 h-4" /> Volver a ingresar
              </button>
            </form>
          )}

          {modo === 'enviado' && (
            <div className="space-y-4 text-sm text-gray-600">
              <p>
                Si <strong className="text-gray-800">{email.trim()}</strong> tiene usuario, en unos minutos le llega un mail con un link.
                Abrilo desde este mismo dispositivo y elegí la contraseña nueva.
              </p>
              <p className="text-xs text-gray-400">Si no lo ves, fijate en spam. El link vence en una hora.</p>
              <button type="button" onClick={() => irA('ingresar')} className={botonCls}>Volver a ingresar</button>
            </div>
          )}

          {modo === 'nueva' && (
            <form onSubmit={guardarNueva} className="space-y-4">
              {campoPassword('nueva-password', password, setPassword, 'new-password', 'Contraseña nueva')}
              {campoPassword('nueva-repetida', repetida, setRepetida, 'new-password', 'Repetila')}
              <p className="text-xs text-gray-400">Mínimo {MIN_PASSWORD} caracteres.</p>
              {error && <div role="alert" className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200">{error}</div>}
              <button type="submit" disabled={loading} className={botonCls}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} Guardar y entrar
              </button>
              <button type="button" onClick={() => void signOut()} className="w-full text-sm text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
