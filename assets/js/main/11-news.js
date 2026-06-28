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
