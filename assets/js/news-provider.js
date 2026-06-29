import './runtime-ux.js';

const NEWS_ENDPOINT = '/.netlify/functions/alarabiya-news-v3';
const NEWS_PLACEHOLDER = '/assets/images/news-placeholder.svg';
const HOME_NEWS_LIMIT = 3;
const FULL_NEWS_LIMIT = 18;
const NEWS_CACHE_KEY = 'estraha-news-v5';
const NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NEWS_REFRESH_AFTER_MS = 10 * 60 * 1000;
const NEWS_API_VERSION = '281';

const newsRequests = new WeakMap();
const newsObservers = new WeakMap();

function escapeMarkup(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function safeHttpUrl(value = '') {
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function safeImageUrl(value = '') {
  const url = safeHttpUrl(value);
  if (!url) return '';

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    if (/\.(?:svg|mp4|m3u8|mov|webm)(?:$|\?)/i.test(`${parsed.pathname}${parsed.search}`)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function shouldProxyNewsImage() {
  const host = window.location.hostname;
  return !['localhost', '127.0.0.1', '::1'].includes(host);
}

function proxiedNewsImageUrl(value = '') {
  const image = safeImageUrl(value);
  if (!image) return '';
  return shouldProxyNewsImage()
    ? `/.netlify/functions/alarabiya-image?url=${encodeURIComponent(image)}`
    : image;
}

function newsCacheKey(limit) {
  return `${NEWS_CACHE_KEY}:${limit}`;
}

function readNewsCache(limit) {
  try {
    const cached = JSON.parse(localStorage.getItem(newsCacheKey(limit)) || 'null');
    const savedAt = Number(cached?.savedAt || 0);
    const age = Date.now() - savedAt;

    if (!savedAt || !Array.isArray(cached?.articles) || !cached.articles.length || age > NEWS_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(newsCacheKey(limit));
      return null;
    }

    return {
      articles: cached.articles,
      savedAt,
      fresh: age <= NEWS_REFRESH_AFTER_MS
    };
  } catch {
    return null;
  }
}

function writeNewsCache(limit, articles) {
  if (!Array.isArray(articles) || !articles.length) return 0;

  const savedAt = Date.now();
  try {
    localStorage.setItem(newsCacheKey(limit), JSON.stringify({ savedAt, articles }));
  } catch (_) {}

  window.EstrahaFreshness?.record('news', savedAt);
  return savedAt;
}

async function fetchNews(limit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 14000);

  try {
    const response = await fetch(`${NEWS_ENDPOINT}?limit=${limit}&v=${NEWS_API_VERSION}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`News endpoint returned ${response.status}`);

    const data = await response.json();
    if (!data?.ok || !Array.isArray(data.articles) || !data.articles.length) {
      throw new Error('No football news returned');
    }

    return data.articles;
  } finally {
    window.clearTimeout(timeout);
  }
}

function bindImageFallbacks(container) {
  container.querySelectorAll('.v3-news-item .compact-news-thumb').forEach((image) => {
    image.addEventListener('error', () => {
      if (image.dataset.fallbackApplied === 'true') return;
      image.dataset.fallbackApplied = 'true';
      image.classList.add('is-placeholder');
      image.src = NEWS_PLACEHOLDER;
    }, { once: true });
  });
}

function ensureNewsFreshnessElement(container) {
  let element = container.querySelector('.news-freshness');
  if (!element) {
    element = document.createElement('p');
    element.className = 'news-freshness';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    container.prepend(element);
  }
  return element;
}

function renderNews(container, articles, compact, { cached = false, savedAt = 0 } = {}) {
  const limit = compact ? HOME_NEWS_LIMIT : FULL_NEWS_LIMIT;
  const visible = articles.slice(0, limit);
  if (!visible.length) throw new Error('No visible football news');

  container.className = compact ? 'home-news-preview compact-arabiya-news' : 'compact-arabiya-news';
  container.dataset.newsProvider = 'v3';
  container.dataset.newsState = 'success';
  container.dataset.newsCached = cached ? 'true' : 'false';
  container.setAttribute('aria-busy', 'false');
  container.innerHTML = visible.map((article) => {
    const title = String(article.title || 'خبر رياضي').trim();
    const url = safeHttpUrl(article.url) || '#';
    const rawImage = article.image || article.imageUrl || article.thumbnail || article.thumbnailUrl || article.enclosure || '';
    const actualImage = proxiedNewsImageUrl(rawImage);
    const image = actualImage || NEWS_PLACEHOLDER;
    const placeholderClass = actualImage ? '' : ' is-placeholder';

    return `
      <a class="compact-news-item v3-news-item" href="${escapeMarkup(url)}" target="_blank" rel="noopener noreferrer">
        <img class="compact-news-thumb${placeholderClass}" src="${escapeMarkup(image)}" alt="${escapeMarkup(title)}" loading="${compact ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">
        <span class="compact-news-copy">
          <strong title="${escapeMarkup(title)}">${escapeMarkup(title)}</strong>
          <small>العربية رياضة</small>
        </span>
      </a>
    `;
  }).join('');

  const freshness = ensureNewsFreshnessElement(container);
  window.EstrahaFreshness?.render(freshness, 'news', { cached, timestamp: savedAt });
  bindImageFallbacks(container);
}

function renderNewsLoading(container, compact) {
  const count = compact ? HOME_NEWS_LIMIT : 5;
  container.className = compact
    ? 'home-news-preview compact-arabiya-news news-loading-state'
    : 'compact-arabiya-news news-loading-state';
  container.dataset.newsState = 'loading';
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="compact-news-item news-skeleton" aria-hidden="true">
      <span class="compact-news-thumb news-skeleton-thumb"></span>
      <span class="compact-news-copy">
        <span class="news-skeleton-line"></span>
        <span class="news-skeleton-line short"></span>
      </span>
    </div>
  `).join('');
}

function renderNewsError(container, compact) {
  container.className = compact ? 'home-news-preview compact-arabiya-news' : 'compact-arabiya-news';
  container.dataset.newsState = 'error';
  container.setAttribute('aria-busy', 'false');
  container.innerHTML = `
    <div class="news-load-error" role="status">
      <span>تعذر تحميل أخبار العربية حالياً.</span>
      <button type="button" class="btn retry-arabiya-news">إعادة المحاولة</button>
    </div>
  `;

  container.querySelector('.retry-arabiya-news')?.addEventListener('click', () => {
    container.dataset.newsState = '';
    loadNews(container, { compact, force: true });
  });
}

async function performNewsLoad(container, compact, force) {
  const limit = compact ? HOME_NEWS_LIMIT : FULL_NEWS_LIMIT;
  const cached = readNewsCache(limit);
  let renderedCached = false;

  if (cached && !force) {
    renderNews(container, cached.articles, compact, { cached: true, savedAt: cached.savedAt });
    renderedCached = true;
    if (cached.fresh) return;
  } else {
    renderNewsLoading(container, compact);
  }

  try {
    const articles = await fetchNews(limit);
    const savedAt = writeNewsCache(limit, articles);
    renderNews(container, articles, compact, { cached: false, savedAt });
  } catch (error) {
    console.error('Al Arabiya news failed:', error);
    if (!renderedCached) renderNewsError(container, compact);
  }
}

function inferCompactMode(container, limit) {
  return container?.id === 'home-arabiya-news-list' || Number(limit) <= HOME_NEWS_LIMIT;
}

function loadNews(container, options = {}) {
  if (!container) return Promise.resolve();
  const compact = Boolean(options.compact ?? inferCompactMode(container, options.limit));
  const force = Boolean(options.force);
  if (newsRequests.has(container)) return newsRequests.get(container);

  const request = performNewsLoad(container, compact, force)
    .finally(() => newsRequests.delete(container));

  newsRequests.set(container, request);
  return request;
}

function watchNewsContainer(container, options = {}) {
  if (!container) return;
  const compact = Boolean(options.compact ?? inferCompactMode(container, options.limit));
  loadNews(container, { compact, limit: options.limit });
  if (newsObservers.has(container)) return;

  let timer = 0;
  const observer = new MutationObserver(() => {
    if (container.querySelector('.v3-news-item') || container.dataset.newsState === 'loading') return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => loadNews(container, { compact, limit: options.limit }), 40);
  });

  observer.observe(container, { childList: true });
  newsObservers.set(container, observer);
}

function initNewsContainers() {
  watchNewsContainer(document.getElementById('home-arabiya-news-list'), { compact: true });
  watchNewsContainer(document.getElementById('arabiya-news-list'), { compact: false });
}

window.EstrahaNews = {
  load: loadNews,
  watch: watchNewsContainer,
  init: initNewsContainers
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNewsContainers, { once: true });
} else {
  initNewsContainers();
}

window.addEventListener('hashchange', () => window.setTimeout(initNewsContainers, 0));
