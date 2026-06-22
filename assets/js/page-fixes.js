const ARABIYA_SPORT_RSS = 'https://www.alarabiya.net/.mrss/ar/sport.xml';
const FOOTBALL_KEYWORDS = [
  'كرة القدم', 'دوري', 'كأس', 'مونديال', 'مباراة', 'مباريات', 'هدف', 'أهداف',
  'منتخب', 'نادي', 'فريق', 'لاعب', 'مدرب', 'فيفا', 'أبطال أوروبا', 'الدوري الإنجليزي',
  'الدوري الإسباني', 'الدوري الإيطالي', 'الدوري الألماني', 'الدوري الفرنسي', 'الدوري السعودي',
  'ريال مدريد', 'برشلونة', 'ليفربول', 'مانشستر', 'أرسنال', 'تشيلسي', 'بايرن', 'باريس سان جيرمان',
  'الهلال', 'النصر', 'الاتحاد', 'الأهلي', 'القادسية', 'الشباب', 'الاتفاق', 'كرة'
];

let arabiyaNewsPromise = null;
let orientationHandler = null;

function plainText(value = '') {
  const template = document.createElement('template');
  template.innerHTML = String(value);
  return (template.content.textContent || '').replace(/\s+/g, ' ').trim();
}

function safeUrl(value = '') {
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function escapeMarkup(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function isFootballArticle(article) {
  const haystack = `${article.title || ''} ${article.description || ''}`.toLowerCase();
  return FOOTBALL_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

async function fetchWithTimeout(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchArabiyaFootballNews() {
  if (arabiyaNewsPromise) return arabiyaNewsPromise;

  arabiyaNewsPromise = (async () => {
    let items = [];
    const rssJsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(ARABIYA_SPORT_RSS)}`;

    try {
      const response = await fetchWithTimeout(rssJsonUrl);
      const data = await response.json();
      if (data.status !== 'ok' || !Array.isArray(data.items)) throw new Error('Invalid RSS JSON');
      items = data.items.map((item) => ({
        title: plainText(item.title),
        description: plainText(item.description || item.content || ''),
        url: safeUrl(item.link),
        publishedAt: item.pubDate || ''
      }));
    } catch (error) {
      console.warn('Al Arabiya RSS JSON unavailable, trying XML fallback:', error);
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ARABIYA_SPORT_RSS)}`;
      const response = await fetchWithTimeout(proxyUrl);
      const xml = await response.text();
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid RSS XML');
      items = Array.from(doc.querySelectorAll('item')).map((item) => ({
        title: plainText(item.querySelector('title')?.textContent || ''),
        description: plainText(item.querySelector('description')?.textContent || ''),
        url: safeUrl(item.querySelector('link')?.textContent || ''),
        publishedAt: item.querySelector('pubDate')?.textContent || ''
      }));
    }

    const seen = new Set();
    return items
      .filter((item) => item.title && item.url && isFootballArticle(item))
      .filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  })().catch((error) => {
    arabiyaNewsPromise = null;
    throw error;
  });

  return arabiyaNewsPromise;
}

async function renderArabiyaNews(container, compact = false) {
  if (!container || container.dataset.arabiyaLoading === 'true') return;
  container.dataset.arabiyaLoading = 'true';

  try {
    const articles = await fetchArabiyaFootballNews();
    const limit = compact ? 8 : 16;
    const visible = articles.slice(0, limit);

    container.classList.add('compact-arabiya-news');
    container.dataset.newsSource = 'arabiya-football';

    if (!visible.length) {
      container.innerHTML = '<p class="text-center">ما فيه أخبار كرة قدم متاحة حالياً.</p>';
      return;
    }

    container.innerHTML = visible.map((article, index) => `
      <a class="compact-news-item" href="${escapeMarkup(article.url)}" target="_blank" rel="noopener noreferrer">
        <span class="compact-news-index">${index + 1}</span>
        <strong title="${escapeMarkup(article.title)}">${escapeMarkup(article.title)}</strong>
        <small>العربية رياضة</small>
      </a>
    `).join('');
  } catch (error) {
    console.error('Al Arabiya football news failed:', error);
    container.innerHTML = '<p class="text-center">تعذر تحميل أخبار كرة القدم حالياً.</p>';
  } finally {
    container.dataset.arabiyaLoading = 'false';
  }
}

function monitorNewsContainer(container, compact) {
  if (!container || container.dataset.arabiyaObserved === 'true') return;
  container.dataset.arabiyaObserved = 'true';

  const observer = new MutationObserver(() => {
    if (container.dataset.arabiyaLoading === 'true') return;
    const hasOurItems = container.querySelector('.compact-news-item');
    const hasOldCards = container.querySelector('.news-card');
    if (!hasOurItems || hasOldCards) {
      queueMicrotask(() => renderArabiyaNews(container, compact));
    }
  });

  observer.observe(container, { childList: true });
  renderArabiyaNews(container, compact);
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
        window.removeEventListener('deviceorientation', orientationHandler);
        window.removeEventListener('deviceorientationabsolute', orientationHandler);
      }

      const orientationAvailable = 'DeviceOrientationEvent' in window
        && motionPermission !== 'denied';

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
  const homeNews = document.getElementById('home-news-list');
  if (homeNews) monitorNewsContainer(homeNews, true);

  const newsList = document.getElementById('news-list');
  if (newsList) monitorNewsContainer(newsList, false);

  bindQiblaFix();
}

function startPageObserver() {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;
  const observer = new MutationObserver(() => initPageFixes());
  observer.observe(pageContent, { childList: true, subtree: true });
  initPageFixes();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPageObserver, { once: true });
} else {
  startPageObserver();
}

window.addEventListener('hashchange', () => setTimeout(initPageFixes, 0));
