const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function replaceExact(content, search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error(`Missing replacement target: ${label}`);
  }
  return content.replace(search, replacement);
}

function replaceRegex(content, regex, replacement, label) {
  if (!regex.test(content)) {
    throw new Error(`Missing regex replacement target: ${label}`);
  }
  return content.replace(regex, replacement);
}

const notificationHelpers = `function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function stringifyData(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])
  );
}

function buildDataOnlyMessage(message = {}) {
  const originalData = message.data || {};
  const title = cleanText(message.notification?.title || originalData.title, 'تطبيق الاستراحة').slice(0, 120);
  const body = cleanText(message.notification?.body || originalData.body, '').slice(0, 240);
  const type = cleanText(originalData.type, 'general');
  const link = cleanText(originalData.link, '/index.html#home');
  const tag = cleanText(
    originalData.tag || originalData.dedupeKey || message.webpush?.notification?.tag,
    \`estraha-\${type}-\${Date.now()}\`
  );

  return {
    data: stringifyData({
      ...originalData,
      title,
      body,
      type,
      link,
      tag,
      dedupeKey: cleanText(originalData.dedupeKey, tag)
    }),
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '300',
        ...(message.webpush?.headers || {})
      },
      fcmOptions: {
        link,
        ...(message.webpush?.fcmOptions || {})
      }
    }
  };
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizePrayerLocation(record = {}, fallback = {}) {
  const latitude = validCoordinate(record.prayerLocation?.latitude, -90, 90);
  const longitude = validCoordinate(record.prayerLocation?.longitude, -180, 180);
  const timeZone = cleanText(record.prayerLocation?.timeZone, cleanText(fallback.timeZone, 'Asia/Riyadh'));

  if (latitude !== null && longitude !== null) {
    return {
      mode: 'coordinates',
      latitude,
      longitude,
      timeZone
    };
  }

  return {
    mode: 'city',
    city: cleanText(fallback.city, 'Jeddah'),
    country: cleanText(fallback.country, 'Saudi Arabia'),
    timeZone
  };
}

function prayerLocationKey(location = {}) {
  if (location.mode === 'coordinates') {
    return [
      'coords',
      Number(location.latitude).toFixed(3),
      Number(location.longitude).toFixed(3),
      location.timeZone || 'Asia/Riyadh'
    ].join('|');
  }

  return [
    'city',
    cleanText(location.city, 'Jeddah').toLowerCase(),
    cleanText(location.country, 'Saudi Arabia').toLowerCase(),
    location.timeZone || 'Asia/Riyadh'
  ].join('|');
}

function groupPrayerTokenRecords(records = [], fallback = {}) {
  const groups = new Map();

  records.forEach((record) => {
    const location = normalizePrayerLocation(record, fallback);
    const key = prayerLocationKey(location);
    if (!groups.has(key)) groups.set(key, { key, location, records: [] });
    groups.get(key).records.push(record);
  });

  return Array.from(groups.values());
}

function isPrayerTimeDue(prayerDate, now = new Date()) {
  if (!(prayerDate instanceof Date) || Number.isNaN(prayerDate.getTime())) return false;
  const deltaMs = now.getTime() - prayerDate.getTime();
  return deltaMs >= -30 * 1000 && deltaMs <= 90 * 1000;
}

module.exports = {
  buildDataOnlyMessage,
  groupPrayerTokenRecords,
  isPrayerTimeDue,
  normalizePrayerLocation,
  prayerLocationKey,
  stringifyData
};
`;

const notificationHelpersTest = `const test = require('node:test');
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
  assert.match(prayerLocationKey(groups[0].location), /^(coords|city)\|/);
});

test('accepts a narrow scheduler window around the exact prayer time', () => {
  const prayer = new Date('2026-06-25T15:00:00.000Z');
  assert.equal(isPrayerTimeDue(prayer, new Date('2026-06-25T14:59:45.000Z')), true);
  assert.equal(isPrayerTimeDue(prayer, new Date('2026-06-25T15:01:20.000Z')), true);
  assert.equal(isPrayerTimeDue(prayer, new Date('2026-06-25T15:02:00.000Z')), false);
});
`;

write('functions/notification-helpers.js', notificationHelpers);
write('functions/test/notification-helpers.test.js', notificationHelpersTest);

let functionsIndex = read('functions/index.js');
functionsIndex = replaceExact(
  functionsIndex,
  "const { createInMemoryRateLimiter } = require('./rate-limit');",
  "const { createInMemoryRateLimiter } = require('./rate-limit');\nconst {\n  buildDataOnlyMessage,\n  groupPrayerTokenRecords,\n  isPrayerTimeDue\n} = require('./notification-helpers');",
  'notification helper import'
);

