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
const mainCss = read('assets/css/main.css');
const serviceWorker = read('service-worker.js');

const assetVersion = mainJs.match(/APP_ASSET_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
if (!assetVersion) fail('APP_ASSET_VERSION was not found in assets/js/main.js.');

const cacheVersion = serviceWorker.match(/CACHE_NAME\s*=\s*['"]estraha-cache-v([^'"]+)['"]/)?.[1];
if (!cacheVersion) fail('CACHE_NAME was not found in service-worker.js.');

if (assetVersion !== cacheVersion) {
  fail(`APP_ASSET_VERSION (${assetVersion}) does not match service-worker cache version (${cacheVersion}).`);
}

const versionedRefFiles = [
  'index.html',
  'offline.html',
  'firebase-messaging-sw.js',
  'assets/js/main.js',
  'assets/js/runtime-ux.js',
  'pages/home.html'
].filter((file) => fs.existsSync(file));

const assetRefs = versionedRefFiles.flatMap((file) => (
  [...read(file).matchAll(/\?v=(\d+)/g)]
    .map((match) => ({ file, ref: match[0], version: match[1] }))
));

if (!assetRefs.length) {
  fail(`No asset query versions were found in ${versionedRefFiles.join(', ')}.`);
}

const mismatchedRefs = assetRefs.filter((item) => item.version !== assetVersion);
if (mismatchedRefs.length) {
  fail(`Asset query versions do not match ${assetVersion}: ${mismatchedRefs.map((item) => `${item.file}${item.ref}`).join(', ')}`);
}

const appShellMatch = serviceWorker.match(/const\s+APP_SHELL_URLS\s*=\s*\[([\s\S]*?)\];/);
if (!appShellMatch) {
  fail('APP_SHELL_URLS was not found in service-worker.js.');
}

const appShellUrls = [...appShellMatch[1].matchAll(/['"]([^'"]+)['"]/g)]
  .map((match) => match[1]);

const cssImports = [...mainCss.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/g)]
  .map((match) => path.posix.join('/assets/css', match[1].replace(/^\.\//, '')));
const missingCssImportsFromShell = cssImports.filter((url) => !appShellUrls.includes(url));

if (missingCssImportsFromShell.length) {
  fail(`service-worker.js APP_SHELL_URLS is missing CSS imports from assets/css/main.css: ${missingCssImportsFromShell.join(', ')}`);
}

const missing = appShellUrls
  .map((url) => url === '/' ? '/index.html' : url)
  .filter((url) => {
    const localPath = url.replace(/^\//, '').split('?')[0].split('#')[0];
    return localPath && !fs.existsSync(path.join(process.cwd(), localPath));
  });

if (missing.length) {
  fail(`service-worker.js references missing app-shell files: ${missing.join(', ')}`);
}

console.log(`PWA version validation ok (v${assetVersion}, ${appShellUrls.length} app-shell URLs, ${cssImports.length} CSS imports).`);
