import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, X } from 'lucide-react';
import { activarPush, desactivarPush, estadoPush, probarPush, type EstadoPush } from '@/lib/push';
import { useToast } from '@/components/Toast';

const CLAVE_DESCARTE = 'cotizador.avisosPush.descartado';

function leerDescartado(): boolean {
  try { return localStorage.getItem(CLAVE_DESCARTE) === '1'; } catch { return false; }
}
function guardarDescartado() {
  try { localStorage.setItem(CLAVE_DESCARTE, '1'); } catch { /* sin almacenamiento */ }
}

/**
 * Activa o desactiva los avisos al celular cuando la mesa de insumos carga precios.
 * `compacto`: tarjeta para Inicio que solo aparece si todavía no se activaron (y se puede descartar).
 */
export default function AvisosPush({ compacto = false }: { compacto?: boolean }) {
  const toast = useToast();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [descartado, setDescartado] = useState(leerDescartado);

  useEffect(() => {
    let vivo = true;
    estadoPush().then((e) => { if (vivo) setEstado(e); }).catch(() => { if (vivo) setEstado('no-soportado'); });
    return () => { vivo = false; };
  }, []);

  async function activar() {
    setOcupado(true);
    try {
      const e = await activarPush();
      setEstado(e);
      if (e === 'activo') {
        toast.exito('Avisos activados en este dispositivo');
        void probarPush().catch(() => { /* la prueba es opcional */ });
      } else if (e === 'bloqueado') {
        toast.aviso('El navegador tiene bloqueadas las notificaciones para esta app. Habilitalas desde la configuración del sitio.');
      }
    } catch (e) { toast.error(e); } finally { setOcupado(false); }
  }

  async function desactivar() {
    setOcupado(true);
    try { setEstado(await desactivarPush()); toast.exito('Avisos desactivados en este dispositivo'); }
    catch (e) { toast.error(e); } finally { setOcupado(false); }
  }

  async function probar() {
    setOcupado(true);
    try {
      const n = await probarPush();
      if (n > 0) toast.exito('Aviso de prueba enviado');
      else toast.aviso('No salió ningún aviso: probá desactivar y volver a activar.');
    } catch (e) { toast.error(e); } finally { setOcupado(false); }
  }

  if (estado === null || estado === 'no-soportado') return null;

  if (compacto) {
    if (estado !== 'inactivo' || descartado) return null;
    return (
      <div className="w-full bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
        <Bell className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <p className="text-sm text-gray-700 flex-1">Activá los avisos y te llega una notificación cuando la mesa de insumos carga los precios.</p>
        <button onClick={() => void activar()} disabled={ocupado} className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap">
          {ocupado && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Activar
        </button>
        <button onClick={() => { guardarDescartado(); setDescartado(true); }} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Ahora no"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1">
        {estado === 'activo' ? <BellRing className="w-5 h-5 text-emerald-700 mt-0.5" /> : <BellOff className="w-5 h-5 text-gray-400 mt-0.5" />}
        <div>
          <p className="text-sm font-semibold text-gray-800">
            {estado === 'activo' ? 'Avisos activados en este dispositivo' : 'Avisos al celular'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {estado === 'activo' && 'Te llega una notificación cuando la mesa carga precios o pide una corrección en tus cotizaciones.'}
            {estado === 'inactivo' && 'Recibí una notificación cuando la mesa carga precios, aunque tengas la app cerrada.'}
            {estado === 'bloqueado' && 'El navegador tiene bloqueadas las notificaciones. Habilitalas en la configuración del sitio y volvé a esta pantalla.'}
            {estado === 'instalar-ios' && 'En iPhone primero instalá la app: botón Compartir → “Agregar a inicio”. Después abrila desde el ícono y activá los avisos acá.'}
          </p>
        </div>
      </div>
      {estado === 'inactivo' && (
        <button onClick={() => void activar()} disabled={ocupado} className="px-3 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 flex items-center justify-center gap-1.5">
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Activar avisos
        </button>
      )}
      {estado === 'activo' && (
        <div className="flex gap-2">
          <button onClick={() => void probar()} disabled={ocupado} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">Probar</button>
          <button onClick={() => void desactivar()} disabled={ocupado} className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">Desactivar</button>
        </div>
      )}
    </div>
  );
}
