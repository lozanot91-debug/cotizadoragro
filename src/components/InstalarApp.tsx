import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function yaInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Botón para instalar la app en el celular (Android/Chrome) o instrucciones para iPhone. */
export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [instalada, setInstalada] = useState(() => yaInstalada());
  const [verAyudaIOS, setVerAyudaIOS] = useState(false);

  useEffect(() => {
    const alOfrecer = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar); };
    const alInstalar = () => { setInstalada(true); setEvento(null); };
    window.addEventListener('beforeinstallprompt', alOfrecer);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alOfrecer);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  if (instalada) return null;
  const iphone = esIOS();
  if (!evento && !iphone) return null;

  async function instalar() {
    if (evento) {
      await evento.prompt();
      const r = await evento.userChoice;
      if (r.outcome === 'accepted') setInstalada(true);
      setEvento(null);
    } else {
      setVerAyudaIOS(true);
    }
  }

  return (
    <>
      <button onClick={instalar} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100">
        <Download className="w-5 h-5 flex-shrink-0" /> Instalar en el celular
      </button>
      {verAyudaIOS && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setVerAyudaIOS(false)}>
          <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Instalar en iPhone</h3>
              <button onClick={() => setVerAyudaIOS(false)} aria-label="Cerrar" className="text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <ol className="text-sm text-gray-600 space-y-2 list-decimal pl-5">
              <li>Abrí esta página en <strong>Safari</strong>.</li>
              <li>Tocá el botón <Share className="inline w-4 h-4 -mt-0.5" /> <strong>Compartir</strong>.</li>
              <li>Elegí <strong>Agregar a inicio</strong> y confirmá.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
