const admin = require('firebase-admin');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

admin.initializeApp();

const db = admin.firestore();
const ADMIN_UID = 'tquFv8nhU3ZPGgqumfCo3Hx67k02';
const REGISTRATION_INVITE_CODE = defineSecret('ESTRAHA_INVITE_CODE');
const THE_SPORTS_DB_KEY = '3';
const SAUDI_LEAGUE_ID = '4668';
const WORLD_CUP_LEAGUE_ID = '4429';
const WORLD_CUP_SEASON = '2026';
const ADMIN_TEST_NOTIFICATION_TYPES = new Set(['match', 'payment', 'prayer', 'general']);
const MATCH_NOTIFICATION_TEMPLATES = [
  '⚽ لا تروح بعيد {{homeTeam}} ضد {{awayTeam}} قربت',
  '☕ جهزوا القهوة {{homeTeam}} ضد {{awayTeam}} بتبدا عقب شوي 😄'
];
const PRAYER_NAMES = {
  Fajr: 'الفجر',
  Dhuhr: 'الظهر',
  Asr: 'العصر',
  Maghrib: 'المغرب',
  Isha: 'العشاء'
};
const INVALID_FCM_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

exports.checkUpcomingMatches = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'Asia/Riyadh',
    region: 'us-central1'
  },
  async () => {
    const upcomingMatches = await getUpcomingMatches();
    if (!upcomingMatches.length) return;

    const notificationWindows = [
      { minutes: 60, min: 55, max: 65 },
      { minutes: 15, min: 10, max: 20 }
    ];

    for (const match of upcomingMatches) {
      if (!isNotifiableMatch(match)) continue;

      const kickoff = getMatchKickoffDate(match);
      if (!kickoff) continue;

      const remainingMinutes = Math.round((kickoff.getTime() - Date.now()) / 60000);
      const windowConfig = notificationWindows.find((item) => (
        remainingMinutes >= item.min && remainingMinutes <= item.max
      ));

      if (!windowConfig) continue;

      const teams = getMatchNotificationTeams(match);
      if (!teams) {
        logger.info('Skipped match notification because team names are missing.');
        continue;
      }

      const matchKey = getMatchKey(match);
      const stateKey = `${matchKey}-${windowConfig.minutes}`;
      const stateRef = db.collection('matchNotificationState').doc(toDocId(stateKey));
      const stateDoc = await stateRef.get();
      if (stateDoc.exists) continue;

      const tokenRecords = await getTokenRecordsByTopic('matches');

      if (!tokenRecords.length) {
        logger.info('No FCM tokens subscribed to match notifications.');
        continue;
      }

      const title = renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[0], teams);
      const body = renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[1], teams);

      const result = await sendNotificationToTokenRecords(tokenRecords, {
        notification: {
          title,
          body
        },
        data: {
          type: 'match',
          notificationWindow: String(windowConfig.minutes),
          matchKey,
          homeTeam: teams.homeTeam,
          awayTeam: teams.awayTeam,
          link: '/index.html#matches'
        },
        webpush: {
          notification: {
            icon: '/assets/icons/icon-192.png',
            badge: '/assets/icons/icon-192.png',
            tag: `match-${toDocId(stateKey)}`,
            renotify: false
          }
        }
      });

      await stateRef.set({
        matchKey,
        notificationWindow: windowConfig.minutes,
        remainingMinutes,
        homeTeam: teams.homeTeam,
        awayTeam: teams.awayTeam,
        kickoffAt: admin.firestore.Timestamp.fromDate(kickoff),
        targetedTokens: result.targetedTokens,
        successCount: result.successCount,
        failureCount: result.failureCount,
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
);

exports.checkPrayerNotifications = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Riyadh',
    region: 'us-central1'
  },
  async () => {
    try {
      const settings = await getAppSettings();
      if (settings.prayerNotificationsEnabled === false) return;

      const city = cleanSettingText(settings.prayerCity, 'Jeddah');
      const country = cleanSettingText(settings.prayerCountry, 'Saudi Arabia');
      const minutesBefore = clampNumber(settings.prayerReminderMinutes, 1, 60, 10);
      const dateKey = getLocalDateKey();
      const timings = await fetchPrayerTimings(city, country);
      const windowStart = Math.max(0, minutesBefore - 3);
      const windowEnd = minutesBefore + 3;

      for (const [prayerKey, prayerName] of Object.entries(PRAYER_NAMES)) {
        const prayerTime = timings[prayerKey];
        const prayerDate = parseRiyadhDateTime(dateKey, prayerTime);
        if (!prayerDate) continue;

        const remainingMinutes = Math.round((prayerDate.getTime() - Date.now()) / 60000);
        if (remainingMinutes < windowStart || remainingMinutes > windowEnd) continue;

        const stateKey = `${dateKey}-${prayerKey}-${minutesBefore}`;
        const stateRef = db.collection('prayerNotificationState').doc(toDocId(stateKey));
        if ((await stateRef.get()).exists) continue;

        const tokenRecords = await getTokenRecordsByTopic('prayer');
        if (!tokenRecords.length) {
          logger.info('No FCM tokens subscribed to prayer notifications.');
          continue;
        }

        const message = buildPrayerReminderMessage(prayerName, minutesBefore);
        const result = await sendNotificationToTokenRecords(tokenRecords, message);

        await stateRef.set({
          prayerName,
          prayerTime,
          reminderMinutes: minutesBefore,
          successCount: result.successCount,
          failureCount: result.failureCount,
          targetedTokens: result.targetedTokens,
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      logger.error('Prayer notification schedule failed.', error);
    }
  }
);

exports.checkPaymentReminders = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'Asia/Riyadh',
    region: 'us-central1'
  },
  async () => {
    try {
      const settings = await getAppSettings();
      if (settings.paymentReminderEnabled === false) return;

      const now = getRiyadhParts();
      const reminderDay = clampNumber(settings.paymentReminderDay, 1, 31, 1);
      const reminderHour = clampNumber(settings.paymentReminderHour, 0, 23, 9);
      const reminderMinute = clampNumber(settings.paymentReminderMinute, 0, 59, 0);
      if (now.day !== reminderDay || now.hour !== reminderHour) return;
      if (Math.abs(now.minute - reminderMinute) > 5) return;

      const audience = settings.paymentReminderMode === 'lateOnly' ? 'lateOnly' : 'all';
      const stateKey = `${now.year}-${now.month}-${now.day}-${audience}`;
      const stateRef = db.collection('paymentReminderState').doc(toDocId(stateKey));
      if ((await stateRef.get()).exists) return;

      const tokenRecords = audience === 'lateOnly'
        ? await getLatePaymentTokenRecords()
        : await getTokenRecordsByTopic('payments');

      if (!tokenRecords.length) {
        logger.info('No FCM tokens subscribed to payment reminders.', { audience });
        return;
      }

      const message = buildPaymentReminderMessage(settings);
      const result = await sendNotificationToTokenRecords(tokenRecords, message);

      await stateRef.set({
        reminderMonth: `${now.year}-${now.month}`,
        audience,
        targetedUsers: Array.from(new Set(tokenRecords.map((record) => record.uid).filter(Boolean))).length,
        targetedTokens: result.targetedTokens,
        successCount: result.successCount,
        failureCount: result.failureCount,
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      logger.error('Payment reminder schedule failed.', error);
    }
  }
);

exports.sendAdminTestNotification = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);

    const type = String(request.data?.type || 'general');
    if (!ADMIN_TEST_NOTIFICATION_TYPES.has(type)) {
      throw new HttpsError('invalid-argument', 'Unsupported notification test type.');
    }

    const message = await buildAdminTestMessage(type);
    const tokenRecords = await getTokenRecordsForUser(ADMIN_UID);

    if (!tokenRecords.length) {
      throw new HttpsError('failed-precondition', 'لا يوجد جهاز مسجل لاستقبال الإشعارات. افتح إعدادات الإشعارات وفعّلها أولاً.');
    }

    const result = await sendNotificationToTokenRecords(tokenRecords, {
      ...message,
      webpush: {
        notification: {
          icon: '/assets/icons/icon-192.png',
          badge: '/assets/icons/icon-192.png',
          tag: `admin-test-${type}-${Date.now()}`
        }
      }
    });

    return result;
  }
);

