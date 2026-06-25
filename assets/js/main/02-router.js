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
