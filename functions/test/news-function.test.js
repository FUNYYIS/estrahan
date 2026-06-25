const test = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('../../netlify/functions/alarabiya-news-v2');

const SAMPLE_RSS = `<?xml version="1.0"?><rss><channel>
  <item>
    <title><![CDATA[الهلال يحسم المواجهة - العربية]]></title>
    <link>https://news.google.com/rss/articles/example</link>
    <description><![CDATA[<a href="https://www.alarabiya.net/sport/example-story">كرة القدم السعودية</a>]]></description>
    <pubDate>Thu, 25 Jun 2026 01:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

test('clamps requested article limits', () => {
  assert.equal(__test.parseLimit(undefined), 18);
  assert.equal(__test.parseLimit('0'), 1);
  assert.equal(__test.parseLimit('3'), 3);
  assert.equal(__test.parseLimit('99'), 18);
});

test('limits enrichment work for home and full news views', () => {
  assert.equal(__test.selectEnrichmentCount(3, 18), 3);
  assert.equal(__test.selectEnrichmentCount(18, 18), 6);
  assert.equal(__test.selectEnrichmentCount(18, 2), 2);
});

test('parses RSS and prefers a direct Al Arabiya URL from the description', () => {
  const articles = __test.parseRss(SAMPLE_RSS);
  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, 'الهلال يحسم المواجهة');
  assert.equal(articles[0].url, 'https://www.alarabiya.net/sport/example-story');
});

test('rejects generic or non-image URLs', () => {
  assert.equal(__test.cleanImageUrl('https://estraha.app/'), '');
  assert.equal(__test.cleanImageUrl('https://example.com/logo.svg'), '');
  assert.equal(
    __test.cleanImageUrl('https://cdn.example.com/media/story-photo.webp'),
    'https://cdn.example.com/media/story-photo.webp'
  );
});

test('returns browser and Netlify CDN cache headers', () => {
  const headers = __test.buildHeaders({ fast: false });
  assert.match(headers['cache-control'], /stale-while-revalidate/);
  assert.match(headers['netlify-cdn-cache-control'], /s-maxage=900/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
});
