/** Contactos de un cliente: validación, links de WhatsApp / teléfono / mail y contacto principal. */
import type { Contacto } from '@/types';

export const CARGOS_SUGERIDOS = ['Dueño', 'Encargado de campo', 'Administración', 'Contador', 'Ingeniero agrónomo', 'Socio'];

export interface FormContacto {
  nombre: string;
  cargo: string;
  telefono: string;
  email: string;
  notas: string;
  principal: boolean;
}

export const FORM_CONTACTO_VACIO: FormContacto = { nombre: '', cargo: '', telefono: '', email: '', notas: '', principal: false };

export function formDeContacto(c: Contacto): FormContacto {
  return {
    nombre: c.nombre, cargo: c.cargo || '', telefono: c.telefono || '',
    email: c.email || '', notas: c.notas || '', principal: c.principal,
  };
}

const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarContacto(f: FormContacto):
  | { ok: true; datos: Pick<Contacto, 'nombre' | 'cargo' | 'telefono' | 'email' | 'notas' | 'principal'> }
  | { ok: false; error: string } {
  const nombre = f.nombre.trim();
  if (!nombre) return { ok: false, error: 'Poné el nombre del contacto.' };
  if (nombre.length > 120) return { ok: false, error: 'El nombre es muy largo.' };
  const telefono = f.telefono.trim();
  if (telefono && !/^[\d\s+()\-./]+$/.test(telefono)) return { ok: false, error: 'El teléfono solo puede tener números, espacios, +, guiones y paréntesis.' };
  if (telefono && telefono.replace(/\D/g, '').length < 6) return { ok: false, error: 'El teléfono es muy corto.' };
  if (telefono.length > 40) return { ok: false, error: 'El teléfono es muy largo.' };
  const email = f.email.trim();
  if (email && !MAIL_RE.test(email)) return { ok: false, error: 'El mail no parece válido.' };
  if (email.length > 160) return { ok: false, error: 'El mail es muy largo.' };
  const cargo = f.cargo.trim();
  if (cargo.length > 80) return { ok: false, error: 'El cargo es muy largo.' };
  const notas = f.notas.trim();
  if (notas.length > 500) return { ok: false, error: 'Las notas son muy largas (máximo 500 caracteres).' };
  return {
    ok: true,
    datos: { nombre, cargo: cargo || null, telefono: telefono || null, email: email || null, notas: notas || null, principal: f.principal },
  };
}

/**
 * Número para wa.me (solo dígitos, con 549 para Argentina), o null si no se puede armar.
 * Acepta como lo anota la gente: "0249 15 412-3456", "249 4123456", "+54 9 11 1234-5678", "11 15 1234 5678".
 * Un número con + que no es de Argentina se usa tal cual.
 */
export function numeroWhatsApp(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const crudo = tel.trim();
  let d = crudo.replace(/\D/g, '');
  if (!d) return null;
  if (crudo.startsWith('+') && !d.startsWith('54')) return d.length >= 8 ? d : null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) {
    d = d.slice(2);
    if (d.startsWith('9')) d = d.slice(1);
  }
  if (d.startsWith('0')) d = d.slice(1);
  // Saca el 15 del celular: área de 2, 3 o 4 cifras + 15 + abonado = 12 cifras
  if (d.length === 12) {
    for (const i of [2, 3, 4]) {
      if (d.slice(i, i + 2) === '15') { d = d.slice(0, i) + d.slice(i + 2); break; }
    }
  }
  return d.length === 10 ? `549${d}` : null;
}

export function linkWhatsApp(tel: string | null | undefined): string | null {
  const n = numeroWhatsApp(tel);
  return n ? `https://wa.me/${n}` : null;
}

export function linkTelefono(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const limpio = tel.trim().replace(/[^\d+]/g, '');
  return limpio.replace(/\D/g, '').length >= 6 ? `tel:${limpio}` : null;
}

export function linkMail(email: string | null | undefined): string | null {
  return email && MAIL_RE.test(email.trim()) ? `mailto:${email.trim()}` : null;
}

/** El contacto marcado como principal; si no hay, el primero. */
export function contactoPrincipal<T extends Pick<Contacto, 'principal'>>(contactos: T[]): T | null {
  return contactos.find((c) => c.principal) ?? contactos[0] ?? null;
}

/** Principal primero, después por nombre. */
export function ordenarContactos<T extends Pick<Contacto, 'principal' | 'nombre'>>(contactos: T[]): T[] {
  return [...contactos].sort((a, b) => Number(b.principal) - Number(a.principal) || a.nombre.localeCompare(b.nombre, 'es'));
}