exports.sendAdminBroadcastNotification = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);

    const title = cleanNotificationText(request.data?.title);
    const body = cleanNotificationText(request.data?.message);

    if (!title || !body) {
      throw new HttpsError('invalid-argument', 'Notification title and message are required.');
    }

    const tokenRecords = await getAllTokenRecords();
    const result = await sendNotificationToTokenRecords(tokenRecords, {
      notification: {
        title,
        body
      },
      data: {
        type: 'broadcast',
        title,
        body,
        link: '/index.html#notifications-settings'
      },
      webpush: {
        notification: {
          icon: '/assets/icons/icon-192.png',
          badge: '/assets/icons/icon-192.png',
          tag: `broadcast-${Date.now()}`
        }
      }
    });

    await db.collection('adminNotifications').add({
      title,
      body,
      audience: 'all',
      sentBy: request.auth.uid,
      successCount: result.successCount,
      failureCount: result.failureCount,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return result;
  }
);

exports.debugPrayerNotification = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);
    const settings = await getAppSettings();
    const minutesBefore = clampNumber(settings.prayerReminderMinutes, 1, 60, 10);
    const message = buildPrayerReminderMessage('العصر', minutesBefore);
    const tokenRecords = await getTokenRecordsForUser(ADMIN_UID);
    if (!tokenRecords.length) {
      throw new HttpsError('failed-precondition', 'لا يوجد جهاز مسجل لاستقبال الإشعارات. افتح إعدادات الإشعارات وفعّلها أولاً.');
    }
    return sendNotificationToTokenRecords(tokenRecords, message);
  }
);

