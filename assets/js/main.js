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
    getDocs,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// إعدادات Firebase الخاصة بتطبيقك
const firebaseConfig = {
  apiKey: "AIzaSyCoIy5Yf3nvkpbp9l43590snBZui86uSXY",
  authDomain: "estrahaapp-9e327.firebaseapp.com",
  projectId: "estrahaapp-9e327",
  storageBucket: "estrahaapp-9e327.appspot.com",
  messagingSenderId: "198308357962",
  appId: "1:198308357962:web:63b5b267e738efd54a83b3"
};


// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const ADMIN_UID = "tquFv8nhU3ZPGgqumfCo3Hx67k02"; //  <-- تم وضع معرف المستخدم الخاص بالمسؤول هنا

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
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.querySelector('.sidebar');
const logoutButton = document.getElementById('logout-button');
const profileName = document.querySelector('.profile-copy strong');
const profileSince = document.querySelector('.profile-copy small');
const shellAvatar = document.getElementById('shell-avatar');
const topProfile = document.getElementById('top-profile');

// --- حالة التطبيق ---
let currentUser = null;
let tempName = ''; // لتخزين الاسم مؤقتاً عند التسجيل
let unsubscribeChat, unsubscribeMembers, unsubscribePayments;

const routeTitles = {
    '#login': 'أقلط',
    '#register': 'سجل معنا',
    '#home': 'المجلس',
    '#members': 'الربع',
    '#payments': 'القطة الشهرية',
    '#chat': 'السوالف',
    '#settings': 'الضبط',
    '#profile-settings': 'بياناتك',
    '#notifications-settings': 'تنبيهاتك',
    '#prayer': 'الصلاة',
    '#qibla': 'القبلة',
    '#matches': 'مباريات اليوم',
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
function showAlert(message) {
    alertMessage.textContent = message;
    customAlert.style.display = 'flex';
}
alertCloseBtn.addEventListener('click', () => {
    customAlert.style.display = 'none';
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
    document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    updateThemeButtons();
}

function toggleTheme() {
    const newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('al-istiraha-theme', newTheme);
    applyTheme(newTheme);
}

function loadTheme() {
    const savedTheme = localStorage.getItem('al-istiraha-theme') || 'light';
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
    if (bottomNav) bottomNav.style.display = currentUser ? 'grid' : 'none';
    if (logoutButton) logoutButton.style.display = currentUser ? 'flex' : 'none';
    if (profileName) profileName.textContent = currentUser?.name ? `أهلاً ${currentUser.name}` : '';
    if (profileSince) profileSince.textContent = currentUser ? 'من الربع الشقردية' : '';
    if (shellAvatar) shellAvatar.src = currentUser?.avatarUrl || 'assets/images/shagrdiyah-mark.png';
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

function updateActiveNav(hash) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === hash) {
            link.classList.add('active');
        }
    });

    if (pageTitle) pageTitle.textContent = routeTitles[hash] || 'الشقردية';
    if (todayLabel) {
        todayLabel.textContent = new Intl.DateTimeFormat('ar-SA', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).format(new Date());
    }
}

