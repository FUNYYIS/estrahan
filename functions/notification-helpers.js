function cleanText(value, fallback = '') {
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
    `estraha-${type}-${Date.now()}`
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
