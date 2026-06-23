function getPreviewName(row) {
  const text = Array.from(row.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || '')
    .join(' ')
    .trim();

  return text || 'واحد من الربع';
}

function getInitial(name) {
  const value = Array.from(String(name).trim())[0];
  return value || 'و';
}

function buildChatPreviewItem(row, index) {
  const name = getPreviewName(row);
  const message = row.querySelector('b')?.textContent?.trim() || 'افتح الدردشة لمشاهدة الرسالة';

  const link = document.createElement('a');
  link.href = '#chat';
  link.className = 'home-chat-preview-item';
  link.setAttribute('aria-label', `فتح رسالة ${name}`);

  const avatar = document.createElement('span');
  avatar.className = 'home-chat-preview-avatar';
  avatar.textContent = getInitial(name);

  const content = document.createElement('span');
  content.className = 'home-chat-preview-content';

  const meta = document.createElement('span');
  meta.className = 'home-chat-preview-meta';

  const sender = document.createElement('strong');
  sender.textContent = name;

  const status = document.createElement('small');
  status.textContent = index === 0 ? 'آخر رسالة' : 'رسالة سابقة';

  const preview = document.createElement('span');
  preview.className = 'home-chat-preview-text';
  preview.textContent = message;

  const arrow = document.createElement('span');
  arrow.className = 'home-chat-preview-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '‹';

  meta.append(sender, status);
  content.append(meta, preview);
  link.append(avatar, content, arrow);
  return link;
}

function enhanceHomeChatPreview() {
  const container = document.getElementById('home-chat-preview');
  if (!container) return;

  const rawRows = Array.from(container.querySelectorAll(':scope > span'));
  if (!rawRows.length) return;

  const fragment = document.createDocumentFragment();
  rawRows.slice(0, 2).forEach((row, index) => {
    fragment.appendChild(buildChatPreviewItem(row, index));
  });

  container.replaceChildren(fragment);
  container.dataset.enhanced = 'true';
}

const pageContent = document.getElementById('page-content');
if (pageContent) {
  const observer = new MutationObserver(() => enhanceHomeChatPreview());
  observer.observe(pageContent, { childList: true, subtree: true });
}

window.addEventListener('hashchange', () => {
  window.setTimeout(enhanceHomeChatPreview, 0);
});

window.setTimeout(enhanceHomeChatPreview, 0);