async function renderPage(hash) {
    const defaultPage = currentUser ? '#home' : '#login';
    const requestedHash = normalizeHash(hash || defaultPage);
    const isPublicRoute = publicRoutes.includes(requestedHash);
    const currentHash = currentUser && isPublicRoute
        ? '#home'
        : routes[requestedHash] && (currentUser || isPublicRoute) ? requestedHash : defaultPage;
    const pageFile = routes[currentHash];

    if (pageFile) {
        try {
            const response = await fetch(`pages/${pageFile}`);
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

            attachEventListeners(currentHash);
            // Normalize page ID for loadPageData
            const normalizedPageId = currentHash.substring(1).replace('#', '');
            loadPageData(normalizedPageId);
            updateActiveNav(currentHash);
            sidebar?.classList.remove('open');
        } catch (error) {
            console.error('Error fetching page:', error);
            pageContent.innerHTML = '<p class="text-center">عفواً، الصفحة غير موجودة.</p>';
        }
    } else {
        // Fallback to default page
        await renderPage(defaultPage);
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
        if (phoneForm) phoneForm.addEventListener('submit', (e) => handleSendCode(e, false));
        if (codeForm) codeForm.addEventListener('submit', (e) => handleVerifyCode(e, false));

        // Setup recaptcha with validation
        const recaptchaSetupSuccess = setupRecaptcha('recaptcha-container');
        if (!recaptchaSetupSuccess) {
            console.error('Failed to set up reCAPTCHA on login page');
        }
    }

    if (pageId === 'register') {
        console.log('Setting up register page event listeners');

        // Clean up old verifier if switching pages
        recaptchaManager.destroy('recaptcha-container-register');

        const registerForm = document.getElementById('register-form');
        const registerCodeForm = document.getElementById('register-code-form');
        if (registerForm) registerForm.addEventListener('submit', (e) => handleSendCode(e, true));
        if (registerCodeForm) registerCodeForm.addEventListener('submit', (e) => handleVerifyCode(e, true));

        // Setup recaptcha with validation
        const recaptchaSetupSuccess = setupRecaptcha('recaptcha-container-register');
        if (!recaptchaSetupSuccess) {
            console.error('Failed to set up reCAPTCHA on register page');
        }
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

    if (nameInput) nameInput.value = currentUser.name || '';
    if (phoneInput) phoneInput.value = currentUser.phone || '';
    if (avatarPreview) avatarPreview.src = currentUser.avatarUrl || 'assets/images/shagrdiyah-mark.png';

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
        const nextName = nameInput?.value.trim() || '';
        const nextPhone = phoneInput?.value.trim() || '';

        if (!nextName) {
            showAlert('اكتب اسمك عشان نحفظ البيانات.');
            return;
        }

        try {
            setFormLoading(form, true, 'جاري الحفظ...');
            if (status) status.textContent = 'نحفظ بياناتك...';
            await updateDoc(doc(db, "users", currentUser.uid), {
                name: nextName,
                phone: nextPhone,
                updatedAt: serverTimestamp()
            });
            currentUser = { ...currentUser, name: nextName, phone: nextPhone };
            syncShellUserState();
            if (status) status.textContent = 'تم حفظ بياناتك.';
        } catch (error) {
            console.error('Profile update failed:', error);
            showAlert('ما قدرنا نحفظ البيانات. جرّب مرة ثانية.');
            if (status) status.textContent = '';
        } finally {
            setFormLoading(form, false);
        }
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
    document.querySelectorAll('[data-notification-toggle]').forEach((button) => {
        const key = `al-istiraha-${button.dataset.notificationToggle}`;
        const savedValue = localStorage.getItem(key);
        const enabled = savedValue === null ? button.getAttribute('aria-pressed') === 'true' : savedValue === 'true';
        setNotificationToggleState(button, enabled);
        button.addEventListener('click', () => {
            const nextValue = button.getAttribute('aria-pressed') !== 'true';
            localStorage.setItem(key, String(nextValue));
            setNotificationToggleState(button, nextValue);
            if (nextValue) requestBrowserNotificationPermission();
        });
    });
}

async function requestBrowserNotificationPermission() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    try {
        await Notification.requestPermission();
    } catch (error) {
        console.warn('Notification permission request failed:', error);
    }
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

function setAuthStatus(isRegister, phase, message) {
    const id = isRegister
        ? phase === 'code' ? 'register-code-status' : 'register-status'
        : phase === 'code' ? 'login-code-status' : 'login-status';
    const element = document.getElementById(id);
    if (element) element.textContent = message || '';
}

async function handleSendCode(e, isRegister = false) {
    e.preventDefault();
    console.log(`handleSendCode called (isRegister=${isRegister})`);

    const phoneInputId = isRegister ? 'register-phone-number' : 'phone-number';
    const phoneInput = document.getElementById(phoneInputId);

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

    if (isRegister) {
        const nameInput = document.getElementById('register-name');
        if (!nameInput) {
            showAlert('خانة الاسم مو موجودة، حدّث الصفحة.');
            return;
        }
        tempName = nameInput.value.trim();
        if (!tempName) {
            showAlert('الرجاء إدخال الاسم الكامل.');
            return;
        }
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
    setAuthStatus(isRegister, 'phone', 'نجهز التحقق ونرسل لك الرمز...');

    try {
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        console.log('✓ Verification code sent successfully');

        // Store verification ID in sessionStorage
        sessionStorage.setItem('firebaseVerificationId', confirmationResult.verificationId);
        if (isRegister) {
            sessionStorage.setItem('tempName', tempName);
        }

        setAuthStatus(isRegister, 'code', 'وصل الرمز. دخّله هنا وكمل.');
        if (isRegister) {
            const registerForm = document.getElementById('register-form');
            const registerCodeForm = document.getElementById('register-code-form');
            if (registerForm) registerForm.style.display = 'none';
            if (registerCodeForm) registerCodeForm.style.display = 'block';
        } else {
            const phoneForm = document.getElementById('phone-form');
            const codeForm = document.getElementById('code-form');
            if (phoneForm) phoneForm.style.display = 'none';
            if (codeForm) codeForm.style.display = 'block';
        }
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
        } else if (error.code === 'auth/invalid-app-credential') {
            errorMsg = 'في مشكلة بالتحقق. تأكد من إعدادات النطاق.';
        } else if (error.code === 'auth/captcha-check-failed') {
            errorMsg = 'ما ضبط تحقق reCAPTCHA. جرّب مرة ثانية.';
        }

        showAlert(errorMsg);
        setAuthStatus(isRegister, 'phone', '');

        // Reset recaptcha and try to recreate it
        const containerId = isRegister ? 'recaptcha-container-register' : 'recaptcha-container';
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

async function handleVerifyCode(e, isRegister = false) {
    e.preventDefault();
    console.log(`handleVerifyCode called (isRegister=${isRegister})`);

    const codeInputId = isRegister ? 'register-verification-code' : 'verification-code';
    const codeInput = document.getElementById(codeInputId);

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
        if (isRegister) {
            const registerForm = document.getElementById('register-form');
            const registerCodeForm = document.getElementById('register-code-form');
            if (registerForm) registerForm.style.display = 'block';
            if (registerCodeForm) registerCodeForm.style.display = 'none';
        } else {
            const phoneForm = document.getElementById('phone-form');
            const codeForm = document.getElementById('code-form');
            if (phoneForm) phoneForm.style.display = 'block';
            if (codeForm) codeForm.style.display = 'none';
        }
        return;
    }

    console.log('Verifying code...');
    setFormLoading(e.currentTarget, true, 'جاري التحقق...');
    setAuthStatus(isRegister, 'code', 'نتأكد من الرمز...');

    try {
        const credential = PhoneAuthProvider.credential(verificationId, code);
        const result = await signInWithCredential(auth, credential);
        const user = result.user;
        console.log('✓ Phone verification successful');

        if (isRegister) {
            const name = sessionStorage.getItem('tempName');
            if (!name) {
                showAlert('ضاعت بيانات التسجيل. جرّب مرة ثانية.');
                return;
            }
            console.log('Creating user profile...');
            await setDoc(doc(db, "users", user.uid), {
                name: name,
                phone: user.phoneNumber,
                paymentStatus: 'late',
                createdAt: serverTimestamp()
            });
            console.log('✓ User profile created');
        }

        if (!isRegister) {
            const userDocRef = doc(db, "users", user.uid);
            const existingUserDoc = await getDoc(userDocRef);
            if (!existingUserDoc.exists()) {
                await setDoc(userDocRef, {
                    name: user.phoneNumber || 'مطناخ جديد',
                    phone: user.phoneNumber,
                    paymentStatus: 'late',
                    createdAt: serverTimestamp(),
                    autoCreatedFromLogin: true
                });
                console.log('✓ Missing user profile repaired after login');
            }
        }

        // Clear temporary data after success
        sessionStorage.removeItem('firebaseVerificationId');
        sessionStorage.removeItem('tempName');

        setAuthStatus(isRegister, 'code', 'تم التحقق. تفضل اقلط...');
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
        setAuthStatus(isRegister, 'code', '');
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

function loadHomePageData() {
    if (!currentUser) return;

    try {
        loadHomePrayerAndDate();
        loadHomeWeather();
        loadHomeMembersSummary();
        loadHomeChatPreview();
        loadHomeMatches();
        loadHomeNews();
    } catch (error) {
        console.error('Error loading home page data:', error);
    }
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
                    ? `<span class="font-bold" style="color: #5cb85c;">✅ مدفوع</span>`
                    : `<span class="font-bold" style="color: #d9534f;">❌ متأخر</span>`;

                let adminControls = '';
                if (auth.currentUser?.uid === ADMIN_UID) {
                    adminControls = `
                        <button data-id="${memberId}" data-status="paid" class="toggle-payment-btn btn" style="width:auto; padding: 5px 8px; font-size: 12px; margin-inline-start: 10px;">دفع</button>
                        <button data-id="${memberId}" data-status="late" class="toggle-payment-btn btn btn-danger" style="width:auto; padding: 5px 8px; font-size: 12px;">لم يدفع</button>
                    `;
                }

                div.innerHTML = `
                    <div>
                        <p class="font-bold">${escapeHtml(member.name || 'بدون اسم')}</p>
                        <p class="text-sm">${escapeHtml(member.phone || 'بدون رقم')}</p>
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
                    const memberId = e.target.dataset.id;
                    const newStatus = e.target.dataset.status;
                    try {
                        await updateDoc(doc(db, "users", memberId), { paymentStatus: newStatus });
                        showAlert('تم تحديث الحالة بنجاح!');
                    } catch (error) {
                        console.error('Error updating payment status:', error);
                        showAlert('فشل تحديث الحالة. حاول مرة أخرى.');
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
                        <span class="font-bold">${payment.userName || 'بدون اسم'}</span>
                        <span style="color: #5cb85c;">✅ مدفوع</span>
                        <span>${date}</span>
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

function loadChat() {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) {
        console.warn('chat-box element not found');
        return;
    }

    try {
        unsubscribeChat = onSnapshot(
            query(collection(db, "chat"), orderBy("createdAt")),
            (snapshot) => {
                chatBox.innerHTML = '';
                snapshot.forEach(doc => {
                    const msg = doc.data();
                    const div = document.createElement('div');
                    const isMe = msg.userId === auth.currentUser?.uid;
                    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'}`;

                    const userDisplayName = msg.userName || 'مستخدم';
                    const messageText = escapeHtml(msg.text || '');

                    div.innerHTML = `
                        <div class="text-xs mb-1 mx-2" style="color: var(--muted);">${escapeHtml(userDisplayName)}</div>
                        <div class="message ${isMe ? 'mine' : ''}">
                            <p>${messageText}</p>
                        </div>
                    `;
                    chatBox.appendChild(div);
                });
                chatBox.scrollTop = chatBox.scrollHeight;
            },
            error => {
                console.error('Error loading chat:', error);
                chatBox.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل السوالف.</p>';
            }
        );
    } catch (error) {
        console.error('Error setting up chat listener:', error);
        chatBox.innerHTML = '<p class="text-center text-red-500">ما قدرنا نحمّل السوالف.</p>';
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
        showAlert('اكتب سالفتك أول.');
        return;
    }

    if (!currentUser) {
        showAlert('لازم تقلط أول.');
        return;
    }

    try {
        await addDoc(collection(db, "chat"), {
            text: text,
            userId: currentUser.uid,
            userName: currentUser.name || 'مستخدم',
            createdAt: serverTimestamp()
        });
        input.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        showAlert('ما قدرت أرسل السالفة: ' + (error.message || 'جرّب مرة ثانية'));
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

    const fallback = { latitude: 24.7136, longitude: 46.6753, label: 'الرياض' };
    const coords = await getCurrentPositionSafe().catch(() => fallback);

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
            container.innerHTML = '<p class="text-center">ما فيه سوالف للحين.</p>';
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
        container.innerHTML = '<p class="text-center">السوالف ما ظهرت حالياً.</p>';
    }
}

