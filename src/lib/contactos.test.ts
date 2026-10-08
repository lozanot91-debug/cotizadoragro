import { describe, expect, it } from 'vitest';
import { contactoPrincipal, linkMail, linkTelefono, linkWhatsApp, numeroWhatsApp, ordenarContactos, validarContacto, FORM_CONTACTO_VACIO } from './contactos';

describe('numeroWhatsApp', () => {
  it.each([
    ['0249 15 412-3456', '5492494123456'],
    ['249 154123456', '5492494123456'],
    ['2494123456', '5492494123456'],
    ['+54 9 249 412-3456', '5492494123456'],
    ['+54 249 15 4123456', '5492494123456'],
    ['011 15 1234-5678', '5491112345678'],
    ['11 1234 5678', '5491112345678'],
    ['02983 15 412345', '5492983412345'],
    ['0221 15 555-1234', '5492215551234'],
    ['0054 9 11 1234 5678', '5491112345678'],
  ])('%s → %s', (tel, esperado) => {
    expect(numeroWhatsApp(tel)).toBe(esperado);
  });

  it('número del exterior con + se usa tal cual', () => {
    expect(numeroWhatsApp('+598 99 123 456')).toBe('59899123456');
  });

  it('devuelve null si no le da el largo', () => {
    expect(numeroWhatsApp('4123456')).toBeNull();
    expect(numeroWhatsApp('')).toBeNull();
    expect(numeroWhatsApp(null)).toBeNull();
  });

  it('linkWhatsApp arma wa.me', () => {
    expect(linkWhatsApp('0249 15 412-3456')).toBe('https://wa.me/5492494123456');
    expect(linkWhatsApp('123')).toBeNull();
  });
});

describe('links de teléfono y mail', () => {
  it('tel: sin espacios ni guiones', () => {
    expect(linkTelefono('0249 15 412-3456')).toBe('tel:0249154123456');
    expect(linkTelefono('+54 9 249 4123456')).toBe('tel:+5492494123456');
    expect(linkTelefono('12')).toBeNull();
  });
  it('mailto solo con mail válido', () => {
    expect(linkMail(' juan@campo.com.ar ')).toBe('mailto:juan@campo.com.ar');
    expect(linkMail('juan@')).toBeNull();
    expect(linkMail(null)).toBeNull();
  });
});

describe('validarContacto', () => {
  it('pide nombre', () => {
    expect(validarContacto(FORM_CONTACTO_VACIO)).toEqual({ ok: false, error: 'Poné el nombre del contacto.' });
  });
  it('rechaza mail y teléfono inválidos', () => {
    expect(validarContacto({ ...FORM_CONTACTO_VACIO, nombre: 'Juan', email: 'juan@campo' }).ok).toBe(false);
    expect(validarContacto({ ...FORM_CONTACTO_VACIO, nombre: 'Juan', telefono: 'llamar a la tarde' }).ok).toBe(false);
    expect(validarContacto({ ...FORM_CONTACTO_VACIO, nombre: 'Juan', telefono: '123' }).ok).toBe(false);
  });
  it('limpia espacios y deja null lo vacío', () => {
    const v = validarContacto({ ...FORM_CONTACTO_VACIO, nombre: '  Juan Pérez ', cargo: ' Encargado ', telefono: ' 0249 15 4123456 ', principal: true });
    expect(v).toEqual({ ok: true, datos: { nombre: 'Juan Pérez', cargo: 'Encargado', telefono: '0249 15 4123456', email: null, notas: null, principal: true } });
  });
});

describe('principal y orden', () => {
  const cs = [
    { nombre: 'Zulma', principal: false },
    { nombre: 'Ana', principal: false },
    { nombre: 'Marcos', principal: true },
  ];
  it('principal marcado, o el primero', () => {
    expect(contactoPrincipal(cs)?.nombre).toBe('Marcos');
    expect(contactoPrincipal(cs.map((c) => ({ ...c, principal: false })))?.nombre).toBe('Zulma');
    expect(contactoPrincipal([])).toBeNull();
  });
  it('ordena principal primero y después por nombre', () => {
    expect(ordenarContactos(cs).map((c) => c.nombre)).toEqual(['Marcos', 'Ana', 'Zulma']);
  });
});
