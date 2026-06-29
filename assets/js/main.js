// استيراد الوظائف اللازمة من حزم Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    initializeAppCheck,
    ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";
import {
    getAuth,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    signOut,
    onAuthStateChanged,
    PhoneAuthProvider,
    signInWithCredential
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    addDoc,
    query,
    onSnapshot,
    serverTimestamp,
    updateDoc,
    deleteDoc,
    getDocs,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getMessaging,
    getToken,
    onMessage,
    isSupported as isMessagingSupported
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js";
import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// إعدادات Firebase الخاصة بتطبيقك
const firebaseConfig = {
  apiKey: "AIzaSyCoIy5Yf3nvkpbp9l43590snBZui86uSXY",
  authDomain: "estrahaapp-9e327.firebaseapp.com",
  projectId: "estrahaapp-9e327",
  storageBucket: "estrahaapp-9e327.firebasestorage.app",
  messagingSenderId: "198308357962",
  appId: "1:198308357962:web:63b5b267e738efd54a83b3"
};

const APP_ASSET_VERSION = '277';
const FCM_VAPID_KEY = 'BDv-0DqOy9KaOY4Om9wdNitW8ZB3ZDTqZn-vbOH2I7jWQL888yWFq1GGWXqR4GYHyTw_NWB_S4cx8HI7zrnp77U';


// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const appCheck = configureAppCheck(app);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'us-central1');
const storage = getStorage(app);
const ADMIN_UID = "g0qsFSAGg1dKy10Nnen8Djk6NB53"; //  <-- تم وضع معرف المستخدم الخاص بالمسؤول هنا

const DEFAULT_APP_SETTINGS = {
    siteName: 'تطبيق الاستراحة',
    siteDescription: 'إدارة خدمات الاستراحة والقطة والمباريات',
    homeAnnouncement: '',

    showWeather: true,
    showPrayer: true,
    showMatches: true,
    showNews: true,
    showChat: true,
    matchReminderMinutes: 5,

    chatEnabled: true,
    mutedUserIds: [],

    themePrimaryColor: '#78915a',
    themeBackgroundColor: '#f6f3ea',
    themeCardColor: '#ffffff',
    themeLogoUrl: '',
    themeBackgroundImageUrl: '',
    themeBackgroundImageEnabled: false,

    splashEnabled: true,
    splashType: 'logo',
    splashTitle: 'تطبيق الاستراحة',
    splashDuration: 0.45,
    splashImageUrl: '',
    splashVideoUrl: '',

    qattahAmount: 100,
    paymentEnabled: false,
    paymentReminderEnabled: false,
    paymentReminderDay: 1,
    paymentReminderHour: 9,
    paymentReminderMinute: 0,
    paymentReminderMode: 'lateOnly',

    stcPayNumber: '',
    applePayText: '',
    beneficiaryName: '',
    paymentQrUrl: '',

    prayerNotificationsEnabled: false,
    prayerCity: 'Jeddah',
    prayerCountry: 'Saudi Arabia',
    prayerReminderMinutes: 0
};

let appSettings = { ...DEFAULT_APP_SETTINGS };

function configureAppCheck(firebaseApp) {
    const runtimeConfig = window.ESTRAHA_APP_CONFIG || {};
    const siteKey = String(runtimeConfig.appCheckSiteKey || '').trim();

    if (!siteKey) {
        console.info('Firebase App Check is ready but disabled until FIREBASE_APPCHECK_SITE_KEY is configured.');
        return null;
    }

    const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    const debugToken = isLocalHost
        ? String(runtimeConfig.appCheckDebugToken || localStorage.getItem('estraha-app-check-debug-token') || '').trim()
        : '';

    if (isLocalHost && debugToken) {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
    }

    try {
        return initializeAppCheck(firebaseApp, {
            provider: new ReCaptchaEnterpriseProvider(siteKey),
            isTokenAutoRefreshEnabled: true
        });
    } catch (error) {
        console.warn('Firebase App Check initialization skipped:', error);
        return null;
    }
}



function applySplashSettings() {
    const splash = document.getElementById('splash');
    const splashCard = splash?.querySelector('.splash-card');
    if (!splash || !splashCard) return;

    if (appSettings.splashEnabled === false) {
        splash.hidden = true;
        return;
    }

    splash.hidden = false;
    const type = appSettings.splashType || 'logo';
    const title = appSettings.splashTitle || appSettings.siteName || 'تطبيق الاستراحة';
    const imageUrl = safeExternalUrl(appSettings.splashImageUrl || appSettings.themeLogoUrl || '', '');
    const videoUrl = safeExternalUrl(appSettings.splashVideoUrl || '', '');

    if (type === 'video' && videoUrl) {
        splashCard.innerHTML = `
            <video class="splash-media" src="${escapeHtml(videoUrl)}" autoplay muted playsinline preload="metadata"></video>
            <strong>${escapeHtml(title)}</strong>
        `;
    } else if (type === 'image' && imageUrl) {
        splashCard.innerHTML = `
            <img class="splash-logo splash-media" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" width="210" height="210" loading="eager" decoding="async" fetchpriority="high">
            <strong>${escapeHtml(title)}</strong>
        `;
    } else {
        const logoUrl = safeExternalUrl(appSettings.themeLogoUrl || '', '') || 'assets/icons/icon-512-original-zoom.png?v=277';
        splashCard.innerHTML = `
            <img class="splash-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(title)}" width="210" height="210" loading="eager" decoding="async" fetchpriority="high">
            <strong>${escapeHtml(title)}</strong>
        `;
    }
}

function applyCustomTheme() {
    const root = document.documentElement;

    const primary = appSettings.themePrimaryColor || '#78915a';
    const background = appSettings.themeBackgroundColor || '#f6f3ea';
    const card = appSettings.themeCardColor || '#ffffff';

    root.style.setProperty('--theme-primary', primary);
    root.style.setProperty('--theme-background', background);
    root.style.setProperty('--theme-card', card);

    root.style.setProperty('--theme-bg-color', background);

    document.querySelectorAll('.panel, .home-reference-card, .payment-summary-card, .list-item-card, .service-card, .stat-card').forEach((el) => {
        el.style.backgroundColor = card;
    });

    document.querySelectorAll('.btn').forEach((el) => {
        el.style.backgroundColor = primary;
    });

    const logoUrl = safeExternalUrl(appSettings.themeLogoUrl || '', '');
    if (logoUrl) {
        document.querySelectorAll('img[src*="estraha-logo"], #app-logo, .app-page-logo, .topbar-logo, .splash-logo, .home-title-logo').forEach((img) => {
            img.src = logoUrl;
        });
    }

    if (appSettings.themeBackgroundImageEnabled === true && appSettings.themeBackgroundImageUrl) {
        const bgUrl = safeExternalUrl(appSettings.themeBackgroundImageUrl, '');
        if (bgUrl) {
            document.documentElement.style.setProperty('--theme-bg-image', `url("${bgUrl}")`);
            document.body.classList.add('theme-custom-bg');
        }
    } else {
        document.body.classList.remove('theme-custom-bg');
        document.documentElement.style.removeProperty('--theme-bg-image');
    }
}

async function loadAppSettings() {
    try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'app'));
        if (settingsDoc.exists()) {
            appSettings = { ...DEFAULT_APP_SETTINGS, ...settingsDoc.data() };
        } else if (auth.currentUser?.uid === ADMIN_UID) {
            await setDoc(doc(db, 'settings', 'app'), DEFAULT_APP_SETTINGS, { merge: true });
            appSettings = { ...DEFAULT_APP_SETTINGS };
        }
    } catch (error) {
        console.warn('App settings unavailable, using defaults:', error);
        appSettings = { ...DEFAULT_APP_SETTINGS };
    }
    applySplashSettings();
    applyCustomTheme();
    return appSettings;
}

// --- عناصر واجهة المستخدم ---
const pageContent = document.getElementById('page-content');
const bottomNav = document.getElementById('bottom-nav');
const customAlert = document.getElementById('custom-alert');
const alertMessage = document.getElementById('alert-message');
const alertCloseBtn = document.getElementById('alert-close-btn');
const appLogo = document.getElementById('app-logo');
const pageTitle = document.getElementById('pageTitle');
const todayLabel = document.getElementById('todayLabel');
const onlineState = document.getElementById('onlineState');
const notifyBtn = document.getElementById('notifyBtn');
const notificationCount = document.querySelector('.notification-count');
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.querySelector('.sidebar');
const logoutButton = document.getElementById('logout-button');
const profileName = document.querySelector('.profile-copy strong');
const profileSince = document.querySelector('.profile-copy small');
const shellAvatar = document.getElementById('shell-avatar');
const topProfile = document.getElementById('top-profile');

// --- حالة التطبيق ---
let currentUser = null;
let unsubscribeChat, unsubscribeChatUsers, unsubscribeMembers, unsubscribePayments;
let chatMessagesCache = [];
let chatUsersCache = new Map();
let firebaseMessaging = null;
let firebaseMessagingReady = null;
let foregroundMessageUnsubscribe = null;

const MATCH_NOTIFICATION_TEMPLATES = [
    '⚽ لا تروح بعيد {{homeTeam}} ضد {{awayTeam}} قربت',
    '☕ جهزوا القهوة {{homeTeam}} ضد {{awayTeam}} بتبدا عقب شوي 😄'
];

const routeTitles = {
    '#login': 'أقلط',
    '#register': 'إنشاء حساب',
    '#home': 'الصفحة الرئيسية',
    '#members': 'الأعضاء',
    '#payments': 'القطة الشهرية',
    '#chat': 'الدردشة',
    '#settings': 'المزيد',
    '#profile-settings': 'بياناتك',
    '#notifications-settings': 'الإشعارات',
    '#admin-notifications': 'لوحة التحكم',
    '#prayer': 'مواقيت الصلاة',
    '#qibla': 'القبلة',
    '#matches': 'المباريات',
    '#news': 'الأخبار',
};

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function safeExternalUrl(value, fallback = '#') {
    if (!value) return fallback;

    try {
        const url = new URL(value, window.location.origin);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
        return fallback;
    }
}

function cleanupRealtimeListeners() {
    if (unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }
    if (unsubscribeChatUsers) {
        unsubscribeChatUsers();
        unsubscribeChatUsers = null;
    }
    if (unsubscribeMembers) {
        unsubscribeMembers();
        unsubscribeMembers = null;
    }
    if (unsubscribePayments) {
        unsubscribePayments();
        unsubscribePayments = null;
    }
}

// --- RecaptchaVerifier Manager ---
const recaptchaManager = {
    verifiers: new Map(), // Map<containerId, RecaptchaVerifier>

    getOrCreate(containerId) {
        // Check if verifier already exists and is valid
        if (this.verifiers.has(containerId)) {
            const verifier = this.verifiers.get(containerId);
            // Check if element still exists in DOM
            if (document.getElementById(containerId) && !verifier.destroyed) {
                console.log(`✓ Reusing existing RecaptchaVerifier for ${containerId}`);
                return verifier;
            } else {
                console.log(`✗ Removing dead RecaptchaVerifier for ${containerId}`);
                this.verifiers.delete(containerId);
            }
        }

        // Create new verifier
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`✗ Container ${containerId} not found in DOM`);
            return null;
        }

        try {
            console.log(`Creating new RecaptchaVerifier for ${containerId}...`);
            const verifier = new RecaptchaVerifier(auth, containerId, {
                'size': 'invisible',
                'callback': (response) => {
                    console.log('✓ reCAPTCHA verification successful');
                },
                'expired-callback': () => {
                    console.warn('⚠ reCAPTCHA expired');
                    this.verifiers.delete(containerId);
                },
                'error-callback': (error) => {
                    console.error('✗ reCAPTCHA error:', error);
                    this.verifiers.delete(containerId);
                }
            });

            this.verifiers.set(containerId, verifier);
            console.log(`✓ RecaptchaVerifier created successfully for ${containerId}`);
            return verifier;
        } catch (error) {
            console.error(`✗ Failed to create RecaptchaVerifier for ${containerId}:`, error);
            return null;
        }
    },

    destroy(containerId) {
        if (this.verifiers.has(containerId)) {
            try {
                const verifier = this.verifiers.get(containerId);
                if (verifier && !verifier.destroyed) {
                    verifier.clear();
                }
                this.verifiers.delete(containerId);
                console.log(`✓ Destroyed RecaptchaVerifier for ${containerId}`);
            } catch (error) {
                console.error(`Error destroying verifier for ${containerId}:`, error);
                this.verifiers.delete(containerId);
            }
        }
    },

    destroyAll() {
        for (const [containerId] of this.verifiers) {
            this.destroy(containerId);
        }
    }
};

// --- وظائف مساعدة ---
let alertReturnFocus = null;

function closeAlert() {
    if (!customAlert) return;

    const returnTarget = alertReturnFocus;
    alertReturnFocus = null;

    if (returnTarget instanceof HTMLElement && returnTarget.isConnected) {
        returnTarget.focus({ preventScroll: true });
    } else {
        alertCloseBtn?.blur();
    }

    customAlert.style.display = 'none';
    customAlert.setAttribute('aria-hidden', 'true');
    customAlert.setAttribute('inert', '');
}

function showAlert(message) {
    if (!customAlert || !alertMessage) return;

    alertReturnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    alertMessage.textContent = message;
    customAlert.removeAttribute('inert');
    customAlert.setAttribute('aria-hidden', 'false');
    customAlert.style.display = 'flex';
    window.requestAnimationFrame(() => alertCloseBtn?.focus({ preventScroll: true }));
}

alertCloseBtn?.addEventListener('click', closeAlert);
customAlert?.addEventListener('click', (event) => {
    if (event.target === customAlert) closeAlert();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && customAlert?.getAttribute('aria-hidden') === 'false') {
        closeAlert();
    }
});

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
    showAlert('تم نسخ الآيبان يا ذيب.');
    }).catch(err => {
        showAlert('ما ضبط النسخ، جرّب مرة ثانية.');
    });
}
window.copyToClipboard = copyToClipboard;

// --- إدارة الوضع الليلي ---
function applyTheme(theme) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', normalizedTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', normalizedTheme === 'dark' ? '#101413' : '#78915a');
    updateThemeButtons();
}

function toggleTheme() {
    const newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('al-istiraha-theme', newTheme);
    applyTheme(newTheme);
}

function loadTheme() {
    const savedTheme = localStorage.getItem('al-istiraha-theme') || 'dark';
    applyTheme(savedTheme);
}

function updateThemeButtons() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('[data-theme-toggle-icon]').forEach((icon) => {
        icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    });
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function setOnlineState() {
    if (!onlineState) return;
    onlineState.textContent = navigator.onLine ? 'متصل' : 'وضع عدم الاتصال';
}

function syncShellUserState() {
    if (bottomNav) bottomNav.classList.toggle('hidden', !currentUser);
    if (logoutButton) logoutButton.classList.toggle('hidden', !currentUser);
    if (profileName) profileName.textContent = currentUser?.name ? `أهلاً ${currentUser.name}` : '';
    if (profileSince) profileSince.textContent = currentUser ? 'من أعضاء الاستراحة' : '';
    const isAdmin = auth.currentUser?.uid === ADMIN_UID || currentUser?.uid === ADMIN_UID;
    if (shellAvatar) shellAvatar.src = currentUser?.avatarUrl || 'assets/icons/icon-192-original-zoom.png?v=277';
    document.querySelectorAll('[data-admin-only]').forEach((element) => {
        element.classList.toggle('hidden', !isAdmin);
    });
    updateNotificationBadge(0);
}

function updateNotificationBadge(count = 0) {
    if (!notificationCount) return;
    const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
    notificationCount.textContent = safeCount > 99 ? '99+' : String(safeCount);
    notificationCount.classList.toggle('hidden', safeCount <= 0);
    notificationCount.setAttribute('aria-hidden', safeCount <= 0 ? 'true' : 'false');
}

function waitForBrowserIdle(timeout = 1200) {
    return new Promise((resolve) => {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => resolve(), { timeout });
            return;
        }
        window.setTimeout(resolve, 250);
    });
}