async function loadHomeMatches() {
    const container = document.getElementById('home-matches-list');
    if (!container) return;
    await loadMatches(container, 3, true);
}

async function loadHomeNews() {
    const container = document.getElementById('home-news-list');
    if (!container) return;
    await loadNews(container, 2);
}


async function loadPrayerTimes() {
    const container = document.getElementById('prayer-times-container');
    if (!container) return;

    container.innerHTML = `<p class="text-center w-full">اسمح بالموقع عشان نجيب المواقيت...</p>`;

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
        const [todayResponse, saudiResponse, worldCupResponse, githubWorldCup] = await Promise.all([
            fetch(todayUrl),
            fetch(saudiSeasonUrl),
            fetch(worldCupSeasonUrl),
            fetchWorldCupGithubFixtures().catch((error) => {
                console.warn('World Cup GitHub fallback unavailable:', error);
                return [];
            })
        ]);

        if (!todayResponse.ok || !saudiResponse.ok || !worldCupResponse.ok) {
            throw new Error(`API returned status ${todayResponse.status}/${saudiResponse.status}/${worldCupResponse.status}`);
        }

        const [todayData, saudiData, worldCupData] = await Promise.all([
            todayResponse.json(),
            saudiResponse.json(),
            worldCupResponse.json()
        ]);

        const saudiEvents = (saudiData.events || [])
            .filter((event) => event.idLeague === SAUDI_LEAGUE_ID)
            .sort((a, b) => `${a.dateEventLocal || a.dateEvent} ${a.strTimeLocal || a.strTime || ''}`.localeCompare(`${b.dateEventLocal || b.dateEvent} ${b.strTimeLocal || b.strTime || ''}`));
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
                <div class="panel-head"><h2>مباريات اليوم</h2><span class="badge scheduled">TheSportsDB</span></div>
                <div class="cards-grid matches-grid">
                    ${todayMatches.length ? todayMatches.map(renderSportsDbMatchCard).join('') : '<div class="empty card">ما فيه مباريات اليوم.</div>'}
                </div>
            </div>
            <div class="panel">
                <div class="panel-head"><h2>الدوري السعودي</h2><span class="badge scheduled">League 4668</span></div>
                <div class="cards-grid matches-grid">
                    ${saudiUpcoming.length ? saudiUpcoming.map(renderSportsDbMatchCard).join('') : '<div class="empty card">ما فيه مباريات جاية للدوري السعودي حالياً.</div>'}
                </div>
            </div>
            <div class="panel">
                <div class="panel-head"><h2>كأس العالم 2026</h2><span class="badge scheduled">League 4429 + GitHub fallback</span></div>
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
    return `${getEventDateKey(a)} ${a.strTimeLocal || a.strTime || ''}`.localeCompare(`${getEventDateKey(b)} ${b.strTimeLocal || b.strTime || ''}`);
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getEventDateKey(event) {
    return event.dateEventLocal || event.dateEvent || '';
}

function renderSportsDbMatchCard(event) {
    const status = event.strStatus || (event.intHomeScore !== null && event.intAwayScore !== null ? 'FT' : 'NS');
    const isFinished = status === 'FT' || (event.intHomeScore !== null && event.intAwayScore !== null);
    const isLive = ['Live', '1H', '2H', 'HT', 'ET', 'P'].includes(status);
    const statusClass = isLive ? 'live' : isFinished ? 'done' : 'scheduled';
    const statusLabel = isLive ? 'مباشر' : isFinished ? 'انتهت' : 'قادمة';
    const score = isFinished
        ? `${event.intHomeScore ?? 0} - ${event.intAwayScore ?? 0}`
        : (event.strTimeLocal || event.strTime || '--:--').slice(0, 5);
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
            <p class="muted">${escapeHtml(getEventDateKey(event))}</p>
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
    if (!container) container = document.getElementById('news-list');
    if (!container) return;

    container.innerHTML = `<p class="text-center">جاري تحميل الأخبار...</p>`;

    try {
        const articles = await fetchFootballNews(limit);

        if (!articles.length) {
            container.innerHTML = `<p class="text-center">ما فيه أخبار كروية متاحة حالياً.</p>`;
            return;
        }

        container.innerHTML = '';
        articles.slice(0, limit).forEach(article => {
            try {
                const title = article.title || 'بدون عنوان';
                const description = article.description || 'خبر رياضي عربي من مصادر موثوقة، بدون صور مكسورة أو بطاقات فاضية.';
                const url = safeExternalUrl(article.url, '#');
                const source = article.source?.name || 'مصدر';
                const image = safeExternalUrl(article.urlToImage, '');
                const imageMarkup = image
                    ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`
                    : '';

                const newsCard = `
                    <article class="news-card card">
                        ${imageMarkup}
                        <h3>${escapeHtml(title.substring(0, 110))}</h3>
                        <p>${escapeHtml(description.substring(0, 160))}</p>
                        <span class="text-xs opacity-70">${escapeHtml(source)}</span>
                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="primary">قراءة المزيد</a>
                    </article>
                `;
                container.innerHTML += newsCard;
            } catch (itemError) {
                console.error('Error processing article:', itemError);
            }
        });

    } catch (error) {
        console.error("Error fetching news:", error);
        container.innerHTML = `<p class="text-center">ما قدرنا نجيب أخبار الكورة حالياً. بنحاول لاحقاً.</p>`;
    }
}

async function fetchFootballNews(limit = 10) {
    const sources = [
        { name: 'الجزيرة رياضة', url: 'https://www.aljazeera.net/aljazeerarss/sports.xml' }
    ];
    const requests = sources.map((source) => fetchRssNewsSource(source));
    const settled = await Promise.allSettled(requests);
    const articles = settled
        .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
        .filter((article) => article.title && article.url && containsArabic(article.title));

    return dedupeNewsArticles(articles)
        .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
        .slice(0, limit);
}

async function fetchRssNewsSource(source) {
    const rssJsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`;
    try {
        const response = await fetch(rssJsonUrl);
        if (!response.ok) {
            throw new Error(`${source.name} rss2json returned ${response.status}`);
        }
        const data = await response.json();
        if (data.status !== 'ok' || !Array.isArray(data.items)) {
            throw new Error(`${source.name} rss2json returned invalid data`);
        }
        return data.items.map((item) => ({
            title: sanitizePlainText(item.title),
            description: sanitizePlainText(item.description || item.content || ''),
            url: item.link || '',
            urlToImage: getValidImageUrl(item.thumbnail || item.enclosure?.link || extractFirstImageFromHtml(item.description || item.content || '')),
            publishedAt: item.pubDate,
            source: { name: source.name }
        }));
    } catch (primaryError) {
        console.warn(`${source.name} rss2json unavailable, trying RSS fallback:`, primaryError);
    }

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(source.url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error(`${source.name} returned ${response.status}`);
    }

    const xmlText = await response.text();
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) {
        throw new Error(`${source.name} returned invalid RSS`);
    }

    return Array.from(doc.querySelectorAll('item')).map((item) => ({
        title: sanitizePlainText(readRssText(item, 'title')),
        description: sanitizePlainText(readRssText(item, 'description')),
        url: readRssText(item, 'link'),
        urlToImage: extractRssImage(item),
        publishedAt: readRssText(item, 'pubDate'),
        source: { name: source.name }
    }));
}

function containsArabic(value = '') {
    return /[\u0600-\u06FF]/.test(String(value));
}

function sanitizePlainText(value = '') {
    const template = document.createElement('template');
    template.innerHTML = String(value);
    return (template.content.textContent || '').trim();
}

function extractFirstImageFromHtml(value = '') {
    const template = document.createElement('template');
    template.innerHTML = String(value);
    return template.content.querySelector('img')?.getAttribute('src') || '';
}

function getValidImageUrl(value = '') {
    const url = safeExternalUrl(value, '');
    if (!url) return '';
    if (/\.(mp4|m3u8|mov|webm)(\?|#|$)/i.test(url)) return '';
    return url;
}

function readRssText(item, tagName) {
    return item.querySelector(tagName)?.textContent?.trim() || '';
}

function extractRssImage(item) {
    const mediaContent = item.getElementsByTagName('media:content')[0] || item.getElementsByTagName('media:thumbnail')[0];
    const enclosure = item.querySelector('enclosure[type^="image"]');
    const mediaUrl = mediaContent?.getAttribute('url') || enclosure?.getAttribute('url') || '';
    return getValidImageUrl(mediaUrl);
}

function dedupeNewsArticles(articles) {
    const seen = new Set();
    return articles.filter((article) => {
        const key = safeExternalUrl(article.url, '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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
                    currentUser = { uid: user.uid, ...userDoc.data() };
                    document.body.classList.add('is-authenticated');
                    syncShellUserState();
                    appLogo.style.display = 'block';
                    console.log('✓ User profile found, navigating to home');
                    await renderPage(window.location.hash || '#home');
                } else {
                    console.log('✓ Auth user has no Firestore profile, creating a minimal member profile');
                    const repairedProfile = {
                        name: user.phoneNumber || 'مطناخ جديد',
                        phone: user.phoneNumber,
                        paymentStatus: 'late',
                        createdAt: serverTimestamp(),
                        autoCreatedFromLogin: true
                    };
                    await setDoc(doc(db, "users", user.uid), repairedProfile);
                    currentUser = { uid: user.uid, ...repairedProfile };
                    document.body.classList.add('is-authenticated');
                    syncShellUserState();
                    appLogo.style.display = 'block';
                    await renderPage('#home');
                }
            } else {
                console.log('✓ No user authenticated, showing login');
                currentUser = null;
                document.body.classList.remove('is-authenticated');
                sidebar?.classList.remove('open');
                syncShellUserState();
                appLogo.style.display = 'block';
                await renderPage(currentPublicRoute());
            }
        } catch (error) {
            console.error('✗ Error in auth state change:', error);
            currentUser = null;
            document.body.classList.remove('is-authenticated');
            sidebar?.classList.remove('open');
            syncShellUserState();
            appLogo.style.display = 'block';
            await renderPage(currentPublicRoute());
        }
    });

        // Splash Screen Logic
    const splash = document.getElementById('splash');
    const mainContent = document.getElementById('main-content');

    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');

    if (hasSeenSplash) {
        if (splash) splash.style.display = 'none';
        if (mainContent) mainContent.style.display = 'grid';

        console.log('✓ Splash skipped');
    } else {
        sessionStorage.setItem('hasSeenSplash', 'true');

        setTimeout(() => {
            if (splash) {
                splash.classList.add('done');

                setTimeout(() => {
                    splash.style.display = 'none';

                    if (mainContent) {
                        mainContent.style.display = 'grid';
                        console.log('✓ Splash screen hidden, main content shown');
                    }
                }, 4500);
            } else if (mainContent) {
                mainContent.style.display = 'grid';
            }
        }, 1300);
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