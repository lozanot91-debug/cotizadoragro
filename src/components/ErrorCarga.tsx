import { AlertCircle, RefreshCw } from 'lucide-react';
import { traducirError } from '@/lib/errores';

/** Se muestra cuando falla la carga inicial de una pantalla. */
export default function ErrorCarga({ error, onReintentar }: { error: unknown; onReintentar: () => void }) {
  return (
    <div className="max-w-md mx-auto mt-16 bg-white rounded-xl border border-red-200 shadow-sm p-6 text-center">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-red-600" />
      </div>
      <h2 className="font-bold text-gray-800 mb-1">No pudimos cargar los datos</h2>
      <p className="text-sm text-gray-500 mb-4">{traducirError(error)}</p>
      <button onClick={onReintentar} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
        <RefreshCw className="w-4 h-4" /> Reintentar
      </button>
    </div>
  );
}