async function initFirebaseMessaging() {
    if (firebaseMessagingReady) return firebaseMessagingReady;

    firebaseMessagingReady = (async () => {
        if (!('serviceWorker' in navigator)) {
            console.warn('Firebase Cloud Messaging skipped: service workers are not supported.');
            return null;
        }

        const supported = await isMessagingSupported().catch(() => false);
        if (!supported) {
            console.warn('Firebase Cloud Messaging skipped: this browser does not support FCM.');
            return null;
        }

        await waitForBrowserIdle();
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        firebaseMessaging = getMessaging(app);

        if (!foregroundMessageUnsubscribe) {
            foregroundMessageUnsubscribe = onMessage(firebaseMessaging, async (payload) => {
                console.log('Received foreground FCM message:', payload);
                const data = payload.data || {};
                const title = data.title || payload.notification?.title || 'تطبيق الاستراحة';
                const body = data.body || payload.notification?.body || '';
                if (Notification.permission === 'granted' && title) {
                    await registration.showNotification(title, {
                        body,
                        icon: '/assets/icons/icon-512.png',
                        badge: '/assets/icons/icon-192.png',
                        dir: 'rtl',
                        lang: 'ar',
                        tag: data.tag || data.dedupeKey || `estraha-foreground-${data.type || 'general'}`,
                        renotify: false,
                        timestamp: Date.now(),
                        data
                    });
                }
            });
        }

        return registration;
    })();

    return firebaseMessagingReady;
}

function getConfiguredVapidKey() {
    const key = localStorage.getItem('firebase-vapid-key') || FCM_VAPID_KEY;
    if (!key) {
        console.warn('Firebase Cloud Messaging token skipped: add the Firebase Web Push VAPID key.');
        return '';
    }
    return key;
}

function readPrayerLocationPreference() {
    try {
        const raw = localStorage.getItem('al-istiraha-prayer-location');
        if (!raw) return null;
        const value = JSON.parse(raw);
        const latitude = Number(value?.latitude);
        const longitude = Number(value?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return {
            latitude,
            longitude,
            timeZone: value.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh',
            savedAt: value.savedAt || new Date().toISOString()
        };
    } catch {
        return null;
    }
}

function requestCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('جهازك ما يدعم تحديد الموقع.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10 * 60 * 1000
        });
    });
}

async function savePrayerLocationFromDevice(button, statusElement) {
    const defaultText = button?.textContent || 'استخدام موقعي';
    if (button) {
        button.disabled = true;
        button.textContent = 'جاري تحديد الموقع...';
    }
    if (statusElement) statusElement.textContent = 'نحدد موقعك لحساب الأذان بدقة...';

    try {
        const position = await requestCurrentPosition();
        const preference = {
            latitude: Number(position.coords.latitude.toFixed(5)),
            longitude: Number(position.coords.longitude.toFixed(5)),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh',
            savedAt: new Date().toISOString()
        };
        localStorage.setItem('al-istiraha-prayer-location', JSON.stringify(preference));
        if (Notification.permission === 'granted') await syncFcmTokenWithPreferences();
        if (statusElement) statusElement.textContent = 'تم ربط تنبيه الصلاة بموقع هذا الجهاز.';
        showAlert('تم ضبط تنبيه الصلاة حسب موقعك الحالي.');
    } catch (error) {
        const message = error?.code === 1
            ? 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح.'
            : error?.message || 'تعذر تحديد الموقع.';
        if (statusElement) statusElement.textContent = message;
        showAlert(message);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = defaultText;
        }
    }
}

async function syncFcmTokenWithPreferences() {
    if (!currentUser) throw new Error('لازم تقلط أول.');
    if (!('Notification' in window)) throw new Error('المتصفح لا يدعم الإشعارات.');
    if (Notification.permission !== 'granted') throw new Error('لم يتم منح صلاحية الإشعارات.');

    const vapidKey = getConfiguredVapidKey();
    if (!vapidKey) throw new Error('مفتاح إشعارات المتصفح غير مضبوط.');

    try {
        const serviceWorkerRegistration = await initFirebaseMessaging();
        if (!firebaseMessaging || !serviceWorkerRegistration) throw new Error('تعذر تسجيل خدمة الإشعارات.');

        const token = await getToken(firebaseMessaging, {
            vapidKey,
            serviceWorkerRegistration
        });

        if (!token) {
            throw new Error('تعذر إنشاء FCM Token.');
        }

        const result = await saveFcmToken(token);
        const syncedAt = new Date().toISOString();
        localStorage.setItem('al-istiraha-notification-last-sync', syncedAt);
        updateNotificationPermissionStatus();
        return { ...result, syncedAt };
    } catch (error) {
        console.warn('Firebase Cloud Messaging token sync failed:', error);
        updateNotificationPermissionStatus(error.message || 'تعذرت مزامنة الإشعارات.');
        throw error;
    }
}

async function saveFcmToken(token) {
    const tokenId = btoa(token).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const prayerLocation = readPrayerLocationPreference();
    const payload = {
        token,
        uid: currentUser.uid,
        topics: {
            payments: localStorage.getItem('al-istiraha-payment-notification') !== 'false',
            prayer: localStorage.getItem('al-istiraha-prayer-notification') === 'true',
            matches: localStorage.getItem('al-istiraha-matches-notification') === 'true',
            chat: localStorage.getItem('al-istiraha-chat-notification') !== 'false'
        },
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp()
    };
    if (prayerLocation) payload.prayerLocation = prayerLocation;

    await setDoc(doc(db, 'fcmTokens', tokenId), payload, { merge: true });
    return { tokenId };
}

menuBtn?.addEventListener('click', () => {
    if (!currentUser) return;
    window.location.hash = '#settings';
});
logoutButton?.addEventListener('click', handleLogout);
notifyBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!currentUser) return;
    window.location.hash = '#notifications-settings';

    if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (error) { console.warn('Notification permission failed:', error); }
    }
});

topProfile?.addEventListener('click', (event) => {
    if (event.target.closest('#notifyBtn')) return;
    if (!currentUser) return;
    window.location.hash = '#profile-settings';
});

topProfile?.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && currentUser) {
        event.preventDefault();
        window.location.hash = '#profile-settings';
    }
});
window.addEventListener('online', setOnlineState);
window.addEventListener('offline', setOnlineState);

// --- نظام التنقل (Router) ---
const routes = {
    '#login': 'login.html',
    '#register': 'register.html',
    '#home': 'home.html',
    '#members': 'members.html',
    '#payments': 'payments.html',
    '#chat': 'chat.html',
    '#settings': 'settings.html',
    '#profile-settings': 'profile-settings.html',
    '#notifications-settings': 'notifications-settings.html',
    '#admin-notifications': 'admin-notifications.html',
    '#prayer': 'prayer.html',
    '#qibla': 'qibla.html',
    '#matches': 'matches.html',
    '#news': 'news.html',
};

const publicRoutes = ['#login', '#register'];

function normalizeHash(hash) {
    return hash && hash.startsWith('#') ? hash : `#${hash || ''}`;
}

function currentPublicRoute() {
    const hash = normalizeHash(window.location.hash);
    return publicRoutes.includes(hash) ? hash : '#login';
}

async function navigateToHash(hash) {
    const nextHash = normalizeHash(hash);
    if (window.location.hash === nextHash) {
        await renderPage(nextHash);
        return;
    }

    window.location.hash = nextHash;
}

function updateActiveNav(hash) {
    const activeHash = getPrimaryNavHash(hash);
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === activeHash) {
            link.classList.add('active');
        }
    });

    if (pageTitle) pageTitle.textContent = routeTitles[hash] || 'تطبيق الاستراحة';
    if (todayLabel) {
        todayLabel.textContent = new Intl.DateTimeFormat('ar-SA', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(new Date());
    }
}

function getPrimaryNavHash(hash) {
    if (['#home', '#chat', '#matches', '#payments'].includes(hash)) return hash;
    return '#settings';
}