exports.debugPaymentReminder = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);
    const message = buildPaymentReminderMessage(await getAppSettings());
    const tokenRecords = await getTokenRecordsForUser(ADMIN_UID);
    if (!tokenRecords.length) {
      throw new HttpsError('failed-precondition', 'لا يوجد جهاز مسجل لاستقبال الإشعارات. افتح إعدادات الإشعارات وفعّلها أولاً.');
    }
    return sendNotificationToTokenRecords(tokenRecords, message);
  }
);

exports.completeRegistration = onCall(
  {
    region: 'us-central1',
    secrets: [REGISTRATION_INVITE_CODE]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const uid = request.auth.uid;
    const phone = String(request.auth.token.phone_number || '').trim();
    const name = normalizeMemberName(request.data?.name);
    const inviteCode = normalizeInviteCode(request.data?.inviteCode);
    const validInviteCode = normalizeInviteCode(REGISTRATION_INVITE_CODE.value());

    if (!name || name.length < 2 || name.length > 60) {
      throw new HttpsError('invalid-argument', 'Invalid member name.');
    }

    if (!validInviteCode) {
      logger.error('Registration invite code secret is not configured.');
      throw new HttpsError('failed-precondition', 'Registration is not configured.');
    }

    if (!inviteCode || inviteCode !== validInviteCode) {
      throw new HttpsError('permission-denied', 'Invalid invite code.');
    }

    if (!phone) {
      throw new HttpsError('failed-precondition', 'Verified phone number is missing.');
    }

    const userRef = db.collection('users').doc(uid);

    await db.runTransaction(async (transaction) => {
      const existingDoc = await transaction.get(userRef);
      if (existingDoc.exists) {
        throw new HttpsError('already-exists', 'Member account already exists.');
      }

      transaction.set(userRef, {
        name,
        phone,
        paymentStatus: 'late',
        disabled: false,
        avatarUrl: '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return {
      ok: true,
      user: {
        uid,
        name,
        phone,
        paymentStatus: 'late',
        disabled: false,
        avatarUrl: ''
      }
    };
  }
);

exports.addManualMember = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);

    const name = normalizeMemberName(request.data?.name);
    const phone = String(request.data?.phone || '').trim();

    if (!name || name.length < 2 || name.length > 60) {
      throw new HttpsError('invalid-argument', 'Invalid member name.');
    }

    const memberRef = await db.collection('users').add({
      name,
      phone,
      paymentStatus: 'late',
      disabled: false,
      avatarUrl: '',
      manual: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: request.auth.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { ok: true, memberId: memberRef.id };
  }
);

exports.updateMemberPaymentStatus = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);

    const memberId = normalizeMemberId(request.data?.memberId);
    const paymentStatus = String(request.data?.paymentStatus || '').trim();
    if (!memberId || !['paid', 'late'].includes(paymentStatus)) {
      throw new HttpsError('invalid-argument', 'Invalid member payment status.');
    }

    await db.collection('users').doc(memberId).update({
      paymentStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { ok: true };
  }
);

exports.updateMemberName = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);

    const memberId = normalizeMemberId(request.data?.memberId);
    const name = normalizeMemberName(request.data?.name);
    if (!memberId || !name || name.length < 2 || name.length > 60) {
      throw new HttpsError('invalid-argument', 'Invalid member name.');
    }

    await db.collection('users').doc(memberId).update({
      name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { ok: true };
  }
);

