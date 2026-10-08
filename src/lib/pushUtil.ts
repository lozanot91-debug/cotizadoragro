/** Funciones puras de las notificaciones push (sin Supabase, para poder testearlas). */

/** Clave pública VAPID (es pública: la privada vive en Supabase Vault). */
export const VAPID_PUBLICA = 'BOkQWSSFLCmH0uJa631RI2xfAsveXgZ_AEhMEU_buc2atYnhS5QCTV1fOD4gpTcAsXwo6nk3PAksHuf0QOzF1xI';

/** "BOkQ..." (base64url) → bytes, como lo pide PushManager.subscribe */
export function base64UrlABytes(b64: string): Uint8Array {
  const relleno = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Nombre corto del dispositivo, para reconocerlo en la base ("Android · Chrome"). */
export function nombreDispositivo(ua: string): string {
  const so = /android/i.test(ua) ? 'Android' : /iphone|ipad|ipod/i.test(ua) ? 'iPhone/iPad' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'Otro';
  const nav = /edg\//i.test(ua) ? 'Edge' : /samsungbrowser/i.test(ua) ? 'Samsung' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Navegador';
  return `${so} · ${nav}`;
}