async function renderPage(hash) {
    const defaultPage = currentUser ? '#home' : '#login';
    const requestedHash = normalizeHash(hash || defaultPage);
    const isPublicRoute = publicRoutes.includes(requestedHash);
    const currentHash = currentUser && isPublicRoute
        ? '#home'
        : routes[requestedHash] && (currentUser || isPublicRoute) ? requestedHash : defaultPage;

    if (currentHash === '#admin-notifications' && (auth.currentUser?.uid !== ADMIN_UID && currentUser?.uid !== ADMIN_UID)) {
        showAlert('هذه الصفحة للمسؤول فقط.');
        await navigateToHash('#settings');
        return;
    }

    const pageFile = routes[currentHash];

    if (pageFile) {
        try {
            const response = await fetch(`pages/${pageFile}?v=${APP_ASSET_VERSION}`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Page fetch failed with status ${response.status}`);
            }
            const pageHtml = await response.text();
            pageContent.innerHTML = pageHtml;

            // Create lucide icons with retry logic
            const safeCreateIcons = () => {
                if (typeof lucide !== 'undefined' && lucide.createIcons) {
                    try {
                        lucide.createIcons();
                    } catch (error) {
                        console.warn('Error creating lucide icons:', error);
                        setTimeout(safeCreateIcons, 100);
                    }
                } else {
                    setTimeout(safeCreateIcons, 100);
                }
            };
            safeCreateIcons();
            syncShellUserState();

            attachEventListeners(currentHash);
            // Normalize page ID for loadPageData
            const normalizedPageId = currentHash.substring(1).replace('#', '');
            loadPageData(normalizedPageId);
            updateActiveNav(currentHash);
            sidebar?.classList.remove('open');
        } catch (error) {
            const isTransientFetchError = error instanceof TypeError && /Failed to fetch/i.test(error.message || '');
            if (isTransientFetchError) {
                console.warn('Page fetch was interrupted while navigating:', error.message);
                return;
            }
            console.error('Error fetching page:', error);
            pageContent.innerHTML = '<p class="text-center">عفواً، الصفحة غير موجودة.</p>';
        }
    } else {
        // Fallback to default page
        await navigateToHash(defaultPage);
    }
}

function attachEventListeners(hash) {
    const pageId = hash.substring(1); // remove '#'

    if (pageId === 'login') {
        console.log('Setting up login page event listeners');

        // Clean up old verifier if switching pages
        recaptchaManager.destroy('recaptcha-container');

        const phoneForm = document.getElementById('phone-form');
        const codeForm = document.getElementById('code-form');
        if (phoneForm) phoneForm.addEventListener('submit', handleSendCode);
        if (codeForm) codeForm.addEventListener('submit', handleVerifyCode);

        // Setup recaptcha with validation
        const recaptchaSetupSuccess = setupRecaptcha('recaptcha-container');
        if (!recaptchaSetupSuccess) {
            console.error('Failed to set up reCAPTCHA on login page');
        }
    }

    if (pageId === 'register') {
        console.log('Setting up register page event listeners');

        const registerForm = document.getElementById('register-form');
        if (registerForm) registerForm.addEventListener('submit', handleCompleteRegistration);
    }

    if (pageId === 'settings') {
        const logoutBtn = document.getElementById('settings-logout-button');
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.checked = (localStorage.getItem('al-istiraha-theme') === 'dark');
            themeToggle.addEventListener('change', toggleTheme);
        }
        setupThemeChoices();
    }

    if (pageId === 'chat') {
        const chatForm = document.getElementById('chat-form');
        if (chatForm) chatForm.addEventListener('submit', handleSendMessage);
    }

    if (pageId === 'members') {
        setupManualMemberForm();
    }

    if (pageId === 'home') {
        const homeThemeToggle = document.getElementById('home-theme-toggle');
        const homeThemeIcon = homeThemeToggle?.querySelector('i');
        if (homeThemeIcon) homeThemeIcon.setAttribute('data-theme-toggle-icon', '');
        if (homeThemeToggle) homeThemeToggle.addEventListener('click', toggleTheme);
        updateThemeButtons();
    }

    if (pageId === 'profile-settings') {
        setupProfileEditor();
    }

    if (pageId === 'payments') {
        const copyIbanButton = document.getElementById('copy-iban-button');
        if (copyIbanButton) {
            copyIbanButton.addEventListener('click', () => copyToClipboard('SA00 1234 5678 9012 3456 7890'));
        }
    }

    if (pageId === 'notifications-settings') {
        setupNotificationToggles();
    }

    if (pageId === 'admin-notifications') {
        setupAdminNotifications();
    }
}

function setupThemeChoices() {
    const currentTheme = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
        const theme = button.dataset.themeChoice === 'dark' ? 'dark' : 'light';
        button.classList.toggle('active', theme === currentTheme);
        button.addEventListener('click', () => {
            localStorage.setItem('al-istiraha-theme', theme);
            applyTheme(theme);
            setupThemeChoices();
        }, { once: true });
    });
}

function setupProfileEditor() {
    if (!currentUser) return;

    const form = document.getElementById('profile-form');
    const nameInput = document.getElementById('profile-name-input');
    const phoneInput = document.getElementById('profile-phone-input');
    const avatarInput = document.getElementById('profile-avatar-input');
    const avatarPreview = document.getElementById('profile-avatar-preview');
    const status = document.getElementById('profile-save-status');
    const saveNameBtn = document.getElementById('profile-save-name-btn');

    if (nameInput) nameInput.value = currentUser.name || '';

    if (auth.currentUser?.uid === ADMIN_UID || currentUser?.uid === ADMIN_UID) {
        if (nameInput) nameInput.removeAttribute('readonly');
        if (saveNameBtn) saveNameBtn.classList.remove('hidden');
    }

    saveNameBtn?.addEventListener('click', async () => {
        const newName = nameInput?.value.trim();
        if (!newName) {
            showAlert('اكتب الاسم أولاً.');
            return;
        }

        try {
            await updateDoc(doc(db, "users", currentUser.uid), { name: newName });
            currentUser = { ...currentUser, name: newName };
            syncShellUserState();
            if (status) status.textContent = 'تم حفظ الاسم بنجاح.';
        } catch (error) {
            console.error('Profile name update failed:', error);
            showAlert('فشل حفظ الاسم.');
        }
    });
    if (phoneInput) phoneInput.value = currentUser.phone || '';
    if (avatarPreview) avatarPreview.src = currentUser.avatarUrl || 'assets/images/estraha-logo.svg';

    avatarInput?.addEventListener('change', async () => {
        const file = avatarInput.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showAlert('اختر صورة صحيحة يا ذيب.');
            return;
        }

        try {
            if (status) status.textContent = 'نجهز الصورة...';
            const avatarUrl = await resizeImageToDataUrl(file, 360);
            await updateDoc(doc(db, "users", currentUser.uid), { avatarUrl });
            currentUser = { ...currentUser, avatarUrl };
            if (avatarPreview) avatarPreview.src = avatarUrl;
            syncShellUserState();
            if (status) status.textContent = 'تم تحديث الصورة.';
        } catch (error) {
            console.error('Avatar update failed:', error);
            if (status) status.textContent = '';
            showAlert('ما قدرنا نحدث الصورة. جرّب صورة أخف.');
        }
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        showAlert('الاسم ورقم الجوال يديرها المسؤول فقط.');
    });
}

function resizeImageToDataUrl(file, maxSize = 360) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const image = new Image();
            image.onerror = reject;
            image.onload = () => {
                const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.78));
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function setupNotificationToggles() {
    updateNotificationPermissionStatus();

    const registerDeviceButton = document.getElementById('register-notification-device');
    const resyncButton = document.getElementById('resync-notifications');
    const prayerLocationButton = document.getElementById('save-prayer-location');
    const prayerLocationStatus = document.getElementById('prayer-location-status');
    const savedPrayerLocation = readPrayerLocationPreference();
    if (prayerLocationStatus) {
        prayerLocationStatus.textContent = savedPrayerLocation
            ? 'تنبيه الصلاة مربوط بموقع هذا الجهاز.'
            : 'استخدم موقعك لضبط الأذان حسب منطقتك.';
    }
    if (prayerLocationButton && prayerLocationButton.dataset.bound !== 'true') {
        prayerLocationButton.dataset.bound = 'true';
        prayerLocationButton.addEventListener('click', () => savePrayerLocationFromDevice(prayerLocationButton, prayerLocationStatus));
    }

    if (registerDeviceButton && registerDeviceButton.dataset.bound !== 'true') {
        registerDeviceButton.dataset.bound = 'true';
        registerDeviceButton.addEventListener('click', async () => {
            await handleNotificationRegistrationAction(registerDeviceButton);
        });
    }

    if (resyncButton && resyncButton.dataset.bound !== 'true') {
        resyncButton.dataset.bound = 'true';
        resyncButton.addEventListener('click', async () => {
            await handleNotificationRegistrationAction(resyncButton, true);
        });
    }

    document.querySelectorAll('[data-notification-toggle]').forEach((button) => {
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';

        const key = `al-istiraha-${button.dataset.notificationToggle}`;
        const savedValue = localStorage.getItem(key);
        const enabled = savedValue === null
            ? button.getAttribute('aria-pressed') === 'true'
            : savedValue === 'true';

        setNotificationToggleState(button, enabled);

        button.addEventListener('click', async () => {
            const previousEnabled = button.getAttribute('aria-pressed') === 'true';
            const previousStoredValue = localStorage.getItem(key);
            const nextValue = !previousEnabled;

            button.disabled = true;

            try {
                /*
                 * نحفظ القيمة مؤقتًا لكي يقرأها saveFcmToken،
                 * لكن لا نغيّر شكل الزر إلا بعد نجاح المزامنة.
                 */
                localStorage.setItem(key, String(nextValue));

                if (nextValue) {
                    if (!('Notification' in window)) {
                        throw new Error('المتصفح لا يدعم الإشعارات.');
                    }

                    const permission = Notification.permission === 'default'
                        ? await Notification.requestPermission()
                        : Notification.permission;

                    if (permission !== 'granted') {
                        throw new Error(
                            permission === 'denied'
                                ? 'تم رفض صلاحية الإشعارات من المتصفح.'
                                : 'لم يتم منح صلاحية الإشعارات.'
                        );
                    }

                    await syncFcmTokenWithPreferences();
                } else if (
                    'Notification' in window &&
                    Notification.permission === 'granted'
                ) {
                    await syncFcmTokenWithPreferences();
                }

                setNotificationToggleState(button, nextValue);
                updateNotificationPermissionStatus();

                showAlert(
                    nextValue
                        ? 'تم تفعيل هذا التنبيه ومزامنة الجهاز.'
                        : 'تم إيقاف هذا التنبيه ومزامنة الجهاز.'
                );
            } catch (error) {
                if (previousStoredValue === null) {
                    localStorage.removeItem(key);
                } else {
                    localStorage.setItem(key, previousStoredValue);
                }

                setNotificationToggleState(button, previousEnabled);
                updateNotificationPermissionStatus(
                    error.message || 'تعذرت مزامنة الإشعارات.'
                );
                showAlert(error.message || 'تعذرت مزامنة الإشعارات.');
            } finally {
                button.disabled = false;
            }
        });
    });
}

async function requestBrowserNotificationPermission() {
    if (!('Notification' in window)) {
        updateNotificationPermissionStatus('المتصفح لا يدعم الإشعارات.');
        showAlert('المتصفح لا يدعم الإشعارات.');
        return null;
    }
    try {
        const permission = Notification.permission === 'default'
            ? await Notification.requestPermission()
            : Notification.permission;
        if (permission === 'granted') {
            await syncFcmTokenWithPreferences();
            showAlert('تم تفعيل الإشعارات.');
        } else if (permission === 'denied') {
            updateNotificationPermissionStatus('تم رفض صلاحية الإشعارات.');
            showAlert('تم رفض صلاحية الإشعارات من المتصفح.');
        } else {
            updateNotificationPermissionStatus('لم يتم طلب صلاحية الإشعارات.');
            showAlert('لم يتم تفعيل الإشعارات بعد.');
        }
        return permission;
    } catch (error) {
        console.warn('Notification permission request failed:', error);
        updateNotificationPermissionStatus(error.message || 'تعذر طلب صلاحية الإشعارات.');
        throw error;
    }
}

async function handleNotificationRegistrationAction(button, forceSync = false) {
    const defaultText = button.textContent;
    button.disabled = true;
    button.textContent = forceSync ? 'جاري إعادة المزامنة...' : 'جاري تسجيل الجهاز...';

    try {
        if (!('Notification' in window)) {
            throw new Error('المتصفح لا يدعم الإشعارات.');
        }

        if (Notification.permission === 'default') {
            await requestBrowserNotificationPermission();
        } else if (Notification.permission === 'denied') {
            throw new Error('تم رفض صلاحية الإشعارات.');
        } else {
            await syncFcmTokenWithPreferences();
            showAlert(forceSync ? 'تمت إعادة مزامنة الإشعارات.' : 'تم تسجيل هذا الجهاز للإشعارات.');
        }
    } catch (error) {
        showAlert(error.message || 'تعذرت مزامنة الإشعارات.');
    } finally {
        button.disabled = false;
        button.textContent = defaultText;
        updateNotificationPermissionStatus();
    }
}

function updateNotificationPermissionStatus(extraMessage = '') {
    const permissionStatus = document.getElementById('notification-permission-status');
    const syncStatus = document.getElementById('notification-sync-status');
    if (!permissionStatus && !syncStatus) return;

    let statusText = 'غير مدعوم';
    if ('Notification' in window) {
        statusText = Notification.permission === 'granted'
            ? 'مفعّل'
            : Notification.permission === 'denied'
                ? 'مرفوض'
                : 'لم يُطلب';
    }

    if (permissionStatus) permissionStatus.textContent = statusText;

    const lastSync = localStorage.getItem('al-istiraha-notification-last-sync');
    if (syncStatus) {
        const lastSyncText = lastSync
            ? `آخر مزامنة: ${new Date(lastSync).toLocaleString('ar-SA')}`
            : 'لم تتم مزامنة هذا الجهاز بعد.';
        syncStatus.textContent = extraMessage || lastSyncText;
    }
}

async function loadAdminStats() {
    const membersCount = document.getElementById('admin-members-count');
    const paidCount = document.getElementById('admin-paid-count');
    const lateCount = document.getElementById('admin-late-count');

    if (!membersCount && !paidCount && !lateCount) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        const total = snapshot.size;
        let paid = 0;

        snapshot.forEach((item) => {
            const user = item.data();
            if (user.paymentStatus === 'paid') paid += 1;
        });

        const late = Math.max(total - paid, 0);

        if (membersCount) membersCount.textContent = String(total);
        if (paidCount) paidCount.textContent = String(paid);
        if (lateCount) lateCount.textContent = String(late);
    } catch (error) {
        console.error('Admin stats load failed:', error);
        if (membersCount) membersCount.textContent = '--';
        if (paidCount) paidCount.textContent = '--';
        if (lateCount) lateCount.textContent = '--';
    }
}

async function setupAdminNotifications() {
    if ((auth.currentUser?.uid !== ADMIN_UID && currentUser?.uid !== ADMIN_UID)) {
        showAlert('هذه الصفحة للمسؤول فقط.');
        await navigateToHash('#settings');
        return;
    }

    await loadAppSettings();
    loadAdminStats();

    const adminPage = document.querySelector('.admin-notifications-page');
    const tabList = adminPage?.querySelector('.admin-tabs');
    const tabButtons = adminPage ? adminPage.querySelectorAll('[data-admin-tab-target]') : [];
    const tabSections = adminPage ? adminPage.querySelectorAll('[data-admin-tab]') : [];

    const activateAdminTab = (targetTab = 'general') => {
        tabButtons.forEach((button) => {
            const isActive = button.dataset.adminTabTarget === targetTab;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', String(isActive));
            button.setAttribute('tabindex', isActive ? '0' : '-1');
            if (isActive) {
                button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        });

        tabSections.forEach((section) => {
            const isActive = section.dataset.adminTab === targetTab;
            const isDeferredReport = section.id === 'admin-notification-report'
                && section.dataset.reportReady !== 'true';
            const shouldShow = isActive && !isDeferredReport;
            section.hidden = !shouldShow;
            section.setAttribute('aria-hidden', String(!shouldShow));
        });
    };

    if (tabList && !tabList.dataset.adminTabsBound) {
        tabList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-admin-tab-target]');
            if (!button || !tabList.contains(button)) return;

            activateAdminTab(button.dataset.adminTabTarget || 'general');
            button.focus();
        });
        tabList.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

            const buttons = Array.from(tabButtons);
            const currentIndex = buttons.indexOf(document.activeElement);
            if (currentIndex === -1) return;

            event.preventDefault();
            const lastIndex = buttons.length - 1;
            // RTL visual order places the first tab on the right, so ArrowRight moves to the previous DOM tab.
            const nextIndex = event.key === 'Home'
                ? 0
                : event.key === 'End'
                    ? lastIndex
                    : event.key === 'ArrowLeft'
                        ? (currentIndex + 1) % buttons.length
                        : (currentIndex - 1 + buttons.length) % buttons.length;
            const nextButton = buttons[nextIndex];
            nextButton.focus();
            activateAdminTab(nextButton.dataset.adminTabTarget || 'general');
        });
        tabList.dataset.adminTabsBound = 'true';
    }

    activateAdminTab('general');

    const report = document.getElementById('admin-notification-report');
    const targetCount = document.getElementById('notification-target-count');
    const successCount = document.getElementById('notification-success-count');
    const failureCount = document.getElementById('notification-failure-count');
    const deletedTokenCount = document.getElementById('notification-deleted-token-count');
    const status = document.getElementById('admin-notification-status');
    const broadcastForm = document.getElementById('admin-broadcast-form');
    const titleInput = document.getElementById('broadcast-title');
    const messageInput = document.getElementById('broadcast-message');

    const appSettingsForm = document.getElementById('admin-app-settings-form');
    const siteNameInput = document.getElementById('admin-site-name');
    const siteDescriptionInput = document.getElementById('admin-site-description');
    const homeAnnouncementInput = document.getElementById('admin-home-announcement');
    const appSettingsStatus = document.getElementById('admin-app-settings-status');

    const paymentSettingsForm = document.getElementById('admin-payment-settings-form');
    const qattahAmountInput = document.getElementById('admin-qattah-amount');
    const beneficiaryNameInput = document.getElementById('admin-beneficiary-name');
    const stcPayNumberInput = document.getElementById('admin-stc-pay-number');
    const applePayTextInput = document.getElementById('admin-apple-pay-text');
    const paymentQrUrlInput = document.getElementById('admin-payment-qr-url');
    const paymentEnabledInput = document.getElementById('admin-payment-enabled');
    const paymentReminderEnabledInput = document.getElementById('admin-payment-reminder-enabled');
    const paymentReminderDayInput = document.getElementById('admin-payment-reminder-day');
    const paymentReminderHourInput = document.getElementById('admin-payment-reminder-hour');
    const paymentReminderMinuteInput = document.getElementById('admin-payment-reminder-minute');
    const paymentReminderModeInput = document.getElementById('admin-payment-reminder-mode');
    const paymentSettingsStatus = document.getElementById('admin-payment-settings-status');

    const prayerNotificationSettingsForm = document.getElementById('admin-prayer-notification-settings-form');
    const prayerNotificationsEnabledInput = document.getElementById('admin-prayer-notifications-enabled');
    const prayerCityInput = document.getElementById('admin-prayer-city');
    const prayerCountryInput = document.getElementById('admin-prayer-country');
    const prayerReminderMinutesInput = document.getElementById('admin-prayer-reminder-minutes');
    const matchReminderMinutesInput = document.getElementById('admin-match-reminder-minutes');
    const prayerNotificationSettingsStatus = document.getElementById('admin-prayer-notification-settings-status');

    const homeSectionsForm = document.getElementById('admin-home-sections-form');
    const showWeatherInput = document.getElementById('admin-show-weather');
    const showPrayerInput = document.getElementById('admin-show-prayer');
    const showMatchesInput = document.getElementById('admin-show-matches');
    const showNewsInput = document.getElementById('admin-show-news');
    const showChatInput = document.getElementById('admin-show-chat');
    const homeSectionsStatus = document.getElementById('admin-home-sections-status');

    const chatSettingsForm = document.getElementById('admin-chat-settings-form');
    const chatEnabledInput = document.getElementById('admin-chat-enabled');
    const chatSettingsStatus = document.getElementById('admin-chat-settings-status');

    const splashSettingsForm = document.getElementById('admin-splash-settings-form');
    const splashEnabledInput = document.getElementById('admin-splash-enabled');
    const splashTypeInput = document.getElementById('admin-splash-type');
    const splashTitleInput = document.getElementById('admin-splash-title');
    const splashDurationInput = document.getElementById('admin-splash-duration');
    const splashImageFileInput = document.getElementById('admin-splash-image-file');
    const splashImageUrlInput = document.getElementById('admin-splash-image-url');
    const splashVideoFileInput = document.getElementById('admin-splash-video-file');
    const splashVideoUrlInput = document.getElementById('admin-splash-video-url');
    const splashSettingsStatus = document.getElementById('admin-splash-settings-status');

    if (splashEnabledInput) splashEnabledInput.checked = appSettings.splashEnabled !== false;
    if (splashTypeInput) splashTypeInput.value = appSettings.splashType || 'logo';
    if (splashTitleInput) splashTitleInput.value = appSettings.splashTitle || appSettings.siteName || 'تطبيق الاستراحة';
    if (splashDurationInput) splashDurationInput.value = appSettings.splashDuration || 6;
    if (splashImageUrlInput) splashImageUrlInput.value = appSettings.splashImageUrl || '';
    if (splashVideoUrlInput) splashVideoUrlInput.value = appSettings.splashVideoUrl || '';

    const bindAdminListenerOnce = (element, key, eventName, handler) => {
        if (!element || element.dataset[key] === 'true') return;
        element.dataset[key] = 'true';
        element.addEventListener(eventName, handler);
    };

    async function uploadSplashFile(file, folder) {
        const fileRef = storageRef(storage, `${folder}/${Date.now()}-${file.name}`);
        await uploadBytes(fileRef, file);
        return await getDownloadURL(fileRef);
    }

    bindAdminListenerOnce(splashImageFileInput, 'adminSplashImageUploadBound', 'change', async () => {
        const file = splashImageFileInput.files?.[0];
        if (!file) return;
        try {
            if (splashSettingsStatus) splashSettingsStatus.textContent = 'جاري رفع صورة السبلاش...';
            const url = await uploadSplashFile(file, 'splash-images');
            if (splashImageUrlInput) splashImageUrlInput.value = url;
            if (splashTypeInput) splashTypeInput.value = 'image';
            if (splashSettingsStatus) splashSettingsStatus.textContent = 'تم رفع صورة السبلاش.';
        } catch (error) {
            console.error('Splash image upload failed:', error);
            showAlert('فشل رفع صورة السبلاش.');
        }
    });

    bindAdminListenerOnce(splashVideoFileInput, 'adminSplashVideoUploadBound', 'change', async () => {
        const file = splashVideoFileInput.files?.[0];
        if (!file) return;
        try {
            if (splashSettingsStatus) splashSettingsStatus.textContent = 'جاري رفع فيديو السبلاش...';
            const url = await uploadSplashFile(file, 'splash-videos');
            if (splashVideoUrlInput) splashVideoUrlInput.value = url;
            if (splashTypeInput) splashTypeInput.value = 'video';
            if (splashSettingsStatus) splashSettingsStatus.textContent = 'تم رفع فيديو السبلاش.';
        } catch (error) {
            console.error('Splash video upload failed:', error);
            showAlert('فشل رفع فيديو السبلاش.');
        }
    });

    const themeSettingsForm = document.getElementById('admin-theme-settings-form');
    const themePrimaryColorInput = document.getElementById('admin-theme-primary-color');
    const themeBackgroundColorInput = document.getElementById('admin-theme-background-color');
    const themeCardColorInput = document.getElementById('admin-theme-card-color');
    const themeLogoUrlInput = document.getElementById('admin-theme-logo-url');
    const themeBackgroundImageUrlInput = document.getElementById('admin-theme-background-image-url');
    const themeBackgroundImageEnabledInput = document.getElementById('admin-theme-background-image-enabled');
    const themeLogoFileInput = document.getElementById('admin-theme-logo-file');
    const themeBackgroundFileInput = document.getElementById('admin-theme-background-file');
    const themeSettingsStatus = document.getElementById('admin-theme-settings-status');

    async function uploadThemeFile(file, folder) {
        const fileRef = storageRef(
            storage,
            `${folder}/${Date.now()}-${file.name}`
        );

        await uploadBytes(fileRef, file);
        return await getDownloadURL(fileRef);
    }

    bindAdminListenerOnce(themeLogoFileInput, 'adminLogoUploadBound', 'change', async () => {
        const file = themeLogoFileInput.files?.[0];
        if (!file) return;

        try {
            if (themeSettingsStatus) themeSettingsStatus.textContent = 'جاري رفع الشعار...';
            const url = await uploadThemeFile(file, 'theme-logos');
            if (themeLogoUrlInput) themeLogoUrlInput.value = url;
            if (themeSettingsStatus) themeSettingsStatus.textContent = 'تم رفع الشعار.';
        } catch (error) {
            console.error('Logo upload failed:', error);
            showAlert('فشل رفع الشعار.');
        }
    });

    bindAdminListenerOnce(themeBackgroundFileInput, 'adminBackgroundUploadBound', 'change', async () => {
        const file = themeBackgroundFileInput.files?.[0];
        if (!file) return;

        try {
            if (themeSettingsStatus) themeSettingsStatus.textContent = 'جاري رفع الخلفية...';
            const url = await uploadThemeFile(file, 'theme-backgrounds');
            if (themeBackgroundImageUrlInput) themeBackgroundImageUrlInput.value = url;
            if (themeSettingsStatus) themeSettingsStatus.textContent = 'تم رفع الخلفية.';
        } catch (error) {
            console.error('Background upload failed:', error);
            showAlert('فشل رفع الخلفية.');
        }
    });


    if (themePrimaryColorInput) themePrimaryColorInput.value = appSettings.themePrimaryColor || '#78915a';
    if (themeBackgroundColorInput) themeBackgroundColorInput.value = appSettings.themeBackgroundColor || '#f6f3ea';
    if (themeCardColorInput) themeCardColorInput.value = appSettings.themeCardColor || '#ffffff';
    if (themeLogoUrlInput) themeLogoUrlInput.value = appSettings.themeLogoUrl || '';
    if (themeBackgroundImageUrlInput) themeBackgroundImageUrlInput.value = appSettings.themeBackgroundImageUrl || '';
    if (themeBackgroundImageEnabledInput) themeBackgroundImageEnabledInput.checked = appSettings.themeBackgroundImageEnabled === true;


    if (chatEnabledInput) chatEnabledInput.checked = appSettings.chatEnabled !== false;


    if (showWeatherInput) showWeatherInput.checked = appSettings.showWeather !== false;
    if (showPrayerInput) showPrayerInput.checked = appSettings.showPrayer !== false;
    if (showMatchesInput) showMatchesInput.checked = appSettings.showMatches !== false;
    if (showNewsInput) showNewsInput.checked = appSettings.showNews !== false;
    if (showChatInput) showChatInput.checked = appSettings.showChat !== false;


    if (siteNameInput) siteNameInput.value = appSettings.siteName || '';
    if (siteDescriptionInput) siteDescriptionInput.value = appSettings.siteDescription || '';
    if (homeAnnouncementInput) homeAnnouncementInput.value = appSettings.homeAnnouncement || '';

    if (qattahAmountInput) qattahAmountInput.value = appSettings.qattahAmount ?? DEFAULT_APP_SETTINGS.qattahAmount;
    if (beneficiaryNameInput) beneficiaryNameInput.value = appSettings.beneficiaryName || '';
    if (stcPayNumberInput) stcPayNumberInput.value = appSettings.stcPayNumber || '';
    if (applePayTextInput) applePayTextInput.value = appSettings.applePayText || '';
    if (paymentQrUrlInput) paymentQrUrlInput.value = appSettings.paymentQrUrl || '';
    if (paymentEnabledInput) paymentEnabledInput.checked = appSettings.paymentEnabled === true;
    if (paymentReminderEnabledInput) paymentReminderEnabledInput.checked = appSettings.paymentReminderEnabled === true;
    if (paymentReminderDayInput) paymentReminderDayInput.value = appSettings.paymentReminderDay ?? DEFAULT_APP_SETTINGS.paymentReminderDay;
    if (paymentReminderHourInput) paymentReminderHourInput.value = appSettings.paymentReminderHour ?? DEFAULT_APP_SETTINGS.paymentReminderHour;
    if (paymentReminderMinuteInput) paymentReminderMinuteInput.value = appSettings.paymentReminderMinute ?? DEFAULT_APP_SETTINGS.paymentReminderMinute;
    if (paymentReminderModeInput) paymentReminderModeInput.value = appSettings.paymentReminderMode || DEFAULT_APP_SETTINGS.paymentReminderMode;
    if (prayerNotificationsEnabledInput) prayerNotificationsEnabledInput.checked = appSettings.prayerNotificationsEnabled !== false;
    if (prayerCityInput) prayerCityInput.value = appSettings.prayerCity || DEFAULT_APP_SETTINGS.prayerCity;
    if (prayerCountryInput) prayerCountryInput.value = appSettings.prayerCountry || DEFAULT_APP_SETTINGS.prayerCountry;
    if (prayerReminderMinutesInput) prayerReminderMinutesInput.value = 0;
    if (matchReminderMinutesInput) matchReminderMinutesInput.value = appSettings.matchReminderMinutes ?? DEFAULT_APP_SETTINGS.matchReminderMinutes;


    bindAdminListenerOnce(homeSectionsForm, 'adminHomeSectionsBound', 'submit', async (event) => {
        event.preventDefault();

        const nextHomeSettings = {
            showWeather: showWeatherInput?.checked === true,
            showPrayer: showPrayerInput?.checked === true,
            showMatches: showMatchesInput?.checked === true,
            showNews: showNewsInput?.checked === true,
            showChat: showChatInput?.checked === true
        };

        if (homeSectionsStatus) homeSectionsStatus.textContent = 'جاري الحفظ...';

        try {
            await setDoc(doc(db, 'settings', 'app'), {
                ...nextHomeSettings,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid || currentUser?.uid || ''
            }, { merge: true });

            appSettings = { ...appSettings, ...nextHomeSettings };

            if (homeSectionsStatus) homeSectionsStatus.textContent = 'تم حفظ إعدادات الرئيسية.';
            showAlert('تم حفظ إعدادات الرئيسية.');
        } catch (error) {
            console.error('Home settings save failed:', error);
            if (homeSectionsStatus) homeSectionsStatus.textContent = 'فشل الحفظ.';
            showAlert('فشل حفظ إعدادات الرئيسية.');
        }
    });




    bindAdminListenerOnce(splashSettingsForm, 'adminSplashSettingsBound', 'submit', async (event) => {
        event.preventDefault();

        const nextSplashSettings = {
            splashEnabled: splashEnabledInput?.checked === true,
            splashType: splashTypeInput?.value || 'logo',
            splashTitle: splashTitleInput?.value.trim() || 'تطبيق الاستراحة',
            splashDuration: Number(splashDurationInput?.value || 6),
            splashImageUrl: splashImageUrlInput?.value.trim() || '',
            splashVideoUrl: splashVideoUrlInput?.value.trim() || ''
        };

        if (splashSettingsStatus) splashSettingsStatus.textContent = 'جاري الحفظ...';

        try {
            await setDoc(doc(db, 'settings', 'app'), {
                ...nextSplashSettings,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid || currentUser?.uid || ''
            }, { merge: true });

            appSettings = { ...appSettings, ...nextSplashSettings };
            applySplashSettings();

            if (splashSettingsStatus) splashSettingsStatus.textContent = 'تم حفظ السبلاش.';
            showAlert('تم حفظ إعدادات السبلاش.');
        } catch (error) {
            console.error('Splash settings save failed:', error);
            if (splashSettingsStatus) splashSettingsStatus.textContent = 'فشل حفظ السبلاش.';
            showAlert('فشل حفظ إعدادات السبلاش.');
        }
    });

    bindAdminListenerOnce(themeSettingsForm, 'adminThemeSettingsBound', 'submit', async (event) => {
        event.preventDefault();

        const nextThemeSettings = {
            themePrimaryColor: themePrimaryColorInput?.value || '#78915a',
            themeBackgroundColor: themeBackgroundColorInput?.value || '#f6f3ea',
            themeCardColor: themeCardColorInput?.value || '#ffffff',
            themeLogoUrl: themeLogoUrlInput?.value.trim() || '',
            themeBackgroundImageUrl: themeBackgroundImageUrlInput?.value.trim() || '',
            themeBackgroundImageEnabled: themeBackgroundImageEnabledInput?.checked === true
        };

        if (themeSettingsStatus) themeSettingsStatus.textContent = 'جاري الحفظ...';

        try {
            await setDoc(doc(db, 'settings', 'app'), {
                ...nextThemeSettings,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid || currentUser?.uid || ''
            }, { merge: true });

            appSettings = { ...appSettings, ...nextThemeSettings };
            applyCustomTheme();

            if (themeSettingsStatus) themeSettingsStatus.textContent = 'تم حفظ التصميم.';
            showAlert('تم حفظ إعدادات التصميم.');
        } catch (error) {
            console.error('Theme settings save failed:', error);
            if (themeSettingsStatus) themeSettingsStatus.textContent = 'فشل حفظ التصميم.';
            showAlert('فشل حفظ إعدادات التصميم.');
        }
    });

    bindAdminListenerOnce(chatSettingsForm, 'adminChatSettingsBound', 'submit', async (event) => {
        event.preventDefault();

        const nextChatSettings = {
            chatEnabled: chatEnabledInput?.checked === true
        };

        if (chatSettingsStatus) chatSettingsStatus.textContent = 'جاري الحفظ...';

        try {
            await setDoc(doc(db, 'settings', 'app'), {
                ...nextChatSettings,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid || currentUser?.uid || ''
            }, { merge: true });

            appSettings = { ...appSettings, ...nextChatSettings };
            if (chatSettingsStatus) chatSettingsStatus.textContent = 'تم حفظ إعدادات الدردشة.';
            showAlert('تم حفظ إعدادات الدردشة.');
        } catch (error) {
            console.error('Chat settings save failed:', error);
            if (chatSettingsStatus) chatSettingsStatus.textContent = 'فشل حفظ إعدادات الدردشة.';
            showAlert('فشل حفظ إعدادات الدردشة.');
        }
    });

    bindAdminListenerOnce(paymentSettingsForm, 'adminPaymentSettingsBound', 'submit', async (event) => {
        event.preventDefault();

        const nextPaymentSettings = {
            qattahAmount: Number(qattahAmountInput?.value || DEFAULT_APP_SETTINGS.qattahAmount),
            paymentEnabled: paymentEnabledInput?.checked === true,
            beneficiaryName: beneficiaryNameInput?.value.trim() || '',
            stcPayNumber: stcPayNumberInput?.value.trim() || '',
            applePayText: applePayTextInput?.value.trim() || '',
            paymentQrUrl: paymentQrUrlInput?.value.trim() || '',
            paymentReminderEnabled: paymentReminderEnabledInput?.checked === true,
            paymentReminderDay: Number(paymentReminderDayInput?.value || DEFAULT_APP_SETTINGS.paymentReminderDay),
            paymentReminderHour: Number(paymentReminderHourInput?.value || DEFAULT_APP_SETTINGS.paymentReminderHour),
            paymentReminderMinute: Number(paymentReminderMinuteInput?.value || DEFAULT_APP_SETTINGS.paymentReminderMinute),
            paymentReminderMode: paymentReminderModeInput?.value === 'all' ? 'all' : 'lateOnly'
        };

        if (paymentSettingsStatus) paymentSettingsStatus.textContent = 'جاري الحفظ...';

        try {
            await setDoc(doc(db, 'settings', 'app'), {
                ...nextPaymentSettings,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid || currentUser?.uid || ''
            }, { merge: true });

            appSettings = { ...appSettings, ...nextPaymentSettings };
            if (paymentSettingsStatus) paymentSettingsStatus.textContent = 'تم حفظ إعدادات القطة والدفع.';
            showAlert('تم حفظ إعدادات القطة والدفع.');
        } catch (error) {
            console.error('Payment settings save failed:', error);
            if (paymentSettingsStatus) paymentSettingsStatus.textContent = 'فشل حفظ إعدادات القطة والدفع.';
            showAlert('فشل حفظ إعدادات القطة والدفع.');
        }
    });

    bindAdminListenerOnce(prayerNotificationSettingsForm, 'adminPrayerSettingsBound', 'submit', async (event) => {
        event.preventDefault();

        const nextPrayerSettings = {
            prayerNotificationsEnabled: prayerNotificationsEnabledInput?.checked === true,
            prayerCity: prayerCityInput?.value.trim() || DEFAULT_APP_SETTINGS.prayerCity,
            prayerCountry: prayerCountryInput?.value.trim() || DEFAULT_APP_SETTINGS.prayerCountry,
            prayerReminderMinutes: 0,
            matchReminderMinutes: Number(matchReminderMinutesInput?.value || DEFAULT_APP_SETTINGS.matchReminderMinutes)
        };

        if (prayerNotificationSettingsStatus) prayerNotificationSettingsStatus.textContent = 'جاري الحفظ...';

        try {
            await setDoc(doc(db, 'settings', 'app'), {
                ...nextPrayerSettings,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid || currentUser?.uid || ''
            }, { merge: true });

            appSettings = { ...appSettings, ...nextPrayerSettings };
            if (prayerNotificationSettingsStatus) prayerNotificationSettingsStatus.textContent = 'تم حفظ إعدادات الصلاة.';
            showAlert('تم حفظ إعدادات تنبيهات الصلاة.');
        } catch (error) {
            console.error('Prayer notification settings save failed:', error);
            if (prayerNotificationSettingsStatus) prayerNotificationSettingsStatus.textContent = 'فشل حفظ إعدادات الصلاة.';
            showAlert('فشل حفظ إعدادات تنبيهات الصلاة.');
        }
    });

    bindAdminListenerOnce(appSettingsForm, 'adminAppSettingsBound', 'submit', async (event) => {
        event.preventDefault();

        const nextSettings = {
            siteName: siteNameInput?.value.trim() || DEFAULT_APP_SETTINGS.siteName,
            siteDescription: siteDescriptionInput?.value.trim() || DEFAULT_APP_SETTINGS.siteDescription,
            homeAnnouncement: homeAnnouncementInput?.value.trim() || ''
        };

        if (appSettingsStatus) appSettingsStatus.textContent = 'جاري الحفظ...';

        try {
            await setDoc(doc(db, 'settings', 'app'), {
                ...nextSettings,
                updatedAt: serverTimestamp(),
                updatedBy: auth.currentUser?.uid || currentUser?.uid || ''
            }, { merge: true });

            appSettings = { ...DEFAULT_APP_SETTINGS, ...nextSettings };
            if (appSettingsStatus) appSettingsStatus.textContent = 'تم حفظ إعدادات الموقع بنجاح.';
            showAlert('تم حفظ إعدادات الموقع.');
        } catch (error) {
            console.error('App settings save failed:', error);
            if (appSettingsStatus) appSettingsStatus.textContent = 'فشل حفظ الإعدادات.';
            showAlert('فشل حفظ إعدادات الموقع.');
        }
    });

    const setStatus = (message = '', type = '') => {
        if (!status) return;
        status.textContent = message;
        status.dataset.status = type;
    };

    const renderReport = (result = {}) => {
        if (report) {
            report.dataset.reportReady = 'true';
            report.hidden = false;
            report.setAttribute('aria-hidden', 'false');
        }
        if (targetCount) targetCount.textContent = String(result.targetedTokens || 0);
        if (successCount) successCount.textContent = String(result.successCount || 0);
        if (failureCount) failureCount.textContent = String(result.failureCount || 0);
        if (deletedTokenCount) deletedTokenCount.textContent = String(result.deletedInvalidTokens || 0);
    };

    document.querySelectorAll('[data-admin-test-notification]').forEach((button) => {
        bindAdminListenerOnce(button, 'adminTestNotificationBound', 'click', async () => {
            const type = button.dataset.adminTestNotification;
            button.disabled = true;
            setStatus('جاري إرسال الاختبار...', 'pending');
            try {
                const callable = httpsCallable(functions, 'sendAdminTestNotification');
                const response = await callable({ type });
                const result = response.data || {};
                renderReport(result);
                if ((result.successCount || 0) > 0) {
                    setStatus('تم إرسال اختبار الإشعار.', 'success');
                } else {
                    setStatus('لم يصل الاختبار لأي جهاز. أعد مزامنة الإشعارات ثم حاول مرة أخرى.', 'error');
                }
            } catch (error) {
                console.error('Admin test notification failed:', error);
                renderReport({ successCount: 0, failureCount: 1 });
                setStatus(getAdminNotificationErrorMessage(error), 'error');
            } finally {
                button.disabled = false;
            }
        });
    });

    bindAdminListenerOnce(broadcastForm, 'adminBroadcastBound', 'submit', async (event) => {
        event.preventDefault();
        const title = titleInput?.value.trim();
        const message = messageInput?.value.trim();
        if (!title || !message) {
            showAlert('اكتب عنوان الإشعار والرسالة أولاً.');
            return;
        }

        const submitButton = broadcastForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        setStatus('جاري الإرسال للجميع...', 'pending');

        try {
            const callable = httpsCallable(functions, 'sendAdminBroadcastNotification');
            const response = await callable({ title, message });
            const result = response.data || {};
            renderReport(result);
            setStatus((result.successCount || 0) > 0 ? 'تم إرسال الإشعار للجميع.' : 'لم يصل الإشعار لأي جهاز.', (result.successCount || 0) > 0 ? 'success' : 'error');
            broadcastForm.reset();
        } catch (error) {
            console.error('Admin broadcast notification failed:', error);
            renderReport({ successCount: 0, failureCount: 1 });
            setStatus(getAdminNotificationErrorMessage(error), 'error');
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });
}

function getAdminNotificationErrorMessage(error) {
    const code = error?.code || '';
    const message = error?.message || '';

    if (code.includes('permission-denied')) {
        return 'فشل الإرسال: هذه العملية متاحة للمسؤول فقط.';
    }

    if (code.includes('failed-precondition')) {
        return message || 'فشل الإرسال: لا توجد بيانات كافية لإرسال هذا الاختبار.';
    }

    if (code.includes('invalid-argument')) {
        return message || 'فشل الإرسال: نوع الإشعار أو محتواه غير صحيح.';
    }

    if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
        return 'فشل الإرسال: تعذر الاتصال بخدمة الإشعارات، حاول مرة أخرى.';
    }

    return message || 'فشل إرسال الإشعار. تحقق من تسجيل الجهاز للتنبيهات وحالة Cloud Functions.';
}

function setNotificationToggleState(button, enabled) {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'إيقاف التنبيه' : 'تفعيل التنبيه');
    button.innerHTML = `<i data-lucide="${enabled ? 'toggle-right' : 'toggle-left'}"></i><span>${enabled ? 'شغّال' : 'مقفّل'}</span>`;
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function loadPageData(pageId) {
    // Normalize page ID (remove '-page' suffix if present)
    const normalizedPageId = pageId.replace('-page', '');

    if (!currentUser && !['login', 'register'].includes(normalizedPageId)) {
        return;
    }

    cleanupRealtimeListeners();

    try {
        switch (normalizedPageId) {
            case 'home':
                loadHomePageData();
                break;
            case 'members':
                loadMembers();
                break;
            case 'payments':
                applyPaymentSettingsView();
                loadPaymentOverview();
                loadPaymentLog();
                break;
            case 'chat':
                loadChat();
                break;
            case 'profile-settings':
                loadProfileData();
                break;
            case 'prayer':
                loadPrayerTimes();
                break;
            case 'qibla':
                initQibla();
                break;
            case 'matches':
                loadMatches();
                break;
            case 'news':
                loadNews();
                break;
        }
    } catch (error) {
        console.error(`Error loading page data for ${normalizedPageId}:`, error);
    }
}

// --- Firebase Auth Handlers ---
function setupRecaptcha(containerId) {
    console.log(`Setting up reCAPTCHA for container: ${containerId}`);
    const verifier = recaptchaManager.getOrCreate(containerId);
    if (verifier) {
        window.recaptchaVerifier = verifier;
        if (typeof verifier.render === 'function' && !verifier.renderStarted) {
            verifier.renderStarted = true;
            verifier.render().catch((error) => {
                verifier.renderStarted = false;
                console.warn('reCAPTCHA pre-render failed:', error);
            });
        }
        return true;
    } else {
        console.error(`Failed to set up reCAPTCHA for ${containerId}`);
        showAlert('ما ضبط تجهيز التحقق، حدّث الصفحة وجرب.');
        return false;
    }
}

function setFormLoading(form, isLoading, loadingText) {
    if (!form) return;
    const submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton) return;

    if (!submitButton.dataset.defaultText) {
        submitButton.dataset.defaultText = submitButton.textContent;
    }

    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? loadingText : submitButton.dataset.defaultText;
}

function setAuthStatus(phase, message) {
    const id = phase === 'code' ? 'login-code-status' : 'login-status';
    const element = document.getElementById(id);
    if (element) element.textContent = message || '';
}


async function handleCompleteRegistration(e) {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        const status = document.getElementById('register-status');
        if (status) status.textContent = 'ابدأ من صفحة الدخول برقم جوالك، وبعد التحقق كمل التسجيل هنا.';
        showAlert('تحقق من رقم جوالك أولاً من صفحة الدخول.');
        await navigateToHash('#login');
        return;
    }

    const nameInput = document.getElementById('register-name');
    const inviteInput = document.getElementById('register-invite-code');

    const name = nameInput?.value.trim();
    const inviteCode = inviteInput?.value.trim();

    if (!name) {
        showAlert('اكتب اسمك يا طويل العمر.');
        return;
    }

    if (!inviteCode) {
        showAlert('اكتب رمز الدعوة.');
        return;
    }

    try {
        const completeRegistration = httpsCallable(functions, 'completeRegistration');
        const response = await completeRegistration({
            name,
            inviteCode
        });
        const registeredUser = response.data?.user || {};

        currentUser = {
            uid: user.uid,
            name: registeredUser.name || name,
            phone: registeredUser.phone || user.phoneNumber || '',
            paymentStatus: registeredUser.paymentStatus || 'late',
            disabled: registeredUser.disabled === true,
            avatarUrl: registeredUser.avatarUrl || ''
        };

        document.body.classList.add('is-authenticated');
        sessionStorage.removeItem('firebaseVerificationId');
        syncShellUserState();
        showAlert('تم تسجيلك بنجاح، حيّاك الله.');
        await navigateToHash('#home');
    } catch (error) {
        console.error('Registration completion failed:', error);
        showAlert(getRegistrationErrorMessage(error));
    }
}

function getRegistrationErrorMessage(error) {
    const code = error?.code || '';
    const message = error?.message || '';

    if (code.includes('permission-denied')) {
        return 'رمز الدعوة غير صحيح.';
    }

    if (code.includes('invalid-argument')) {
        return 'تأكد من الاسم ورمز الدعوة.';
    }

    if (code.includes('already-exists')) {
        return 'هذا الحساب مسجل مسبقاً.';
    }

    if (code.includes('unauthenticated')) {
        return 'تحقق من رقم جوالك أولاً.';
    }

    if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
        return 'تعذر الاتصال بخدمة التسجيل. حاول مرة ثانية.';
    }

    if (code.includes('failed-precondition')) {
        return 'التسجيل غير متاح حالياً. تواصل مع مسؤول الاستراحة.';
    }

    return message && !message.includes('internal')
        ? 'فشل التسجيل. تأكد من البيانات وحاول مرة ثانية.'
        : 'فشل التسجيل. حاول مرة ثانية.';
}


async function handleSendCode(e) {
    e.preventDefault();

    const phoneInput = document.getElementById('phone-number');

    if (!phoneInput) {
        showAlert('خانة الجوال مو موجودة، حدّث الصفحة.');
        return;
    }

    let phoneNumber = phoneInput.value.trim();

    // Validate phone number format
    if (!phoneNumber) {
        showAlert('الرجاء إدخال رقم جوال صحيح.');
        return;
    }

    // Convert Saudi format to international format
    if (phoneNumber.startsWith('05')) {
        phoneNumber = '+966' + phoneNumber.substring(1);
    } else if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+966' + phoneNumber;
    }

    // Get recaptcha verifier
    const appVerifier = window.recaptchaVerifier;
    if (!appVerifier) {
        console.error('reCAPTCHA verifier not initialized');
        showAlert('يتم تحضير التحقق... حاول مرة أخرى بعد قليل.');
        return;
    }

    console.log(`Sending verification code to: ${phoneNumber}`);
    setFormLoading(e.currentTarget, true, 'جاري إرسال الرمز...');
    setAuthStatus('phone', 'نجهز التحقق ونرسل لك الرمز...');

    try {
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        console.log('✓ Verification code sent successfully');

        // Store verification ID in sessionStorage
        sessionStorage.setItem('firebaseVerificationId', confirmationResult.verificationId);
        setAuthStatus('code', 'وصل الرمز. دخّله هنا وكمل.');
        const phoneForm = document.getElementById('phone-form');
        const codeForm = document.getElementById('code-form');
        if (phoneForm) phoneForm.classList.add('hidden');
        if (codeForm) codeForm.classList.remove('hidden');
        setFormLoading(e.currentTarget, false);
    } catch (error) {
        console.error("✗ SMS Error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);

        let errorMsg = 'ما قدرنا نرسل الرمز. تأكد من الرقم.';

        if (error.code === 'auth/invalid-phone-number') {
            errorMsg = 'صيغة الرقم ما هي صحيحة. استخدم +966XXXXXXXXX';
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg = 'كثرت الطلبات شوي. جرّب بعدين.';
        } else if (error.code === 'auth/unauthorized-domain') {
            errorMsg = 'نطاق المعاينة غير مصرح في Firebase. أضف 127.0.0.1 أو الدومين من إعدادات Firebase Authentication.';
        } else if (error.code === 'auth/invalid-app-credential') {
            errorMsg = 'في مشكلة بالتحقق. تأكد من إعدادات النطاق.';
        } else if (error.code === 'auth/captcha-check-failed') {
            errorMsg = 'ما ضبط تحقق reCAPTCHA. جرّب مرة ثانية.';
        }

        showAlert(errorMsg);
        setAuthStatus('phone', '');

        // Reset recaptcha and try to recreate it
        const containerId = 'recaptcha-container';
        recaptchaManager.destroy(containerId);

        // Wait a moment then recreate
        setTimeout(() => {
            const success = setupRecaptcha(containerId);
            if (!success) {
                showAlert('ما ضبطت إعادة التحقق. حدّث الصفحة وجرب.');
            }
        }, 500);
        setFormLoading(e.currentTarget, false);
    }
}

async function handleVerifyCode(e) {
    e.preventDefault();

    const codeInput = document.getElementById('verification-code');

    if (!codeInput) {
        showAlert('خانة الرمز مو موجودة، حدّث الصفحة.');
        return;
    }

    const code = codeInput.value.trim();

    if (!code) {
        showAlert('اكتب رمز الدخول يا ذيب.');
        return;
    }

    // Get verification ID from sessionStorage
    const verificationId = sessionStorage.getItem('firebaseVerificationId');

    if (!verificationId) {
        showAlert('انتهت مهلة الرمز. اطلب رمز جديد.');
        // Reset forms
        const phoneForm = document.getElementById('phone-form');
        const codeForm = document.getElementById('code-form');
        if (phoneForm) phoneForm.classList.remove('hidden');
        if (codeForm) codeForm.classList.add('hidden');
        return;
    }

    console.log('Verifying code...');
    setFormLoading(e.currentTarget, true, 'جاري التحقق...');
    setAuthStatus('code', 'نتأكد من الرمز...');

    try {
        const credential = PhoneAuthProvider.credential(verificationId, code);
        const result = await signInWithCredential(auth, credential);
        const user = result.user;
        console.log('✓ Phone verification successful');

        const userDocRef = doc(db, "users", user.uid);
        const existingUserDoc = await getDoc(userDocRef);
        if (!existingUserDoc.exists()) {
            showAlert('رقمك غير مسجل. كمل التسجيل باسمك ورمز الدعوة.');
            await navigateToHash('#register');
            return;
        }

        // Clear temporary data after success
        sessionStorage.removeItem('firebaseVerificationId');

        setAuthStatus('code', 'تم التحقق. تفضل اقلط...');
        console.log('✓ Authentication successful, redirecting...');
        // onAuthStateChanged will handle navigation
    } catch (error) {
        console.error("✗ Verification Error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);

        let errorMsg = 'رمز الدخول غير صحيح.';

        if (error.code === 'auth/invalid-verification-code') {
            errorMsg = 'الرمز اللي دخلته غير صحيح. تأكد وجرب.';
        } else if (error.code === 'auth/code-expired') {
            errorMsg = 'انتهت صلاحية الرمز. اطلب رمز جديد.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMsg = 'بيانات التحقق ما هي صحيحة.';
        }

        showAlert(errorMsg);
        setAuthStatus('code', '');
        setFormLoading(e.currentTarget, false);
    }
}

async function handleLogout() {
    if(unsubscribeChat) unsubscribeChat();
    if(unsubscribeMembers) unsubscribeMembers();
    if(unsubscribePayments) unsubscribePayments();
    await signOut(auth);
}

// --- Firestore Data Loading & Realtime Updates ---

function applyHomeAppSettings() {
    const title = document.getElementById('home-welcome-title');
    const heroDescription = document.querySelector('.home-reference-hero p');
    const heroSection = document.querySelector('.home-reference-hero');

    if (title) title.textContent = appSettings.siteName || DEFAULT_APP_SETTINGS.siteName;
    if (heroDescription) heroDescription.textContent = appSettings.siteDescription || DEFAULT_APP_SETTINGS.siteDescription;

    let announcement = document.getElementById('home-announcement-card');
    if (appSettings.homeAnnouncement) {
        if (!announcement && heroSection) {
            announcement = document.createElement('div');
            announcement.id = 'home-announcement-card';
            announcement.className = 'home-reference-card';
            heroSection.insertAdjacentElement('afterend', announcement);
        }
        if (announcement) {
            announcement.innerHTML = `
<div class="announcement-marquee">
  <span>📢 ${escapeHtml(appSettings.homeAnnouncement)}</span>
</div>
`;
            announcement.classList.remove('hidden');
        }
    } else if (announcement) {
        announcement.classList.add('hidden');
    }
}



function applyHomeSectionVisibility() {
    const widgetsSection = document.querySelector('.home-reference-widgets');
    const prayerCard = document.querySelector('.home-prayer-card');
    const weatherCard = document.querySelector('.home-weather-card');

    const matchesHead = document.querySelector('a[href="#matches"]')?.closest('.reference-section-head');
    const matchesList = document.getElementById('home-matches-list');

    const chatHead = document.querySelector('a[href="#chat"]')?.closest('.reference-section-head');
    const chatList = document.getElementById('home-chat-preview');

    const newsSections = document.querySelectorAll('[data-home-section="news"]');

    if (prayerCard) prayerCard.classList.toggle('hidden', appSettings.showPrayer === false);
    if (weatherCard) weatherCard.classList.toggle('hidden', appSettings.showWeather === false);
    if (widgetsSection) {
        widgetsSection.classList.toggle('hidden', appSettings.showPrayer === false && appSettings.showWeather === false);
    }

    if (matchesHead) matchesHead.classList.toggle('hidden', appSettings.showMatches === false);
    if (matchesList) matchesList.classList.toggle('hidden', appSettings.showMatches === false);

    if (chatHead) chatHead.classList.toggle('hidden', appSettings.showChat === false);
    if (chatList) chatList.classList.toggle('hidden', appSettings.showChat === false);

    newsSections.forEach((section) => {
        section.classList.toggle('hidden', appSettings.showNews === false);
    });
}

async function loadHomePageData() {
    if (!currentUser) return;

    try {
        await loadAppSettings();
        applyHomeAppSettings();
        if (appSettings.showPrayer !== false) {
            loadHomePrayerAndDate();
        }
        if (appSettings.showWeather !== false) {
            loadHomeWeather();
        }
        loadHomeMembersSummary();
        if (appSettings.showChat !== false) {
            loadHomeChatPreview();
        }
        if (appSettings.showMatches !== false) {
            loadHomeMatches();
        }
        if (appSettings.showNews !== false) {
            loadHomeNews();
        }
        applyHomeSectionVisibility();
    } catch (error) {
        console.error('Error loading home page data:', error);
    }
}

function setupManualMemberForm() {
    const form = document.getElementById('manual-member-form');
    if (!form) return;

    const nameInput = document.getElementById('manual-member-name');
    const phoneInput = document.getElementById('manual-member-phone');
    const status = document.getElementById('manual-member-status');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (auth.currentUser?.uid !== ADMIN_UID && currentUser?.uid !== ADMIN_UID) {
            showAlert('هذه العملية للمسؤول فقط.');
            return;
        }

        const name = nameInput?.value.trim();
        const phone = phoneInput?.value.trim() || '';

        if (!name) {
            showAlert('اكتب اسم العضو أولاً.');
            return;
        }

        if (status) status.textContent = 'جاري إضافة العضو...';

        try {
            const addManualMember = httpsCallable(functions, 'addManualMember');
            await addManualMember({
                name,
                phone
            });

            form.reset();
            if (status) status.textContent = 'تمت إضافة العضو.';
            showAlert('تمت إضافة العضو.');
        } catch (error) {
            console.error('Manual member add failed:', error);
            if (status) status.textContent = 'فشلت إضافة العضو.';
            showAlert('فشلت إضافة العضو.');
        }
    });
}

function loadMembers() {
    const membersList = document.getElementById('members-list');
    if (!membersList) {
        console.warn('members-list element not found');
        return;
    }

    try {
        const membersCollection = collection(db, "users");
        unsubscribeMembers = onSnapshot(membersCollection, (snapshot) => {
            const isAdminUser = auth.currentUser?.uid === ADMIN_UID || currentUser?.uid === ADMIN_UID;
            membersList.innerHTML = '';

            if (snapshot.empty) {
                membersList.innerHTML = '<p class="text-center">ما فيه مطانيخ للحين.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const member = doc.data();
                const memberId = doc.id;
                const div = document.createElement('div');
                div.className = 'list-item-card';

                const statusIcon = member.paymentStatus === 'paid'
                    ? `<span class="font-bold payment-status-paid">✅ مدفوع</span>`
                    : `<span class="font-bold payment-status-late">❌ متأخر</span>`;

                let adminControls = '';
                if (isAdminUser) {
                    adminControls = `
                        <button data-id="${memberId}" data-status="paid" class="toggle-payment-btn btn btn-compact ms-2">دفع</button>
                        <button data-id="${memberId}" data-status="late" class="toggle-payment-btn btn btn-danger btn-compact">لم يدفع</button>
                        <button data-id="${memberId}" data-name="${escapeHtml(member.name || '')}" class="edit-member-btn btn btn-compact">تعديل الاسم</button>
                        <button data-id="${memberId}" data-disabled="${member.disabled === true ? 'true' : 'false'}" class="disable-member-btn btn btn-compact">${member.disabled === true ? 'تفعيل' : 'تعطيل'}</button>
                        <button data-id="${memberId}" class="reset-avatar-btn btn btn-compact">تصفير الصورة</button>
                        <button data-id="${memberId}" class="delete-member-btn btn btn-danger btn-compact">حذف</button>
                    `;
                }

                const phoneLine = isAdminUser
                    ? `<p class="text-sm">${escapeHtml(member.phone || 'بدون رقم')}</p>`
                    : '';

                div.innerHTML = `
                    <div>
                        <p class="font-bold">${escapeHtml(member.name || 'بدون اسم')}</p>
                        ${phoneLine}
                    </div>
                    <div class="flex items-center">
                        ${adminControls}
                        ${statusIcon}
                    </div>
                `;
                membersList.appendChild(div);
            });

            document.querySelectorAll('.toggle-payment-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.currentTarget.dataset.id;
                    const newStatus = e.currentTarget.dataset.status;
                    try {
                        const updateMemberPaymentStatus = httpsCallable(functions, 'updateMemberPaymentStatus');
                        await updateMemberPaymentStatus({ memberId, paymentStatus: newStatus });
                        showAlert('تم تحديث الحالة بنجاح!');
                    } catch (error) {
                        console.error('Error updating payment status:', error);
                        showAlert('فشل تحديث الحالة. حاول مرة أخرى.');
                    }
                });
            });

            document.querySelectorAll('.edit-member-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.currentTarget.dataset.id;
                    const oldName = e.currentTarget.dataset.name || '';
                    const newName = prompt('اكتب الاسم الجديد:', oldName);
                    if (!newName || !newName.trim()) return;

                    try {
                        const updateMemberName = httpsCallable(functions, 'updateMemberName');
                        await updateMemberName({ memberId, name: newName.trim() });
                        showAlert('تم تعديل اسم العضو بنجاح.');
                    } catch (error) {
                        console.error('Error updating member name:', error);
                        showAlert('فشل تعديل اسم العضو.');
                    }
                });
            });


            document.querySelectorAll('.disable-member-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.currentTarget.dataset.id;
                    const isDisabled = e.currentTarget.dataset.disabled === 'true';

                    try {
                        const setMemberDisabled = httpsCallable(functions, 'setMemberDisabled');
                        await setMemberDisabled({ memberId, disabled: !isDisabled });
                        showAlert(isDisabled ? 'تم تفعيل العضو.' : 'تم تعطيل العضو.');
                    } catch (error) {
                        console.error('Error toggling member disabled:', error);
                        showAlert('فشل تحديث حالة العضو.');
                    }
                });
            });

            document.querySelectorAll('.reset-avatar-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.currentTarget.dataset.id;
                    const confirmed = confirm('متأكد تبي تصفر صورة هذا العضو؟');
                    if (!confirmed) return;

                    try {
                        const resetMemberAvatar = httpsCallable(functions, 'resetMemberAvatar');
                        await resetMemberAvatar({ memberId });
                        showAlert('تمت إعادة تعيين صورة العضو.');
                    } catch (error) {
                        console.error('Error resetting member avatar:', error);
                        showAlert('فشل تصفير صورة العضو.');
                    }
                });
            });

            document.querySelectorAll('.delete-member-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const memberId = e.currentTarget.dataset.id;
                    const confirmed = confirm('متأكد تبي تحذف هذا العضو؟ لا يمكن التراجع.');
                    if (!confirmed) return;

                    try {
                        const deleteMember = httpsCallable(functions, 'deleteMember');
                        await deleteMember({ memberId });
                        showAlert('تم حذف العضو بنجاح.');
                    } catch (error) {
                        console.error('Error deleting member:', error);
                        showAlert('فشل حذف العضو.');
                    }
                });
            });
        }, error => {
            console.error('Error loading members:', error);
                    membersList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل المطانيخ.</p>';
        });
    } catch (error) {
        console.error('Error setting up members listener:', error);
        membersList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل المطانيخ.</p>';
    }
}

function loadPaymentLog() {
    const logList = document.getElementById('payment-log-list');
    if (!logList) {
        console.warn('payment-log-list element not found');
        return;
    }

    try {
        unsubscribePayments = onSnapshot(
            query(collection(db, "payments"), orderBy("date", "desc")),
            (snapshot) => {
                logList.innerHTML = '';
                if (snapshot.empty) {
                    logList.innerHTML = '<p class="text-center">ما فيه سجل للقطة للحين.</p>';
                    return;
                }
                snapshot.docs.forEach(doc => {
                    const payment = doc.data();
                    const div = document.createElement('div');
                    div.className = 'list-item-card text-sm';
                    const date = payment.date
                        ? new Date(payment.date.seconds * 1000).toLocaleDateString('ar-SA')
                        : 'غير محدد';
                    div.innerHTML = `
                        <div>
                            <span class="font-bold">${escapeHtml(payment.userName || 'بدون اسم')}</span>
                            <small>${escapeHtml(date)}</small>
                        </div>
                        <span class="status-badge paid">تم السداد</span>
                    `;
                    logList.appendChild(div);
                });
            },
            error => {
                console.error('Error loading payment log:', error);
                logList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل سجل القطة.</p>';
            }
        );
    } catch (error) {
        console.error('Error setting up payment listener:', error);
        logList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل سجل القطة.</p>';
    }
}


async function applyPaymentSettingsView() {
    await loadAppSettings();

    const enabled = appSettings.paymentEnabled === true;

    const title = document.getElementById('payment-availability-title');
    const desc = document.getElementById('payment-availability-desc');
    const methodsNote = document.getElementById('payment-methods-note');

    const stcMethod = document.getElementById('stc-pay-method');
    const stcValue = document.getElementById('stc-pay-value');
    const copyStcBtn = document.getElementById('copy-stc-pay-button');

    const appleMethod = document.getElementById('apple-pay-method');
    const appleValue = document.getElementById('apple-pay-value');
    const appleStatus = document.getElementById('apple-pay-status');

    const beneficiaryCard = document.getElementById('payment-beneficiary-card');
    const beneficiaryName = document.getElementById('payment-beneficiary-name');

    const qrCard = document.getElementById('payment-qr-card');
    const qrImage = document.getElementById('payment-qr-image');

    if (title) title.textContent = enabled ? 'الدفع متاح حالياً' : 'الدفع الإلكتروني غير متاح حالياً';
    if (desc) desc.textContent = enabled
        ? 'اختر طريقة الدفع المناسبة لك من البيانات بالأسفل'
        : 'تابع السداد حالياً من السجل وسيتم تفعيل الدفع لاحقاً';

    if (methodsNote) methodsNote.textContent = enabled
        ? `مبلغ القطة الشهري: ${Number(appSettings.qattahAmount || 0)} ريال`
        : 'طرق الدفع مخفية حتى يتم تفعيلها من لوحة التحكم';

    if (stcMethod) stcMethod.classList.toggle('is-disabled', !enabled || !appSettings.stcPayNumber);
    if (stcValue) stcValue.textContent = enabled && appSettings.stcPayNumber ? appSettings.stcPayNumber : 'غير متاح حالياً';
    if (copyStcBtn) {
        copyStcBtn.classList.toggle('hidden', !(enabled && appSettings.stcPayNumber));
        copyStcBtn.onclick = () => copyToClipboard(appSettings.stcPayNumber || '');
    }

    if (appleMethod) appleMethod.classList.toggle('is-disabled', !enabled || !appSettings.applePayText);
    if (appleValue) appleValue.textContent = enabled && appSettings.applePayText ? appSettings.applePayText : 'غير متاح حالياً';
    if (appleStatus) appleStatus.textContent = enabled && appSettings.applePayText ? 'متاح' : 'قريباً';

    if (beneficiaryCard) beneficiaryCard.classList.toggle('hidden', !(enabled && appSettings.beneficiaryName));
    if (beneficiaryName) beneficiaryName.textContent = appSettings.beneficiaryName || '--';

    if (qrCard) qrCard.classList.toggle('hidden', !(enabled && appSettings.paymentQrUrl));
    if (qrImage && appSettings.paymentQrUrl) qrImage.src = safeExternalUrl(appSettings.paymentQrUrl, '');
}

async function loadPaymentOverview() {
    const paidCount = document.getElementById('payments-paid-count');
    const lateCount = document.getElementById('payments-late-count');
    const remainingCount = document.getElementById('payments-remaining-count');
    const lateMembersList = document.getElementById('late-members-list');

    if (!paidCount && !lateCount && !remainingCount && !lateMembersList) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        const isAdminUser = auth.currentUser?.uid === ADMIN_UID || currentUser?.uid === ADMIN_UID;
        const members = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        const paid = members.filter((member) => member.paymentStatus === 'paid');
        const late = members.filter((member) => member.paymentStatus !== 'paid');

        if (paidCount) paidCount.textContent = String(paid.length);
        if (lateCount) lateCount.textContent = String(late.length);
        if (remainingCount) remainingCount.textContent = String(late.length);

        if (lateMembersList) {
            lateMembersList.innerHTML = late.length
                ? late.slice(0, 8).map((member) => {
                    const phoneLine = isAdminUser
                        ? `<small>${escapeHtml(member.phone || 'بدون رقم')}</small>`
                        : '';

                    return `
                        <div class="list-item-card text-sm">
                            <div>
                                <span class="font-bold">${escapeHtml(member.name || 'بدون اسم')}</span>
                                ${phoneLine}
                            </div>
                            <span class="status-badge overdue">متأخر</span>
                        </div>
                    `;
                }).join('')
                : '<p class="text-center">كل الأعضاء مسددين.</p>';
        }
    } catch (error) {
        console.warn('Payment overview unavailable:', error);
        if (lateMembersList) lateMembersList.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل المتأخرين.</p>';
    }
}

function loadChat() {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) {
        console.warn('chat-box element not found');
        return;
    }

    const searchInput = document.getElementById('chat-search-input');
    if (searchInput && searchInput.dataset.bound !== 'true') {
        searchInput.dataset.bound = 'true';
        searchInput.addEventListener('input', () => renderChatMessages(chatBox));
    }

    try {
        unsubscribeChat = onSnapshot(
            query(collection(db, "chat"), orderBy("createdAt", "desc"), limit(50)),
            async (snapshot) => {
                chatMessagesCache = snapshot.docs
                    .map((item) => ({ id: item.id, ...item.data() }))
                    .reverse();
                await hydrateChatUsersForMessages(chatMessagesCache);
                renderChatMessages(chatBox);
            },
            error => {
                console.error('Error loading chat:', error);
                chatBox.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل الدردشة.</p>';
            }
        );
    } catch (error) {
        console.error('Error setting up chat listener:', error);
        chatBox.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل الدردشة.</p>';
    }
}

async function hydrateChatUsersForMessages(messages = []) {
    const userIds = Array.from(new Set(
        messages
            .map((message) => message.userId)
            .filter((userId) => userId && !chatUsersCache.has(userId))
    ));

    if (!userIds.length) return;

    await Promise.all(userIds.map(async (userId) => {
        try {
            const userSnapshot = await getDoc(doc(db, 'users', userId));
            if (userSnapshot.exists()) {
                chatUsersCache.set(userId, userSnapshot.data());
            }
        } catch (error) {
            console.warn('Chat user profile unavailable:', error);
        }
    }));
}

function renderChatMessages(chatBox) {
    const searchTerm = (document.getElementById('chat-search-input')?.value || '').trim().toLowerCase();
    const messages = chatMessagesCache.filter((msg) => {
        if (!searchTerm) return true;
        return `${msg.userName || ''} ${msg.text || ''}`.toLowerCase().includes(searchTerm);
    });
    const shouldStickToBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 120;

    chatBox.innerHTML = '';

    if (!messages.length) {
        chatBox.innerHTML = '<p class="text-center">ما فيه رسائل مطابقة.</p>';
        return;
    }

    messages.forEach(msg => {
        const div = document.createElement('div');
        const isMe = msg.userId === auth.currentUser?.uid;
        div.className = `chat-message-row ${isMe ? 'is-me' : ''}`;

        const userDisplayName = msg.userName || 'مستخدم';
        const messageText = escapeHtml(msg.text || '');
        const time = formatMessageTime(msg.createdAt);
        const initials = getAvatarInitials(userDisplayName);
        const profile = chatUsersCache.get(msg.userId) || {};
        const avatarUrl = getSafeAvatarUrl(msg.avatarUrl || profile.avatarUrl || (isMe ? currentUser?.avatarUrl : '')) || 'assets/images/estraha-logo.svg';
        const avatarContent = `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(userDisplayName)}" loading="lazy" decoding="async">`;
        const adminChatControls = (auth.currentUser?.uid === ADMIN_UID || currentUser?.uid === ADMIN_UID)
            ? `<button type="button" class="pin-chat-message-btn btn btn-mini" data-id="${escapeHtml(msg.id)}">تثبيت</button>
               <button type="button" class="mute-chat-user-btn btn btn-mini" data-user-id="${escapeHtml(msg.userId || '')}">كتم</button>
               <button type="button" class="delete-chat-message-btn btn btn-danger btn-mini" data-id="${escapeHtml(msg.id)}">حذف</button>`
            : '';

        div.innerHTML = `
            <div class="chat-avatar">${avatarContent}</div>
            <div class="chat-message-stack">
                <div class="chat-message-meta">
                    <strong>${appSettings.pinnedMessageId === msg.id ? '📌 ' : ''}${escapeHtml(userDisplayName)}</strong>
                    <span>${escapeHtml(time)}</span>
                    ${adminChatControls}
                </div>
                <div class="message ${isMe ? 'mine' : ''}">
                    <p>${messageText}</p>
                </div>
            </div>
        `;
        chatBox.appendChild(div);
    });



    document.querySelectorAll('.pin-chat-message-btn').forEach((button) => {
        button.addEventListener('click', async (event) => {
            const messageId = event.currentTarget.dataset.id;
            if (!messageId) return;

            try {
                await setDoc(doc(db, 'settings', 'app'), {
                    pinnedMessageId: messageId
                }, { merge: true });

                appSettings.pinnedMessageId = messageId;
                showAlert('تم تثبيت الرسالة.');
            } catch (error) {
                console.error('Pin message failed:', error);
                showAlert('فشل تثبيت الرسالة.');
            }
        });
    });

    document.querySelectorAll('.mute-chat-user-btn').forEach((button) => {
        button.addEventListener('click', async (event) => {
            const userId = event.currentTarget.dataset.userId;
            if (!userId) return;

            const confirmed = confirm('متأكد تبي تكتم هذا العضو؟');
            if (!confirmed) return;

            try {
                await loadAppSettings();

                const muted = Array.isArray(appSettings.mutedUserIds)
                    ? [...appSettings.mutedUserIds]
                    : [];

                if (!muted.includes(userId)) {
                    muted.push(userId);
                }

                await setDoc(doc(db, 'settings', 'app'), {
                    mutedUserIds: muted
                }, { merge: true });

                appSettings.mutedUserIds = muted;

                showAlert('تم كتم العضو.');
            } catch (error) {
                console.error('Mute user failed:', error);
                showAlert('فشل كتم العضو.');
            }
        });
    });

    document.querySelectorAll('.delete-chat-message-btn').forEach((button) => {
        button.addEventListener('click', async (event) => {
            const messageId = event.currentTarget.dataset.id;
            const confirmed = confirm('متأكد تبي تحذف الرسالة؟');
            if (!confirmed || !messageId) return;

            try {
                await deleteDoc(doc(db, "chat", messageId));
                showAlert('تم حذف الرسالة.');
            } catch (error) {
                console.error('Chat message delete failed:', error);
                showAlert('فشل حذف الرسالة.');
            }
        });
    });

    if (shouldStickToBottom) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function formatMessageTime(timestamp) {
    if (!timestamp?.seconds) return '';
    return new Date(timestamp.seconds * 1000).toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getAvatarInitials(name = '') {
    return String(name || 'مستخدم')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] || '')
        .join('') || 'م';
}

