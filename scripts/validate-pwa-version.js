const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  console.error(`PWA version validation failed: ${message}`);
  process.exit(1);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const mainJs = read('assets/js/main.js');
const indexHtml = read('index.html');
const serviceWorker = read('service-worker.js');

const assetVersion = mainJs.match(/APP_ASSET_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!assetVersion) fail('APP_ASSET_VERSION was not found in assets/js/main.js.');

const cacheVersion = serviceWorker.match(/CACHE_NAME\s*=\s*['"]estraha-cache-v([^'"]+)['"]/)?.[1];
if (!cacheVersion) fail('CACHE_NAME was not found in service-worker.js.');

if (assetVersion !== cacheVersion) {
  fail(`APP_ASSET_VERSION (${assetVersion}) does not match service-worker cache version (${cacheVersion}).`);
}

const assetRefs = [...indexHtml.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+\.(?:js|css)\?v=([^"']+))["']/g)]
  .map((match) => ({ ref: match[1], version: match[2] }));

if (!assetRefs.length) {
  fail('No JavaScript or CSS query versions were found in index.html.');
}

const mismatchedRefs = assetRefs.filter((item) => item.version !== assetVersion);
if (mismatchedRefs.length) {
  fail(`index.html has asset query versions that do not match ${assetVersion}: ${mismatchedRefs.map((item) => item.ref).join(', ')}`);
}

const appShellMatch = serviceWorker.match(/const\s+APP_SHELL_URLS\s*=\s*\[([\s\S]*?)\];/);
if (!appShellMatch) {
  fail('APP_SHELL_URLS was not found in service-worker.js.');
}

const appShellUrls = [...appShellMatch[1].matchAll(/['"]([^'"]+)['"]/g)]
  .map((match) => match[1]);
const missing = appShellUrls
  .map((url) => url === '/' ? '/index.html' : url)
  .filter((url) => {
    const localPath = url.replace(/^\//, '').split('?')[0].split('#')[0];
    return localPath && !fs.existsSync(path.join(process.cwd(), localPath));
  });

if (missing.length) {
  fail(`service-worker.js references missing app-shell files: ${missing.join(', ')}`);
}

console.log(`PWA version validation ok (v${assetVersion}, ${appShellUrls.length} app-shell URLs).`);
