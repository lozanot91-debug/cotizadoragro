import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useData } from '@/hooks/useData';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import type { Usuario, Rol } from '@/types';

export default function UsuariosAdmin() {
  const data = useData();
  const toast = useToast();
  const { usuario: yo } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setUsuarios(await data.fetchUsuarios());
    } catch (e) {
      toast.error(e);
      setUsuarios((u) => u ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function cambiar(u: Usuario, cambios: { activo?: boolean; rol?: Rol }, msg: string) {
    setGuardando(u.id);
    try {
      await data.actualizarUsuario(u.id, cambios);
      toast.exito(msg);
      await cargar();
    } catch (e) {
      toast.error(e);
    } finally {
      setGuardando(null);
    }
  }

  const ordenados = [...(usuarios ?? [])].sort((a, b) => Number(a.activo) - Number(b.activo));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Usuarios</h2>
        <p className="text-sm text-gray-500">Las cuentas nuevas entran desactivadas hasta que las apruebes.</p>
      </div>
      {usuarios === null ? (
        <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 text-emerald-600 animate-spin" /></div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {ordenados.map((u) => {
            const soyYo = u.id === yo.id;
            const bloqueado = soyYo || guardando === u.id;
            return (
              <li key={u.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-48">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{u.nombre}</span>
                    {!u.activo && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>}
                  </div>
                  <div className="text-sm text-gray-500">{u.email}</div>
                </div>
                <select value={u.rol} disabled={bloqueado} title={soyYo ? 'No podés cambiarte a vos mismo' : undefined}
                  onChange={(e) => cambiar(u, { rol: e.target.value as Rol }, 'Rol actualizado')}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400">
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Admin</option>
                </select>
                <button disabled={bloqueado} title={soyYo ? 'No podés cambiarte a vos mismo' : undefined}
                  onClick={() => cambiar(u, { activo: !u.activo }, u.activo ? 'Usuario desactivado' : 'Usuario aprobado')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${u.activo ? 'border border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                  {u.activo ? 'Desactivar' : 'Aprobar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