function getSafeAvatarUrl(value = '') {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url)) return url;

    try {
        const parsed = new URL(url, window.location.origin);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
        return '';
    }
}

async function handleSendMessage(e) {
    e.preventDefault();

    const input = document.getElementById('chat-input');
    if (!input) {
        showAlert('عنصر الإدخال غير موجود.');
        return;
    }

    const text = input.value.trim();

    if (!text) {
        showAlert('اكتب رسالتك أول.');
        return;
    }

    if (!currentUser) {
        showAlert('لازم تقلط أول.');
        return;
    }

    await loadAppSettings();

    if (appSettings.chatEnabled === false) {
        showAlert('الدردشة مقفلة مؤقتاً.');
        return;
    }

    if (Array.isArray(appSettings.mutedUserIds) && appSettings.mutedUserIds.includes(currentUser.uid)) {
        showAlert('تم كتمك مؤقتاً من الدردشة.');
        return;
    }

    try {
        await addDoc(collection(db, "chat"), {
            text: text,
            userId: currentUser.uid,
            userName: currentUser.name || 'مستخدم',
            avatarUrl: currentUser.avatarUrl || '',
            createdAt: serverTimestamp()
        });
        input.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        showAlert('ما قدرت أرسل الرسالة: ' + (error.message || 'جرّب مرة ثانية'));
    }
}

