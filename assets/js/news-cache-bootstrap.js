const NEWS_FUNCTION_PATH = '/.netlify/functions/alarabiya-news-v2';
const NEWS_CACHE_VERSION = 2;
const NEWS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NEWS_CACHE_FRESH_MS = 10 * 60 * 1000;
const nativeFetch = window.fetch.bind(window);
const refreshes = new Map();

function currentNewsLimit() {
  return document.getElementById('home-arabiya-news-list') ? 3 : 18;
}

function cacheKey(limit) {
  return `estraha-news-response-v${NEWS_CACHE_VERSION}:${limit}`;
}

function readCachedPayload(limit) {
  try {
    const raw = localStorage.getItem(cacheKey(limit));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const age = Date.now() - Number(cached?.savedAt || 0);
    if (!cached?.payload?.ok || !Array.isArray(cached.payload.articles) || age > NEWS_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(cacheKey(limit));
      return null;
    }
    return { ...cached, fresh: age <= NEWS_CACHE_FRESH_MS };
  } catch {
    return null;
  }
}

function writeCachedPayload(limit, payload) {
  if (!payload?.ok || !Array.isArray(payload.articles) || !payload.articles.length) return;
  try {
    localStorage.setItem(cacheKey(limit), JSON.stringify({ savedAt: Date.now(), payload }));
  } catch (_) {}
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function stableNewsUrl(limit, fast = false) {
  const url = new URL(NEWS_FUNCTION_PATH, window.location.origin);
  url.searchParams.set('limit', String(limit));
  if (fast) url.searchParams.set('fast', '1');
  return url.href;
}

async function fetchAndCache(limit, fast = false) {
  const response = await nativeFetch(stableNewsUrl(limit, fast), {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) return response;

  const payload = await response.clone().json();
  if (!fast) writeCachedPayload(limit, payload);
  return response;
}

function refreshInBackground(limit) {
  if (refreshes.has(limit)) return refreshes.get(limit);

  const refresh = fetchAndCache(limit, false)
    .then(async (response) => {
      if (!response.ok) return;
      const container = limit === 3
        ? document.getElementById('home-arabiya-news-list')
        : document.getElementById('arabiya-news-list');
      if (!container) return;

      container.dataset.newsState = '';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    })
    .catch((error) => console.warn('Background news refresh failed:', error))
    .finally(() => refreshes.delete(limit));

  refreshes.set(limit, refresh);
  return refresh;
}

window.fetch = async function estrahaFetch(input, init = {}) {
  const requestUrl = typeof input === 'string' || input instanceof URL
    ? new URL(input, window.location.origin)
    : new URL(input.url, window.location.origin);

  if (requestUrl.pathname !== NEWS_FUNCTION_PATH) {
    return nativeFetch(input, init);
  }

  const limit = currentNewsLimit();
  const cached = readCachedPayload(limit);

  if (cached) {
    if (!cached.fresh) refreshInBackground(limit);
    return jsonResponse(cached.payload);
  }

  try {
    const fastResponse = await fetchAndCache(limit, true);
    refreshInBackground(limit);
    return fastResponse;
  } catch (error) {
    console.warn('Fast news request failed, trying enriched response:', error);
    return fetchAndCache(limit, false);
  }
};
