const DIRECT_RSS_FEEDS = [
  'https://www.alarabiya.net/.mrss/ar/sport.xml',
  'https://www.alarabiya.net/rss/sport.xml',
  'https://www.alarabiya.net/sport.rss'
];

const SPORT_PAGE = 'https://www.alarabiya.net/sport';
const GOOGLE_NEWS_FALLBACK = 'https://news.google.com/rss/search?q=site%3Aalarabiya.net%2Fsport+%D9%83%D8%B1%D8%A9+%D8%A7%D9%84%D9%82%D8%AF%D9%85&hl=ar&gl=SA&ceid=SA%3Aar';
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
        const xml = await fetchText(feedUrl);
        articles = parseRss(xml, 'العربية رياضة');
        if (articles.length >= 3) break;
      } catch (error) {
        console.warn('Al Arabiya RSS failed:', feedUrl, error.message);
      }
    }

    if (articles.length < 3) {
      try {
        const html = await fetchText(SPORT_PAGE);
        articles = mergeArticles(articles, parseSportPage(html));
      } catch (error) {
        console.warn('Al Arabiya sport page failed:', error.message);
      }
    }

    if (articles.length < 3) {
      try {
        const xml = await fetchText(GOOGLE_NEWS_FALLBACK);
        articles = mergeArticles(articles, parseRss(xml, 'العربية رياضة'));
      } catch (error) {
        console.warn('Google News fallback failed:', error.message);
      }
    }

    articles = dedupe(articles)
      .filter(isFootballArticle)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, 24);

    if (!articles.length) {
      return response(502, { ok: false, articles: [], error: 'No Al Arabiya football articles available' });
    }

    return response(200, { ok: true, source: 'العربية رياضة', articles });
  } catch (error) {
    console.error('alarabiya-news function failed:', error);
    return response(500, { ok: false, articles: [], error: 'Unable to load Al Arabiya news' });
  }
};

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

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
    return await result.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseRss(xml, defaultSource) {
  if (!xml || !/<item[\s>]/i.test(xml)) return [];

  return Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)).map((match) => {
    const item = match[1];
    const title = cleanText(readTag(item, 'title'));
    const descriptionHtml = readTag(item, 'description') || readTag(item, 'content:encoded');
    const description = cleanText(descriptionHtml);
    const link = cleanUrl(readTag(item, 'link') || readAttr(item, 'guid', 'isPermaLink'));
    const image = cleanUrl(
      readMediaUrl(item)
      || readEnclosureUrl(item)
      || readImageFromHtml(descriptionHtml)
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
  if (!value || depth > 12 || output.length > 80) return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonArticles(item, output, depth + 1));
    return;
  }

  if (typeof value !== 'object') return;

  const title = cleanText(value.headline || value.title || value.name || '');
  const url = cleanUrl(value.url || value.link || value.canonicalUrl || value.webUrl || '');
  const image = extractJsonImage(value.image || value.thumbnailUrl || value.thumbnail || value.media || '');
  const publishedAt = value.datePublished || value.dateCreated || value.publishedAt || value.publishDate || '';
  const description = cleanText(value.description || value.summary || value.excerpt || '');

  if (title && url && /alarabiya\.net/i.test(url)) {
    output.push({ title, description, url, image, publishedAt, source: 'العربية رياضة' });
  }

  Object.values(value).forEach((item) => collectJsonArticles(item, output, depth + 1));
}

function extractJsonImage(value) {
  if (typeof value === 'string') return cleanUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractJsonImage(item);
      if (found) return found;
    }
    return '';
  }
  if (value && typeof value === 'object') {
    return cleanUrl(value.url || value.contentUrl || value.src || value.href || '');
  }
  return '';
}

function readTag(text, tagName) {
  const safeTag = tagName.replace(':', '\\:');
  const match = text.match(new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, 'i'));
  return match ? stripCdata(match[1]).trim() : '';
}

function readAttr(text, tagName, ignoredAttr) {
  const safeTag = tagName.replace(':', '\\:');
  const match = text.match(new RegExp(`<${safeTag}\\b(?![^>]*${ignoredAttr}=["']false["'])[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, 'i'));
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
  const match = String(html || '').match(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
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

function cleanUrl(value) {
  const decoded = decodeEntities(stripCdata(String(value || '')).trim());
  try {
    const url = new URL(decoded);
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
