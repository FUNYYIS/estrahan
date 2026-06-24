const RSS_FEEDS = [
  'https://www.alarabiya.net/.mrss/ar/sport.xml',
  'https://www.alarabiya.net/rss/sport.xml',
  'https://www.alarabiya.net/sport.rss'
];
const SPORT_PAGE = 'https://www.alarabiya.net/sport';
const GOOGLE_NEWS = 'https://news.google.com/rss/search?q=site%3Aalarabiya.net%2Fsport+%D9%83%D8%B1%D8%A9+%D8%A7%D9%84%D9%82%D8%AF%D9%85&hl=ar&gl=SA&ceid=SA%3Aar';
const ALARABIYA_ORIGIN = 'https://www.alarabiya.net';
const ALL_ORIGINS_RAW = 'https://api.allorigins.win/raw?url=';
const FOOTBALL_WORDS = [
  'كرة', 'قدم', 'دوري', 'كأس', 'مونديال', 'مباراة', 'هدف', 'منتخب', 'نادي',
  'فريق', 'لاعب', 'مدرب', 'فيفا', 'الهلال', 'النصر', 'الاتحاد', 'الأهلي',
  'ريال مدريد', 'برشلونة', 'ليفربول', 'مانشستر', 'أرسنال', 'تشيلسي', 'بايرن'
];
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
  'access-control-allow-origin': '*'
};

exports.handler = async () => {
  try {
    const sourceResults = await Promise.allSettled([
      ...RSS_FEEDS.map((url) => fetchText(url, 7000).then(({ text }) => parseRss(text))),
      fetchText(SPORT_PAGE, 7000).then(({ text }) => parseSportPage(text)),
      fetchText(GOOGLE_NEWS, 7000).then(({ text }) => parseRss(text))
    ]);

    let articles = sourceResults
      .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      .filter(isFootballArticle);

    articles = dedupe(articles)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, 18);

    if (!articles.length) {
      return json(502, { ok: false, articles: [], error: 'No football articles available' });
    }

    const enrichedResults = await Promise.allSettled(articles.map(enrichArticle));
    articles = enrichedResults.map((result, index) => (
      result.status === 'fulfilled' ? result.value : articles[index]
    ));

    articles.sort((a, b) => (
      Number(Boolean(b.image)) - Number(Boolean(a.image))
      || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
    ));

    return json(200, { ok: true, source: 'العربية رياضة', articles });
  } catch (error) {
    console.error('alarabiya-news-v2 failed:', error);
    return json(500, { ok: false, articles: [], error: 'Unable to load Al Arabiya news' });
  }
};

async function enrichArticle(article) {
  let articleUrl = cleanUrl(article.url, ALARABIYA_ORIGIN);
  let image = cleanImageUrl(article.image, articleUrl || ALARABIYA_ORIGIN);
  let page = null;

  try {
    if (articleUrl && !isAlArabiyaUrl(articleUrl)) {
      const intermediaryPage = await fetchArticlePage(articleUrl, 5500);
      const directUrl = extractAlArabiyaUrl(intermediaryPage.text);
      if (directUrl) articleUrl = directUrl;
    }

    if (articleUrl && isAlArabiyaUrl(articleUrl)) {
      page = await fetchArticlePage(articleUrl, 6500);
      const canonical = extractCanonicalUrl(page.text, articleUrl);
      if (canonical && isAlArabiyaUrl(canonical)) articleUrl = canonical;

      image = extractMetaImage(page.text, articleUrl)
        || extractJsonLdImage(page.text, articleUrl)
        || extractNextDataImage(page.text, articleUrl)
        || extractFirstContentImage(page.text, articleUrl)
        || image;
    }
  } catch (error) {
    console.warn('Article enrichment failed:', articleUrl, error.message);
  }

  return {
    ...article,
    url: cleanUrl(articleUrl, ALARABIYA_ORIGIN) || article.url,
    image: cleanImageUrl(image, articleUrl || ALARABIYA_ORIGIN)
  };
}

