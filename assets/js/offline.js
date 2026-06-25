const FRESHNESS_STORAGE_PREFIX = 'estraha:last-updated:';

function getRiyadhDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function formatSaudiLastUpdated(timestamp) {
  const date = new Date(Number(timestamp || 0));
  if (Number.isNaN(date.getTime())) return 'غير متوفر بعد';

  const now = new Date();
  const todayKey = getRiyadhDateKey(now);
  const dateKey = getRiyadhDateKey(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = getRiyadhDateKey(yesterday);
  const time = new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);

  if (dateKey === todayKey) return `اليوم ${time}`;
  if (dateKey === yesterdayKey) return `أمس ${time}`;

  const day = new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'short'
  }).format(date);
  return `${day} ${time}`;
}

function readLastUpdated(key) {
  try {
    return Number(localStorage.getItem(`${FRESHNESS_STORAGE_PREFIX}${key}`) || 0) || 0;
  } catch {
    return 0;
  }
}

document.querySelectorAll('[data-last-updated-key]').forEach((element) => {
  const key = element.dataset.lastUpdatedKey;
  const savedAt = readLastUpdated(key);
  element.dataset.cached = savedAt ? 'true' : 'false';
  element.textContent = savedAt
    ? `بيانات محفوظة - آخر تحديث: ${formatSaudiLastUpdated(savedAt)}`
    : 'آخر تحديث: غير متوفر بعد';
});
