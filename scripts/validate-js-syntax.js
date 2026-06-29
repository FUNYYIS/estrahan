const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const mainJsParts = fs.existsSync('assets/js/main')
  ? fs.readdirSync('assets/js/main')
    .filter((file) => file.endsWith('.js'))
    .map((file) => `assets/js/main/${file}`)
    .sort()
  : [];
const e2eFiles = fs.existsSync('tests/e2e')
  ? fs.readdirSync('tests/e2e')
    .filter((file) => file.endsWith('.js'))
    .map((file) => `tests/e2e/${file}`)
    .sort()
  : [];

const files = [
  'playwright.config.js',
  'assets/js/app-config.js',
  'assets/js/news-provider.js',
  'assets/js/main.js',
  ...mainJsParts,
  'assets/js/page-fixes.js',
  'assets/js/home-polish.js',
  'assets/js/chat-layout-fix.js',
  'assets/js/runtime-ux.js',
  'assets/js/offline.js',
  'service-worker.js',
  'firebase-messaging-sw.js',
  'netlify/functions/alarabiya-news-v2.js',
  'netlify/functions/alarabiya-news-v3.js',
  'netlify/functions/alarabiya-image.js',
  'netlify/functions/csp-report.js',
  'functions/index.js',
  'functions/match-helpers.js',
  'functions/rate-limit.js',
  'functions/test/match-helpers.test.js',
  'functions/test/rate-limit.test.js',
  'functions/test/news-function.test.js',
  'scripts/validate-firebase-config.js',
  'scripts/validate-js-syntax.js',
  'scripts/validate-json.js',
  'scripts/validate-pwa-version.js',
  'scripts/build-main-js.js',
  'scripts/generate-app-config.js',
  ...e2eFiles
].filter((file) => fs.existsSync(file));

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`JavaScript syntax check failed for ${file}\n`);
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
  }
}

if (failed) {
  process.exit(1);
}

console.log(`JavaScript syntax ok (${files.length} files).`);
