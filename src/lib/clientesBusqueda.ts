/** Búsqueda de clientes por nombre, razón social, CUIT y número de cuenta interno. */
import type { Cliente } from '@/types';

type Buscable = Pick<Cliente, 'nombre'> & Partial<Pick<Cliente, 'razon_social' | 'cuit' | 'numero_cuenta'>>;

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const alfanum = (s: string) => sinAcentos(s).replace(/[^a-z0-9]/g, '');

/** true si el cliente coincide con el texto (vacío = coincide todo). */
export function coincideCliente(c: Buscable, texto: string): boolean {
  const q = sinAcentos(texto.trim());
  if (!q) return true;
  if (sinAcentos([c.nombre, c.razon_social].filter(Boolean).join(' ')).includes(q)) return true;
  const qa = alfanum(texto);
  if (!qa) return false;
  if (c.numero_cuenta && alfanum(c.numero_cuenta).includes(qa)) return true;
  const qd = texto.replace(/\D/g, '');
  return qd.length >= 4 && qd.length === qa.length && !!c.cuit && c.cuit.replace(/\D/g, '').includes(qd);
}