const matchFunction = `exports.checkUpcomingMatches = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Asia/Riyadh',
    region: 'us-central1'
  },
  async () => {
    try {
      const settings = await getAppSettings();
      const reminderMinutes = clampNumber(settings.matchReminderMinutes, 1, 120, 5);
      const upcomingMatches = await getUpcomingMatches();
      if (!upcomingMatches.length) return;

      for (const match of upcomingMatches) {
        try {
          if (!isNotifiableMatch(match)) continue;

          const kickoff = getMatchKickoffDate(match);
          if (!kickoff) continue;

          const remainingMinutes = Math.round((kickoff.getTime() - Date.now()) / 60000);
          if (remainingMinutes < reminderMinutes - 1 || remainingMinutes > reminderMinutes + 1) continue;

          const teams = getMatchNotificationTeams(match);
          if (!teams) continue;

          const matchKey = getMatchKey(match);
          const stateKey = \`\${matchKey}-\${reminderMinutes}\`;
          const stateRef = db.collection('matchNotificationState').doc(toDocId(stateKey));
          const tokenRecords = await getTokenRecordsByTopic('matches');
          if (!tokenRecords.length) continue;

          const claimed = await claimNotificationState(stateRef, {
            kind: 'match',
            matchKey,
            reminderMinutes
          });
          if (!claimed) continue;

          const kickoffTime = formatRiyadhTime(kickoff);
          const title = \`⚽ \${teams.homeTeam} ضد \${teams.awayTeam}\`;
          const body = \`باقي \${reminderMinutes} دقائق على المباراة · \${kickoffTime} بتوقيت السعودية\`;

          try {
            const result = await sendNotificationToTokenRecords(tokenRecords, {
              notification: { title, body },
              data: {
                type: 'match',
                title,
                body,
                notificationWindow: String(reminderMinutes),
                matchKey,
                homeTeam: teams.homeTeam,
                awayTeam: teams.awayTeam,
                kickoffTime,
                link: '/index.html#matches',
                dedupeKey: stateRef.id,
                tag: \`match-\${stateRef.id}\`
              }
            });

            await stateRef.set({
              status: 'sent',
              matchKey,
              notificationWindow: reminderMinutes,
              remainingMinutes,
              homeTeam: teams.homeTeam,
              awayTeam: teams.awayTeam,
              kickoffAt: admin.firestore.Timestamp.fromDate(kickoff),
              targetedTokens: result.targetedTokens,
              successCount: result.successCount,
              failureCount: result.failureCount,
              sentAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          } catch (error) {
            await stateRef.delete().catch(() => {});
            throw error;
          }
        } catch (error) {
          logMatchScheduleError(error, {
            operation: 'checkUpcomingMatches.processMatch',
            matchIdentifier: getMatchKey(match)
          });
        }
      }
    } catch (error) {
      logMatchScheduleError(error, { operation: 'checkUpcomingMatches' });
    }
  }
);

`;

functionsIndex = replaceRegex(
  functionsIndex,
  /exports\.checkUpcomingMatches = onSchedule\([\s\S]*?\n\);\n\n(?=exports\.checkPrayerNotifications)/,
  matchFunction,
  'match scheduler'
);

const prayerFunction = `exports.checkPrayerNotifications = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Asia/Riyadh',
    region: 'us-central1'
  },
  async () => {
    try {
      const settings = await getAppSettings();
      if (settings.prayerNotificationsEnabled !== true) return;

      const tokenRecords = await getTokenRecordsByTopic('prayer');
      if (!tokenRecords.length) return;

      const fallback = {
        city: cleanSettingText(settings.prayerCity, 'Jeddah'),
        country: cleanSettingText(settings.prayerCountry, 'Saudi Arabia'),
        timeZone: 'Asia/Riyadh'
      };

      const groups = groupPrayerTokenRecords(tokenRecords, fallback);

      for (const group of groups) {
        try {
          const schedule = group.location.mode === 'coordinates'
            ? await fetchPrayerScheduleByCoordinates(group.location.latitude, group.location.longitude)
            : await fetchPrayerScheduleByCity(group.location.city, group.location.country);

          const timeZone = schedule.timeZone || group.location.timeZone || 'Asia/Riyadh';
          const dateKey = getDateKeyForTimeZone(new Date(), timeZone);

          for (const [prayerKey, prayerName] of Object.entries(PRAYER_NAMES)) {
            const prayerTime = schedule.timings[prayerKey];
            const prayerDate = parseZonedDateTime(dateKey, prayerTime, timeZone);
            if (!isPrayerTimeDue(prayerDate)) continue;

            const stateKey = \`\${dateKey}-\${prayerKey}-\${group.key}\`;
            const stateRef = db.collection('prayerNotificationState').doc(toDocId(stateKey));
            const claimed = await claimNotificationState(stateRef, {
              kind: 'prayer',
              prayerKey,
              locationKey: group.key
            });
            if (!claimed) continue;

            const message = buildPrayerReminderMessage(prayerName, 0, group.location.mode === 'coordinates' ? 'موقعك' : group.location.city);
            message.data.dedupeKey = stateRef.id;
            message.data.tag = \`prayer-\${stateRef.id}\`;

            try {
              const result = await sendNotificationToTokenRecords(group.records, message);
              await stateRef.set({
                status: 'sent',
                prayerName,
                prayerTime,
                timeZone,
                locationKey: group.key,
                reminderMinutes: 0,
                successCount: result.successCount,
                failureCount: result.failureCount,
                targetedTokens: result.targetedTokens,
                sentAt: admin.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
            } catch (error) {
              await stateRef.delete().catch(() => {});
              throw error;
            }
          }
        } catch (error) {
          logger.error('Prayer notification group failed.', {
            locationKey: group.key,
            message: error?.message || String(error)
          });
        }
      }
    } catch (error) {
      logger.error('Prayer notification schedule failed.', error);
    }
  }
);

`;