function loadProfileData() {
    if (!currentUser) return;

    const nameElement = document.getElementById('profile-name');
    const phoneElement = document.getElementById('profile-phone');

    if (nameElement) nameElement.textContent = currentUser.name || 'بدون اسم';
    if (phoneElement) phoneElement.textContent = currentUser.phone || 'بدون رقم';
}

// --- Service Functions ---

async function getPrayerData(latitude, longitude) {
    const now = new Date();
    const date = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
    const response = await fetch(`https://api.aladhan.com/v1/timings/${date}?latitude=${latitude}&longitude=${longitude}&method=4`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
}

function prayerCards(timings, keys) {
    const labels = {
        Fajr: 'الفجر',
        Sunrise: 'الشروق',
        Dhuhr: 'الظهر',
        Asr: 'العصر',
        Maghrib: 'المغرب',
        Isha: 'العشاء'
    };

    return keys.map((key) => `
        <article class="stat">
            <span>${labels[key]}</span>
            <strong>${escapeHtml(timings[key] || '--:--')}</strong>
        </article>
    `).join('');
}

async function loadHomePrayerAndDate() {
    const hijriContainer = document.getElementById('hijri-date-container');
    const prayerContainer = document.getElementById('home-prayer-times');

    if (!hijriContainer || !prayerContainer) return;

    const todayGregorian = new Date();

    try {
        hijriContainer.innerHTML = `<p class="font-bold text-lg">${todayGregorian.toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>`;

        const response = await fetch(`https://api.aladhan.com/v1/gToH?date=${todayGregorian.getDate()}-${todayGregorian.getMonth()+1}-${todayGregorian.getFullYear()}`);
        if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.hijri) {
                const hijri = data.data.hijri;
                hijriContainer.innerHTML += `<p class="text-md">${hijri.day} ${hijri.month.ar} ${hijri.year} هـ</p>`;
            }
        }
    } catch (error) {
        console.error("Could not fetch Hijri date:", error);
    }

    if (!navigator.geolocation) {
        prayerContainer.innerHTML = `<p class="text-yellow-400 text-center w-full">جهازك ما يدعم تحديد الموقع.</p>`;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                const data = await getPrayerData(latitude, longitude);
                const timings = data.data.timings;

                prayerContainer.innerHTML = prayerCards(timings, ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
            } catch (error) {
                console.error('Error fetching prayer times:', error);
                prayerContainer.innerHTML = `<p class="text-red-400 text-center w-full">ما قدرنا نجيب المواقيت.</p>`;
            }
        },
        () => {
            prayerContainer.innerHTML = `<p class="text-yellow-400 text-center w-full">فعّل الموقع عشان نجيب المواقيت.</p>`;
        }
    );
}