exports.setMemberDisabled = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);

    const memberId = normalizeMemberId(request.data?.memberId);
    const disabled = request.data?.disabled === true;
    if (!memberId) {
      throw new HttpsError('invalid-argument', 'Invalid member id.');
    }

    await db.collection('users').doc(memberId).update({
      disabled,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { ok: true };
  }
);

exports.resetMemberAvatar = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);

    const memberId = normalizeMemberId(request.data?.memberId);
    if (!memberId) {
      throw new HttpsError('invalid-argument', 'Invalid member id.');
    }

    await db.collection('users').doc(memberId).update({
      avatarUrl: '',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { ok: true };
  }
);

exports.deleteMember = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);

    const memberId = normalizeMemberId(request.data?.memberId);
    if (!memberId) {
      throw new HttpsError('invalid-argument', 'Invalid member id.');
    }

    await db.collection('users').doc(memberId).delete();
    await deleteTokensForUser(memberId);

    try {
      await admin.auth().deleteUser(memberId);
    } catch (error) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-uid') {
        return { ok: true, authDeleted: false };
      }

        logger.warn('Member Firestore document deleted, but Auth delete failed.', {
          memberId,
          code: error.code
        });
        return { ok: true, authDeleted: false };
    }

    return { ok: true, authDeleted: true };
  }
);

function assertAdmin(request) {
  if (!request.auth || request.auth.uid !== ADMIN_UID) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
}

function normalizeMemberName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeInviteCode(value) {
  return String(value || '').trim();
}

function normalizeMemberId(value) {
  return String(value || '').trim();
}

async function deleteTokensForUser(uid) {
  const snapshot = await db
    .collection('fcmTokens')
    .where('uid', '==', uid)
    .get();

  const batches = chunk(snapshot.docs, 400);
  for (const docs of batches) {
    const batch = db.batch();
    docs.forEach((tokenDoc) => batch.delete(tokenDoc.ref));
    await batch.commit();
  }
}

async function buildAdminTestMessage(type) {
  if (type === 'match') {
    const nextMatch = await getNextUpcomingMatch();
    const teams = nextMatch ? getMatchNotificationTeams(nextMatch) : null;
    if (!teams) {
      console.log('Skipped match notification because team names are missing.');
      throw new HttpsError('failed-precondition', 'Skipped match notification because team names are missing.');
    }

    return {
      notification: {
        title: renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[0], teams),
        body: renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[1], teams)
      },
      data: {
        type: 'match',
        title: renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[0], teams),
        body: renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[1], teams),
        homeTeam: teams.homeTeam,
        awayTeam: teams.awayTeam,
        link: '/index.html#matches'
      }
    };
  }

  if (type === 'payment') {
    return buildPaymentReminderMessage(await getAppSettings());
  }

  if (type === 'prayer') {
    const settings = await getAppSettings();
    const minutesBefore = clampNumber(settings.prayerReminderMinutes, 1, 60, 10);
    return buildPrayerReminderMessage('العصر', minutesBefore);
  }

  return {
    notification: {
      title: 'تطبيق الاستراحة',
      body: 'وصل إشعار اختبار من تطبيق الاستراحة.'
    },
    data: {
      type: 'general',
      title: 'تطبيق الاستراحة',
      body: 'وصل إشعار اختبار من تطبيق الاستراحة.',
      link: '/index.html#home'
    }
  };
}

async function getTokenRecordsForUser(uid) {
  const snapshot = await db
    .collection('fcmTokens')
    .where('uid', '==', uid)
    .get();

  return docsToTokenRecords(snapshot.docs);
}

async function getAllTokenRecords() {
  const snapshot = await db.collection('fcmTokens').get();
  return docsToTokenRecords(snapshot.docs);
}

async function getTokenRecordsByTopic(topic) {
  const snapshot = await db
    .collection('fcmTokens')
    .where(`topics.${topic}`, '==', true)
    .get();

  return docsToTokenRecords(snapshot.docs);
}

