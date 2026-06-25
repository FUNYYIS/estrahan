const admin = require('firebase-admin');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const {
  buildUpcomingMatchesFromSources,
  chunk,
  getLocalDateKey,
  getMatchKey,
  getMatchKickoffDate,
  getMatchNotificationTeams,
  isNotifiableMatch,
  parseWorldCupLocalDate,
  renderMatchNotification,
  toDocId
} = require('./match-helpers');
const { createInMemoryRateLimiter } = require('./rate-limit');

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
const callableRateLimiter = createInMemoryRateLimiter({ maxEntries: 500 });
const RATE_LIMITS = {
  adminTestNotification: { limit: 12, windowMs: 60 * 1000 },
  adminBroadcastNotification: { limit: 5, windowMs: 60 * 1000 },
  adminDebugNotification: { limit: 10, windowMs: 60 * 1000 },
  memberManagement: { limit: 20, windowMs: 60 * 1000 },
  completeRegistration: { limit: 5, windowMs: 10 * 60 * 1000 }
};

exports.checkUpcomingMatches = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'Asia/Riyadh',
    region: 'us-central1'
  },
  async () => {
    try {
      const upcomingMatches = await getUpcomingMatches();
      if (!upcomingMatches.length) return;

      const notificationWindows = [
        { minutes: 60, min: 55, max: 65 },
        { minutes: 15, min: 10, max: 20 }
      ];

      for (const match of upcomingMatches) {
        try {
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
            logger.info('Skipped match notification because team names are missing.', {
              operation: 'checkUpcomingMatches',
              matchIdentifier: getMatchKey(match)
            });
            continue;
          }

          const matchKey = getMatchKey(match);
          const stateKey = `${matchKey}-${windowConfig.minutes}`;
          const stateRef = db.collection('matchNotificationState').doc(toDocId(stateKey));
          const stateDoc = await stateRef.get();
          if (stateDoc.exists) continue;

          const tokenRecords = await getTokenRecordsByTopic('matches');

          if (!tokenRecords.length) {
            logger.info('No FCM tokens subscribed to match notifications.', {
              operation: 'checkUpcomingMatches',
              matchIdentifier: matchKey
            });
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
        } catch (error) {
          logMatchScheduleError(error, {
            operation: 'checkUpcomingMatches.processMatch',
            matchIdentifier: getMatchKey(match)
          });
        }
      }
    } catch (error) {
      logMatchScheduleError(error, {
        operation: 'checkUpcomingMatches'
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
      if (settings.prayerNotificationsEnabled !== true) return;

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
      if (settings.paymentReminderEnabled !== true) return;

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
    assertCallableRateLimit(request, 'sendAdminTestNotification', RATE_LIMITS.adminTestNotification);

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

    assertNotificationDeliveryResult(result);
    return result;
  }
);

exports.sendAdminBroadcastNotification = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);
    assertCallableRateLimit(request, 'sendAdminBroadcastNotification', RATE_LIMITS.adminBroadcastNotification);

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
    assertCallableRateLimit(request, 'debugPrayerNotification', RATE_LIMITS.adminDebugNotification);

    const mode = request.data?.mode === 'force' ? 'force' : 'dryRun';
    const settings = await getAppSettings();
    const city = cleanSettingText(settings.prayerCity, 'Jeddah');
    const country = cleanSettingText(settings.prayerCountry, 'Saudi Arabia');
    const minutesBefore = clampNumber(settings.prayerReminderMinutes, 1, 60, 10);
    const dateKey = getLocalDateKey();
    const timings = await fetchPrayerTimings(city, country);

    const requestedPrayerKey = String(request.data?.prayerKey || '');
    const nowMs = Date.now();

    let selectedPrayer = null;

    if (Object.prototype.hasOwnProperty.call(PRAYER_NAMES, requestedPrayerKey)) {
      selectedPrayer = {
        key: requestedPrayerKey,
        name: PRAYER_NAMES[requestedPrayerKey],
        time: timings[requestedPrayerKey],
        dateKey
      };
    } else {
      const upcoming = Object.entries(PRAYER_NAMES)
        .map(([key, name]) => ({
          key,
          name,
          time: timings[key],
          dateKey,
          date: parseRiyadhDateTime(dateKey, timings[key])
        }))
        .filter((item) => item.date && item.date.getTime() >= nowMs)
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      selectedPrayer = upcoming[0] || {
        key: 'Fajr',
        name: PRAYER_NAMES.Fajr,
        time: timings.Fajr,
        dateKey: getLocalDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000))
      };
    }

    const subscribedRecords = await getTokenRecordsByTopic('prayer');
    const adminRecords = await getTokenRecordsForUser(ADMIN_UID);

    const preview = {
      mode,
      city,
      country,
      prayerKey: selectedPrayer.key,
      prayerName: selectedPrayer.name,
      prayerTime: selectedPrayer.time,
      prayerDate: selectedPrayer.dateKey,
      reminderMinutes: minutesBefore,
      targetedTokens: mode === 'force'
        ? adminRecords.length
        : subscribedRecords.length,
      targetedUsers: mode === 'force'
        ? Number(adminRecords.length > 0)
        : new Set(subscribedRecords.map((record) => record.uid).filter(Boolean)).size,
      successCount: 0,
      failureCount: 0,
      deletedInvalidTokens: 0
    };

    if (mode === 'dryRun') {
      return preview;
    }

    if (!adminRecords.length) {
      throw new HttpsError(
        'failed-precondition',
        'لا يوجد جهاز مسجل للمشرف. افتح إعدادات الإشعارات وسجّل الجهاز أولاً.'
      );
    }

    const result = await sendNotificationToTokenRecords(
      adminRecords,
      buildPrayerReminderMessage(selectedPrayer.name, minutesBefore)
    );

    assertNotificationDeliveryResult(result);
    return { ...preview, ...result };
  }
);

