const ALARABIYA_FEED = 'https://www.alarabiya.net/.mrss/ar/sport.xml';
const GOOGLE_NEWS_FEED = 'https://news.google.com/rss/search?q=site%3Aalarabiya.net%2Fsport+%D9%83%D8%B1%D8%A9+%D8%A7%D9%84%D9%82%D8%AF%D9%85&hl=ar&gl=SA&ceid=SA%3Aar';
const ALARABIYA_ORIGIN = 'https://www.alarabiya.net';
const JINA_READER = 'https://r.jina.ai/';
const MAX_ARTICLES = 18;
const CACHE_FRESH_MS = 10 * 60 * 1000;
const CACHE_STALE_MS = 24 * 60 * 60 * 1000;
const memoryCache = new Map();

const FOOTBALL_WORDS = [
  'كرة', 'قدم', 'دوري', 'كأس', 'مونديال', 'مباراة', 'هدف', 'منتخب', 'نادي',
  'فريق', 'لاعب', 'مدرب', 'فيفا', 'الهلال', 'النصر', 'الاتحاد', 'الأهلي',
  'ريال مدريد', 'برشلونة', 'ليفربول', 'مانشستر', 'أرسنال', 'تشيلسي', 'بايرن'
];

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.9,*/*;q=0.7',
  'accept-language': 'ar-SA,ar;q=0.9,en;q=0.5'
};

exports.handler = async (event = {}) => {
  if (event.httpMethod && event.httpMethod !== 'GET') {
    return json(405, { ok: false, articles: [], error: 'Method not allowed' });
  }

  const limit = parseLimit(event.queryStringParameters?.limit);
  const cacheKey = String(limit);
  const fresh = readCache(cacheKey, CACHE_FRESH_MS);
  if (fresh) return json(200, { ...fresh, cache: 'memory' });

  try {
    const articles = await buildArticles(limit);
    if (!articles.length) throw new Error('No football articles available');

    const payload = {
      ok: true,
      source: 'العربية رياضة',
      generatedAt: new Date().toISOString(),
      articles
    };
    writeCache(cacheKey, payload);
    return json(200, payload);
  } catch (error) {
    console.error('alarabiya-news-v3 failed:', error);
    const stale = readCache(cacheKey, CACHE_STALE_MS);
    if (stale) return json(200, { ...stale, cache: 'stale-memory', stale: true });
    return json(502, { ok: false, articles: [], error: 'Unable to load Al Arabiya news' });
  }
};

async function buildArticles(limit) {
  let articles = [];

  for (const feedUrl of [ALARABIYA_FEED, GOOGLE_NEWS_FEED]) {
    try {
      const { text } = await fetchText(feedUrl, 6500);
      articles.push(...parseRss(text));
      articles = dedupeArticles(articles);
      if (articles.filter(isFootballArticle).length >= limit) break;
    } catch (error) {
      console.warn('News feed failed:', feedUrl, error.message);
    }
  }

  articles = dedupeArticles(articles)
    .filter(isFootballArticle)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, Math.max(limit, 6));

  const enrichCount = Math.min(articles.length, limit <= 3 ? 3 : 8);
  const enriched = await Promise.allSettled(
    articles.slice(0, enrichCount).map(enrichArticle)
  );

  articles = articles.map((article, index) => {
    const result = enriched[index];
    return result?.status === 'fulfilled' ? result.value : article;
  });

  return articles
    .sort((a, b) => (
      Number(Boolean(b.image)) - Number(Boolean(a.image))
      || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
    ))
    .slice(0, limit);
}

async function enrichArticle(article) {
  let url = cleanUrl(article.url);
  let image = cleanImageUrl(article.image, url);

  try {
    if (isGoogleNewsUrl(url)) {
      const googlePage = await fetchText(url, 3000);
      url = extractAlArabiyaUrl(googlePage.text)
        || extractCanonicalUrl(googlePage.text, url)
        || url;
    }

    if (isAlArabiyaUrl(url)) {
      const page = await fetchArticlePage(url);
      const canonical = extractCanonicalUrl(page.text, url);
      if (canonical && isAlArabiyaUrl(canonical)) url = canonical;

      image = extractMetaImage(page.text, url)
        || extractJsonLdImage(page.text, url)
        || extractFirstImage(page.text, url)
        || image;
    }
  } catch (error) {
    console.warn('Article enrichment failed:', article.title, error.message);
  }

  return {
    ...article,
    url: cleanUrl(url) || article.url,
    image: cleanImageUrl(image, url)
  };
}

async function fetchArticlePage(url) {
  const attempts = [
    fetchText(url, 4200, { ...BROWSER_HEADERS, referer: ALARABIYA_ORIGIN }),
    fetchText(`${JINA_READER}${url}`, 4200)
  ];
  try {
    return await Promise.any(attempts);
  } catch (error) {
    throw error?.errors?.[0] || error;
  }
}

async function fetchText(url, timeoutMs = 6000, headers = BROWSER_HEADERS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers });
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
    const descriptionHtml = readTag(item, 'description') || readTag(item, 'content:encoded');
    const rawLink = readTag(item, 'link') || readTag(item, 'guid');
    const directUrl = extractAlArabiyaUrl(descriptionHtml);
    const url = cleanUrl(directUrl || rawLink);

    const imageCandidates = [
      readTagAttribute(item, 'media:content', 'url'),
      readTagAttribute(item, 'media:thumbnail', 'url'),
      readTagAttribute(item, 'enclosure', 'url'),
      String(descriptionHtml || '').match(/<img\b[^>]+(?:src|data-src|data-original)=['"]([^'"]+)['"]/i)?.[1]
    ];

    let image = '';
    for (const candidate of imageCandidates) {
      image = cleanImageUrl(candidate, url);
      if (image) break;
    }

    return {
      title: cleanText(readTag(item, 'title')).replace(/\s*-\s*العربية\s*$/u, '').trim(),
      description: cleanText(descriptionHtml),
      url,
      image,
      publishedAt: cleanText(readTag(item, 'pubDate') || readTag(item, 'dc:date')),
      source: 'العربية رياضة'
    };
  }).filter((article) => article.title && article.url);
}

function extractMetaImage(html, baseUrl) {
  const keys = ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src'];
  for (const key of keys) {
    const escaped = key.replace(/:/g, '\\:');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=['"]${escaped}['"][^>]+content=['"]([^'"]+)['"][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=['"]([^'"]+)['"][^>]+(?:property|name)=['"]${escaped}['"][^>]*>`, 'i')
    ];
    for (const pattern of patterns) {
      const image = cleanImageUrl(String(html || '').match(pattern)?.[1], baseUrl);
      if (image) return image;
    }
  }
  return '';
}

function extractJsonLdImage(html, baseUrl) {
  const scripts = Array.from(String(html || '').matchAll(/<script[^>]+type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi));
  for (const script of scripts) {
    try {
      const image = findImageInJson(JSON.parse(decodeEntities(script[1]).trim()), baseUrl);
      if (image) return image;
    } catch (_) {}
  }
  return '';
}

function findImageInJson(value, baseUrl, depth = 0) {
  if (!value || depth > 9) return '';
  if (typeof value === 'string') return cleanImageUrl(value, baseUrl);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageInJson(item, baseUrl, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (const key of ['image', 'images', 'thumbnailUrl', 'thumbnail', 'contentUrl', 'imageUrl']) {
    if (value[key]) {
      const found = findImageInJson(value[key], baseUrl, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

function extractFirstImage(html, baseUrl) {
  const matches = Array.from(String(html || '').matchAll(/<img\b[^>]*(?:src|data-src|data-original|data-lazy-src)=['"]([^'"]+)['"][^>]*>/gi));
  for (const match of matches) {
    const image = cleanImageUrl(match[1], baseUrl);
    if (image) return image;
  }
  return '';
}

function extractCanonicalUrl(html, baseUrl) {
  const patterns = [
    /<link[^>]+rel=['"]canonical['"][^>]+href=['"]([^'"]+)['"][^>]*>/i,
    /<link[^>]+href=['"]([^'"]+)['"][^>]+rel=['"]canonical['"][^>]*>/i,
    /<meta[^>]+property=['"]og:url['"][^>]+content=['"]([^'"]+)['"][^>]*>/i
  ];
  for (const pattern of patterns) {
    const url = cleanUrl(String(html || '').match(pattern)?.[1], baseUrl);
    if (url) return url;
  }
  return '';
}

function extractAlArabiyaUrl(value) {
  const normalized = decodeEntities(String(value || ''))
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
  const matches = normalized.match(/https?:\/\/(?:www\.)?alarabiya\.net\/[a-zA-Z0-9_%?=&.,~+\-/]+/gi) || [];
  return matches.map((url) => cleanUrl(url)).find(isAlArabiyaUrl) || '';
}

function cleanImageUrl(value, baseUrl = ALARABIYA_ORIGIN) {
  const cleaned = cleanUrl(value, baseUrl);
  if (!cleaned) return '';
  try {
    const url = new URL(cleaned);
    const host = url.hostname.toLowerCase();
    const path = `${url.pathname}${url.search}`.toLowerCase();
    if (url.protocol !== 'https:') return '';
    if (host === 'news.google.com') return '';
    if (/\.(?:svg|mp4|m3u8|mov|webm)(?:$|\?)/i.test(path)) return '';
    if (/(?:^|[\/_-])(logo|icon|favicon|sprite|placeholder)(?:[\/_-]|\.|$)/i.test(path)) return '';
    return url.href;
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
  try { return new URL(value).hostname === 'news.google.com'; } catch { return false; }
}

function isAlArabiyaUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'alarabiya.net' || host.endsWith('.alarabiya.net');
  } catch { return false; }
}

function isFootballArticle(article) {
  const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();
  return FOOTBALL_WORDS.some((word) => text.includes(word.toLowerCase()));
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = cleanUrl(article.url).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readTag(text, tagName) {
  const safeTag = tagName.replace(':', '\\:');
  const match = String(text || '').match(new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, 'i'));
  return match ? stripCdata(match[1]).trim() : '';
}

function readTagAttribute(text, tagName, attributeName) {
  const safeTag = tagName.replace(':', '\\:');
  return String(text || '').match(new RegExp(`<${safeTag}\\b[^>]*\\b${attributeName}=['"]([^'"]+)['"][^>]*>`, 'i'))?.[1] || '';
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

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(MAX_ARTICLES, Math.max(1, parsed)) : MAX_ARTICLES;
}

function writeCache(key, payload) {
  memoryCache.set(key, { createdAt: Date.now(), payload });
  if (memoryCache.size > 12) {
    const oldest = [...memoryCache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0]?.[0];
    if (oldest) memoryCache.delete(oldest);
  }
}

function readCache(key, maxAge) {
  const cached = memoryCache.get(key);
  return cached && Date.now() - cached.createdAt <= maxAge ? cached.payload : null;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=120, stale-while-revalidate=600',
      'netlify-cdn-cache-control': 'public, durable, s-maxage=600, stale-while-revalidate=86400',
      'x-content-type-options': 'nosniff'
    },
    body: JSON.stringify(body)
  };
}
