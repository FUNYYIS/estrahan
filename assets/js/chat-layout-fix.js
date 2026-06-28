let chatLayoutFrame = 0;
let chatLayoutObserver = null;

function measureChatLayout() {
  window.cancelAnimationFrame(chatLayoutFrame);
  chatLayoutFrame = window.requestAnimationFrame(() => {
    const chatPage = document.querySelector('.compact-chat-page');
    const bottomNav = document.getElementById('bottom-nav');
    const root = document.documentElement;

    if (!chatPage || !bottomNav || getComputedStyle(bottomNav).display === 'none') {
      root.style.removeProperty('--estraha-chat-available-height');
      chatLayoutObserver?.disconnect();
      chatLayoutObserver = null;
      return;
    }

    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const chatTop = chatPage.getBoundingClientRect().top;
    const navTop = Math.min(bottomNav.getBoundingClientRect().top, viewportHeight);
    const availableHeight = Math.max(240, Math.floor(navTop - chatTop - 8));

    root.style.setProperty('--estraha-chat-available-height', `${availableHeight}px`);

    if (!chatLayoutObserver && 'ResizeObserver' in window) {
      chatLayoutObserver = new ResizeObserver(measureChatLayout);
      chatLayoutObserver.observe(bottomNav);
      chatLayoutObserver.observe(chatPage);
    }
  });
}

function scheduleChatLayoutMeasurement() {
  measureChatLayout();
  window.setTimeout(measureChatLayout, 60);
  window.setTimeout(measureChatLayout, 220);
}

const pageContent = document.getElementById('page-content');
if (pageContent) {
  new MutationObserver(scheduleChatLayoutMeasurement).observe(pageContent, {
    childList: true,
    subtree: false
  });
}

window.addEventListener('resize', scheduleChatLayoutMeasurement, { passive: true });
window.addEventListener('orientationchange', scheduleChatLayoutMeasurement, { passive: true });
window.addEventListener('hashchange', scheduleChatLayoutMeasurement);
window.visualViewport?.addEventListener('resize', scheduleChatLayoutMeasurement, { passive: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleChatLayoutMeasurement, { once: true });
} else {
  scheduleChatLayoutMeasurement();
}

function ensureChatSendIcon() {
    const button = document.querySelector(
        '#sendMessageBtn, #send-message-btn, #chat-send-btn, #sendMessageButton, #chat-form button[type="submit"], .chat-form button[type="submit"], .chat-composer button[type="submit"], .chat-input-form button[type="submit"]'
    );

    if (!button || button.dataset.sendIconReady === '1') return;

    const hasIcon = button.querySelector('svg, i[data-lucide]');
    if (!hasIcon) {
        button.innerHTML = '<i data-lucide="send-horizontal" aria-hidden="true"></i>';
        button.setAttribute('aria-label', 'إرسال');
        button.setAttribute('title', 'إرسال');
    }

    button.dataset.sendIconReady = '1';

    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}

document.addEventListener('DOMContentLoaded', ensureChatSendIcon);
window.addEventListener('hashchange', () => setTimeout(ensureChatSendIcon, 150));

const chatIconObserverTarget = document.getElementById('page-content');
if (chatIconObserverTarget) {
    new MutationObserver(() => ensureChatSendIcon()).observe(chatIconObserverTarget, {
        childList: true,
        subtree: true
    });
}