exports.debugPaymentReminder = onCall(
  {
    region: 'us-central1'
  },
  async (request) => {
    assertAdmin(request);
    assertCallableRateLimit(request, 'debugPaymentReminder', RATE_LIMITS.adminDebugNotification);

    const mode = request.data?.mode === 'force' ? 'force' : 'dryRun';
    const settings = await getAppSettings();
    const audience = settings.paymentReminderMode === 'lateOnly'
      ? 'lateOnly'
      : 'all';

    const audienceRecords = audience === 'lateOnly'
      ? await getLatePaymentTokenRecords()
      : await getTokenRecordsByTopic('payments');

    const adminRecords = await getTokenRecordsForUser(ADMIN_UID);

    const preview = {
      mode,
      audience,
      amount: clampNumber(settings.qattahAmount, 0, 100000, 100),
      targetedTokens: mode === 'force'
        ? adminRecords.length
        : audienceRecords.length,
      targetedUsers: mode === 'force'
        ? Number(adminRecords.length > 0)
        : new Set(audienceRecords.map((record) => record.uid).filter(Boolean)).size,
      successCount: 0,
      failureCount: 0,
      deletedInvalidTokens: 0
    };

    if (mode === 'dryRun') {
      return preview;
    }

    if (!adminRecords.length) {
      throw new HttpsError(
        'failed-precondition',
        'لا يوجد جهاز مسجل للمشرف. افتح إعدادات الإشعارات وسجّل الجهاز أولاً.'
      );
    }

    const result = await sendNotificationToTokenRecords(
      adminRecords,
      buildPaymentReminderMessage(settings)
    );

    assertNotificationDeliveryResult(result);
    return { ...preview, ...result };
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
    assertCallableRateLimit(request, 'completeRegistration', RATE_LIMITS.completeRegistration);

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
    assertCallableRateLimit(request, 'addManualMember', RATE_LIMITS.memberManagement);

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
    assertCallableRateLimit(request, 'updateMemberPaymentStatus', RATE_LIMITS.memberManagement);

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
    assertCallableRateLimit(request, 'updateMemberName', RATE_LIMITS.memberManagement);

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
    assertCallableRateLimit(request, 'setMemberDisabled', RATE_LIMITS.memberManagement);

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
    assertCallableRateLimit(request, 'resetMemberAvatar', RATE_LIMITS.memberManagement);

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
    assertCallableRateLimit(request, 'deleteMember', RATE_LIMITS.memberManagement);

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

function assertCallableRateLimit(request, operation, config) {
  const result = callableRateLimiter.check({
    uid: request.auth?.uid,
    operation,
    limit: config?.limit,
    windowMs: config?.windowMs
  });

  if (!result.ok) {
    throw new HttpsError(result.code, result.message);
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
  const usersSnapshot = await db.collection('users').get();

  const lateUserIds = new Set(
    usersSnapshot.docs
      .filter((userDoc) => userDoc.data()?.paymentStatus !== 'paid')
      .map((userDoc) => userDoc.id)
  );

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

function assertNotificationDeliveryResult(result) {
  if (
    !result ||
    result.targetedTokens < 1 ||
    (result.successCount === 0 && result.failureCount === 0)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'لم يتم العثور على جهاز صالح لإرسال الإشعار إليه.'
    );
  }

  if (result.successCount === 0) {
    throw new HttpsError(
      'unavailable',
      `فشل إيصال الإشعار إلى جميع الأجهزة المستهدفة (${result.failureCount}).`
    );
  }
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

function logMatchScheduleError(error, context = {}, level = 'error') {
  const payload = {
    operation: context.operation || 'checkUpcomingMatches',
    dataSource: context.dataSource || null,
    leagueId: context.leagueId || null,
    season: context.season || null,
    matchIdentifier: context.matchIdentifier || null,
    errorMessage: error?.message || String(error || ''),
    errorCode: error?.code || null
  };

  if (level === 'warn') {
    logger.warn('Match notification workflow warning.', payload);
    return;
  }

  logger.error('Match notification workflow failed.', payload);
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

  const todayData = resultValue(todayResult, { events: [] }, {
    operation: 'getUpcomingMatches',
    dataSource: 'TheSportsDB daily events',
    leagueId: `${SAUDI_LEAGUE_ID},${WORLD_CUP_LEAGUE_ID}`,
    season: today
  });
  const saudiData = resultValue(saudiResult, { events: [] }, {
    operation: 'getUpcomingMatches',
    dataSource: 'TheSportsDB Saudi season',
    leagueId: SAUDI_LEAGUE_ID,
    season: saudiSeason
  });
  const worldCupData = resultValue(worldCupResult, { events: [] }, {
    operation: 'getUpcomingMatches',
    dataSource: 'TheSportsDB World Cup season',
    leagueId: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON
  });
  const githubWorldCup = resultValue(githubResult, [], {
    operation: 'getUpcomingMatches',
    dataSource: 'GitHub World Cup fallback',
    leagueId: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON
  });

  return buildUpcomingMatchesFromSources({
    todayData,
    saudiData,
    worldCupData,
    githubWorldCup,
    today,
    saudiLeagueId: SAUDI_LEAGUE_ID,
    worldCupLeagueId: WORLD_CUP_LEAGUE_ID
  });
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

function resultValue(result, fallback, context) {
  if (result.status === 'fulfilled') return result.value || fallback;
  logMatchScheduleError(result.reason, context, 'warn');
  return fallback;
}

async function fetchWorldCupGithubFixtures() {
  const [matchesResult, teamsResult] = await Promise.allSettled([
    fetchJson('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.matches.json'),
    fetchJson('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.teams.json')
  ]);

  const matches = resultValue(matchesResult, [], {
    operation: 'fetchWorldCupGithubFixtures',
    dataSource: 'GitHub football.matches.json',
    leagueId: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON
  });
  const teams = resultValue(teamsResult, [], {
    operation: 'fetchWorldCupGithubFixtures',
    dataSource: 'GitHub football.teams.json',
    leagueId: WORLD_CUP_LEAGUE_ID,
    season: WORLD_CUP_SEASON
  });

  if (!Array.isArray(matches) || !matches.length) return [];

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


async function getSaudiLeagueSeason() {
  try {
    const data = await fetchJson(`https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/lookupleague.php?id=${SAUDI_LEAGUE_ID}`);
    return data.leagues?.[0]?.strCurrentSeason || '2025-2026';
  } catch (error) {
    logMatchScheduleError(error, {
      operation: 'getSaudiLeagueSeason',
      dataSource: 'TheSportsDB lookupleague',
      leagueId: SAUDI_LEAGUE_ID,
      season: '2025-2026'
    }, 'warn');
    return '2025-2026';
  }
}