async function loadHomeWeather() {
    const tempElement = document.getElementById('weather-temp');
    const descElement = document.getElementById('weather-desc');
    const locationElement = document.getElementById('weather-location');
    if (!tempElement || !descElement) return;

    const coords = await getCurrentPositionSafe().catch(() => null);

    if (!coords) {
        tempElement.textContent = '--°';
        descElement.textContent = 'فعّل الموقع لعرض الطقس';
        if (locationElement) locationElement.textContent = 'الموقع غير محدد';
        return;
    }

    try {
        if (locationElement) locationElement.textContent = coords.label || 'موقعك';
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code&timezone=auto`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
        const data = await response.json();
        const current = data.current || {};
        tempElement.textContent = Number.isFinite(current.temperature_2m)
            ? `${Math.round(current.temperature_2m)}°`
            : '--°';
        descElement.textContent = weatherCodeLabel(current.weather_code);
    } catch (error) {
        console.warn('Weather unavailable:', error);
        tempElement.textContent = '--°';
        descElement.textContent = 'الطقس غير متاح';
    }
}

function getCurrentPositionSafe() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation unavailable'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                label: 'موقعك'
            }),
            reject,
            { timeout: 4200, maximumAge: 600000 }
        );
    });
}

function weatherCodeLabel(code) {
    const labels = {
        0: 'صحو',
        1: 'غالباً صافي',
        2: 'غيم خفيف',
        3: 'غائم',
        45: 'ضباب',
        48: 'ضباب كثيف',
        51: 'رذاذ خفيف',
        53: 'رذاذ',
        55: 'رذاذ قوي',
        61: 'مطر خفيف',
        63: 'مطر',
        65: 'مطر قوي',
        80: 'زخات خفيفة',
        81: 'زخات مطر',
        82: 'زخات قوية',
        95: 'رعد'
    };
    return labels[code] || 'طقس متغير';
}

async function loadHomeMembersSummary() {
    const membersCount = document.getElementById('home-members-count');
    const activeCount = document.getElementById('home-active-count');
    const unpaidCount = document.getElementById('home-unpaid-count');
    const percentElement = document.getElementById('home-qattah-percent');
    const paidElement = document.getElementById('home-paid-count');
    const lateElement = document.getElementById('home-late-count');
    const meter = document.getElementById('home-qattah-meter');

    if (!membersCount && !percentElement) return;

    try {
        const snapshot = await getDocs(collection(db, "users"));
        const members = snapshot.docs.map((item) => item.data());
        const total = members.length;
        const paid = members.filter((member) => member.paymentStatus === 'paid').length;
        const late = Math.max(total - paid, 0);
        const percent = total ? Math.round((paid / total) * 100) : 0;

        if (membersCount) membersCount.textContent = total ? String(total) : '0';
        if (activeCount) activeCount.textContent = `${paid} مسدد`;
        if (unpaidCount) unpaidCount.textContent = `${late} متأخر`;
        if (percentElement) percentElement.textContent = total ? `${percent}%` : '0%';
        if (paidElement) paidElement.textContent = String(paid);
        if (lateElement) lateElement.textContent = String(late);
        if (meter) meter.style.setProperty('--value', `${percent}%`);
    } catch (error) {
        console.warn('Home member summary unavailable:', error);
        if (membersCount) membersCount.textContent = '--';
        if (percentElement) percentElement.textContent = '--';
    }
}

async function loadHomeChatPreview() {
    const container = document.getElementById('home-chat-preview');
    if (!container) return;

    try {
        const snapshot = await getDocs(query(collection(db, "chat"), orderBy("createdAt", "desc"), limit(3)));
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center">ما فيه رسائل للحين.</p>';
            return;
        }

        container.innerHTML = snapshot.docs.map((item) => {
            const message = item.data();
            return `
                <span>
                    ${escapeHtml(message.userName || 'واحد من الربع')}
                    <b>${escapeHtml(message.text || '')}</b>
                </span>
            `;
        }).join('');
    } catch (error) {
        console.warn('Home chat preview unavailable:', error);
        container.innerHTML = '<p class="text-center">الدردشة ما ظهرت حالياً.</p>';
    }
}

async function loadHomeMatches() {
    const container = document.getElementById('home-matches-list');
    if (!container) return;
    await loadMatches(container, 3, true);
}

async function loadHomeNews() {
    const container = document.getElementById('home-arabiya-news-list');
    if (!container) return;
    await loadNews(container, 3);
}


async function loadPrayerTimes() {
    const container = document.getElementById('prayer-times-container');
    if (!container) return;

    container.innerHTML = `<p class="text-center w-full">اسمح بالموقع عشان نجيب المواقيت...</p>`;

    if (!navigator.geolocation) {
        container.innerHTML = `<p class="text-yellow-400 text-center w-full">جهازك ما يدعم تحديد الموقع.</p>`;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                const data = await getPrayerData(latitude, longitude);

                if (!data.data || !data.data.timings) {
                    throw new Error('Invalid prayer data structure');
                }

                const timings = data.data.timings;
                container.innerHTML = prayerCards(timings, ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
            } catch (error) {
                console.error('Error fetching prayer times:', error);
                container.innerHTML = `<p class="text-red-400 text-center w-full">ما قدرنا نجيب مواقيت الصلاة.</p>`;
            }
        },
        () => {
            container.innerHTML = `<p class="text-yellow-400 text-center w-full">الموقع مقفل، ما نقدر نعرض المواقيت.</p>`;
        }
    );
}

async function initQibla() {
    const container = document.getElementById('qibla-container');
    const status = document.getElementById('qibla-status');
    const compass = document.getElementById('compass');

    if (!container || !status || !compass) {
        console.warn('Qibla elements not found');
        return;
    }

    if (!navigator.geolocation) {
        status.textContent = 'جهازك ما يدعم تحديد الموقع.';
        return;
    }

    status.textContent = "اسمح بالموقع عشان نحدد القبلة...";

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const { latitude, longitude } = position.coords;
                const response = await fetch(`https://api.aladhan.com/v1/qibla/${latitude}/${longitude}`);

                if (!response.ok) {
                    throw new Error('Failed to fetch qibla direction');
                }

                const data = await response.json();

                if (!data.data || data.data.direction === undefined) {
                    throw new Error('Invalid qibla data structure');
                }

                const qiblaAngle = data.data.direction;

                status.textContent = "حرك جوالك وبتضبط معك القبلة";
                compass.style.display = 'block';

                if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
                    try {
                        const permission = await window.DeviceOrientationEvent.requestPermission();
                        if (permission === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientation);
                        } else {
                            status.textContent = 'تم رفض حساس الحركة.';
                        }
                    } catch (permError) {
                        console.error('Permission request error:', permError);
                        status.textContent = 'صار خطأ بطلب الإذن.';
                    }
                } else if ('DeviceOrientationEvent' in window) {
                    window.addEventListener('deviceorientation', handleOrientation);
                } else {
                    status.textContent = 'جهازك ما يدعم تحديد الاتجاه.';
                }

                function handleOrientation(event) {
                    let direction = event.webkitCompassHeading || event.alpha;
                    if (direction === null) return;
                    compass.style.transform = `rotate(${-direction}deg)`;
                    const qiblaArrow = document.getElementById('qibla-arrow');
                    if (qiblaArrow) {
                        qiblaArrow.style.transform = `translateX(-50%) rotate(${qiblaAngle}deg)`;
                    }
                }
            } catch (error) {
                console.error('Error in initQibla:', error);
                status.textContent = 'ما قدرنا نحسب اتجاه القبلة.';
            }
        },
        () => {
            status.textContent = 'الموقع مقفل، ما نقدر نعرض القبلة.';
        }
    );
}

