const NEWS_ENDPOINT = '/.netlify/functions/alarabiya-news-v2';
const HOME_NEWS_LIMIT = 3;
const FULL_NEWS_LIMIT = 18;
const NEWS_CACHE_SCHEMA = 2;
const NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NEWS_REFRESH_AFTER_MS = 10 * 60 * 1000;
const FAST_NEWS_TIMEOUT_MS = 6500;
const FULL_NEWS_TIMEOUT_MS = 12000;
const newsLoadPromises = new WeakMap();
let orientationHandler = null;

function escapeMarkup(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function safeUrl(value = '') {
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function safeNewsImageUrl(value = '') {
  const cleaned = safeUrl(value);
  if (!cleaned) return '';

  try {
    const url = new URL(cleaned);
    const host = url.hostname.toLowerCase();
    const pathAndQuery = `${url.pathname}${url.search}`.toLowerCase();
    const blockedGoogleImage = host === 'news.google.com'
      || host.endsWith('.gstatic.com')
      || host.endsWith('.googleusercontent.com');
    const genericAsset = /(?:^|[\/_-])(logo|icon|favicon|sprite|placeholder|google[-_]?news)(?:[\/_-]|\.|$)/i.test(pathAndQuery);
    const unsupported = url.protocol !== 'https:' || url.pathname.toLowerCase().endsWith('.svg');
    const looksLikeImage = /\.(?:avif|webp|jpe?g|png)(?:$|\?)/i.test(url.href)
      || /(?:image|images|media|cdn|asset|upload|resize|transform)/i.test(pathAndQuery);

    return blockedGoogleImage || genericAsset || unsupported || !looksLikeImage ? '' : url.href;
  } catch {
    return '';
  }
}

function newsCacheKey(limit) {
  return `estraha-news-v${NEWS_CACHE_SCHEMA}:${limit}`;
}

function readNewsCache(limit) {
  try {
    const raw = localStorage.getItem(newsCacheKey(limit));
    if (!raw) return null;

    const cached = JSON.parse(raw);
    const age = Date.now() - Number(cached?.savedAt || 0);
    if (!Array.isArray(cached?.articles) || !cached.articles.length || age > NEWS_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(newsCacheKey(limit));
      return null;
    }

    return {
      articles: cached.articles,
      savedAt: Number(cached.savedAt),
      fresh: age <= NEWS_REFRESH_AFTER_MS
    };
  } catch {
    return null;
  }
}

function writeNewsCache(limit, articles) {
  if (!Array.isArray(articles) || !articles.length) return;

  try {
    localStorage.setItem(newsCacheKey(limit), JSON.stringify({
      savedAt: Date.now(),
      articles
    }));
  } catch (_) {}
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Al Arabiya endpoint returned ${response.status}`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchArabiyaNews(limit, { fast = false } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (fast) query.set('fast', '1');

  const data = await fetchJsonWithTimeout(
    `${NEWS_ENDPOINT}?${query.toString()}`,
    fast ? FAST_NEWS_TIMEOUT_MS : FULL_NEWS_TIMEOUT_MS
  );

  if (!data?.ok || !Array.isArray(data.articles)) {
    throw new Error(data?.error || 'Invalid Al Arabiya response');
  }

  return data.articles;
}

function selectVisibleNews(articles, compact) {
  const list = Array.isArray(articles) ? articles : [];
  const limit = compact ? HOME_NEWS_LIMIT : FULL_NEWS_LIMIT;
  if (!compact) return list.slice(0, limit);

  const withImages = [];
  const withoutImages = [];
  list.forEach((article) => {
    (safeNewsImageUrl(article?.image) ? withImages : withoutImages).push(article);
  });

  return [...withImages, ...withoutImages].slice(0, limit);
}

function bindNewsImageFallbacks(container) {
  container.querySelectorAll('.compact-news-thumb').forEach((imageElement) => {
    imageElement.addEventListener('error', () => {
      const card = imageElement.closest('.compact-news-item');
      card?.classList.add('no-image');
      imageElement.remove();
    });
  });
}

function renderNewsItems(container, articles, compact, { cached = false } = {}) {
  const visible = selectVisibleNews(articles, compact);

  if (!visible.length) {
    throw new Error('No Al Arabiya football articles');
  }

  container.className = compact
    ? 'home-news-preview compact-arabiya-news'
    : 'compact-arabiya-news';
  container.dataset.newsState = 'success';
  container.dataset.newsCached = cached ? 'true' : 'false';
  container.setAttribute('aria-busy', 'false');

  container.innerHTML = visible.map((article) => {
    const url = safeUrl(article.url);
    const image = safeNewsImageUrl(article.image);
    const title = String(article.title || 'خبر رياضي').trim();
    const imageMarkup = image
      ? `<img class="compact-news-thumb" src="${escapeMarkup(image)}" alt="${escapeMarkup(title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : '';

    return `
      <a class="compact-news-item${image ? '' : ' no-image'}" href="${escapeMarkup(url || '#')}" target="_blank" rel="noopener noreferrer">
        ${imageMarkup}
        <span class="compact-news-copy">
          <strong title="${escapeMarkup(title)}">${escapeMarkup(title)}</strong>
          <small>العربية رياضة</small>
        </span>
      </a>
    `;
  }).join('');

  bindNewsImageFallbacks(container);
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
  container.className = compact
    ? 'home-news-preview compact-arabiya-news'
    : 'compact-arabiya-news';
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
    loadArabiyaNews(container, compact, { force: true });
  });
}

