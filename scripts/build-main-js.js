const fs = require('node:fs');
const path = require('node:path');

const PART_DIR = path.join('assets', 'js', 'main');
const OUTPUT_FILE = path.join('assets', 'js', 'main.js');

const PARTS = [
  '00-core-firebase-settings.js',
  '01-notifications-and-device.js',
  '02-router.js',
  '03-settings-profile-notifications.js',
  '04-admin.js',
  '05-auth.js',
  '06-home.js',
  '07-members-payments.js',
  '08-chat-profile.js',
  '09-prayer-weather-qibla.js',
  '10-matches.js',
  '11-news.js',
  '12-bootstrap.js'
];

function buildMainJs() {
  return PARTS
    .map((file) => fs.readFileSync(path.join(PART_DIR, file), 'utf8').replace(/\s*$/, ''))
    .join('\n\n') + '\n';
}

function assertGeneratedMainIsCurrent() {
  const expected = buildMainJs();
  const actual = fs.readFileSync(OUTPUT_FILE, 'utf8');

  if (actual !== expected) {
    console.error(`${OUTPUT_FILE} is out of sync with ${PART_DIR}. Run: node scripts/build-main-js.js`);
    process.exit(1);
  }
}

if (process.argv.includes('--check')) {
  assertGeneratedMainIsCurrent();
  console.log('main.js source parts are in sync.');
} else {
  fs.writeFileSync(OUTPUT_FILE, buildMainJs());
  console.log(`Built ${OUTPUT_FILE} from ${PARTS.length} source parts.`);
}
