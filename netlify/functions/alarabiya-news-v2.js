const GOOGLE_NEWS_FEED = 'https://news.google.com/rss/search?q=site%3Aalarabiya.net%2Fsport+%D9%83%D8%B1%D8%A9+%D8%A7%D9%84%D9%82%D8%AF%D9%85&hl=ar&gl=SA&ceid=SA%3Aar';
const ALARABIYA_ORIGIN = 'https://www.alarabiya.net';
const JINA_READER = 'https://r.jina.ai/';
const MAX_ARTICLES = 18;
const MAX_ENRICHED_ARTICLES = 6;
const MEMORY_FRESH_MS = 10 * 60 * 1000;
const MEMORY_STALE_MS = 24 * 60 * 60 * 1000;
const memoryCache = new Map();

const FOOTBALL_WORDS = [
  'كرة', 'قدم', 'دوري', 'كأس', 'مونديال', 'مباراة', 'هدف', 'منتخب', 'نادي',
  'فريق', 'لاعب', 'مدرب', 'فيفا', 'الهلال', 'النصر', 'الاتحاد', 'الأهلي',
  'ريال مدريد', 'برشلونة', 'ليفربول', 'مانشستر', 'أرسنال', 'تشيلسي', 'بايرن'
];

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,*/*;q=0.7',
  'accept-language': 'ar-SA,ar;q=0.9,en;q=0.5'
};

exports.handler = async (event = {}) => {
  if (event.httpMethod && event.httpMethod !== 'GET') {
    return json(405, { ok: false, articles: [], error: 'Method not allowed' }, { fast: true });
  }

  const limit = parseLimit(event.queryStringParameters?.limit);
  const fast = event.queryStringParameters?.fast === '1';
  const cacheKey = `${fast ? 'fast' : 'full'}:${limit}`;
  const fresh = readMemoryCache(cacheKey, MEMORY_FRESH_MS);

  if (fresh) {
    return json(200, withCacheMeta(fresh, 'memory'), { fast });
  }

  try {
    const { text } = await fetchText(GOOGLE_NEWS_FEED, 5000);
    let articles = parseRss(text)
      .filter(isFootballArticle)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, limit);

    if (!articles.length) {
      throw new Error('No football articles available');
    }

    if (!fast) {
      const enrichCount = selectEnrichmentCount(limit, articles.length);
      const enriched = await Promise.allSettled(
        articles.slice(0, enrichCount).map(enrichArticle)
      );

      articles = articles.map((article, index) => {
        const result = enriched[index];
        return result?.status === 'fulfilled' ? result.value : article;
      });

      articles.sort((a, b) => (
        Number(Boolean(b.image)) - Number(Boolean(a.image))
        || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
      ));
    }

    const payload = {
      ok: true,
      source: 'العربية رياضة',
      meta: {
        fast,
        cache: 'miss',
        generatedAt: new Date().toISOString(),
        resolvedUrls: articles.filter((article) => isAlArabiyaUrl(article.url)).length,
        articlesWithImages: articles.filter((article) => Boolean(article.image)).length
      },
      articles
    };

    writeMemoryCache(cacheKey, payload);
    return json(200, payload, { fast });
  } catch (error) {
    console.error('alarabiya-news-v2 failed:', error);
    const stale = readMemoryCache(cacheKey, MEMORY_STALE_MS);

    if (stale) {
      return json(200, withCacheMeta(stale, 'stale-memory', true), { fast });
    }

    return json(502, {
      ok: false,
      articles: [],
      error: 'Unable to load Al Arabiya news'
    }, { fast: true });
  }
};

async function enrichArticle(article) {
  let articleUrl = cleanUrl(article.url);
  let image = cleanImageUrl(article.image, articleUrl);

  try {
    if (isGoogleNewsUrl(articleUrl)) {
      articleUrl = await resolvePublisherUrl(articleUrl) || articleUrl;
    }

    if (isAlArabiyaUrl(articleUrl)) {
      const page = await fetchArticlePage(articleUrl, 3200);
      const canonical = extractCanonicalUrl(page.text, articleUrl);
      if (canonical && isAlArabiyaUrl(canonical)) articleUrl = canonical;

      image = extractMetaImage(page.text, articleUrl)
        || extractJsonLdImage(page.text, articleUrl)
        || extractNextDataImage(page.text, articleUrl)
        || extractMarkdownImage(page.text, articleUrl)
        || extractFirstContentImage(page.text, articleUrl)
        || image;
    }
  } catch (error) {
    console.warn('Article enrichment failed:', article.title, error.message);
  }

  return {
    ...article,
    url: cleanUrl(articleUrl) || article.url,
    image: cleanImageUrl(image, articleUrl)
  };
}

async function resolvePublisherUrl(googleUrl) {
  const { text } = await fetchText(googleUrl, 2400, BROWSER_HEADERS);
  return extractAlArabiyaUrl(text)
    || extractCanonicalUrl(text, googleUrl)
    || '';
}

async function fetchArticlePage(url, timeoutMs) {
  const attempts = [
    fetchText(url, timeoutMs, { ...BROWSER_HEADERS, referer: ALARABIYA_ORIGIN }),
    fetchText(`${JINA_READER}${url}`, timeoutMs, BROWSER_HEADERS)
      .then((result) => ({ ...result, url }))
  ];

  try {
    return await Promise.any(attempts);
  } catch (error) {
    throw error?.errors?.[0] || error;
  }
}

async function fetchText(url, timeoutMs = 5000, headers = BROWSER_HEADERS, options = {}) {
  if (!url) throw new Error('Missing URL');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      ...options,
      signal: controller.signal,
      headers
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { text: await response.text(), url: response.url || url };
  } finally {
    clearTimeout(timeout);
  }
}

function parseRss(xml) {
  if (!xml || !/<item[\s>]/i.test(xml)) return [];

  return Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)).map((match) => {
    const item = match[1];
    const rawTitle = cleanText(readTag(item, 'title'));
    const title = rawTitle.replace(/\s*-\s*العربية\s*$/u, '').trim();
    const descriptionHtml = readTag(item, 'description') || readTag(item, 'content:encoded');
    const description = cleanText(descriptionHtml);
    const rawLink = readTag(item, 'link') || readTag(item, 'guid');
    const directPublisherUrl = extractAlArabiyaUrl(descriptionHtml);
    const url = cleanUrl(directPublisherUrl || rawLink);
    const publishedAt = cleanText(readTag(item, 'pubDate') || readTag(item, 'dc:date'));
    const image = extractRssImage(item, descriptionHtml, url);

    return { title, description, url, image, publishedAt, source: 'العربية رياضة' };
  }).filter((article) => article.title && article.url);
}

function extractRssImage(item, descriptionHtml, baseUrl) {
  const candidates = [
    readTagAttribute(item, 'media:content', 'url'),
    readTagAttribute(item, 'media:thumbnail', 'url'),
    readTagAttribute(item, 'enclosure', 'url'),
    String(descriptionHtml || '').match(/<img\b[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1]
  ];

  for (const candidate of candidates) {
    const image = cleanImageUrl(candidate, baseUrl);
    if (image) return image;
  }

  return '';
}

function extractMetaImage(html, baseUrl) {
  const keys = ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src'];

  for (const key of keys) {
    const escaped = key.replace(/:/g, '\\:');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
    ];

    for (const pattern of patterns) {
      const image = cleanImageUrl(String(html || '').match(pattern)?.[1], baseUrl);
      if (image) return image;
    }
  }

  return '';
}

function extractJsonLdImage(html, baseUrl) {
  const scripts = Array.from(String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));

  for (const script of scripts) {
    try {
      const image = findImageInJson(JSON.parse(decodeEntities(script[1]).trim()), baseUrl);
      if (image) return image;
    } catch (_) {}
  }

  return '';
}

function extractNextDataImage(html, baseUrl) {
  const match = String(html || '').match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return '';

  try {
    return findImageInJson(JSON.parse(decodeEntities(match[1])), baseUrl);
  } catch {
    return '';
  }
}

function findImageInJson(value, baseUrl, depth = 0) {
  if (!value || depth > 10) return '';
  if (typeof value === 'string') return cleanImageUrl(value, baseUrl);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageInJson(item, baseUrl, depth + 1);
      if (found) return found;
    }
    return '';
  }

  if (typeof value !== 'object') return '';

  const preferredKeys = ['image', 'images', 'thumbnailUrl', 'thumbnail', 'contentUrl', 'imageUrl', 'imageURL'];
  for (const key of preferredKeys) {
    if (value[key]) {
      const found = findImageInJson(value[key], baseUrl, depth + 1);
      if (found) return found;
    }
  }

  for (const child of Object.values(value)) {
    const found = findImageInJson(child, baseUrl, depth + 1);
    if (found) return found;
  }

  return '';
}

function extractMarkdownImage(text, baseUrl) {
  const matches = Array.from(String(text || '').matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi));
  for (const match of matches) {
    const image = cleanImageUrl(match[1], baseUrl);
    if (image) return image;
  }
  return '';
}

function extractFirstContentImage(html, baseUrl) {
  const matches = Array.from(String(html || '').matchAll(/<img\b[^>]*(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]*>/gi));
  for (const match of matches) {
    const image = cleanImageUrl(match[1], baseUrl);
    if (image) return image;
  }
  return '';
}

function extractCanonicalUrl(html, baseUrl) {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["'][^>]*>/i
  ];

  for (const pattern of patterns) {
    const url = cleanUrl(String(html || '').match(pattern)?.[1], baseUrl);
    if (url) return url;
  }

  return '';
}

function extractAlArabiyaUrl(value) {
  const normalized = normalizeEscapedText(value);
  const matches = normalized.match(/https?:\/\/(?:www\.)?alarabiya\.net\/[a-zA-Z0-9_%?=&.,~+\-/]+/gi) || [];
  return matches.map((url) => cleanUrl(url)).find(isAlArabiyaUrl) || '';
}

function cleanImageUrl(value, baseUrl = ALARABIYA_ORIGIN) {
  const cleaned = cleanUrl(value, baseUrl);
  if (!cleaned) return '';

  try {
    const url = new URL(cleaned);
    const host = url.hostname.toLowerCase();
    const pathAndQuery = `${url.pathname}${url.search}`.toLowerCase();
    const blockedHost = host === 'news.google.com'
      || host.endsWith('.gstatic.com')
      || host.endsWith('.googleusercontent.com');
    const genericAsset = /(?:^|[\/_-])(logo|icon|favicon|sprite|placeholder|google[-_]?news)(?:[\/_-]|\.|$)/i.test(pathAndQuery);
    const looksLikeImage = /\.(?:avif|webp|jpe?g|png)(?:$|\?)/i.test(url.href)
      || /(?:image|images|media|cdn|asset|upload|resize|transform)/i.test(pathAndQuery);

    return url.protocol === 'https:'
      && !blockedHost
      && !genericAsset
      && !url.pathname.toLowerCase().endsWith('.svg')
      && looksLikeImage
      ? url.href
      : '';
  } catch {
    return '';
  }
}

function cleanUrl(value, baseUrl = ALARABIYA_ORIGIN) {
  const decoded = decodeEntities(stripCdata(String(value || '')).trim());
  if (!decoded) return '';

  try {
    const url = new URL(decoded, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function isGoogleNewsUrl(value) {
  try {
    return new URL(value).hostname === 'news.google.com';
  } catch {
    return false;
  }
}

function isAlArabiyaUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'alarabiya.net' || host.endsWith('.alarabiya.net');
  } catch {
    return false;
  }
}

function readTag(text, tagName) {
  const safeTag = tagName.replace(':', '\\:');
  const match = String(text || '').match(new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, 'i'));
  return match ? stripCdata(match[1]).trim() : '';
}

function readTagAttribute(text, tagName, attributeName) {
  const safeTag = tagName.replace(':', '\\:');
  const pattern = new RegExp(`<${safeTag}\\b[^>]*\\b${attributeName}=["']([^"']+)["'][^>]*>`, 'i');
  return String(text || '').match(pattern)?.[1] || '';
}

function stripCdata(value) {
  return String(value || '').replace(/^\s*<!\[CDATA\[/i, '').replace(/\]\]>\s*$/i, '');
}

function cleanText(value) {
  return decodeEntities(stripCdata(String(value || '')).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function normalizeEscapedText(value) {
  return decodeEntities(String(value || ''))
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"');
}

function isFootballArticle(article) {
  const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();
  return FOOTBALL_WORDS.some((word) => text.includes(word.toLowerCase()));
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return MAX_ARTICLES;
  return Math.min(MAX_ARTICLES, Math.max(1, parsed));
}

function selectEnrichmentCount(limit, articleCount) {
  const requested = limit <= 3 ? 3 : MAX_ENRICHED_ARTICLES;
  return Math.min(requested, articleCount);
}

function writeMemoryCache(key, payload) {
  memoryCache.set(key, { createdAt: Date.now(), payload });

  if (memoryCache.size > 12) {
    const oldestKey = [...memoryCache.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt)[0]?.[0];
    if (oldestKey) memoryCache.delete(oldestKey);
  }
}

function readMemoryCache(key, maxAgeMs) {
  const cached = memoryCache.get(key);
  if (!cached || Date.now() - cached.createdAt > maxAgeMs) return null;
  return cached.payload;
}

function withCacheMeta(payload, cache, stale = false) {
  return {
    ...payload,
    meta: {
      ...(payload.meta || {}),
      cache,
      stale
    }
  };
}

function buildHeaders({ fast = false } = {}) {
  const browserMaxAge = fast ? 60 : 120;
  const edgeMaxAge = fast ? 300 : 900;

  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': `public, max-age=${browserMaxAge}, stale-while-revalidate=600`,
    'netlify-cdn-cache-control': `public, durable, s-maxage=${edgeMaxAge}, stale-while-revalidate=86400`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  };
}

function json(statusCode, body, options) {
  return {
    statusCode,
    headers: buildHeaders(options),
    body: JSON.stringify(body)
  };
}

exports.__test = {
  buildHeaders,
  cleanImageUrl,
  parseLimit,
  parseRss,
  selectEnrichmentCount
};