functionsIndex = replaceRegex(
  functionsIndex,
  /exports\.checkPrayerNotifications = onSchedule\([\s\S]*?\n\);\n\n(?=exports\.checkPaymentReminders)/,
  prayerFunction,
  'prayer scheduler'
);

const paymentFunction = `exports.checkPaymentReminders = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Riyadh',
    region: 'us-central1'
  },
  async () => {
    try {
      const settings = await getAppSettings();
      if (settings.paymentReminderEnabled !== true) return;

      const now = getRiyadhParts();
      const reminderDay = clampNumber(settings.paymentReminderDay, 1, 31, 1);
      const reminderHour = clampNumber(settings.paymentReminderHour, 0, 23, 9);
      const reminderMinute = clampNumber(settings.paymentReminderMinute, 0, 59, 0);
      if (now.day !== reminderDay || now.hour !== reminderHour) return;
      if (Math.abs(now.minute - reminderMinute) > 2) return;

      const audience = settings.paymentReminderMode === 'lateOnly' ? 'lateOnly' : 'all';
      const stateKey = \`\${now.year}-\${now.month}-\${now.day}-\${audience}\`;
      const stateRef = db.collection('paymentReminderState').doc(toDocId(stateKey));
      const tokenRecords = audience === 'lateOnly'
        ? await getLatePaymentTokenRecords()
        : await getTokenRecordsByTopic('payments');
      if (!tokenRecords.length) return;

      const claimed = await claimNotificationState(stateRef, { kind: 'payment', audience });
      if (!claimed) return;

      const message = buildPaymentReminderMessage(settings);
      message.data.dedupeKey = stateRef.id;
      message.data.tag = \`payment-\${stateRef.id}\`;

      try {
        const result = await sendNotificationToTokenRecords(tokenRecords, message);
        await stateRef.set({
          status: 'sent',
          reminderMonth: \`\${now.year}-\${now.month}\`,
          audience,
          targetedUsers: Array.from(new Set(tokenRecords.map((record) => record.uid).filter(Boolean))).length,
          targetedTokens: result.targetedTokens,
          successCount: result.successCount,
          failureCount: result.failureCount,
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (error) {
        await stateRef.delete().catch(() => {});
        throw error;
      }
    } catch (error) {
      logger.error('Payment reminder schedule failed.', error);
    }
  }
);

`;

functionsIndex = replaceRegex(
  functionsIndex,
  /exports\.checkPaymentReminders = onSchedule\([\s\S]*?\n\);\n\n(?=exports\.sendAdminTestNotification)/,
  paymentFunction,
  'payment scheduler'
);

functionsIndex = replaceExact(
  functionsIndex,
  "const minutesBefore = clampNumber(settings.prayerReminderMinutes, 1, 60, 10);",
  "const minutesBefore = 0;",
  'debug prayer exact timing'
);
functionsIndex = functionsIndex.replace(
  "return buildPrayerReminderMessage('العصر', minutesBefore);",
  "return buildPrayerReminderMessage('العصر', 0, 'موقعك');"
);

