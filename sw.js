const CACHE = 'maman-v1';
const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/logo.jpg',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first for Firebase API calls, cache first for assets
  const url = new URL(e.request.url);
  const isFirebase = url.hostname.includes('firebase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic');
  if (isFirebase) {
    // Always network for Firebase — no caching
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful GET responses
        if (e.request.method === 'GET' && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, resClone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});
