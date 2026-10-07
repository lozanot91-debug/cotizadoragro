import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** Franja que avisa cuando se pierde internet (la app necesita conexión para guardar y traer datos). */
export default function SinConexion() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return (
    <div role="alert" className="bg-amber-100 text-amber-900 text-sm px-4 py-2 flex items-center gap-2">
      <WifiOff className="w-4 h-4 shrink-0" />
      Sin conexión. Lo que estás cargando no se guarda hasta que vuelva internet.
    </div>
  );
}