const sendFunction = `async function sendNotificationToTokenRecords(tokenRecords, message) {
  if (!tokenRecords.length) {
    return {
      targetedTokens: 0,
      successCount: 0,
      failureCount: 0,
      deletedInvalidTokens: 0
    };
  }

  const normalizedMessage = buildDataOnlyMessage(message);
  let successCount = 0;
  let failureCount = 0;
  let deletedInvalidTokens = 0;
  const chunks = chunk(tokenRecords, 500);

  for (const tokenChunk of chunks) {
    const tokens = tokenChunk.map((record) => record.token);
    const response = await admin.messaging().sendEachForMulticast({
      ...normalizedMessage,
      tokens
    });
    successCount += response.successCount;
    failureCount += response.failureCount;

    const deletePromises = [];
    response.responses.forEach((item, index) => {
      const code = item.error?.code;
      if (code && INVALID_FCM_TOKEN_CODES.has(code)) {
        deletePromises.push(tokenChunk[index].ref.delete());
      }
    });

    if (deletePromises.length) {
      await Promise.allSettled(deletePromises);
      deletedInvalidTokens += deletePromises.length;
    }
  }

  return {
    targetedTokens: tokenRecords.length,
    successCount,
    failureCount,
    deletedInvalidTokens
  };
}

`;

functionsIndex = replaceRegex(
  functionsIndex,
  /async function sendNotificationToTokenRecords\([\s\S]*?\n}\n\n(?=function assertNotificationDeliveryResult)/,
  sendFunction,
  'data-only sender'
);

const prayerMessageFunction = `function buildPrayerReminderMessage(prayerName, minutesBefore = 0, locationLabel = 'موقعك') {
  const exact = Number(minutesBefore) <= 0;
  const title = exact ? \`🕌 حان الآن موعد صلاة \${prayerName}\` : \`قرب موعد صلاة \${prayerName}\`;
  const body = exact
    ? \`حسب توقيت \${locationLabel}\`
    : \`باقي \${minutesBefore} دقائق على صلاة \${prayerName}\`;
  return {
    notification: { title, body },
    data: {
      type: 'prayer',
      title,
      body,
      link: '/index.html#prayer'
    }
  };
}

`;
functionsIndex = replaceRegex(
  functionsIndex,
  /function buildPrayerReminderMessage\([\s\S]*?\n}\n\n(?=function buildPaymentReminderMessage)/,
  prayerMessageFunction,
  'prayer message'
);

const prayerFetchFunctions = `async function fetchPrayerScheduleByCity(city, country) {
  const url = \`https://api.aladhan.com/v1/timingsByCity?city=\${encodeURIComponent(city)}&country=\${encodeURIComponent(country)}&method=4\`;
  const data = await fetchJson(url);
  if (!data?.data?.timings) throw new Error('Invalid prayer timing response.');
  return {
    timings: data.data.timings,
    timeZone: data.data.meta?.timezone || 'Asia/Riyadh'
  };
}

async function fetchPrayerScheduleByCoordinates(latitude, longitude) {
  const url = \`https://api.aladhan.com/v1/timings?latitude=\${encodeURIComponent(latitude)}&longitude=\${encodeURIComponent(longitude)}&method=4\`;
  const data = await fetchJson(url);
  if (!data?.data?.timings) throw new Error('Invalid prayer timing response.');
  return {
    timings: data.data.timings,
    timeZone: data.data.meta?.timezone || 'Asia/Riyadh'
  };
}

async function fetchPrayerTimings(city, country) {
  return (await fetchPrayerScheduleByCity(city, country)).timings;
}

`;
functionsIndex = replaceRegex(
  functionsIndex,
  /async function fetchPrayerTimings\([\s\S]*?\n}\n\n(?=function parseRiyadhDateTime)/,
  prayerFetchFunctions,
  'prayer API helpers'
);

const schedulerHelpers = `async function claimNotificationState(stateRef, payload = {}) {
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stateRef);
    if (snapshot.exists) return false;
    transaction.create(stateRef, {
      ...payload,
      status: 'sending',
      claimedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return true;
  });
}

function formatRiyadhTime(date) {
  return new Intl.DateTimeFormat('ar-SA', {
    timeZone: 'Asia/Riyadh',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function getDateKeyForTimeZone(date = new Date(), timeZone = 'Asia/Riyadh') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch {
    return getLocalDateKey(date);
  }
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

function parseZonedDateTime(dateKey, timeValue = '', timeZone = 'Asia/Riyadh') {
  const time = String(timeValue || '').match(/\\d{1,2}:\\d{2}/)?.[0];
  if (!time || !/^\\d{4}-\\d{2}-\\d{2}$/.test(dateKey)) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  try {
    const firstOffset = getTimeZoneOffsetMinutes(guess, timeZone);
    const firstCandidate = new Date(guess.getTime() - firstOffset * 60000);
    const secondOffset = getTimeZoneOffsetMinutes(firstCandidate, timeZone);
    return new Date(guess.getTime() - secondOffset * 60000);
  } catch {
    return new Date(\`\${dateKey}T\${time}:00+03:00\`);
  }
}

`;
functionsIndex = replaceExact(
  functionsIndex,
  "function logMatchScheduleError(error, context = {}, level = 'error') {",
  `${schedulerHelpers}function logMatchScheduleError(error, context = {}, level = 'error') {`,
  'scheduler helper insertion'
);

