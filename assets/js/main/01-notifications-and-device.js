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
    if (shellAvatar) shellAvatar.src = currentUser?.avatarUrl || 'assets/icons/icon-192-original-zoom.png?v=280';
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
