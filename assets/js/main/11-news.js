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
        { name: 'الجزيرة رياضة', url: 'https://www.aljazeera.net/aljazeerarss/sports.xml' },
        { name: 'العربية رياضة', url: 'https://www.alarabiya.net/.mrss/ar/sport.xml' }
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
        const data = await fetchJsonWithTimeout(rssJsonUrl, 8000);
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
    const response = await fetchWithTimeout(proxyUrl, 8000);
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

async function fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
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