write('functions/index.js', functionsIndex);

let matchHelpers = read('functions/match-helpers.js');
matchHelpers = replaceRegex(
  matchHelpers,
  /function getMatchKickoffDate\(event = \{\}\) \{[\s\S]*?\n}\n\n(?=function normalizeMatchTime)/,
  `function getMatchKickoffDate(event = {}) {
  const timestampValue = String(event.strTimestamp || '').trim();
  if (timestampValue) {
    const normalizedTimestamp = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(timestampValue)
      ? timestampValue
      : \`\${timestampValue}Z\`;
    const timestampDate = new Date(normalizedTimestamp);
    if (!Number.isNaN(timestampDate.getTime())) return timestampDate;
  }

  const dateValue = getEventDateKey(event);
  const rawTime = event.strTimeLocal || event.strTime || '00:00:00';
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateValue)) return null;

  const timeValue = normalizeMatchTime(rawTime);
  const kickoff = new Date(\`\${dateValue}T\${timeValue}+03:00\`);
  return Number.isNaN(kickoff.getTime()) ? null : kickoff;
}

`,
  'match timestamp parsing'
);
write('functions/match-helpers.js', matchHelpers);

let matchTests = read('functions/test/match-helpers.test.js');
matchTests = replaceExact(
  matchTests,
  "  assert.equal(getMatchKickoffDate({ dateEvent: 'bad-date', strTime: '19:30:00' }), null);\n});",
  "  assert.equal(getMatchKickoffDate({ dateEvent: 'bad-date', strTime: '19:30:00' }), null);\n\n  const timestampKickoff = getMatchKickoffDate({ strTimestamp: '2026-06-23T19:30:00Z' });\n  assert.equal(timestampKickoff.toISOString(), '2026-06-23T19:30:00.000Z');\n});",
  'match timestamp test'
);
write('functions/test/match-helpers.test.js', matchTests);

const functionsPackagePath = 'functions/package.json';
const functionsPackage = JSON.parse(read(functionsPackagePath));
functionsPackage.scripts.check = 'node --check index.js && node --check match-helpers.js && node --check notification-helpers.js && node --check rate-limit.js && node --check test/match-helpers.test.js && node --check test/notification-helpers.test.js && node --check test/rate-limit.test.js';
write(functionsPackagePath, `${JSON.stringify(functionsPackage, null, 2)}\n`);

let mainJs = read('assets/js/main.js');
mainJs = replaceExact(mainJs, "const APP_ASSET_VERSION = '270';", "const APP_ASSET_VERSION = '271';", 'asset version');
mainJs = replaceExact(
  mainJs,
  "    showChat: true,\n\n    chatEnabled: true,",
  "    showChat: true,\n    matchReminderMinutes: 5,\n\n    chatEnabled: true,",
  'match reminder default'
);
mainJs = replaceExact(mainJs, '    prayerReminderMinutes: 10', '    prayerReminderMinutes: 0', 'prayer exact default');

mainJs = replaceRegex(
  mainJs,
  /if \(!foregroundMessageUnsubscribe\) \{[\s\S]*?\n        }\n\n        return registration;/,
  `if (!foregroundMessageUnsubscribe) {
            foregroundMessageUnsubscribe = onMessage(firebaseMessaging, async (payload) => {
                console.log('Received foreground FCM message:', payload);
                const data = payload.data || {};
                const title = data.title || payload.notification?.title || 'تطبيق الاستراحة';
                const body = data.body || payload.notification?.body || '';
                if (Notification.permission === 'granted' && title) {
                    await registration.showNotification(title, {
                        body,
                        icon: '/assets/icons/icon-512.png',
                        badge: '/assets/icons/icon-192.png',
                        dir: 'rtl',
                        lang: 'ar',
                        tag: data.tag || data.dedupeKey || \`estraha-foreground-\${data.type || 'general'}\`,
                        renotify: false,
                        timestamp: Date.now(),
                        data
                    });
                }
            });
        }

        return registration;`,
  'foreground notification handler'
);

