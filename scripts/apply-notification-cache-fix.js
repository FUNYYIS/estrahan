const fs = require('node:fs');

const file = 'functions/index.js';
let content = fs.readFileSync(file, 'utf8');

function replaceExact(search, replacement, label) {
  if (!content.includes(search)) {
    throw new Error('Missing target: ' + label);
  }
  content = content.replace(search, replacement);
}

replaceExact(
  "const callableRateLimiter = createInMemoryRateLimiter({ maxEntries: 500 });",
  "const callableRateLimiter = createInMemoryRateLimiter({ maxEntries: 500 });\nconst prayerScheduleMemoryCache = new Map();",
  'memory cache declaration'
);

replaceExact(
  "          const schedule = group.location.mode === 'coordinates'\n            ? await fetchPrayerScheduleByCoordinates(group.location.latitude, group.location.longitude)\n            : await fetchPrayerScheduleByCity(group.location.city, group.location.country);",
  "          const schedule = await getCachedPrayerSchedule(group);",
  'cached prayer schedule call'
);

const oldClaim = "async function claimNotificationState(stateRef, payload = {}) {\n  return db.runTransaction(async (transaction) => {\n    const snapshot = await transaction.get(stateRef);\n    if (snapshot.exists) return false;\n    transaction.create(stateRef, {\n      ...payload,\n      status: 'sending',\n      claimedAt: admin.firestore.FieldValue.serverTimestamp()\n    });\n    return true;\n  });\n}\n";

const newClaim = "async function getCachedPrayerSchedule(group) {\n  const preferredTimeZone = group.location.timeZone || 'Asia/Riyadh';\n  const dateKey = getDateKeyForTimeZone(new Date(), preferredTimeZone);\n  const cacheKey = dateKey + '|' + group.key;\n\n  if (prayerScheduleMemoryCache.has(cacheKey)) {\n    return prayerScheduleMemoryCache.get(cacheKey);\n  }\n\n  const cacheRef = db.collection('prayerTimingCache').doc(toDocId(cacheKey));\n  const cachedSnapshot = await cacheRef.get();\n  const cachedData = cachedSnapshot.data();\n\n  if (cachedSnapshot.exists && cachedData && cachedData.dateKey === dateKey && cachedData.timings) {\n    const cachedSchedule = {\n      timings: cachedData.timings,\n      timeZone: cachedData.timeZone || preferredTimeZone\n    };\n    prayerScheduleMemoryCache.set(cacheKey, cachedSchedule);\n    return cachedSchedule;\n  }\n\n  const schedule = group.location.mode === 'coordinates'\n    ? await fetchPrayerScheduleByCoordinates(group.location.latitude, group.location.longitude)\n    : await fetchPrayerScheduleByCity(group.location.city, group.location.country);\n\n  prayerScheduleMemoryCache.clear();\n  prayerScheduleMemoryCache.set(cacheKey, schedule);\n  await cacheRef.set({\n    dateKey,\n    locationKey: group.key,\n    timings: schedule.timings,\n    timeZone: schedule.timeZone || preferredTimeZone,\n    updatedAt: admin.firestore.FieldValue.serverTimestamp()\n  }, { merge: false });\n\n  return schedule;\n}\n\nasync function claimNotificationState(stateRef, payload = {}) {\n  const staleBefore = Date.now() - 5 * 60 * 1000;\n\n  return db.runTransaction(async (transaction) => {\n    const snapshot = await transaction.get(stateRef);\n    if (snapshot.exists) {\n      const existing = snapshot.data() || {};\n      const claimedAt = existing.claimedAt && typeof existing.claimedAt.toMillis === 'function'\n        ? existing.claimedAt.toMillis()\n        : 0;\n      const isStaleSendingClaim = existing.status === 'sending' && claimedAt > 0 && claimedAt < staleBefore;\n      if (!isStaleSendingClaim) return false;\n    }\n\n    transaction.set(stateRef, {\n      ...payload,\n      status: 'sending',\n      claimedAt: admin.firestore.FieldValue.serverTimestamp()\n    }, { merge: false });\n    return true;\n  });\n}\n";

replaceExact(oldClaim, newClaim, 'cache helper and stale claim recovery');
fs.writeFileSync(file, content);
console.log('Prayer schedule caching and stale claim recovery applied.');
