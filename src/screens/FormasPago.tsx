import { CreditCard } from 'lucide-react';
import ComparadorFormasPago from '@/components/ComparadorFormasPago';

export default function FormasPago() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="titulo text-3xl text-emerald-900 flex items-center gap-2"><CreditCard className="w-7 h-7" /> Formas de pago</h1>
        <p className="text-sm text-gray-500 mt-1">Compará contado, plazo, canje y tarjetas para un mismo monto.</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <ComparadorFormasPago />
      </div>
    </div>
  );
}
