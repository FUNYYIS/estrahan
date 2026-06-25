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
            announcement.style.display = '';
        }
    } else if (announcement) {
        announcement.style.display = 'none';
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

    if (prayerCard) prayerCard.style.display = appSettings.showPrayer === false ? 'none' : '';
    if (weatherCard) weatherCard.style.display = appSettings.showWeather === false ? 'none' : '';
    if (widgetsSection) {
        widgetsSection.style.display =
            appSettings.showPrayer === false && appSettings.showWeather === false ? 'none' : '';
    }

    if (matchesHead) matchesHead.style.display = appSettings.showMatches === false ? 'none' : '';
    if (matchesList) matchesList.style.display = appSettings.showMatches === false ? 'none' : '';

    if (chatHead) chatHead.style.display = appSettings.showChat === false ? 'none' : '';
    if (chatList) chatList.style.display = appSettings.showChat === false ? 'none' : '';

    newsSections.forEach((section) => {
        section.style.display = appSettings.showNews === false ? 'none' : '';
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
