const fs = require('node:fs');

const REQUIRED_KEYS = [
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId'
];

function fail(message) {
  console.error(`Firebase config validation failed: ${message}`);
  process.exit(1);
}

function parseConfigBlock(file, pattern) {
  const source = fs.readFileSync(file, 'utf8');
  const block = source.match(pattern)?.[1];
  if (!block) fail(`Could not find Firebase config in ${file}.`);

  const values = {};
  for (const key of REQUIRED_KEYS) {
    const match = block.match(new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`));
    if (!match) fail(`${file} is missing Firebase config key ${key}.`);
    values[key] = match[1];
  }
  return values;
}

const frontendConfig = parseConfigBlock(
  'assets/js/main.js',
  /const\s+firebaseConfig\s*=\s*\{([\s\S]*?)\};/
);
const workerConfig = parseConfigBlock(
  'service-worker.js',
  /firebase\.initializeApp\(\s*\{([\s\S]*?)\}\s*\);/
);

const mismatches = REQUIRED_KEYS
  .filter((key) => frontendConfig[key] !== workerConfig[key])
  .map((key) => `${key}: assets/js/main.js=${frontendConfig[key]} service-worker.js=${workerConfig[key]}`);

if (mismatches.length) {
  fail(`config values drifted between frontend and service worker:\n${mismatches.join('\n')}`);
}

console.log('Firebase public config validation ok.');
