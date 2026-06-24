const NEWS_ENDPOINT = '/api/alarabiya-news';
const IMAGE_PROXY_ENDPOINT = '/.netlify/functions/alarabiya-image';
const NEWS_PLACEHOLDER_IMAGE = 'assets/images/news-placeholder.svg';
const HOME_NEWS_LIMIT = 3;
const FULL_NEWS_LIMIT = 18;
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

async function fetchArabiyaNews() {
  const response = await fetch(`${NEWS_ENDPOINT}?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Al Arabiya endpoint returned ${response.status}`);
  }

  const data = await response.json();
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
    (safeUrl(article?.image) ? withImages : withoutImages).push(article);
  });

  return [...withImages, ...withoutImages].slice(0, limit);
}

function bindNewsImageFallbacks(container) {
  container.querySelectorAll('.compact-news-thumb').forEach((imageElement) => {
    imageElement.addEventListener('error', () => {
      const directImage = imageElement.dataset.directSrc || '';

      if (directImage && imageElement.dataset.directTried !== 'true') {
        imageElement.dataset.directTried = 'true';
        imageElement.src = directImage;
        return;
      }

      if (imageElement.dataset.placeholderApplied !== 'true') {
        imageElement.dataset.placeholderApplied = 'true';
        imageElement.src = NEWS_PLACEHOLDER_IMAGE;
      }
    });
  });
}

function renderNewsItems(container, articles, compact) {
  const visible = selectVisibleNews(articles, compact);

  if (!visible.length) {
    throw new Error('No Al Arabiya football articles');
  }

  container.className = compact
    ? 'home-news-preview compact-arabiya-news'
    : 'compact-arabiya-news';
  container.dataset.newsState = 'success';

  container.innerHTML = visible.map((article) => {
    const url = safeUrl(article.url);
    const image = safeUrl(article.image);
    const title = String(article.title || 'خبر رياضي').trim();
    const imageSource = image
      ? `${IMAGE_PROXY_ENDPOINT}?url=${encodeURIComponent(image)}`
      : NEWS_PLACEHOLDER_IMAGE;

    return `
      <a class="compact-news-item${image ? '' : ' no-image'}" href="${escapeMarkup(url || '#')}" target="_blank" rel="noopener noreferrer">
        <img class="compact-news-thumb" src="${escapeMarkup(imageSource)}" data-direct-src="${escapeMarkup(image)}" alt="${escapeMarkup(title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        <span class="compact-news-copy">
          <strong title="${escapeMarkup(title)}">${escapeMarkup(title)}</strong>
          <small>العربية رياضة</small>
        </span>
      </a>
    `;
  }).join('');

  bindNewsImageFallbacks(container);
}

function renderNewsError(container, compact) {
  container.className = compact
    ? 'home-news-preview compact-arabiya-news'
    : 'compact-arabiya-news';
  container.dataset.newsState = 'error';
  container.innerHTML = `
    <div class="news-load-error">
      <span>تعذر تحميل أخبار العربية حالياً.</span>
      <button type="button" class="btn retry-arabiya-news">إعادة المحاولة</button>
    </div>
  `;

  container.querySelector('.retry-arabiya-news')?.addEventListener('click', () => {
    container.dataset.newsState = '';
    loadArabiyaNews(container, compact);
  });
}

async function loadArabiyaNews(container, compact = false) {
  if (!container) return;
  if (container.dataset.newsState === 'loading' || container.dataset.newsState === 'success') return;

  container.dataset.newsState = 'loading';
  container.innerHTML = '<p class="text-center">جاري تحميل أخبار العربية...</p>';

  try {
    const articles = await fetchArabiyaNews();
    renderNewsItems(container, articles, compact);
  } catch (error) {
    console.error('Al Arabiya news failed:', error);
    renderNewsError(container, compact);
  }
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
