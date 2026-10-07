// Service worker del Cotizador Agro.
// Guarda la "cáscara" de la app para que abra rápido y se pueda instalar en el celular.
// NO guarda datos: todo lo que va a Supabase (otro dominio) pasa directo por la red,
// así que nunca se muestran cotizaciones o precios viejos.
const VERSION = 'cotizador-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase y demás: directo a la red

  // Pantalla principal: red primero (siempre la versión nueva), y si no hay internet la guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      const copia = r.clone();
      caches.open(VERSION).then((c) => c.put('/', copia));
      return r;
    }).catch(() => caches.match('/')));
    return;
  }

  // Archivos con huella en el nombre (/assets/...): no cambian nunca, caché primero
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
      return r;
    })));
  }
});
