/** Registra el service worker (solo en la versión publicada, no al programar). */
export function registrarServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.error('No se pudo registrar el service worker:', e));
  });
}