const locationHelpers = `function readPrayerLocationPreference() {
    try {
        const raw = localStorage.getItem('al-istiraha-prayer-location');
        if (!raw) return null;
        const value = JSON.parse(raw);
        const latitude = Number(value?.latitude);
        const longitude = Number(value?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return {
            latitude,
            longitude,
            timeZone: value.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh',
            savedAt: value.savedAt || new Date().toISOString()
        };
    } catch {
        return null;
    }
}

function requestCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('جهازك ما يدعم تحديد الموقع.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 10 * 60 * 1000
        });
    });
}

async function savePrayerLocationFromDevice(button, statusElement) {
    const defaultText = button?.textContent || 'استخدام موقعي';
    if (button) {
        button.disabled = true;
        button.textContent = 'جاري تحديد الموقع...';
    }
    if (statusElement) statusElement.textContent = 'نحدد موقعك لحساب الأذان بدقة...';

    try {
        const position = await requestCurrentPosition();
        const preference = {
            latitude: Number(position.coords.latitude.toFixed(5)),
            longitude: Number(position.coords.longitude.toFixed(5)),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh',
            savedAt: new Date().toISOString()
        };
        localStorage.setItem('al-istiraha-prayer-location', JSON.stringify(preference));
        if (Notification.permission === 'granted') await syncFcmTokenWithPreferences();
        if (statusElement) statusElement.textContent = 'تم ربط تنبيه الصلاة بموقع هذا الجهاز.';
        showAlert('تم ضبط تنبيه الصلاة حسب موقعك الحالي.');
    } catch (error) {
        const message = error?.code === 1
            ? 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح.'
            : error?.message || 'تعذر تحديد الموقع.';
        if (statusElement) statusElement.textContent = message;
        showAlert(message);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = defaultText;
        }
    }
}

`;
mainJs = replaceExact(
  mainJs,
  'async function syncFcmTokenWithPreferences() {',
  `${locationHelpers}async function syncFcmTokenWithPreferences() {`,
  'prayer location helpers'
);

mainJs = replaceRegex(
  mainJs,
  /async function saveFcmToken\(token\) \{[\s\S]*?\n}\n\n(?=menuBtn\?\.addEventListener)/,
  `async function saveFcmToken(token) {
    const tokenId = btoa(token).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
    const prayerLocation = readPrayerLocationPreference();
    const payload = {
        token,
        uid: currentUser.uid,
        topics: {
            payments: localStorage.getItem('al-istiraha-payment-notification') !== 'false',
            prayer: localStorage.getItem('al-istiraha-prayer-notification') === 'true',
            matches: localStorage.getItem('al-istiraha-matches-notification') === 'true',
            chat: localStorage.getItem('al-istiraha-chat-notification') !== 'false'
        },
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp()
    };
    if (prayerLocation) payload.prayerLocation = prayerLocation;

    await setDoc(doc(db, 'fcmTokens', tokenId), payload, { merge: true });
    return { tokenId };
}

`,
  'token location persistence'
);

mainJs = replaceExact(
  mainJs,
  "    const resyncButton = document.getElementById('resync-notifications');",
  "    const resyncButton = document.getElementById('resync-notifications');\n    const prayerLocationButton = document.getElementById('save-prayer-location');\n    const prayerLocationStatus = document.getElementById('prayer-location-status');\n    const savedPrayerLocation = readPrayerLocationPreference();\n    if (prayerLocationStatus) {\n        prayerLocationStatus.textContent = savedPrayerLocation\n            ? 'تنبيه الصلاة مربوط بموقع هذا الجهاز.'\n            : 'استخدم موقعك لضبط الأذان حسب منطقتك.';\n    }\n    if (prayerLocationButton && prayerLocationButton.dataset.bound !== 'true') {\n        prayerLocationButton.dataset.bound = 'true';\n        prayerLocationButton.addEventListener('click', () => savePrayerLocationFromDevice(prayerLocationButton, prayerLocationStatus));\n    }",
  'notification location controls'
);

mainJs = replaceExact(
  mainJs,
  "    const prayerReminderMinutesInput = document.getElementById('admin-prayer-reminder-minutes');",
  "    const prayerReminderMinutesInput = document.getElementById('admin-prayer-reminder-minutes');\n    const matchReminderMinutesInput = document.getElementById('admin-match-reminder-minutes');",
  'admin match field declaration'
);
mainJs = replaceExact(
  mainJs,
  "    if (prayerReminderMinutesInput) prayerReminderMinutesInput.value = appSettings.prayerReminderMinutes ?? DEFAULT_APP_SETTINGS.prayerReminderMinutes;",
  "    if (prayerReminderMinutesInput) prayerReminderMinutesInput.value = 0;\n    if (matchReminderMinutesInput) matchReminderMinutesInput.value = appSettings.matchReminderMinutes ?? DEFAULT_APP_SETTINGS.matchReminderMinutes;",
  'admin match field init'
);
mainJs = replaceExact(
  mainJs,
  "            prayerCountry: prayerCountryInput?.value.trim() || DEFAULT_APP_SETTINGS.prayerCountry,\n            prayerReminderMinutes: Number(prayerReminderMinutesInput?.value || DEFAULT_APP_SETTINGS.prayerReminderMinutes)",
  "            prayerCountry: prayerCountryInput?.value.trim() || DEFAULT_APP_SETTINGS.prayerCountry,\n            prayerReminderMinutes: 0,\n            matchReminderMinutes: Number(matchReminderMinutesInput?.value || DEFAULT_APP_SETTINGS.matchReminderMinutes)",
  'admin prayer and match save'
);

