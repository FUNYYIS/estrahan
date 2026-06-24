const dns = require('node:dns').promises;
const net = require('node:net');

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 4;

exports.handler = async (event) => {
  const rawUrl = event.queryStringParameters?.url || '';

  let imageUrl;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return textResponse(400, 'Invalid image URL');
  }

  try {
    const response = await fetchSafeImage(imageUrl, MAX_REDIRECTS);
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok) {
      return textResponse(response.status, 'Unable to load image');
    }

    if (!contentType.toLowerCase().startsWith('image/')) {
      return textResponse(415, 'Unsupported image response');
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_IMAGE_BYTES) {
      return textResponse(413, 'Image is too large');
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) {
      return textResponse(413, 'Image is too large');
    }

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff'
      },
      body: bytes.toString('base64')
    };
  } catch (error) {
    console.error('News image proxy failed:', error);
    return textResponse(502, 'Unable to load image');
  }
};

async function fetchSafeImage(initialUrl, redirectsLeft) {
  await assertPublicHttpsUrl(initialUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(initialUrl.href, {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        referer: 'https://www.alarabiya.net/',
        'accept-language': 'ar-SA,ar;q=0.9,en;q=0.5'
      }
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectsLeft <= 0) throw new Error('Too many image redirects');
      const location = response.headers.get('location');
      if (!location) throw new Error('Image redirect missing location');
      return fetchSafeImage(new URL(location, initialUrl), redirectsLeft - 1);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function assertPublicHttpsUrl(url) {
  if (!(url instanceof URL) || url.protocol !== 'https:') {
    throw new Error('Only HTTPS image URLs are allowed');
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error('Private image host is not allowed');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Private image address is not allowed');
    return;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Private image address is not allowed');
  }
}

function isPrivateAddress(address) {
  const normalized = String(address || '').toLowerCase();

  if (normalized.startsWith('::ffff:')) {
    return isPrivateAddress(normalized.slice(7));
  }

  if (net.isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number);
    const [a, b] = parts;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }

  if (net.isIP(normalized) === 6) {
    return normalized === '::'
      || normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || /^fe[89ab]/.test(normalized);
  }

  return true;
}

function textResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    },
    body
  };
}