async function fetchArticlePage(url, timeoutMs) {
  try {
    return await fetchText(url, timeoutMs);
  } catch (directError) {
    const proxyUrl = `${ALL_ORIGINS_RAW}${encodeURIComponent(url)}`;
    try {
      const proxied = await fetchText(proxyUrl, timeoutMs);
      return { text: proxied.text, url };
    } catch (proxyError) {
      throw new Error(`direct=${directError.message}; proxy=${proxyError.message}`);
    }
  }
}

async function fetchText(url, timeoutMs) {
  if (!url) throw new Error('Missing URL');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        accept: 'application/rss+xml, application/xml, text/xml, text/html, application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ar-SA,ar;q=0.9,en;q=0.5',
        referer: 'https://www.alarabiya.net/'
      }
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
    const title = cleanText(readTag(item, 'title'));
    const descriptionHtml = readTag(item, 'description') || readTag(item, 'content:encoded');
    const description = cleanText(descriptionHtml);
    const rawLink = readTag(item, 'link') || readTag(item, 'guid');
    const publisherLink = extractAlArabiyaUrl(`${descriptionHtml} ${rawLink}`);
    const url = cleanUrl(publisherLink || rawLink, ALARABIYA_ORIGIN);
    const rawImage = readMediaUrl(item)
      || readEnclosureUrl(item)
      || readImageFromHtml(descriptionHtml)
      || readTag(item, 'image');
    const image = cleanImageUrl(rawImage, url || ALARABIYA_ORIGIN);
    const publishedAt = cleanText(readTag(item, 'pubDate') || readTag(item, 'dc:date'));

    return { title, description, url, image, publishedAt, source: 'العربية رياضة' };
  }).filter((article) => article.title && article.url);
}

function parseSportPage(html) {
  const articles = [];
  collectJsonScripts(html, articles);
  return articles;
}

function collectJsonScripts(html, output) {
  const scripts = Array.from(String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const script of scripts) {
    try {
      collectJsonArticles(JSON.parse(decodeEntities(script[1]).trim()), output);
    } catch (_) {}
  }

  const nextData = String(html || '').match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    try {
      collectJsonArticles(JSON.parse(decodeEntities(nextData[1])), output);
    } catch (_) {}
  }
}

function collectJsonArticles(value, output, depth = 0) {
  if (!value || depth > 12 || output.length > 100) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonArticles(item, output, depth + 1));
    return;
  }

  if (typeof value !== 'object') return;

  const title = cleanText(value.headline || value.title || value.name || '');
  const url = cleanUrl(value.url || value.link || value.canonicalUrl || value.webUrl || '', ALARABIYA_ORIGIN);
  const image = cleanImageUrl(extractJsonImage(value.image || value.thumbnailUrl || value.thumbnail || value.media || '', url), url);
  const publishedAt = value.datePublished || value.dateCreated || value.publishedAt || value.publishDate || '';
  const description = cleanText(value.description || value.summary || value.excerpt || '');

  if (title && url && isAlArabiyaUrl(url)) {
    output.push({ title, description, url, image, publishedAt, source: 'العربية رياضة' });
  }

  Object.values(value).forEach((item) => collectJsonArticles(item, output, depth + 1));
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
      const match = String(html || '').match(pattern);
      const image = cleanImageUrl(match?.[1], baseUrl);
      if (image) return image;
    }
  }
  return '';
}

function extractJsonLdImage(html, baseUrl) {
  const images = [];
  const scripts = Array.from(String(html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));

  for (const script of scripts) {
    try {
      collectImagesInJson(JSON.parse(decodeEntities(script[1]).trim()), images, baseUrl);
    } catch (_) {}
  }

  return images[0] || '';
}

function extractNextDataImage(html, baseUrl) {
  const match = String(html || '').match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return '';

  try {
    const images = [];
    collectImagesInJson(JSON.parse(decodeEntities(match[1])), images, baseUrl);
    return images[0] || '';
  } catch {
    return '';
  }
}