async function loadMatches(container, limit = 10, compact = false) {
    if (!container) container = document.getElementById('matches-list');
    if (!container) return;

    container.innerHTML = `<p class="text-center">جاري تحميل المباريات...</p>`;

    const THE_SPORTS_DB_KEY = '3';
    const SAUDI_LEAGUE_ID = '4668';
    const WORLD_CUP_LEAGUE_ID = '4429';
    const WORLD_CUP_SEASON = '2026';
    const today = getLocalDateKey();

    try {
        const saudiSeason = await getSaudiLeagueSeason(THE_SPORTS_DB_KEY, SAUDI_LEAGUE_ID);
        const todayUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsday.php?d=${today}&s=Soccer`;
        const saudiSeasonUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsseason.php?id=${SAUDI_LEAGUE_ID}&s=${encodeURIComponent(saudiSeason)}`;
        const worldCupSeasonUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsseason.php?id=${WORLD_CUP_LEAGUE_ID}&s=${WORLD_CUP_SEASON}`;
        const [todayResult, saudiResult, worldCupResult, githubResult] = await Promise.allSettled([
            fetchJsonWithTimeout(todayUrl),
            fetchJsonWithTimeout(saudiSeasonUrl),
            fetchJsonWithTimeout(worldCupSeasonUrl),
            fetchWorldCupGithubFixtures()
        ]);

        const todayData = getSettledValue(todayResult, { events: [] }, 'مباريات اليوم غير متاحة حالياً.');
        const saudiData = getSettledValue(saudiResult, { events: [] }, 'جدول الدوري السعودي غير متاح حالياً.');
        const worldCupData = getSettledValue(worldCupResult, { events: [] }, 'جدول كأس العالم من TheSportsDB غير متاح حالياً.');
        const githubWorldCup = getSettledValue(githubResult, [], 'جدول كأس العالم الاحتياطي غير متاح حالياً.');

        const saudiEvents = (saudiData.events || [])
            .filter((event) => event.idLeague === SAUDI_LEAGUE_ID)
            .sort(compareSportsDbEvents);
        const todayMatches = (todayData.events || [])
            .filter((event) => [SAUDI_LEAGUE_ID, WORLD_CUP_LEAGUE_ID].includes(event.idLeague))
            .slice(0, limit);
        const saudiUpcoming = saudiEvents.filter((event) => getEventDateKey(event) > today).slice(0, limit);
        const sportsDbWorldCup = (worldCupData.events || [])
            .filter((event) => event.idLeague === WORLD_CUP_LEAGUE_ID)
            .map((event) => ({ ...event, strSource: 'TheSportsDB' }));
        const worldCupUpcoming = mergeWorldCupFixtures(sportsDbWorldCup, githubWorldCup)
            .filter((event) => getEventDateKey(event) >= today)
            .sort(compareSportsDbEvents)
            .slice(0, limit);
        queueNextMatchNotification([
            ...todayMatches,
            ...saudiUpcoming,
            ...worldCupUpcoming
        ]);

        if (compact) {
            const compactMatches = [
                ...todayMatches,
                ...saudiUpcoming,
                ...worldCupUpcoming
            ].slice(0, limit);
            container.innerHTML = compactMatches.length
                ? compactMatches.map(renderSportsDbMatchCard).join('')
                : '<div class="empty card">ما فيه مباريات متاحة حالياً.</div>';
            return;
        }

        container.innerHTML = `
            <div class="panel">
                <div class="panel-head"><h2>مباريات اليوم</h2><span class="badge scheduled">اليوم</span></div>
                <div class="cards-grid matches-grid">
                    ${todayMatches.length ? todayMatches.map(renderSportsDbMatchCard).join('') : '<div class="empty card">ما فيه مباريات اليوم.</div>'}
                </div>
            </div>
            <div class="panel">
                <div class="panel-head"><h2>الدوري السعودي</h2><span class="badge scheduled">قادمة</span></div>
                <div class="cards-grid matches-grid">
                    ${saudiUpcoming.length ? saudiUpcoming.map(renderSportsDbMatchCard).join('') : '<div class="empty card">ما فيه مباريات جاية للدوري السعودي حالياً.</div>'}
                </div>
            </div>
            <div class="panel">
                <div class="panel-head"><h2>كأس العالم 2026</h2><span class="badge scheduled">الجدول</span></div>
                <div class="cards-grid matches-grid">
                    ${worldCupUpcoming.length ? worldCupUpcoming.map(renderSportsDbMatchCard).join('') : '<div class="empty card">ما فيه جدول كأس العالم متاح حالياً.</div>'}
                </div>
            </div>
        `;

    } catch (error) {
        console.error("Error fetching matches:", error);
        container.innerHTML = `<p class="text-center">ما قدرنا نجيب المباريات. جرّب مرة ثانية.</p>`;
    }
}

async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`${url} returned ${response.status}`);
        return response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function getSettledValue(result, fallback, warning) {
    if (result.status === 'fulfilled') return result.value || fallback;
    console.warn(warning, result.reason);
    return fallback;
}

async function fetchWorldCupGithubFixtures() {
    const [matchesResponse, teamsResponse] = await Promise.all([
        fetch('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.matches.json'),
        fetch('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.teams.json')
    ]);

    if (!matchesResponse.ok || !teamsResponse.ok) {
        throw new Error(`GitHub World Cup fixtures returned ${matchesResponse.status}/${teamsResponse.status}`);
    }

    const [matches, teams] = await Promise.all([
        matchesResponse.json(),
        teamsResponse.json()
    ]);
    const teamsById = new Map((teams || []).map((team) => [String(team.id), team]));

    return (matches || []).map((match) => normalizeGithubWorldCupMatch(match, teamsById));
}

function normalizeGithubWorldCupMatch(match, teamsById) {
    const home = teamsById.get(String(match.home_team_id));
    const away = teamsById.get(String(match.away_team_id));
    const dateParts = parseWorldCupLocalDate(match.local_date);
    const isFinished = String(match.finished).toUpperCase() === 'TRUE';
    const isLive = match.time_elapsed && !['notstarted', 'finished'].includes(String(match.time_elapsed).toLowerCase());

    return {
        idEvent: `github-wc2026-${match.id}`,
        idLeague: '4429',
        strLeague: 'FIFA World Cup 2026',
        strSeason: '2026',
        strSource: 'GitHub schedule',
        strHomeTeam: home?.name_en || 'TBD',
        strAwayTeam: away?.name_en || 'TBD',
        strHomeTeamBadge: safeFlagUrl(home?.iso2 || home?.fifa_code),
        strAwayTeamBadge: safeFlagUrl(away?.iso2 || away?.fifa_code),
        intHomeScore: isFinished ? Number(match.home_score || 0) : null,
        intAwayScore: isFinished ? Number(match.away_score || 0) : null,
        dateEvent: dateParts.date,
        dateEventLocal: dateParts.date,
        strTime: dateParts.time,
        strTimeLocal: dateParts.time,
        strStatus: isLive ? 'Live' : isFinished ? 'FT' : 'NS',
        strGroup: match.group,
        intRound: match.matchday
    };
}

function parseWorldCupLocalDate(value = '') {
    const [dateValue = '', timeValue = ''] = String(value).split(' ');
    const [month, day, year] = dateValue.split('/');
    const date = year && month && day
        ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        : '';
    const time = timeValue ? `${timeValue}:00`.slice(0, 8) : '';
    return { date, time };
}

function mergeWorldCupFixtures(primary = [], fallback = []) {
    const merged = new Map();
    fallback.forEach((event) => merged.set(getWorldCupMatchKey(event), event));
    primary.forEach((event) => merged.set(getWorldCupMatchKey(event), event));
    return Array.from(merged.values());
}

function getWorldCupMatchKey(event) {
    return [
        getEventDateKey(event),
        (event.strHomeTeam || '').toLowerCase(),
        (event.strAwayTeam || '').toLowerCase()
    ].join('|');
}

function compareSportsDbEvents(a, b) {
    const firstKickoff = getSportsDbKickoffDate(a)?.getTime() || 0;
    const secondKickoff = getSportsDbKickoffDate(b)?.getTime() || 0;
    return firstKickoff - secondKickoff;
}

function safeFlagUrl(code) {
    const normalized = String(code || '').trim().toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z]{3})?$/.test(normalized)) return '';
    return `https://flagcdn.com/w80/${normalized}.png`;
}

async function getSaudiLeagueSeason(apiKey, leagueId) {
    const response = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupleague.php?id=${leagueId}`);
    if (!response.ok) return '2025-2026';
    const data = await response.json();
    return data.leagues?.[0]?.strCurrentSeason || '2025-2026';
}

function getLocalDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function getEventDateKey(event = {}) {
    const kickoff = getSportsDbKickoffDate(event);
    if (kickoff) return getLocalDateKey(kickoff);
    return event.dateEvent || event.dateEventLocal || '';
}

function queueNextMatchNotification(matches = []) {
    if (!matches.length || localStorage.getItem('al-istiraha-matches-notification') !== 'true') return;
    console.log('Match notifications are scheduled through Firebase Cloud Functions.');
}

function getMatchNotificationTeams(match = {}) {
    const homeTeam = cleanMatchTeamName(
        match.homeTeam ||
        match.teamHome ||
        match.strHomeTeam ||
        match.home_team ||
        match.home?.name
    );
    const awayTeam = cleanMatchTeamName(
        match.awayTeam ||
        match.teamAway ||
        match.strAwayTeam ||
        match.away_team ||
        match.away?.name
    );

    if (!homeTeam || !awayTeam) return null;
    return { homeTeam, awayTeam };
}

function cleanMatchTeamName(value) {
    const teamName = String(value || '').trim();
    if (!teamName || /^(tbd|فريق|-|null|undefined|\[object Object\])$/i.test(teamName)) return '';
    return teamName;
}

function getSportsDbKickoffDate(event = {}) {
    const timestampValue = String(event.strTimestamp || '').trim();
    if (timestampValue) {
        const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestampValue)
            ? timestampValue
            : `${timestampValue}Z`;
        const date = new Date(normalized);
        if (!Number.isNaN(date.getTime())) return date;
    }

    const isGithubWorldCupFallback = String(event.idEvent || '').startsWith('github-wc2026-');
    const utcDateValue = String(event.dateEvent || '').trim();
    const utcTimeMatch = String(event.strTime || '').match(/\d{1,2}:\d{2}(?::\d{2})?/);

    if (!isGithubWorldCupFallback && /^\d{4}-\d{2}-\d{2}$/.test(utcDateValue) && utcTimeMatch) {
        const utcTime = utcTimeMatch[0].length === 5 ? `${utcTimeMatch[0]}:00` : utcTimeMatch[0];
        const utcKickoff = new Date(`${utcDateValue}T${utcTime}Z`);
        if (!Number.isNaN(utcKickoff.getTime())) return utcKickoff;
    }

    const localDateValue = String(event.dateEventLocal || event.dateEvent || '').trim();
    const localTimeMatch = String(event.strTimeLocal || event.strTime || '').match(/\d{1,2}:\d{2}(?::\d{2})?/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDateValue) || !localTimeMatch) return null;

    const localTime = localTimeMatch[0].length === 5 ? `${localTimeMatch[0]}:00` : localTimeMatch[0];
    const localKickoff = new Date(`${localDateValue}T${localTime}+03:00`);
    return Number.isNaN(localKickoff.getTime()) ? null : localKickoff;
}

function formatSaudiMatchTime(event = {}) {
    const kickoff = getSportsDbKickoffDate(event);
    if (!kickoff) return '--:--';
    return new Intl.DateTimeFormat('ar-SA', {
        timeZone: 'Asia/Riyadh',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(kickoff);
}

function formatSaudiMatchDate(event = {}) {
    const kickoff = getSportsDbKickoffDate(event);
    if (!kickoff) return getEventDateKey(event);
    return new Intl.DateTimeFormat('ar-SA', {
        timeZone: 'Asia/Riyadh',
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    }).format(kickoff);
}

function renderSportsDbMatchCard(event) {
    const status = event.strStatus || (event.intHomeScore !== null && event.intAwayScore !== null ? 'FT' : 'NS');
    const isFinished = status === 'FT' || (event.intHomeScore !== null && event.intAwayScore !== null);
    const isLive = ['Live', '1H', '2H', 'HT', 'ET', 'P'].includes(status);
    const statusClass = isLive ? 'live' : isFinished ? 'done' : 'scheduled';
    const statusLabel = isLive ? 'مباشر' : isFinished ? 'انتهت' : 'قادمة';
    const score = isFinished
        ? `${event.intHomeScore ?? 0} - ${event.intAwayScore ?? 0}`
        : formatSaudiMatchTime(event);
    const homeLogo = safeExternalUrl(event.strHomeTeamBadge, '');
    const awayLogo = safeExternalUrl(event.strAwayTeamBadge, '');
    const homeMark = renderTeamMark(homeLogo, event.strHomeTeam);
    const awayMark = renderTeamMark(awayLogo, event.strAwayTeam);

    return `
        <article class="match-card card">
            <span class="badge ${statusClass}">${statusLabel}</span>
            <p class="muted">${escapeHtml(event.strLeague || 'Saudi Pro League')}${event.strSource ? ` · ${escapeHtml(event.strSource)}` : ''}</p>
            <div class="match-teams">
                <span>${homeMark} ${escapeHtml(event.strHomeTeam || 'فريق')}</span>
                <span>${awayMark} ${escapeHtml(event.strAwayTeam || 'فريق')}</span>
            </div>
            <div class="match-score">${escapeHtml(score)}</div>
            <p class="muted">${escapeHtml(formatSaudiMatchDate(event))} · بتوقيت السعودية</p>
        </article>
    `;
}

function renderTeamMark(src, teamName = '') {
    if (src) {
        return `<img src="${escapeHtml(src)}" alt="" class="team-logo" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
    }
    return `<span class="team-logo team-initial">${escapeHtml(getTeamInitial(teamName))}</span>`;
}

