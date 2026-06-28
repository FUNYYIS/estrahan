import './runtime-ux.js';

function replaceRawPermissionErrors() {
  document.querySelectorAll('#alert-message, #notification-sync-status, #prayer-location-status').forEach((element) => {
    if (/missing or insufficient permissions/i.test(element.textContent || '')) {
      element.textContent = 'تعذر حفظ الإعدادات بسبب صلاحيات قديمة. حدّث الصفحة وجرّب مرة ثانية.';
    }
  });
}

function initHomePolish() {
  window.EstrahaNews?.watch(document.getElementById('home-arabiya-news-list'), { compact: true });
  window.EstrahaNews?.watch(document.getElementById('arabiya-news-list'), { compact: false });
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
