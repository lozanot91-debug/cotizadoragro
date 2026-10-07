import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { traducirError } from '@/lib/errores';

type Tipo = 'error' | 'exito';
interface Aviso { id: number; tipo: Tipo; texto: string }

interface ToastCtx {
  error: (e: unknown) => void;
  /** Aviso de error con un texto propio (no viene de una excepción). */
  aviso: (texto: string) => void;
  exito: (texto: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

let contador = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const quitar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);

  const agregar = useCallback((tipo: Tipo, texto: string) => {
    const id = ++contador;
    setAvisos((a) => (a.some((x) => x.texto === texto) ? a : [...a.slice(-3), { id, tipo, texto }]));
    setTimeout(() => quitar(id), tipo === 'error' ? 8000 : 3000);
  }, [quitar]);

  const api = useMemo<ToastCtx>(() => ({
    error: (e) => agregar('error', traducirError(e)),
    aviso: (t) => agregar('error', t),
    exito: (t) => agregar('exito', t),
  }), [agregar]);

  // Red de seguridad: cualquier error no atrapado se muestra en pantalla en vez de perderse.
  useEffect(() => {
    const onRechazo = (ev: PromiseRejectionEvent) => {
      console.error('Error no atrapado:', ev.reason);
      api.error(ev.reason);
    };
    window.addEventListener('unhandledrejection', onRechazo);
    return () => window.removeEventListener('unhandledrejection', onRechazo);
  }, [api]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm w-[calc(100%-2rem)]" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 shadow-lg text-sm ${a.tipo === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            {a.tipo === 'error' ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
            <span className="flex-1">{a.texto}</span>
            <button onClick={() => quitar(a.id)} aria-label="Cerrar" className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast debe usarse dentro de ToastProvider');
  return c;
}