function collectImagesInJson(value, output, baseUrl, depth = 0) {
  if (!value || depth > 10 || output.length > 10) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectImagesInJson(item, output, baseUrl, depth + 1));
    return;
  }

  if (typeof value === 'string') {
    const image = cleanImageUrl(value, baseUrl);
    if (image && !output.includes(image)) output.push(image);
    return;
  }

  if (typeof value !== 'object') return;

  const likelyImage = value.image
    || value.images
    || value.thumbnailUrl
    || value.thumbnail
    || value.contentUrl
    || value.imageUrl
    || value.imageURL;

  if (likelyImage) collectImagesInJson(likelyImage, output, baseUrl, depth + 1);
  Object.values(value).forEach((item) => collectImagesInJson(item, output, baseUrl, depth + 1));
}

function extractJsonImage(value, baseUrl) {
  if (typeof value === 'string') return cleanUrl(value, baseUrl);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractJsonImage(item, baseUrl);
      if (found) return found;
    }
  }
  if (value && typeof value === 'object') {
    return cleanUrl(value.url || value.contentUrl || value.src || value.href || '', baseUrl);
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
    const match = String(html || '').match(pattern);
    if (match?.[1]) return cleanUrl(match[1], baseUrl);
  }
  return '';
}

function extractAlArabiyaUrl(value) {
  const normalized = decodeEntities(String(value || ''))
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/');
  const match = normalized.match(/https?:\/\/(?:www\.)?alarabiya\.net\/[a-zA-Z0-9_%?=&./-]+/i);
  return match?.[0] ? cleanUrl(match[0], ALARABIYA_ORIGIN) : '';
}

function extractFirstContentImage(html, baseUrl) {
  const images = Array.from(String(html || '').matchAll(/<img\b[^>]*(?:src|data-src|data-original|data-lazy-src)=["']([^"']+)["'][^>]*>/gi));
  for (const match of images) {
    const image = cleanImageUrl(match[1], baseUrl);
    if (image) return image;
  }
  return '';
}

function cleanImageUrl(value, baseUrl) {
  const cleaned = cleanUrl(value, baseUrl);
  if (!cleaned) return '';

  try {
    const url = new URL(cleaned);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const googleAsset = host === 'news.google.com'
      || host.endsWith('.gstatic.com')
      || host.endsWith('.googleusercontent.com');
    const genericAsset = /(?:^|[\/_-])(logo|icon|favicon|sprite|placeholder|google[-_]?news)(?:[\/_-]|\.|$)/i.test(path);
    const unsupported = url.protocol !== 'https:' || path.endsWith('.svg');
    return googleAsset || genericAsset || unsupported ? '' : url.href;
  } catch {
    return '';
  }
}

function cleanUrl(value, baseUrl = ALARABIYA_ORIGIN) {
  const decoded = decodeEntities(stripCdata(String(value || '')).trim());
  if (!decoded) return '';

  try {
    const url = new URL(decoded, baseUrl || ALARABIYA_ORIGIN);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
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

function readMediaUrl(text) {
  return String(text || '').match(/<media:(?:content|thumbnail)\b[^>]*\burl=["']([^"']+)["'][^>]*>/i)?.[1] || '';
}
function readEnclosureUrl(text) {
  return String(text || '').match(/<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*>/i)?.[1] || '';
}
function readImageFromHtml(text) {
  return String(text || '').match(/<img\b[^>]*(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/i)?.[1] || '';
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
function isFootballArticle(article) {
  const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();
  return FOOTBALL_WORDS.some((word) => text.includes(word.toLowerCase()));
}
function dedupe(articles) {
  const seen = new Set();
  return (articles || []).filter((article) => {
    const key = `${article.url || ''}|${article.title || ''}`.toLowerCase();
    if (!article.title || !article.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function json(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}