async function getLatePaymentTokenRecords() {
  const usersSnapshot = await db
    .collection('users')
    .where('paymentStatus', '!=', 'paid')
    .get();
  const lateUserIds = new Set(usersSnapshot.docs.map((doc) => doc.id));
  if (!lateUserIds.size) return [];

  const paymentTokens = await getTokenRecordsByTopic('payments');
  return paymentTokens.filter((record) => lateUserIds.has(record.uid));
}

function docsToTokenRecords(docs) {
  const seen = new Set();
  return docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((record) => {
      if (!record.token || seen.has(record.token)) return false;
      seen.add(record.token);
      return true;
    });
}

async function sendNotificationToTokenRecords(tokenRecords, message) {
  if (!tokenRecords.length) {
    return {
      targetedTokens: 0,
      successCount: 0,
      failureCount: 0,
      deletedInvalidTokens: 0
    };
  }

  let successCount = 0;
  let failureCount = 0;
  let deletedInvalidTokens = 0;
  const chunks = chunk(tokenRecords, 500);

  for (const tokenChunk of chunks) {
    const tokens = tokenChunk.map((record) => record.token);
    const response = await admin.messaging().sendEachForMulticast({
      ...message,
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

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function cleanNotificationText(value) {
  return String(value || '').trim().slice(0, 240);
}

async function getAppSettings() {
  const settingsDoc = await db.collection('settings').doc('app').get();
  return settingsDoc.exists ? settingsDoc.data() : {};
}

function cleanSettingText(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function buildPrayerReminderMessage(prayerName, minutesBefore) {
  const title = `قرب موعد صلاة ${prayerName}`;
  const body = `باقي ${minutesBefore} دقائق على صلاة ${prayerName}`;
  return {
    notification: {
      title,
      body
    },
    data: {
      type: 'prayer',
      title,
      body,
      link: '/index.html#prayer'
    }
  };
}

function buildPaymentReminderMessage(settings = {}) {
  const amount = clampNumber(settings.qattahAmount, 0, 100000, 100);
  const title = 'تذكير القطة الشهرية';
  const body = amount > 0
    ? `لا تنسى تسدد القطة الشهرية بقيمة ${amount} ريال`
    : 'لا تنسى تسدد القطة الشهرية';
  return {
    notification: {
      title,
      body
    },
    data: {
      type: 'payment',
      title,
      body,
      link: '/index.html#payments'
    }
  };
}

async function fetchPrayerTimings(city, country) {
  const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=4`;
  const data = await fetchJson(url);
  if (!data?.data?.timings) {
    throw new Error('Invalid prayer timing response.');
  }
  return data.data.timings;
}

function parseRiyadhDateTime(dateKey, timeValue = '') {
  const time = String(timeValue || '').match(/\d{1,2}:\d{2}/)?.[0];
  if (!time) return null;
  const value = new Date(`${dateKey}T${time}:00+03:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function getRiyadhParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: parts.year,
    month: parts.month,
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute)
  };
}

async function getNextUpcomingMatch() {
  return (await getUpcomingMatches())[0] || null;
}

async function getUpcomingMatches() {
  const today = getLocalDateKey();
  const saudiSeason = await getSaudiLeagueSeason();
  const todayUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsday.php?d=${today}&s=Soccer`;
  const saudiSeasonUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsseason.php?id=${SAUDI_LEAGUE_ID}&s=${encodeURIComponent(saudiSeason)}`;
  const worldCupSeasonUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsseason.php?id=${WORLD_CUP_LEAGUE_ID}&s=${WORLD_CUP_SEASON}`;

  const [todayResult, saudiResult, worldCupResult, githubResult] = await Promise.allSettled([
    fetchJson(todayUrl),
    fetchJson(saudiSeasonUrl),
    fetchJson(worldCupSeasonUrl),
    fetchWorldCupGithubFixtures()
  ]);

  const todayData = resultValue(todayResult, { events: [] }, 'TheSportsDB daily matches unavailable.');
  const saudiData = resultValue(saudiResult, { events: [] }, 'TheSportsDB Saudi season unavailable.');
  const worldCupData = resultValue(worldCupResult, { events: [] }, 'TheSportsDB World Cup season unavailable.');
  const githubWorldCup = resultValue(githubResult, [], 'World Cup GitHub fallback unavailable.');

  const todayMatches = (todayData.events || [])
    .filter((event) => [SAUDI_LEAGUE_ID, WORLD_CUP_LEAGUE_ID].includes(event.idLeague));
  const saudiUpcoming = (saudiData.events || [])
    .filter((event) => event.idLeague === SAUDI_LEAGUE_ID && getEventDateKey(event) >= today);
  const sportsDbWorldCup = (worldCupData.events || [])
    .filter((event) => event.idLeague === WORLD_CUP_LEAGUE_ID);
  const worldCupUpcoming = mergeWorldCupFixtures(sportsDbWorldCup, githubWorldCup)
    .filter((event) => getEventDateKey(event) >= today);

  return [
    ...todayMatches,
    ...saudiUpcoming,
    ...worldCupUpcoming
  ]
    .filter(isNotifiableMatch)
    .filter((event) => getMatchKickoffDate(event))
    .sort(compareSportsDbEvents);
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function resultValue(result, fallback, warning) {
  if (result.status === 'fulfilled') return result.value || fallback;
  logger.warn(warning, { message: result.reason?.message || String(result.reason || '') });
  return fallback;
}

async function fetchWorldCupGithubFixtures() {
  const [matches, teams] = await Promise.all([
    fetchJson('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.matches.json'),
    fetchJson('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.teams.json')
  ]);
  const teamsById = new Map((teams || []).map((team) => [String(team.id), team]));

  return (matches || []).map((match) => normalizeGithubWorldCupMatch(match, teamsById));
}

function normalizeGithubWorldCupMatch(match, teamsById) {
  const home = teamsById.get(String(match.home_team_id));
  const away = teamsById.get(String(match.away_team_id));
  const dateParts = parseWorldCupLocalDate(match.local_date);

  return {
    idEvent: `github-wc2026-${match.id}`,
    idLeague: WORLD_CUP_LEAGUE_ID,
    strHomeTeam: home?.name_en || '',
    strAwayTeam: away?.name_en || '',
    dateEvent: dateParts.date,
    dateEventLocal: dateParts.date,
    strTime: dateParts.time,
    strTimeLocal: dateParts.time,
    strStatus: String(match.finished).toUpperCase() === 'TRUE' ? 'FT' : 'NS'
  };
}


const TEAM_AR_NAMES = {
  "Saudi Arabia":"السعودية",
  "Qatar":"قطر",
  "United Arab Emirates":"الإمارات",
  "UAE":"الإمارات",
  "Iraq":"العراق",
  "Jordan":"الأردن",
  "Oman":"عُمان",
  "Bahrain":"البحرين",
  "Kuwait":"الكويت",
  "Yemen":"اليمن",

  "Argentina":"الأرجنتين",
  "Brazil":"البرازيل",
  "Uruguay":"أوروغواي",
  "Paraguay":"باراغواي",
  "Chile":"تشيلي",
  "Colombia":"كولومبيا",
  "Ecuador":"الإكوادور",

  "United States":"أمريكا",
  "USA":"أمريكا",
  "Mexico":"المكسيك",
  "Canada":"كندا",

  "England":"إنجلترا",
  "France":"فرنسا",
  "Spain":"إسبانيا",
  "Germany":"ألمانيا",
  "Italy":"إيطاليا",
  "Portugal":"البرتغال",
  "Netherlands":"هولندا",
  "Belgium":"بلجيكا",
  "Croatia":"كرواتيا",
  "Switzerland":"سويسرا",

  "Morocco":"المغرب",
  "Tunisia":"تونس",
  "Algeria":"الجزائر",
  "Egypt":"مصر",
  "Senegal":"السنغال",
  "Cameroon":"الكاميرون",
  "Nigeria":"نيجيريا",

  "Japan":"اليابان",
  "South Korea":"كوريا الجنوبية",
  "Australia":"أستراليا",
  "Iran":"إيران",
  "Uzbekistan":"أوزبكستان",

  "Al Hilal":"الهلال",
  "Al Nassr":"النصر",
  "Al Ittihad":"الاتحاد",
  "Al Ahli":"الأهلي",
  "Al Shabab":"الشباب",
  "Al Ettifaq":"الاتفاق",
  "Al Taawoun":"التعاون",
  "Al Fateh":"الفتح",
  "Al Fayha":"الفيحاء",
  "Al Raed":"الرائد",
  "Al Khaleej":"الخليج",
  "Damac":"ضمك",
  "Al Okhdood":"الأخدود",
  "Al Wehda":"الوحدة",
  "Al Riyadh":"الرياض",
  "Al Qadsiah":"القادسية",
  "Al Kholood":"الخلود",
  "Al Orobah":"العروبة",

  "Al-Ahli":"الأهلي",
  "Al-Hilal":"الهلال",
  "Al-Nassr":"النصر",
  "Al-Ittihad":"الاتحاد"
};

function translateTeamName(name = "") {
  const clean = String(name).trim();
  return TEAM_AR_NAMES[clean] || clean;
}


function getMatchNotificationTeams(match = {}) {
  const homeTeam = cleanMatchTeamName(
    match.homeTeam ||
    match.teamHome ||
    match.strHomeTeam ||
    match.home_team ||
    match.home?.name
  );
  const awayTeam = cleanMatchTeamName(
    match.awayTeam ||
    match.teamAway ||
    match.strAwayTeam ||
    match.away_team ||
    match.away?.name
  );

  if (!homeTeam || !awayTeam) return null;
  return {
    homeTeam: translateTeamName(homeTeam),
    awayTeam: translateTeamName(awayTeam)
  };
}

function cleanMatchTeamName(value) {
  const teamName = String(value || '').trim();
  if (!teamName || /^(tbd|فريق|-|null|undefined|\[object Object\])$/i.test(teamName)) return '';
  return teamName;
}

function renderMatchNotification(template, teams) {
  return template
    .replace('{{homeTeam}}', teams.homeTeam)
    .replace('{{awayTeam}}', teams.awayTeam);
}

async function getSaudiLeagueSeason() {
  try {
    const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/lookupleague.php?id=${SAUDI_LEAGUE_ID}`);
    return data.leagues?.[0]?.strCurrentSeason || '2025-2026';
  } catch {
    return '2025-2026';
  }
}

function mergeWorldCupFixtures(primary = [], fallback = []) {
  const merged = new Map();
  fallback.forEach((event) => merged.set(getMatchKey(event), event));
  primary.forEach((event) => merged.set(getMatchKey(event), event));
  return Array.from(merged.values());
}

function getMatchKey(event) {
  return [
    getEventDateKey(event),
    event.strTimeLocal || event.strTime || '',
    event.homeTeam || event.teamHome || event.strHomeTeam || event.home_team || event.home?.name || '',
    event.awayTeam || event.teamAway || event.strAwayTeam || event.away_team || event.away?.name || ''
  ].join('|');
}

function compareSportsDbEvents(a, b) {
  const firstKickoff = getMatchKickoffDate(a)?.getTime() || 0;
  const secondKickoff = getMatchKickoffDate(b)?.getTime() || 0;
  return firstKickoff - secondKickoff;
}

function isNotifiableMatch(event = {}) {
  const status = String(event.strStatus || '').toUpperCase();
  return !['FT', 'AET', 'PEN', 'CANC', 'CANCELLED', 'PST', 'POSTPONED', 'ABD', 'SUSP'].includes(status);
}

function getMatchKickoffDate(event = {}) {
  const dateValue = getEventDateKey(event);
  const rawTime = event.strTimeLocal || event.strTime || '00:00:00';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;

  const timeValue = normalizeMatchTime(rawTime);
  const kickoff = new Date(`${dateValue}T${timeValue}+03:00`);
  return Number.isNaN(kickoff.getTime()) ? null : kickoff;
}

function normalizeMatchTime(value = '') {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return '00:00:00';

  const hours = String(Math.min(Number(match[1]), 23)).padStart(2, '0');
  const minutes = String(Math.min(Number(match[2]), 59)).padStart(2, '0');
  const seconds = String(Math.min(Number(match[3] || 0), 59)).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function getEventDateKey(event) {
  return event.dateEventLocal || event.dateEvent || '';
}

function parseWorldCupLocalDate(value = '') {
  const [dateValue = '', timeValue = ''] = String(value).split(' ');
  const [month, day, year] = dateValue.split('/');
  const date = year && month && day
    ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    : '';
  const time = timeValue ? `${timeValue}:00`.slice(0, 8) : '';
  return { date, time };
}

function getLocalDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

function toDocId(value) {
  return Buffer.from(String(value)).toString('base64url');
}
