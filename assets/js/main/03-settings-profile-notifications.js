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
