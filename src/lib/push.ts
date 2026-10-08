import { supabase } from '@/lib/supabase';
import { VAPID_PUBLICA, base64UrlABytes, nombreDispositivo } from '@/lib/pushUtil';

export type EstadoPush =
  | 'activo'          // este dispositivo recibe avisos
  | 'inactivo'        // se puede activar
  | 'bloqueado'       // el usuario negó el permiso en el navegador
  | 'instalar-ios'    // iPhone/iPad: hay que instalar la app en la pantalla de inicio primero
  | 'no-soportado';   // navegador sin push

function esIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function instalada(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return esIOS() && !instalada() ? 'instalar-ios' : 'no-soportado';
  }
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await registro();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
}

/** Pide permiso, suscribe este dispositivo y lo guarda en Supabase. Llamar desde un toque del usuario. */
export async function activarPush(): Promise<EstadoPush> {
  const permiso = await Notification.requestPermission();
  if (permiso === 'denied') return 'bloqueado';
  if (permiso !== 'granted') return 'inactivo';
  const reg = (await registro()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlABytes(VAPID_PUBLICA) }));
  const j = sub.toJSON();
  const { error } = await supabase.rpc('registrar_push', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_dispositivo: nombreDispositivo(navigator.userAgent),
  });
  if (error) throw error;
  return 'activo';
}

/** Deja de recibir avisos en este dispositivo. */
export async function desactivarPush(): Promise<EstadoPush> {
  const reg = await registro();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_suscripciones').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return 'inactivo';
}

/** Manda un aviso de prueba a los dispositivos del usuario logueado. Devuelve cuántos salieron. */
export async function probarPush(): Promise<number> {
  const { data, error } = await supabase.functions.invoke('enviar-push', { body: { tipo: 'prueba' } });
  if (error) throw error;
  return Number(data?.enviados || 0);
}
