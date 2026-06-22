const ALLOWED_HOST_SUFFIXES = [
  'alarabiya.net',
  'akamaized.net',
  'akamaihd.net',
  'cloudfront.net'
];

exports.handler = async (event) => {
  const rawUrl = event.queryStringParameters?.url || '';

  let imageUrl;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return textResponse(400, 'Invalid image URL');
  }

  if (imageUrl.protocol !== 'https:' || !isAllowedHost(imageUrl.hostname)) {
    return textResponse(403, 'Image host is not allowed');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(imageUrl.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        referer: 'https://www.alarabiya.net/'
      }
    });

    if (!response.ok) {
      return textResponse(response.status, 'Unable to load image');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return textResponse(415, 'Unsupported image response');
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) {
      return textResponse(413, 'Image is too large');
    }

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'access-control-allow-origin': '*'
      },
      body: bytes.toString('base64')
    };
  } catch (error) {
    console.error('Al Arabiya image proxy failed:', error);
    return textResponse(502, 'Unable to load image');
  } finally {
    clearTimeout(timeout);
  }
};

function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function textResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    },
    body
  };
}
