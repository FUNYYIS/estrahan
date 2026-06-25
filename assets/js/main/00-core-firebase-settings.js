// استيراد الوظائف اللازمة من حزم Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
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

const APP_ASSET_VERSION = '274';
const FCM_VAPID_KEY = 'BDv-0DqOy9KaOY4Om9wdNitW8ZB3ZDTqZn-vbOH2I7jWQL888yWFq1GGWXqR4GYHyTw_NWB_S4cx8HI7zrnp77U';


// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'us-central1');
const storage = getStorage(app);
const ADMIN_UID = "tquFv8nhU3ZPGgqumfCo3Hx67k02"; //  <-- تم وضع معرف المستخدم الخاص بالمسؤول هنا

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
    splashDuration: 6,
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



function applySplashSettings() {
    const splash = document.getElementById('splash');
    const splashCard = splash?.querySelector('.splash-card');
    if (!splash || !splashCard) return;

    if (appSettings.splashEnabled === false) {
        splash.style.display = 'none';
        return;
    }

    const type = appSettings.splashType || 'logo';
    const title = appSettings.splashTitle || appSettings.siteName || 'تطبيق الاستراحة';
    const imageUrl = safeExternalUrl(appSettings.splashImageUrl || appSettings.themeLogoUrl || '', '');
    const videoUrl = safeExternalUrl(appSettings.splashVideoUrl || '', '');

    if (type === 'video' && videoUrl) {
        splashCard.innerHTML = `
            <video class="splash-media" src="${escapeHtml(videoUrl)}" autoplay muted playsinline preload="auto"></video>
            <strong>${escapeHtml(title)}</strong>
        `;
    } else if (type === 'image' && imageUrl) {
        splashCard.innerHTML = `
            <img class="splash-logo splash-media" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" loading="eager" decoding="async">
            <strong>${escapeHtml(title)}</strong>
        `;
    } else {
        const logoUrl = safeExternalUrl(appSettings.themeLogoUrl || '', '') || 'assets/images/estraha-logo.svg';
        splashCard.innerHTML = `
            <img class="splash-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(title)}" loading="eager" decoding="async">
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
