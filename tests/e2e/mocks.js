const ADMIN_UID = 'g0qsFSAGg1dKy10Nnen8Djk6NB53';

const firebaseModules = {
  'firebase-app.js': `
    const apps = [];
    export function initializeApp(config) {
      globalThis.__estrahaFirebaseConfig = config;
      const app = { config, name: '[DEFAULT]' };
      apps[0] = app;
      return app;
    }
    export function getApps() { return apps; }
    export function getApp() { return apps[0] || initializeApp(globalThis.__estrahaFirebaseConfig || {}); }
  `,
  'firebase-app-check.js': `
    export class ReCaptchaEnterpriseProvider {
      constructor(siteKey) { this.siteKey = siteKey; }
    }
    export function initializeAppCheck(app, options) {
      globalThis.__estrahaAppCheckOptions = { app, options };
      return { app, options };
    }
  `,
  'firebase-auth.js': `
    const adminUid = '${ADMIN_UID}';
    let signedInUser = null;
    function currentUser() {
      if (signedInUser) return signedInUser;
      const params = new URLSearchParams(location.search);
      if (params.get('e2eAdmin') === '1') return { uid: adminUid, phoneNumber: '+966500000000' };
      if (params.get('e2eAuth') === '1') return { uid: 'e2e-user', phoneNumber: '+966511111111' };
      return null;
    }
    function pendingNewUser() {
      const params = new URLSearchParams(location.search);
      return params.get('e2eNewUser') === '1' ? { uid: 'e2e-new-user', phoneNumber: '+966522222222' } : null;
    }
    export function getAuth() {
      const auth = { currentUser: currentUser(), languageCode: 'ar' };
      globalThis.__estrahaMockAuth = auth;
      return auth;
    }
    export class RecaptchaVerifier {
      constructor() {}
      render() { return Promise.resolve(1); }
      clear() {}
    }
    export function signInWithPhoneNumber() {
      return Promise.resolve({ verificationId: 'e2e-verification', confirm: () => Promise.resolve({ user: currentUser() || { uid: 'e2e-user' } }) });
    }
    export function signOut() {
      signedInUser = null;
      if (globalThis.__estrahaMockAuth) globalThis.__estrahaMockAuth.currentUser = null;
      return Promise.resolve();
    }
    export function onAuthStateChanged(auth, callback) {
      setTimeout(() => callback(currentUser()), 0);
      return () => {};
    }
    export const PhoneAuthProvider = { credential: () => ({ providerId: 'phone' }) };
    export function signInWithCredential(auth) {
      signedInUser = pendingNewUser() || currentUser() || { uid: 'e2e-user', phoneNumber: '+966511111111' };
      if (auth) auth.currentUser = signedInUser;
      if (globalThis.__estrahaMockAuth) globalThis.__estrahaMockAuth.currentUser = signedInUser;
      return Promise.resolve({ user: signedInUser });
    }
  `,
  'firebase-firestore.js': `
    const adminUid = '${ADMIN_UID}';
    const now = { toDate: () => new Date('2026-06-26T18:35:00+03:00') };
    function snapshot(docs) {
      return { empty: docs.length === 0, docs, forEach: (cb) => docs.forEach(cb) };
    }
    function docSnap(id, data, exists = true) {
      return { id, exists: () => exists, data: () => data };
    }
    export function getFirestore() { return {}; }
    export function doc(...parts) { return { type: 'doc', path: parts.slice(1).join('/') }; }
    export function collection(_db, name) { return { type: 'collection', name }; }
    export function query(source) { return source; }
    export function orderBy() { return {}; }
    export function limit() { return {}; }
    export function serverTimestamp() { return now; }
    export function setDoc() { return Promise.resolve(); }
    export function addDoc() { return Promise.resolve({ id: 'e2e-doc' }); }
    export function updateDoc() { return Promise.resolve(); }
    export function deleteDoc() { return Promise.resolve(); }
    export function getDoc(ref) {
      if (ref.path === 'settings/app') {
        return Promise.resolve(docSnap('app', {
          siteName: 'تطبيق الاستراحة',
          siteDescription: 'إدارة خدمات الاستراحة والقطة والمباريات',
          showWeather: true,
          showPrayer: true,
          showMatches: true,
          showNews: true,
          showChat: true,
          chatEnabled: true,
          paymentEnabled: true,
          qattahAmount: 100
        }));
      }
      if (ref.path && ref.path.startsWith('users/')) {
        const uid = ref.path.split('/')[1];
        const params = new URLSearchParams(location.search);
        if (params.get('e2eNewUser') === '1' && uid === 'e2e-new-user') {
          return Promise.resolve(docSnap(uid, {}, false));
        }
        return Promise.resolve(docSnap(uid, {
          uid,
          name: uid === adminUid ? 'مشرف الاختبار' : 'عضو الاختبار',
          phone: '0500000000',
          paymentStatus: 'paid',
          createdAt: now
        }));
      }
      return Promise.resolve(docSnap('missing', {}, false));
    }
    export function getDocs(source) {
      const name = source?.name || '';
      if (name === 'users') {
        return Promise.resolve(snapshot([
          docSnap('e2e-user', { name: 'عضو الاختبار', paymentStatus: 'paid', createdAt: now }),
          docSnap(adminUid, { name: 'مشرف الاختبار', paymentStatus: 'late', createdAt: now })
        ]));
      }
      if (name === 'payments') {
        return Promise.resolve(snapshot([
          docSnap('payment-1', { amount: 100, userName: 'عضو الاختبار', createdAt: now })
        ]));
      }
      if (name === 'chat') {
        return Promise.resolve(snapshot([
          docSnap('chat-1', { text: 'رسالة اختبار', userName: 'عضو الاختبار', userId: 'e2e-user', createdAt: now })
        ]));
      }
      return Promise.resolve(snapshot([]));
    }
    export function onSnapshot(source, callback) {
      getDocs(source).then(callback);
      return () => {};
    }
  `,
  'firebase-messaging.js': `
    export function getMessaging() { return {}; }
    export function getToken() { return Promise.resolve('e2e-fcm-token'); }
    export function onMessage() { return () => {}; }
    export function isSupported() { return Promise.resolve(false); }
  `,
  'firebase-functions.js': `
    export function getFunctions() { return {}; }
    export function httpsCallable(_functions, name) {
      return async (payload) => ({ data: { ok: true, name, payload, targetedTokens: 1, successCount: 1, failureCount: 0, deletedTokenCount: 0 } });
    }
  `,
  'firebase-storage.js': `
    export function getStorage() { return {}; }
    export function ref() { return {}; }
    export function uploadBytes() { return Promise.resolve(); }
    export function getDownloadURL() { return Promise.resolve('/assets/images/estraha-logo.svg'); }
  `
};

