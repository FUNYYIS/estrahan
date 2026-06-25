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
