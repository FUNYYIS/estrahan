const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDataOnlyMessage,
  groupPrayerTokenRecords,
  isPrayerTimeDue,
  prayerLocationKey
} = require('../notification-helpers');

test('converts notification payloads to one data-only web message', () => {
  const result = buildDataOnlyMessage({
    notification: { title: 'عنوان', body: 'نص' },
    data: { type: 'prayer', link: '/index.html#prayer', dedupeKey: 'prayer-1' },
    webpush: { notification: { tag: 'legacy-tag' } }
  });

  assert.equal(result.notification, undefined);
  assert.equal(result.webpush.notification, undefined);
  assert.equal(result.data.title, 'عنوان');
  assert.equal(result.data.body, 'نص');
  assert.equal(result.data.tag, 'prayer-1');
  assert.equal(result.webpush.fcmOptions.link, '/index.html#prayer');
});

test('groups prayer tokens by rounded coordinates', () => {
  const groups = groupPrayerTokenRecords([
    { token: 'a', prayerLocation: { latitude: 21.54321, longitude: 39.17231, timeZone: 'Asia/Riyadh' } },
    { token: 'b', prayerLocation: { latitude: 21.54329, longitude: 39.17235, timeZone: 'Asia/Riyadh' } },
    { token: 'c' }
  ], { city: 'Jeddah', country: 'Saudi Arabia', timeZone: 'Asia/Riyadh' });

  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.location.mode === 'coordinates').records.length, 2);
  assert.match(prayerLocationKey(groups[0].location), /^(coords|city)|/);
});

test('accepts a narrow scheduler window around the exact prayer time', () => {
  const prayer = new Date('2026-06-25T15:00:00.000Z');
  assert.equal(isPrayerTimeDue(prayer, new Date('2026-06-25T14:59:45.000Z')), true);
  assert.equal(isPrayerTimeDue(prayer, new Date('2026-06-25T15:01:20.000Z')), true);
  assert.equal(isPrayerTimeDue(prayer, new Date('2026-06-25T15:02:00.000Z')), false);
});
