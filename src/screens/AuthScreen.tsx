import { useState } from 'react';
import { useSesion } from '@/context/AuthContext';
import { Sprout, Loader2 } from 'lucide-react';

export default function AuthScreen() {
  const { signIn } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-green-800 to-teal-900 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl flex items-center justify-center shadow-lg mb-4">
              <Sprout className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Cotizador Agro</h1>
            <p className="text-sm text-gray-500 mt-1">Ingresá con tu usuario</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="tu@email.com" />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••" />
            </div>

            {error && (
              <div role="alert" className="text-sm px-4 py-3 rounded-lg bg-red-50 text-red-700 border border-red-200">{error}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-green-800 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Ingresar
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">¿No tenés usuario o perdiste la contraseña? Pedíselo al administrador.</p>
        </div>
      </div>
    </div>
  );
}
