const CACHE_NAME = 'al-istiraha-cache-v24';

const urlsToCache = [
  '/',
  '/index.html',
  '/assets/css/main.css',
  '/assets/js/main.js',
  '/assets/images/logo.png',
  '/assets/images/favicon.png',
  '/assets/images/icon-192.png',
  '/assets/images/icon-512.png',
  '/assets/images/al-istiraha-icon.svg',
  '/assets/images/al-istiraha-pattern.svg',
  '/assets/images/al-istiraha-majlis.svg',
  '/assets/images/al-istiraha-news-majlis.svg',
  '/assets/images/al-istiraha-news-service.svg',
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
  '/pages/news.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(url).catch(err => {
              console.warn(`Failed to cache ${url}:`, err);
            });
          })
        );
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('Install event failed:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      ))
      .then(() => self.clients.claim())
      .catch(err => console.error('Activate event failed:', err))
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  // Handle cross-origin requests directly
  if (requestUrl.origin !== self.location.origin) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Cache-first strategy for assets, network-first for pages
  const isAsset = requestUrl.pathname.includes('/assets/');
  
  if (isAsset) {
    // Cache-first for assets
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(request)
            .then(response => {
              // Don't cache non-200 responses or partial responses
              if (
                !response ||
                response.status !== 200 ||
                response.type === 'opaque' ||
                response.status === 206
              ) {
                return response;
              }

              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(request, responseToCache).catch(err => {
                    console.warn('Failed to cache response:', err);
                  });
                })
                .catch(err => console.warn('Failed to open cache:', err));

              return response;
            })
            .catch(() => {
              // Return fallback for failed asset requests
              return caches.match('/index.html');
            });
        })
        .catch(() => {
          return caches.match('/index.html');
        })
    );
  } else {
    // Network-first for HTML pages
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
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(request, responseToCache).catch(err => {
                console.warn('Failed to cache page response:', err);
              });
            })
            .catch(err => console.warn('Failed to open cache:', err));

          return response;
        })
        .catch(() => {
          // Return cached page if network fails
          return caches.match(request)
            .then(cachedResponse => {
              return cachedResponse || caches.match('/index.html');
            });
        })
    );
  }
});
