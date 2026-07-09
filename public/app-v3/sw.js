const CACHE_NAME = 'mercato-ai-seo-recovery-design-v42-20260706__prev-mercato-ai-seo-recovery-specialists-v41-20260706__base-mercato-ai-seo-growth-intelligence-v12-20260623';
const SHELL = [
  '/app-v3/',
  '/app-v3/index.html',
  '/app-v3/app.css',
  '/app-v3/js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/app-v3/')))
  );
});
