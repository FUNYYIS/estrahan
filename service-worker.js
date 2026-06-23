const CACHE_NAME = 'estraha-cache-v262';
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/main.css',
  '/assets/css/chat-fix.css',
  '/assets/css/page-fixes.css',
  '/assets/css/home-layout-fix.css',
  '/assets/js/main.js',
  '/assets/js/page-fixes.js',
  '/assets/js/home-ui-fix.js',
  '/assets/images/estraha-logo.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/images/riyadh-skyline-bg.jpg',
  '/assets/images/shagrdiyah-desert-bg.png',
  '/pages/login.html',
  '/pages/register.html',
  '/pages/home.html',
  '/pages/members.html',
  '/pages/payments.html',
  '/pages/chat.html',
  '/pages/settings.html',
  '/pages/profile-settings.html',
  '/pages/notifications-settings.html',
  '/pages/admin-notifications.html',
  '/pages/prayer.html',
  '/pages/qibla.html',
  '/pages/matches.html',
  '/pages/news.html'
];

importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCoIy5Yf3nvkpbp9l43590snBZui86uSXY',
  authDomain: 'estrahaapp-9e327.firebaseapp.com',
  projectId: 'estrahaapp-9e327',
  storageBucket: 'estrahaapp-9e327.appspot.com',
  messagingSenderId: '198308357962',
  appId: '1:198308357962:web:63b5b267e738efd54a83b3'
});

const messaging = firebase.messaging();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        APP_SHELL_URLS.map((url) => cache.add(url).catch((error) => {
          console.warn(`Failed to cache ${url}:`, error);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('estraha-cache-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isFreshCodeAsset(requestUrl)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (isCacheableResponse(response)) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return (await cache.match(request))
      || (await cache.match(new URL(request.url).pathname))
      || (await cache.match('/index.html'))
      || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

function isFreshCodeAsset(url) {
  return url.pathname.startsWith('/pages/')
    || url.pathname.endsWith('.js')
    || url.pathname.endsWith('.css')
    || url.pathname === '/manifest.json';
}

function isStaticAsset(url) {
  return url.pathname.startsWith('/assets/')
    || url.pathname === '/manifest.json'
    || url.pathname.startsWith('/pages/');
}

function isCacheableResponse(response) {
  return response && response.status === 200 && response.type !== 'opaque' && response.status !== 206;
}

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'تطبيق الاستراحة';
  const options = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const link = event.notification.data?.link || '/index.html#home';
  const targetUrl = new URL(link, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
