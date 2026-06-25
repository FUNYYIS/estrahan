const ICON_LABELS = {
  menu: 'فتح القائمة',
  bell: 'الإشعارات',
  moon: 'تبديل الوضع',
  sun: 'تبديل الوضع',
  'chevron-left': 'عرض المزيد',
  'chevron-right': 'رجوع',
  x: 'إغلاق',
  search: 'بحث',
  refresh: 'تحديث',
  upload: 'رفع ملف',
  camera: 'اختيار صورة',
  trash: 'حذف',
  edit: 'تعديل',
  save: 'حفظ',
  send: 'إرسال',
  'log-out': 'تسجيل الخروج'
};

let lastFocusedElement = null;
let offlineBanner = null;

function ensureRuntimeStyles() {
  if (document.querySelector('link[data-runtime-ux]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'assets/css/runtime-ux.css?v=270';
  link.dataset.runtimeUx = 'true';
  document.head.appendChild(link);
}

function labelIconOnlyControls(root = document) {
  root.querySelectorAll('button:not([aria-label]), a:not([aria-label])').forEach((element) => {
    const visibleText = element.textContent.replace(/\s+/g, ' ').trim();
    if (visibleText) return;
    const icon = element.querySelector('[data-lucide]');
    if (!icon) return;
    const iconName = icon.getAttribute('data-lucide') || '';
    element.setAttribute('aria-label', ICON_LABELS[iconName] || 'زر');
  });
}

function hardenExternalLinks(root = document) {
  root.querySelectorAll('a[target="_blank"]').forEach((link) => {
    const rel = new Set((link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    link.setAttribute('rel', [...rel].join(' '));
  });
}

function markDynamicStatusRegions(root = document) {
  root.querySelectorAll('.news-load-error, .empty-state, .loading-state').forEach((element) => {
    if (!element.hasAttribute('role')) element.setAttribute('role', 'status');
    if (!element.hasAttribute('aria-live')) element.setAttribute('aria-live', 'polite');
  });
}

function ensureOfflineBanner() {
  if (offlineBanner?.isConnected) return offlineBanner;
  offlineBanner = document.createElement('div');
  offlineBanner.id = 'offline-banner';
  offlineBanner.className = 'offline-banner';
  offlineBanner.setAttribute('role', 'status');
  offlineBanner.setAttribute('aria-live', 'polite');
  offlineBanner.hidden = true;
  offlineBanner.innerHTML = '<strong>أنت غير متصل بالإنترنت</strong><span>نعرض آخر بيانات محفوظة، وبعض الخدمات قد لا تتحدث.</span>';
  document.body.appendChild(offlineBanner);
  return offlineBanner;
}

function updateConnectivityState() {
  const banner = ensureOfflineBanner();
  const online = navigator.onLine;
  banner.hidden = online;
  document.documentElement.classList.toggle('is-offline', !online);
  const onlineState = document.getElementById('onlineState');
  if (onlineState) {
    onlineState.textContent = online ? 'متصل' : 'غير متصل';
    onlineState.classList.toggle('is-offline', !online);
    onlineState.setAttribute('aria-live', 'polite');
  }
}

function isElementVisible(element) {
  if (!element || element.hidden) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
}

function improveCustomAlert() {
  const alert = document.getElementById('custom-alert');
  const message = document.getElementById('alert-message');
  const closeButton = document.getElementById('alert-close-btn');
  if (!alert || !message || !closeButton || alert.dataset.a11yBound === 'true') return;
  alert.dataset.a11yBound = 'true';
  alert.setAttribute('role', 'dialog');
  alert.setAttribute('aria-modal', 'true');
  alert.setAttribute('aria-labelledby', message.id || 'alert-message');

  const syncFocus = () => {
    const visible = isElementVisible(alert);
    alert.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) {
      lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
    } else if (lastFocusedElement?.isConnected) {
      lastFocusedElement.focus({ preventScroll: true });
      lastFocusedElement = null;
    }
  };

  new MutationObserver(syncFocus).observe(alert, {
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden']
  });
  alert.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isElementVisible(alert)) {
      event.preventDefault();
      closeButton.click();
    }
  });
  syncFocus();
}

function applyRuntimeEnhancements(root = document) {
  labelIconOnlyControls(root);
  hardenExternalLinks(root);
  markDynamicStatusRegions(root);
  improveCustomAlert();
}

function startRuntimeEnhancements() {
  ensureRuntimeStyles();
  applyRuntimeEnhancements(document);
  updateConnectivityState();
  const pageContent = document.getElementById('page-content');
  if (pageContent) {
    new MutationObserver(() => {
      window.requestAnimationFrame(() => applyRuntimeEnhancements(pageContent));
    }).observe(pageContent, { childList: true, subtree: true });
  }
  window.addEventListener('online', updateConnectivityState);
  window.addEventListener('offline', updateConnectivityState);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startRuntimeEnhancements, { once: true });
} else {
  startRuntimeEnhancements();
}
