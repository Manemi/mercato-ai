const CACHE_NAME = 'mercato-ai-v2-shell-20260607';
const SHELL_ASSETS = [
  '/app-v2/',
  '/app-v2/index.html',
  '/app-v2/styles/app.css',
  '/app-v2/js/app.js',
  '/app-v2/js/api.js',
  '/app-v2/js/state.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin || requestUrl.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/app-v2/')))
  );
});
