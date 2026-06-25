const fs = require('node:fs');

const files = [
  'manifest.json',
  'package.json',
  'functions/package.json',
  'firebase.json'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`${file} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

console.log(`JSON validation ok (${files.filter((file) => fs.existsSync(file)).length} files).`);
