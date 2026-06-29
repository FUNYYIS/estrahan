const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const version = process.argv[2];

if (!/^\d+$/.test(version || '')) {
  console.error('Usage: npm run bump:version -- <number>');
  process.exit(1);
}

function updateFile(file, updater) {
  if (!fs.existsSync(file)) return;

  const before = fs.readFileSync(file, 'utf8');
  const after = updater(before);

  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`Updated ${file}`);
  }
}

function replaceRequired(file, pattern, replacement, description) {
  updateFile(file, (content) => {
    if (!pattern.test(content)) {
      throw new Error(`${description} was not found in ${file}`);
    }

    return content.replace(pattern, replacement);
  });
}

function replaceQueryVersions(content) {
  return content.replace(/\?v=\d+/g, `?v=${version}`);
}

const mainParts = fs.existsSync(path.join('assets', 'js', 'main'))
  ? fs.readdirSync(path.join('assets', 'js', 'main'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => path.join('assets', 'js', 'main', file))
  : [];

replaceRequired(
  path.join('assets', 'js', 'main', '00-core-firebase-settings.js'),
  /APP_ASSET_VERSION\s*=\s*['"]\d+['"];/,
  `APP_ASSET_VERSION = '${version}';`,
  'APP_ASSET_VERSION'
);

replaceRequired(
  'service-worker.js',
  /CACHE_NAME\s*=\s*['"]estraha-cache-v\d+['"];/,
  `CACHE_NAME = 'estraha-cache-v${version}';`,
  'service worker cache version'
);

[
  'index.html',
  'offline.html',
  'firebase-messaging-sw.js',
  'assets/js/runtime-ux.js',
  'pages/home.html',
  ...mainParts
].forEach((file) => updateFile(file, replaceQueryVersions));

const build = spawnSync(process.execPath, ['scripts/build-main-js.js'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);

console.log(`PWA asset version bumped to ${version}.`);
