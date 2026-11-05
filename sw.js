// Offline support: app files are network-first (so updates arrive), AI runtime + models are cache-first.
const APP_CACHE = 'glow-app-v2';
const AI_CACHE = 'glow-ai-v1';
const APP_FILES = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './js/main.js', './js/params.js', './js/gl.js', './js/shaders.js', './js/renderer.js',
  './js/face.js', './js/ai.js', './js/viewer.js', './js/ui.js', './js/exporter.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
const AI_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== AI_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (AI_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(AI_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin === self.location.origin) {
    // `no-cache` revalidates with the server (cheap 304s), so an update is never mixed with stale files.
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(APP_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('./index.html')),
    );
  }
});