function getTeamInitial(teamName = '') {
    const clean = String(teamName || '').trim();
    return clean ? clean.slice(0, 2).toUpperCase() : 'FC';
}

async function loadNews(container, limit = 10) {
    if (!container) container = document.getElementById('arabiya-news-list') || document.getElementById('news-list');
    if (!container) return;

    const compact = container.id === 'home-arabiya-news-list' || Number(limit) <= 3;
    if (window.EstrahaNews?.load) {
        await window.EstrahaNews.load(container, { compact, limit });
        return;
    }

    container.innerHTML = '<p class="text-center">جاري تحميل أخبار العربية...</p>';
    window.setTimeout(() => {
        window.EstrahaNews?.load?.(container, { compact, limit });
    }, 0);
}


// --- App Initialization ---

function initApp() {
    console.log('Initializing app...');
    setOnlineState();

    try {
        loadTheme();
    } catch (error) {
        console.error('Error loading theme:', error);
    }

    onAuthStateChanged(auth, async (user) => {
        try {
            if (user) {
                console.log('✓ User authenticated:', user.uid);
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (userData.disabled === true) {
                        currentUser = null;
                        document.body.classList.remove('is-authenticated');
                        sidebar?.classList.remove('open');
                        syncShellUserState();
                        showAlert('تم تعطيل عضويتك. تواصل مع مسؤول الاستراحة.');
                        await signOut(auth);
                        return;
                    }

                    currentUser = { uid: user.uid, ...userData };
                    document.body.classList.add('is-authenticated');
                    syncShellUserState();
                    if ('Notification' in window && Notification.permission === 'granted') {
                        initFirebaseMessaging()
                            .then(() => syncFcmTokenWithPreferences())
                            .catch((error) => console.warn('Firebase Cloud Messaging init failed:', error));
                    }
                    if (appLogo) appLogo.style.display = 'block';
                    console.log('✓ User profile found, navigating to home');
                    await renderPage(window.location.hash || '#home');
                } else {
                    console.log('✓ Auth user has no Firestore profile, redirecting to registration');
                    currentUser = null;
                    document.body.classList.remove('is-authenticated');
                    syncShellUserState();
                    if (appLogo) appLogo.style.display = 'block';
                    await navigateToHash('#register');
                }
            } else {
                console.log('✓ No user authenticated, showing login');
                currentUser = null;
                document.body.classList.remove('is-authenticated');
                sidebar?.classList.remove('open');
                syncShellUserState();
                if (appLogo) appLogo.style.display = 'block';
                await navigateToHash(currentPublicRoute());
            }
        } catch (error) {
            console.error('✗ Error in auth state change:', error);
            currentUser = null;
            document.body.classList.remove('is-authenticated');
            sidebar?.classList.remove('open');
            syncShellUserState();
            if (appLogo) appLogo.style.display = 'block';
            await navigateToHash(currentPublicRoute());
        }
    });

    // Keep the splash brief so it does not delay the largest page content.
    const splash = document.getElementById('splash');
    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');

    const hideSplash = () => {
        if (!splash || splash.classList.contains('done')) return;
        splash.classList.add('done');
        window.setTimeout(() => {
            console.log('✓ Splash screen hidden, main content shown');
        }, 220);
    };

    if (hasSeenSplash) {
        splash?.classList.add('done');
        console.log('✓ Splash skipped');
    } else {
        sessionStorage.setItem('hasSeenSplash', 'true');

        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const configuredDuration = Number(appSettings.splashDuration || 0.45);
        const splashDelay = prefersReducedMotion
            ? 0
            : Math.min(Math.max(configuredDuration, 0.2), 0.65) * 1000;

        window.setTimeout(hideSplash, splashDelay);
    }

    window.addEventListener('hashchange', () => {
        console.log('Page navigation:', window.location.hash);
        // Clean up recaptcha verifiers on page change
        recaptchaManager.destroyAll();
        renderPage(window.location.hash);
    });

    console.log('✓ App initialization complete');
}

// Start the app
initApp();

// Fix internal hash links for auth pages and SPA navigation
document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    const hash = link.getAttribute('href');
    if (!hash || hash === '#') return;

    event.preventDefault();
    navigateToHash(hash).catch((error) => {
        console.error('Navigation failed:', error);
    });
});
