import { nombreCotizacion } from '@/lib/nombreCotizacion';
import type { Cotizacion } from '@/types';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const numeroDe = (c: Cotizacion) => c.numero_cliente || c.numero || 0;

/**
 * Busca cotizaciones por número (con o sin el nombre del cliente, ignorando ceros a la izquierda) o por cliente,
 * sin importar acentos ni mayúsculas. Más nuevas primero; texto vacío = las últimas.
 */
export function buscarCotizaciones(
  cotizaciones: Cotizacion[],
  { texto, clienteId, limite = 20 }: { texto: string; clienteId?: string | null; limite?: number },
): Cotizacion[] {
  const q = norm(texto);
  const soloNumero = /^\d+$/.test(q);
  return cotizaciones
    .filter((c) => {
      if (clienteId && c.cliente_id !== clienteId) return false;
      if (!q) return true;
      const cli = norm(c.cliente_nombre || (c as { cliente?: { nombre: string } | null }).cliente?.nombre || '');
      if (soloNumero) return numeroDe(c) === parseInt(q, 10) || cli.includes(q);
      return norm(nombreCotizacion(c)).includes(q) || cli.includes(q);
    })
    .sort((a, b) => (a.fecha === b.fecha ? numeroDe(b) - numeroDe(a) : a.fecha < b.fecha ? 1 : -1))
    .slice(0, limite);
}
