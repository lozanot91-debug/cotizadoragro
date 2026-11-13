import { formatARS, formatUSD } from '@/lib/format';
import type { ResumenPesos } from '@/lib/moneda';

/**
 * Línea chica que muestra, aparte, lo que suman las cotizaciones en pesos (balanceado) de un grupo:
 * los pesos reales y su equivalente en dólares al TC de cada cotización. Ese equivalente ya está
 * incluido en el total en dólares de la pantalla. No muestra nada si no hay cotizaciones en pesos.
 */
export function LineaBalanceado({ r, className = '' }: { r: ResumenPesos | null | undefined; className?: string }) {
  if (!r || r.n === 0) return null;
  return (
    <p className={`text-xs ${className}`}>
      Balanceado (en pesos): <strong>{formatARS(r.ars)}</strong> · ≈ {formatUSD(r.usd)} · incluido en el total
    </p>
  );
}