const saudiMatchHelpers = `function getSportsDbKickoffDate(event = {}) {
    const timestampValue = String(event.strTimestamp || '').trim();
    if (timestampValue) {
        const normalized = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(timestampValue)
            ? timestampValue
            : \`\${timestampValue}Z\`;
        const date = new Date(normalized);
        if (!Number.isNaN(date.getTime())) return date;
    }

    const dateKey = getEventDateKey(event);
    const time = String(event.strTimeLocal || event.strTime || '00:00:00').match(/\\d{1,2}:\\d{2}(?::\\d{2})?/)?.[0];
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(dateKey) || !time) return null;
    const normalizedTime = time.length === 5 ? \`\${time}:00\` : time;
    const date = new Date(\`\${dateKey}T\${normalizedTime}+03:00\`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatSaudiMatchTime(event = {}) {
    const kickoff = getSportsDbKickoffDate(event);
    if (!kickoff) return '--:--';
    return new Intl.DateTimeFormat('ar-SA', {
        timeZone: 'Asia/Riyadh',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(kickoff);
}

function formatSaudiMatchDate(event = {}) {
    const kickoff = getSportsDbKickoffDate(event);
    if (!kickoff) return getEventDateKey(event);
    return new Intl.DateTimeFormat('ar-SA', {
        timeZone: 'Asia/Riyadh',
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    }).format(kickoff);
}

`;
mainJs = replaceExact(
  mainJs,
  'function renderSportsDbMatchCard(event) {',
  `${saudiMatchHelpers}function renderSportsDbMatchCard(event) {`,
  'Saudi match formatting helpers'
);
mainJs = replaceExact(
  mainJs,
  "        : (event.strTimeLocal || event.strTime || '--:--').slice(0, 5);",
  "        : formatSaudiMatchTime(event);",
  'Saudi match time display'
);
mainJs = replaceExact(
  mainJs,
  '            <p class="muted">${escapeHtml(getEventDateKey(event))}</p>',
  '            <p class="muted">${escapeHtml(formatSaudiMatchDate(event))} · بتوقيت السعودية</p>',
  'Saudi match date display'
);
mainJs = replaceRegex(
  mainJs,
  /function getLocalDateKey\(date = new Date\(\)\) \{[\s\S]*?\n}\n\n(?=function getEventDateKey)/,
  `function getLocalDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

`,
  'Saudi local date key'
);

write('assets/js/main.js', mainJs);

let notificationPage = read('pages/notifications-settings.html');
notificationPage = replaceExact(
  notificationPage,
  "    <div class=\"cards-grid mt-4\">",
  `    <div class="list-item-card mt-4">
        <div>
            <span class="font-bold">موقع تنبيه الصلاة</span>
            <p id="prayer-location-status" class="text-sm">جاري التحقق...</p>
        </div>
        <button id="save-prayer-location" class="btn" type="button" style="width:auto;">استخدام موقعي</button>
    </div>
    <div class="cards-grid mt-4">`,
  'prayer location UI'
);
write('pages/notifications-settings.html', notificationPage);

let adminPage = read('pages/admin-notifications.html');
adminPage = replaceExact(adminPage, 'إعدادات تنبيهات الصلاة</h2>', 'إعدادات تنبيهات الصلاة والمباريات</h2>', 'admin section title');
adminPage = replaceExact(adminPage, 'تحديد المدينة ووقت التذكير قبل الصلاة', 'الصلاة عند وقت الأذان، والمباراة قبلها بعدد الدقائق المحدد', 'admin section description');
adminPage = replaceExact(
  adminPage,
  `        <div class="input-group">
            <label for="admin-prayer-reminder-minutes">الدقائق قبل الصلاة</label>
            <input id="admin-prayer-reminder-minutes" type="number" min="1" max="60" step="1" placeholder="10">
        </div>`,
  `        <div class="input-group">
            <label for="admin-prayer-reminder-minutes">تنبيه الصلاة</label>
            <input id="admin-prayer-reminder-minutes" type="number" min="0" max="0" value="0" readonly>
            <small>يرسل عند دخول وقت الأذان حسب موقع كل جهاز.</small>
        </div>

        <div class="input-group">
            <label for="admin-match-reminder-minutes">الدقائق قبل المباراة</label>
            <input id="admin-match-reminder-minutes" type="number" min="1" max="120" step="1" placeholder="5">
        </div>`,
  'admin prayer and match fields'
);
write('pages/admin-notifications.html', adminPage);

