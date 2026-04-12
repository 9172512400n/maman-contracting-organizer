// Service worker v2 - force clear all caches
const CACHE_VERSION = 'v2-' + Date.now();

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Force all clients to reload
        return self.clients.matchAll({ type: 'window' });
      })
      .then(clients => {
        clients.forEach(client => client.navigate(client.url));
      })
  );
});

// Never cache — always fetch fresh from network
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request.clone()).catch(() => caches.match(e.request)));
});
