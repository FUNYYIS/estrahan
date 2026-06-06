const CACHE_NAME = 'estraha-cache-v4';

const urlsToCache = [
  '/',
  '/index.html',
  '/assets/css/main.css',
  '/assets/js/main.js',
  '/assets/images/logo.png',
  '/assets/images/favicon.png',
  '/assets/images/icon-192.png',
  '/assets/images/icon-512.png',
  '/welcome.mp4',
  '/pages/login.html',
  '/pages/register.html',
  '/pages/home.html',
  '/pages/members.html',
  '/pages/payments.html',
  '/pages/chat.html',
  '/pages/settings.html',
  '/pages/profile-settings.html',
  '/pages/notifications-settings.html',
  '/pages/services.html',
  '/pages/prayer.html',
  '/pages/qibla.html',
  '/pages/matches.html',
  '/pages/news.html',
  '/pages/important-links.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (
          !response ||
          response.status !== 200 ||
          response.type === 'opaque' ||
          response.status === 206
        ) {
          return response;
        }

        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, responseToCache).catch(() => {});
        });

        return response;
      })
      .catch(() => {
        return caches.match(request).then(cachedResponse => {
          return cachedResponse || caches.match('/index.html');
        });
      })
  );
});