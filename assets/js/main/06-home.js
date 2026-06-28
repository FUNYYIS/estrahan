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