async function performNewsLoad(container, compact, force) {
  const limit = compact ? HOME_NEWS_LIMIT : FULL_NEWS_LIMIT;
  const cached = readNewsCache(limit);
  let hasRendered = false;

  if (cached && !force) {
    renderNewsItems(container, cached.articles, compact, { cached: true });
    hasRendered = true;
    if (cached.fresh) return;
  } else {
    renderNewsLoading(container, compact);
  }

  if (!hasRendered) {
    try {
      const fastArticles = await fetchArabiyaNews(limit, { fast: true });
      renderNewsItems(container, fastArticles, compact);
      hasRendered = true;
    } catch (error) {
      console.warn('Fast Al Arabiya news request failed:', error);
    }
  }

  try {
    const enrichedArticles = await fetchArabiyaNews(limit);
    renderNewsItems(container, enrichedArticles, compact);
    writeNewsCache(limit, enrichedArticles);
  } catch (error) {
    console.error('Enriched Al Arabiya news failed:', error);
    if (!hasRendered) renderNewsError(container, compact);
  }
}

function loadArabiyaNews(container, compact = false, { force = false } = {}) {
  if (!container) return Promise.resolve();
  if (newsLoadPromises.has(container)) return newsLoadPromises.get(container);

  const promise = performNewsLoad(container, compact, force)
    .finally(() => newsLoadPromises.delete(container));

  newsLoadPromises.set(container, promise);
  return promise;
}

function initNews() {
  loadArabiyaNews(document.getElementById('home-arabiya-news-list'), true);
  loadArabiyaNews(document.getElementById('arabiya-news-list'), false);
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function qiblaBearing(latitude, longitude) {
  const kaabaLatitude = toRadians(21.422487);
  const kaabaLongitude = toRadians(39.826206);
  const userLatitude = toRadians(latitude);
  const userLongitude = toRadians(longitude);
  const deltaLongitude = kaabaLongitude - userLongitude;

  const y = Math.sin(deltaLongitude) * Math.cos(kaabaLatitude);
  const x = Math.cos(userLatitude) * Math.sin(kaabaLatitude)
    - Math.sin(userLatitude) * Math.cos(kaabaLatitude) * Math.cos(deltaLongitude);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('الموقع غير مدعوم على هذا الجهاز.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    });
  });
}

function qiblaLocationError(error) {
  if (error?.code === 1) return 'إذن الموقع مرفوض. فعّله من إعدادات التطبيق ثم جرّب.';
  if (error?.code === 2) return 'تعذر تحديد موقعك الآن. تأكد من تشغيل خدمات الموقع.';
  if (error?.code === 3) return 'تأخر تحديد الموقع. جرّب مرة ثانية.';
  return error?.message || 'تعذر تشغيل القبلة.';
}

function bindQiblaFix() {
  const button = document.getElementById('qibla-enable-button');
  const status = document.getElementById('qibla-fix-status');
  const compass = document.getElementById('qibla-fix-compass');
  const needle = document.getElementById('qibla-fix-arrow');

  if (!button || !status || !compass || !needle || button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'جاري التفعيل...';
    status.textContent = 'نتحقق من الموقع والحساس...';

    try {
      let motionPermission = 'not-required';
      if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        motionPermission = await window.DeviceOrientationEvent.requestPermission();
      }

      const position = await getPosition();
      const bearing = qiblaBearing(position.coords.latitude, position.coords.longitude);

      compass.hidden = false;
      compass.style.display = 'block';
      needle.style.transform = `translateX(-50%) rotate(${bearing}deg)`;

      if (orientationHandler) {
        window.removeEventListener('deviceorientation', orientationHandler, true);
        window.removeEventListener('deviceorientationabsolute', orientationHandler, true);
      }

      const orientationAvailable = 'DeviceOrientationEvent' in window && motionPermission !== 'denied';

      if (orientationAvailable) {
        orientationHandler = (event) => {
          let heading = null;
          if (Number.isFinite(event.webkitCompassHeading)) {
            heading = event.webkitCompassHeading;
          } else if (Number.isFinite(event.alpha)) {
            heading = (360 - event.alpha) % 360;
          }
          if (!Number.isFinite(heading)) return;
          const relativeDirection = (bearing - heading + 360) % 360;
          needle.style.transform = `translateX(-50%) rotate(${relativeDirection}deg)`;
        };

        window.addEventListener('deviceorientationabsolute', orientationHandler, true);
        window.addEventListener('deviceorientation', orientationHandler, true);
        status.textContent = 'القبلة جاهزة. حرّك الجوال حتى يتجه السهم للأعلى.';
      } else {
        status.textContent = 'تم تحديد اتجاه القبلة. فعّل إذن الحركة من إعدادات الجهاز لدقة أعلى.';
      }

      button.textContent = 'إعادة تحديد القبلة';
    } catch (error) {
      console.error('Qibla activation failed:', error);
      status.textContent = qiblaLocationError(error);
      button.textContent = 'جرّب مرة ثانية';
    } finally {
      button.disabled = false;
    }
  });
}

function initPageFixes() {
  initNews();
  bindQiblaFix();
}

function startPageObserver() {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(initPageFixes);
  });

  observer.observe(pageContent, { childList: true, subtree: false });
  initPageFixes();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPageObserver, { once: true });
} else {
  startPageObserver();
}

window.addEventListener('hashchange', () => setTimeout(initPageFixes, 0));
