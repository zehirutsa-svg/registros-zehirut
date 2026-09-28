// Service Worker: guarda la app en el teléfono para que abra sin señal.
// Al publicar una versión nueva, subir el número de CACHE para que los
// teléfonos descarguen los archivos nuevos.
const CACHE = 'registros-v8';
const ARCHIVOS = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'app.js',
  'icons/logo.svg',
  'icons/favicon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo archivos propios de la app; lo del Google Sheet va directo a la red.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // El manifest siempre de la red: si se sirviera la copia guardada, Chrome instalaría
  // con el nombre viejo. Sin señal no hace falta.
  if (url.pathname.endsWith('.webmanifest')) return;
  // Red primero (con señal se ve siempre la última versión); sin señal, o si la red
  // tarda más de 3 s (señal débil en el campo), lo guardado.
  e.respondWith((async () => {
    try {
      const r = await Promise.race([
        fetch(e.request, { cache: 'no-cache' }),
        new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('lento')), 3000)),
      ]);
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
      return r;
    } catch (err) {
      return (await caches.match(e.request, { ignoreSearch: true })) || caches.match('index.html');
    }
  })());
});
