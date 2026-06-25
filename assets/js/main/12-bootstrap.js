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
                    initFirebaseMessaging()
                        .then(() => syncFcmTokenWithPreferences())
                        .catch((error) => console.warn('Firebase Cloud Messaging init failed:', error));
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

        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const configuredDuration = Number(appSettings.splashDuration || 1.2);
        const splashDelay = prefersReducedMotion
            ? 0
            : Math.min(Math.max(configuredDuration, 0.4), 1.5) * 1000;

        setTimeout(() => {
            if (splash) {
                splash.classList.add('done');
                splash.style.display = 'none';
            }

            if (mainContent) {
                mainContent.style.display = 'grid';
                console.log('✓ Splash screen hidden, main content shown');
            }
        }, splashDelay);
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
