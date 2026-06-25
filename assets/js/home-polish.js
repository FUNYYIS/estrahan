const NEWS_ENDPOINT_V3 = '/.netlify/functions/alarabiya-news-v3';
const NEWS_PLACEHOLDER = '/assets/images/news-placeholder.svg';
const HOME_NEWS_LIMIT = 3;
const FULL_NEWS_LIMIT = 18;
const NEWS_CACHE_KEY = 'estraha-news-v3';
const NEWS_CACHE_MAX_AGE = 10 * 60 * 1000;

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

function readNewsCache(limit) {
  try {
    const cached = JSON.parse(localStorage.getItem(`${NEWS_CACHE_KEY}:${limit}`) || 'null');
    if (!cached?.savedAt || !Array.isArray(cached.articles)) return null;
    if (Date.now() - cached.savedAt > NEWS_CACHE_MAX_AGE) return null;
    return cached.articles;
  } catch {
    return null;
  }
}

function writeNewsCache(limit, articles) {
  try {
    localStorage.setItem(`${NEWS_CACHE_KEY}:${limit}`, JSON.stringify({
      savedAt: Date.now(),
      articles
    }));
  } catch (_) {}
}

async function fetchNews(limit) {
  const cached = readNewsCache(limit);
  if (cached?.length) return cached;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch(`${NEWS_ENDPOINT_V3}?limit=${limit}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`News endpoint returned ${response.status}`);
    const data = await response.json();
    if (!data?.ok || !Array.isArray(data.articles) || !data.articles.length) {
      throw new Error('No football news returned');
    }
    writeNewsCache(limit, data.articles);
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

function renderNews(container, articles, compact) {
  const limit = compact ? HOME_NEWS_LIMIT : FULL_NEWS_LIMIT;
  const visible = articles.slice(0, limit);
  if (!visible.length) throw new Error('No visible football news');

  container.className = compact ? 'home-news-preview compact-arabiya-news' : 'compact-arabiya-news';
  container.dataset.newsProvider = 'v3';
  container.dataset.newsState = 'success';
  container.setAttribute('aria-busy', 'false');
  container.innerHTML = visible.map((article) => {
    const title = String(article.title || 'خبر رياضي').trim();
    const url = safeHttpUrl(article.url) || '#';
    const actualImage = safeImageUrl(article.image);
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

  bindImageFallbacks(container);
}

async function loadNewsV3(container, compact) {
  if (!container || container.querySelector('.v3-news-item')) return;
  if (newsRequests.has(container)) return newsRequests.get(container);

  const limit = compact ? HOME_NEWS_LIMIT : FULL_NEWS_LIMIT;
  const request = fetchNews(limit)
    .then((articles) => renderNews(container, articles, compact))
    .catch((error) => {
      console.warn('Replacement football news failed:', error);
      if (!container.children.length) {
        container.innerHTML = '<p class="text-center">تعذر تحميل الأخبار حالياً.</p>';
      }
    })
    .finally(() => newsRequests.delete(container));

  newsRequests.set(container, request);
  return request;
}

function watchNewsContainer(container, compact) {
  if (!container) return;
  loadNewsV3(container, compact);
  if (newsObservers.has(container)) return;

  let timer = 0;
  const observer = new MutationObserver(() => {
    if (container.querySelector('.v3-news-item')) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => loadNewsV3(container, compact), 40);
  });
  observer.observe(container, { childList: true });
  newsObservers.set(container, observer);
}

function replaceRawPermissionErrors() {
  document.querySelectorAll('#alert-message, #notification-sync-status, #prayer-location-status').forEach((element) => {
    if (/missing or insufficient permissions/i.test(element.textContent || '')) {
      element.textContent = 'تعذر حفظ الإعدادات بسبب صلاحيات قديمة. حدّث الصفحة وجرّب مرة ثانية.';
    }
  });
}

function initHomePolish() {
  watchNewsContainer(document.getElementById('home-arabiya-news-list'), true);
  watchNewsContainer(document.getElementById('arabiya-news-list'), false);
  replaceRawPermissionErrors();
}

function startHomePolish() {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(initHomePolish);
  });
  observer.observe(pageContent, { childList: true, subtree: true, characterData: true });
  initHomePolish();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startHomePolish, { once: true });
} else {
  startHomePolish();
}

window.addEventListener('hashchange', () => window.setTimeout(initHomePolish, 0));
