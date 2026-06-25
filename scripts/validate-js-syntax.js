const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const files = [
  'assets/js/main.js',
  'assets/js/page-fixes.js',
  'assets/js/runtime-ux.js',
  'service-worker.js',
  'firebase-messaging-sw.js',
  'netlify/functions/alarabiya-news.js',
  'netlify/functions/alarabiya-news-v2.js',
  'netlify/functions/alarabiya-image.js',
  'functions/index.js',
  'functions/match-helpers.js',
  'functions/rate-limit.js',
  'functions/test/match-helpers.test.js',
  'functions/test/rate-limit.test.js',
  'functions/test/news-function.test.js',
  'scripts/validate-firebase-config.js',
  'scripts/validate-js-syntax.js',
  'scripts/validate-json.js',
  'scripts/validate-pwa-version.js'
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