const newsPayload = {
  ok: true,
  articles: [
    {
      title: 'خبر كروي تجريبي بصورة واضحة',
      url: 'https://example.com/news-1',
      image: 'https://example.com/news-1.jpg'
    },
    {
      title: 'نتائج مباريات اليوم',
      url: 'https://example.com/news-2',
      image: 'https://example.com/news-2.jpg'
    },
    {
      title: 'استعدادات المنتخب للبطولة',
      url: 'https://example.com/news-3',
      image: 'https://example.com/news-3.jpg'
    }
  ]
};

function futureDate(daysFromNow = 7) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { year, month, day };
}

function futureDateKey(daysFromNow = 7) {
  const { year, month, day } = futureDate(daysFromNow);
  return `${year}-${month}-${day}`;
}

function futureWorldCupDate(daysFromNow = 7, time = '18:30') {
  const { year, month, day } = futureDate(daysFromNow);
  return `${month}/${day}/${year} ${time}`;
}

const matchPayload = {
  events: [
    {
      idEvent: 'match-1',
      strHomeTeam: 'الهلال',
      strAwayTeam: 'النصر',
      dateEvent: futureDateKey(),
      strTime: '18:30:00',
      strStatus: 'Not Started',
      strHomeTeamBadge: '',
      strAwayTeamBadge: ''
    }
  ]
};

async function installAppMocks(page) {
  const errors = [];
  const badResponses = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('ERR_INTERNET_DISCONNECTED')) return;
    errors.push(text);
  });

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  page.on('response', (response) => {
    const status = response.status();
    if (status === 404) badResponses.push(response.url());
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          success({
            coords: {
              latitude: 24.7136,
              longitude: 46.6753,
              accuracy: 10
            }
          });
        },
        watchPosition(success) {
          success({
            coords: {
              latitude: 24.7136,
              longitude: 46.6753,
              accuracy: 10
            }
          });
          return 1;
        },
        clearWatch() {}
      }
    });
    Object.defineProperty(Notification, 'permission', { configurable: true, value: 'granted' });
    Notification.requestPermission = () => Promise.resolve('granted');
  });

  await page.route('https://unpkg.com/lucide@0.468.0/dist/umd/lucide.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.lucide = { createIcons() {} };'
  }));

  await page.route(/https:\/\/www\.gstatic\.com\/firebasejs\/11\.6\.1\/(.+)$/, (route) => {
    const file = route.request().url().split('/').pop();
    const body = firebaseModules[file];
    if (!body) return route.continue();
    return route.fulfill({ contentType: 'application/javascript', body });
  });

  await page.route(/\/\.netlify\/functions\/alarabiya-news(?:-v2|-v3)?/, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(newsPayload)
  }));

  await page.route(/https:\/\/www\.thesportsdb\.com\/api\/v1\/json\/3\/.+/, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(matchPayload)
  }));

  await page.route('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.matches.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([
      {
        id: 1,
        home_team_id: 1,
        away_team_id: 2,
        local_date: futureWorldCupDate(),
        finished: 'FALSE',
        time_elapsed: 'notstarted',
        group: 'A',
        matchday: 1
      }
    ])
  }));

  await page.route('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.teams.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([
      { id: 1, name_en: 'Saudi Arabia', iso2: 'sa' },
      { id: 2, name_en: 'Argentina', iso2: 'ar' }
    ])
  }));

  await page.route(/https:\/\/api\.aladhan\.com\/.+/, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        timings: {
          Fajr: '04:10',
          Sunrise: '05:35',
          Dhuhr: '12:15',
          Asr: '15:40',
          Maghrib: '18:55',
          Isha: '20:25'
        },
        date: { hijri: { day: '10', month: { ar: 'محرم' }, year: '1448' } }
      }
    })
  }));

  await page.route(/https:\/\/api\.open-meteo\.com\/.+/, (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ current: { temperature_2m: 33, weather_code: 0 } })
  }));

  await page.route(/https:\/\/example\.com\/.+\.(jpg|png|webp)/, (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#1f5a46"/></svg>'
  }));

  await page.route(/https:\/\/fonts\.googleapis\.com\/.+/, (route) => route.fulfill({
    contentType: 'text/css',
    body: ''
  }));

  await page.route(/https:\/\/fonts\.gstatic\.com\/.+/, (route) => route.fulfill({
    contentType: 'font/woff2',
    body: ''
  }));

  return {
    assertClean() {
      if (errors.length) {
        throw new Error(`Console/page errors:\n${errors.join('\n')}`);
      }
      if (badResponses.length) {
        throw new Error(`404 responses:\n${badResponses.join('\n')}`);
      }
    }
  };
}

module.exports = {
  installAppMocks
};
