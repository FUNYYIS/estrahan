// اسم ذاكرة التخزين المؤقت (Cache) للتطبيق
const CACHE_NAME = 'estraha-cache-v1';

// قائمة الملفات الأساسية التي سيتم تخزينها للعمل دون اتصال
const urlsToCache = [
  '/',
  '/index.html',
  '/assets/css/main.css',
  '/assets/js/main.js',
  '/assets/images/logo.png',
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

// حدث التثبيت: يتم تشغيله عند تثبيت الـ Service Worker لأول مرة
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache); // إضافة جميع الملفات الأساسية إلى الـ Cache
      })
  );
});

// حدث الجلب: يتم تشغيله عند كل طلب يقوم به التطبيق (مثل طلب صفحة أو صورة)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // إذا كان الملف موجوداً في الـ Cache، قم بإرجاعه مباشرة
        if (response) {
          return response;
        }
        // إذا لم يكن موجوداً، قم بجلبه من الشبكة
        return fetch(event.request);
      }
    )
  );
});

// حدث التفعيل: يتم تشغيله عند تفعيل نسخة جديدة من الـ Service Worker
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // حذف أي Cache قديم غير مستخدم
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
