const DIRECT_RSS_FEEDS = [
  'https://www.alarabiya.net/.mrss/ar/sport.xml',
  'https://www.alarabiya.net/rss/sport.xml',
  'https://www.alarabiya.net/sport.rss'
];

const SPORT_PAGE = 'https://www.alarabiya.net/sport';
const GOOGLE_NEWS_FALLBACK = 'https://news.google.com/rss/search?q=site%3Aalarabiya.net%2Fsport+%D9%83%D8%B1%D8%A9+%D8%A7%D9%84%D9%82%D8%AF%D9%85&hl=ar&gl=SA&ceid=SA%3Aar';
const ALARABIYA_ORIGIN = 'https://www.alarabiya.net';
const FOOTBALL_WORDS = [
  'كرة', 'قدم', 'دوري', 'كأس', 'مونديال', 'مباراة', 'هدف', 'منتخب', 'نادي',
  'فريق', 'لاعب', 'مدرب', 'فيفا', 'الهلال', 'النصر', 'الاتحاد', 'الأهلي',
  'ريال مدريد', 'برشلونة', 'ليفربول', 'مانشستر', 'أرسنال', 'تشيلسي', 'بايرن'
];

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=900',
  'access-control-allow-origin': '*'
};

exports.handler = async () => {
  try {
    let articles = [];

    for (const feedUrl of DIRECT_RSS_FEEDS) {
      try {
        const { text } = await fetchPage(feedUrl, 8000);
        articles = parseRss(text, 'العربية رياضة', ALARABIYA_ORIGIN);
        if (articles.length >= 6) break;
      } catch (error) {
        console.warn('Al Arabiya RSS failed:', feedUrl, error.message);
      }
    }

    if (articles.length < 8) {
      try {
        const { text } = await fetchPage(SPORT_PAGE, 8000);
        articles = mergeArticles(articles, parseSportPage(text));
      } catch (error) {
        console.warn('Al Arabiya sport page failed:', error.message);
      }
    }

    if (articles.length < 6) {
      try {
        const { text } = await fetchPage(GOOGLE_NEWS_FALLBACK, 8000);
        articles = mergeArticles(articles, parseRss(text, 'العربية رياضة', ALARABIYA_ORIGIN));
      } catch (error) {
        console.warn('Google News fallback failed:', error.message);
      }
    }

    articles = dedupe(articles)
      .filter(isFootballArticle)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, 18);

    if (!articles.length) {
      return response(502, { ok: false, articles: [], error: 'No Al Arabiya football articles available' });
    }

    articles = await enrichArticleImages(articles);

    return response(200, {
      ok: true,
      source: 'العربية رياضة',
      articles
    });
  } catch (error) {
    console.error('alarabiya-news function failed:', error);
    return response(500, { ok: false, articles: [], error: 'Unable to load Al Arabiya news' });
  }
};

async function fetchPage(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        accept: 'application/rss+xml, application/xml, text/xml, text/html, application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ar-SA,ar;q=0.9,en;q=0.6'
      }
    });

    if (!result.ok) throw new Error(`HTTP ${result.status}`);

    return {
      text: await result.text(),
      url: result.url || url
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichArticleImages(articles) {
  const results = await Promise.allSettled(
    articles.map((article) => enrichArticle(article))
  );

  return results.map((result, index) => (
    result.status === 'fulfilled' ? result.value : articles[index]
  ));
}

async function enrichArticle(article) {
  let articleUrl = cleanUrl(article.url, ALARABIYA_ORIGIN);
  let image = cleanUrl(article.image, articleUrl || ALARABIYA_ORIGIN);

  if (image && /alarabiya\.net/i.test(articleUrl)) {
    return { ...article, url: articleUrl, image };
  }

  try {
    let page = await fetchPage(articleUrl, 5000);
    let directUrl = /alarabiya\.net/i.test(page.url)
      ? page.url
      : extractAlArabiyaUrl(page.text);

    if (directUrl && directUrl !== page.url) {
      page = await fetchPage(directUrl, 5000);
    }

    const canonical = extractCanonicalUrl(page.text, page.url) || page.url;
    articleUrl = /alarabiya\.net/i.test(canonical) ? canonical : (directUrl || articleUrl);

    image = image
      || extractMetaImage(page.text, articleUrl)
      || extractJsonLdImage(page.text, articleUrl)
      || extractFirstPageImage(page.text, articleUrl);
  } catch (error) {
    console.warn('Article image enrichment failed:', articleUrl, error.message);
  }

  return {
    ...article,
    url: cleanUrl(articleUrl, ALARABIYA_ORIGIN) || article.url,
    image: cleanUrl(image, articleUrl || ALARABIYA_ORIGIN)
  };
}

function parseRss(xml, defaultSource, baseUrl) {
  if (!xml || !/<item[\s>]/i.test(xml)) return [];

  return Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)).map((match) => {
    const item = match[1];
    const title = cleanText(readTag(item, 'title'));
    const descriptionHtml = readTag(item, 'description') || readTag(item, 'content:encoded');
    const description = cleanText(descriptionHtml);
    const link = cleanUrl(readTag(item, 'link') || readTag(item, 'guid'), baseUrl);
    const image = cleanUrl(
      readMediaUrl(item)
      || readEnclosureUrl(item)
      || readImageFromHtml(descriptionHtml),
      link || baseUrl
    );
    const publishedAt = cleanText(readTag(item, 'pubDate') || readTag(item, 'dc:date'));
    const source = cleanText(readTag(item, 'source')) || defaultSource;

    return { title, description, url: link, image, publishedAt, source };
  }).filter((article) => article.title && article.url);
}

