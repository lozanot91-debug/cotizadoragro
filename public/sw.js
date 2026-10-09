// Service worker del Cotizador Agro.
// Guarda la "cáscara" de la app para que abra rápido y se pueda instalar en el celular.
// NO guarda datos: todo lo que va a Supabase (otro dominio) pasa directo por la red,
// así que nunca se muestran cotizaciones o precios viejos.
const VERSION = 'cotizador-v3';
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

// --- Notificaciones push (aviso cuando la mesa de insumos carga precios) ---------------------------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data ? e.data.text() : '' }; }
  const titulo = d.titulo || 'Cotizador Agro';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.cuerpo || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { cotizacionId: d.cotizacionId || null, pantalla: d.pantalla || null },
  }));
});

// Al tocar el aviso: si la app ya está abierta se enfoca y abre la cotización; si no, se abre con ?abrir=
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.cotizacionId;
  const pantalla = e.notification.data && e.notification.data.pantalla;
  const url = id ? `/?abrir=${encodeURIComponent(id)}` : pantalla ? `/?pantalla=${encodeURIComponent(pantalla)}` : '/';
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const propia = ventanas.find((c) => new URL(c.url).origin === self.location.origin);
    if (propia) {
      await propia.focus();
      if (id) propia.postMessage({ tipo: 'abrir-cotizacion', cotizacionId: id });
      else if (pantalla) propia.postMessage({ tipo: 'abrir-pantalla', pantalla });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
