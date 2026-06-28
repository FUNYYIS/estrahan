const CACHE_NAME = 'estraha-cache-v276';
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/assets/css/chat-fix.css',
  '/assets/css/page-fixes.css',
  '/assets/css/home-layout-fix.css',
  '/assets/css/news-home-fix.css',
  '/assets/css/layout-theme-fix.css',
  '/assets/css/chat-composer-fix.css',
  '/assets/css/home-polish.css',
  '/assets/css/runtime-ux.css',
  '/assets/css/offline.css',
  '/assets/css/main/auth-chat-forms.css',
  '/assets/css/main/auth-final.css',
  '/assets/css/main/base.css',
  '/assets/css/main/components-final.css',
  '/assets/css/main/components.css',
  '/assets/css/main/home-polish.css',
  '/assets/css/main/home-v2.css',
  '/assets/css/main/home.css',
  '/assets/css/main/layout-polish.css',
  '/assets/css/main/layout.css',
  '/assets/css/main/navigation-polish.css',
  '/assets/css/main/payments-polish.css',
  '/assets/css/main/payments.css',
  '/assets/css/main/responsive-polish.css',
  '/assets/css/main/responsive.css',
  '/assets/css/main/typography-splash-auth.css',
  '/assets/css/main/utilities-theme.css',
  '/assets/css/main/visual-theme.css',
  '/assets/js/app-config.js',
  '/assets/js/news-provider.js',
  '/assets/js/main.js',
  '/assets/js/page-fixes.js',
  '/assets/js/chat-layout-fix.js',
  '/assets/js/home-polish.js',
  '/assets/js/runtime-ux.js',
  '/assets/js/offline.js',
  '/assets/images/news-placeholder.svg',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-192-original-zoom.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-512-original-zoom.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/apple-touch-icon-original-zoom.png',
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
  storageBucket: 'estrahaapp-9e327.firebasestorage.app',
  messagingSenderId: '198308357962',
  appId: '1:198308357962:web:63b5b267e738efd54a83b3'
});

const messaging = firebase.messaging();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
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
    event.respondWith(networkFirst(request, true));
    return;
  }

  if (isFreshCodeAsset(requestUrl)) {
    event.respondWith(networkFirst(request, false));
    return;
  }

  if (isStaticAsset(requestUrl)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request, navigationRequest = false) {
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
      || (navigationRequest ? await cache.match('/offline.html') : null)
      || (navigationRequest ? await cache.match('/index.html') : null)
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
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'تطبيق الاستراحة';
  const body = data.body || payload.notification?.body || '';
  const tag = data.tag || data.dedupeKey || `estraha-${data.type || 'general'}`;

  return self.registration.showNotification(title, {
    body,
    icon: '/assets/icons/icon-512-original-zoom.png',
    badge: '/assets/icons/icon-192-original-zoom.png',
    tag,
    renotify: false,
    requireInteraction: false,
    dir: 'rtl',
    lang: 'ar',
    timestamp: Date.now(),
    vibrate: [180, 80, 180],
    data: {
      ...data,
      link: data.link || '/index.html#home'
    }
  });
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