function parseSportPage(html) {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const articles = [];

  for (const script of scripts) {
    try {
      const data = JSON.parse(decodeEntities(script[1]).trim());
      collectJsonArticles(data, articles);
    } catch (_) {}
  }

  const nextData = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextData) {
    try {
      collectJsonArticles(JSON.parse(decodeEntities(nextData[1])), articles);
    } catch (_) {}
  }

  return articles;
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
  const image = extractJsonImage(value.image || value.thumbnailUrl || value.thumbnail || value.media || '', url || ALARABIYA_ORIGIN);
  const publishedAt = value.datePublished || value.dateCreated || value.publishedAt || value.publishDate || '';
  const description = cleanText(value.description || value.summary || value.excerpt || '');

  if (title && url && /alarabiya\.net/i.test(url)) {
    output.push({ title, description, url, image, publishedAt, source: 'العربية رياضة' });
  }

  Object.values(value).forEach((item) => collectJsonArticles(item, output, depth + 1));
}

function extractJsonImage(value, baseUrl) {
  if (typeof value === 'string') return cleanUrl(value, baseUrl);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractJsonImage(item, baseUrl);
      if (found) return found;
    }
    return '';
  }

  if (value && typeof value === 'object') {
    return cleanUrl(value.url || value.contentUrl || value.src || value.href || '', baseUrl);
  }

  return '';
}

function extractMetaImage(html, baseUrl) {
  const keys = ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'];

  for (const key of keys) {
    const escaped = key.replace(':', '\\:');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return cleanUrl(match[1], baseUrl);
    }
  }

  return '';
}

function extractJsonLdImage(html, baseUrl) {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));

  for (const script of scripts) {
    try {
      const data = JSON.parse(decodeEntities(script[1]).trim());
      const image = findImageInJson(data, baseUrl);
      if (image) return image;
    } catch (_) {}
  }

  return '';
}

function findImageInJson(value, baseUrl, depth = 0) {
  if (!value || depth > 8) return '';

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageInJson(item, baseUrl, depth + 1);
      if (found) return found;
    }
    return '';
  }

  if (typeof value !== 'object') return '';

  const direct = extractJsonImage(value.image || value.thumbnailUrl || value.thumbnail || '', baseUrl);
  if (direct) return direct;

  for (const item of Object.values(value)) {
    const found = findImageInJson(item, baseUrl, depth + 1);
    if (found) return found;
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
    const match = html.match(pattern);
    if (match?.[1]) return cleanUrl(match[1], baseUrl);
  }

  return '';
}

function extractAlArabiyaUrl(html) {
  const normalized = decodeEntities(String(html || ''))
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/');
  const match = normalized.match(/https?:\/\/(?:www\.)?alarabiya\.net\/[a-zA-Z0-9_%?=&./-]+/i);
  return match?.[0] ? cleanUrl(match[0], ALARABIYA_ORIGIN) : '';
}

function extractFirstPageImage(html, baseUrl) {
  const match = String(html || '').match(/<img\b[^>]*(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ? cleanUrl(match[1], baseUrl) : '';
}

function readTag(text, tagName) {
  const safeTag = tagName.replace(':', '\\:');
  const match = text.match(new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, 'i'));
  return match ? stripCdata(match[1]).trim() : '';
}

function readMediaUrl(text) {
  const match = text.match(/<media:(?:content|thumbnail)\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
  return match?.[1] || '';
}

function readEnclosureUrl(text) {
  const match = text.match(/<enclosure\b[^>]*\burl=["']([^"']+)["'][^>]*>/i);
  return match?.[1] || '';
}

function readImageFromHtml(html) {
  const match = String(html || '').match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
  return match?.[1] || '';
}

function stripCdata(value) {
  return String(value || '').replace(/^\s*<!\[CDATA\[/i, '').replace(/\]\]>\s*$/i, '');
}

function cleanText(value) {
  return decodeEntities(stripCdata(String(value || '')).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
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

function cleanUrl(value, baseUrl = ALARABIYA_ORIGIN) {
  const decoded = decodeEntities(stripCdata(String(value || '')).trim());
  if (!decoded) return '';

  try {
    const url = new URL(decoded, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) {
    return '';
  }
}

function isFootballArticle(article) {
  const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();
  return FOOTBALL_WORDS.some((word) => text.includes(word.toLowerCase()));
}

function mergeArticles(first, second) {
  return dedupe([...(first || []), ...(second || [])]);
}

function dedupe(articles) {
  const seen = new Set();
  return (articles || []).filter((article) => {
    const key = `${article.url || ''}|${article.title || ''}`.toLowerCase();
    if (!article.url || !article.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(body)
  };
}
