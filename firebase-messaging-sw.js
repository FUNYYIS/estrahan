importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCoIy5Yf3nvkpbp9l43590snBZui86uSXY",
  authDomain: "estrahaapp-9e327.firebaseapp.com",
  projectId: "estrahaapp-9e327",
  storageBucket: "estrahaapp-9e327.appspot.com",
  messagingSenderId: "198308357962",
  appId: "1:198308357962:web:63b5b267e738efd54a83b3"
});

const messaging = firebase.messaging();

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
