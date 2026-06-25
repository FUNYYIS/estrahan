const test = require('node:test');
const assert = require('node:assert/strict');

test('resolve the pinned Lucide UMD integrity value', async () => {
  const response = await fetch('https://unpkg.com/lucide@0.468.0/dist/?meta');
  assert.equal(response.ok, true);
  const metadata = await response.json();
  const file = metadata.files.find((item) => item.path === '/umd/lucide.js');
  assert.ok(file?.integrity);
  console.log(`LUCIDE_UMD_INTEGRITY=${file.integrity}`);
});
