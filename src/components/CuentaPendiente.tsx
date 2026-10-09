import { Clock } from 'lucide-react';
import { useSesion } from '@/context/AuthContext';

export default function CuentaPendiente() {
  const { usuario, signOut, reintentarPerfil, errorPerfil } = useSesion();
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-green-800 to-teal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-9 h-9 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">Tu cuenta está pendiente de aprobación</h1>
        <p className="text-sm text-gray-500 mt-2">
          {errorPerfil ?? 'Un administrador tiene que habilitarla. Cuando lo haga, tocá Reintentar.'}
        </p>
        {usuario?.email && <p className="text-sm font-medium text-gray-700 mt-4">{usuario.email}</p>}
        <div className="mt-6 space-y-2">
          <button onClick={reintentarPerfil}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
            Reintentar
          </button>
          <button onClick={() => { void signOut(); }}
            className="w-full py-2.5 rounded-lg text-sm text-emerald-700 hover:text-emerald-800 font-medium">
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