let serviceWorker = read('service-worker.js');
serviceWorker = replaceExact(serviceWorker, "const CACHE_NAME = 'estraha-cache-v270';", "const CACHE_NAME = 'estraha-cache-v271';", 'service worker version');
serviceWorker = replaceExact(
  serviceWorker,
  "  '/assets/icons/icon-512.png',",
  "  '/assets/icons/icon-512.png',\n  '/assets/icons/apple-touch-icon.png',",
  'apple icon cache'
);
serviceWorker = replaceRegex(
  serviceWorker,
  /messaging\.onBackgroundMessage\(\(payload\) => \{[\s\S]*?\n}\);/,
  `messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || 'تطبيق الاستراحة';
  const body = data.body || payload.notification?.body || '';
  const tag = data.tag || data.dedupeKey || \`estraha-\${data.type || 'general'}\`;

  return self.registration.showNotification(title, {
    body,
    icon: '/assets/icons/icon-512.png',
    badge: '/assets/icons/icon-192.png',
    tag,
    renotify: false,
    requireInteraction: false,
    dir: 'rtl',
    lang: 'ar',
    timestamp: Date.now(),
    vibrate: [180, 80, 180],
    data: {
      ...data,
      link: data.link || '/index.html#home'
    }
  });
});`,
  'background notification handler'
);
write('service-worker.js', serviceWorker);

let indexHtml = read('index.html');
indexHtml = indexHtml.replace(/\?v=270/g, '?v=271');
indexHtml = replaceExact(
  indexHtml,
  '<link rel="apple-touch-icon" href="assets/icons/icon-192.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="assets/icons/apple-touch-icon.png?v=271">',
  'apple icon link'
);
write('index.html', indexHtml);

const manifestPath = 'manifest.json';
const manifest = JSON.parse(read(manifestPath));
manifest.id = '/';
manifest.icons = [
  { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
];
write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(pixels.subarray(y * width * 4, (y + 1) * width * 4)));
  }
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const FONT = {
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110']
};

function generateIcon(size, file) {
  const pixels = new Uint8Array(size * size * 4);
  const background = [10, 65, 48, 255];
  const edge = [215, 187, 118, 255];
  const foreground = [255, 248, 232, 255];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      pixels.set(background, index);
    }
  }

  const border = Math.max(4, Math.round(size * 0.035));
  for (let y = border; y < size - border; y += 1) {
    for (let x = border; x < size - border; x += 1) {
      const nearEdge = x < border * 2 || x >= size - border * 2 || y < border * 2 || y >= size - border * 2;
      if (!nearEdge) continue;
      const index = (y * size + x) * 4;
      pixels.set(edge, index);
    }
  }

  const unit = Math.max(5, Math.floor(size * 0.072));
  const gapUnits = 1;
  const totalUnits = 5 + gapUnits + 5;
  const startX = Math.floor((size - totalUnits * unit) / 2);
  const startY = Math.floor((size - 7 * unit) / 2);

  function drawLetter(letter, offsetUnits) {
    FONT[letter].forEach((row, rowIndex) => {
      [...row].forEach((cell, colIndex) => {
        if (cell !== '1') return;
        const x0 = startX + (offsetUnits + colIndex) * unit;
        const y0 = startY + rowIndex * unit;
        for (let y = y0; y < y0 + unit; y += 1) {
          for (let x = x0; x < x0 + unit; x += 1) {
            if (x < 0 || y < 0 || x >= size || y >= size) continue;
            const index = (y * size + x) * 4;
            pixels.set(foreground, index);
          }
        }
      });
    });
  }

  drawLetter('E', 0);
  drawLetter('S', 6);
  fs.writeFileSync(file, encodePng(size, size, pixels));
}

generateIcon(192, 'assets/icons/icon-192.png');
generateIcon(512, 'assets/icons/icon-512.png');
generateIcon(180, 'assets/icons/apple-touch-icon.png');

for (const temporaryFile of [
  'scripts/apply-notification-upgrade.js',
  '.github/workflows/apply-notification-upgrade.yml'
]) {
  if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile);
}

console.log('Notification reliability, Saudi match time, location prayer timing, and icons applied.');
