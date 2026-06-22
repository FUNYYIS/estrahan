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

exports.checkUpcomingMatches = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'Asia/Riyadh',
    region: 'us-central1'
  },
  async () => {
    const nextMatch = await getNextUpcomingMatch();
    if (!nextMatch) return;

    const teams = getMatchNotificationTeams(nextMatch);
    if (!teams) {
      console.log('Skipped match notification because team names are missing.');
      return;
    }

    const matchKey = getMatchKey(nextMatch);
    const stateRef = db.collection('matchNotificationState').doc(toDocId(matchKey));
    const stateDoc = await stateRef.get();
    if (stateDoc.exists) return;

    const tokenSnapshot = await db
      .collection('fcmTokens')
      .where('topics.matches', '==', true)
      .limit(500)
      .get();

    const tokens = tokenSnapshot.docs
      .map((doc) => doc.data().token)
      .filter(Boolean);

    if (!tokens.length) {
      logger.info('No FCM tokens subscribed to match notifications.');
      return;
    }

    const title = renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[0], teams);
    const body = renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[1], teams);

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title,
        body
      },
      data: {
        type: 'match',
        matchKey,
        homeTeam: teams.homeTeam,
        awayTeam: teams.awayTeam,
        link: '/index.html#matches'
      },
      webpush: {
        notification: {
          icon: '/assets/icons/icon-192.png',
          badge: '/assets/icons/icon-192.png',
          tag: `match-${toDocId(matchKey)}`,
          renotify: false
        }
      }
    });

    await stateRef.set({
      matchKey,
      homeTeam: teams.homeTeam,
      awayTeam: teams.awayTeam,
      successCount: response.successCount,
      failureCount: response.failureCount,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
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
    const tokens = await getTokensForUser(ADMIN_UID);

    return sendNotificationToTokens(tokens, {
      notification: {
        title: message.title,
        body: message.body
      },
      data: message.data,
      webpush: {
        notification: {
          icon: '/assets/icons/icon-192.png',
          badge: '/assets/icons/icon-192.png',
          tag: `admin-test-${type}-${Date.now()}`
        }
      }
    });
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

    const tokens = await getAllTokens();
    const result = await sendNotificationToTokens(tokens, {
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

async function buildAdminTestMessage(type) {
  if (type === 'match') {
    const nextMatch = await getNextUpcomingMatch();
    const teams = nextMatch ? getMatchNotificationTeams(nextMatch) : null;
    if (!teams) {
      console.log('Skipped match notification because team names are missing.');
      throw new HttpsError('failed-precondition', 'Skipped match notification because team names are missing.');
    }

    return {
      title: renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[0], teams),
      body: renderMatchNotification(MATCH_NOTIFICATION_TEMPLATES[1], teams),
      link: '/index.html#matches',
      data: {
        type: 'match',
        homeTeam: teams.homeTeam,
        awayTeam: teams.awayTeam,
        link: '/index.html#matches'
      }
    };
  }

  if (type === 'payment') {
    return {
      title: 'تنبيه القطة',
      body: 'تذكير من تطبيق الاستراحة بمتابعة القطة.',
      link: '/index.html#payments',
      data: {
        type: 'payment',
        link: '/index.html#payments'
      }
    };
  }

  if (type === 'prayer') {
    return {
      title: 'تنبيه الصلاة',
      body: 'تذكير من تطبيق الاستراحة بمتابعة مواقيت الصلاة.',
      link: '/index.html#prayer',
      data: {
        type: 'prayer',
        link: '/index.html#prayer'
      }
    };
  }

  return {
    title: 'تطبيق الاستراحة',
    body: 'وصل إشعار اختبار من تطبيق الاستراحة.',
    link: '/index.html#home',
    data: {
      type: 'general',
      link: '/index.html#home'
    }
  };
}

async function getTokensForUser(uid) {
  const snapshot = await db
    .collection('fcmTokens')
    .where('uid', '==', uid)
    .get();

  return docsToTokens(snapshot.docs);
}

async function getAllTokens() {
  const snapshot = await db.collection('fcmTokens').get();
  return docsToTokens(snapshot.docs);
}

function docsToTokens(docs) {
  return Array.from(new Set(
    docs
      .map((doc) => doc.data().token)
      .filter(Boolean)
  ));
}

async function sendNotificationToTokens(tokens, message) {
  if (!tokens.length) {
    return {
      successCount: 0,
      failureCount: 0
    };
  }

  let successCount = 0;
  let failureCount = 0;
  const chunks = chunk(tokens, 500);

  for (const tokenChunk of chunks) {
    const response = await admin.messaging().sendEachForMulticast({
      ...message,
      tokens: tokenChunk
    });
    successCount += response.successCount;
    failureCount += response.failureCount;
  }

  return {
    successCount,
    failureCount
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

async function getNextUpcomingMatch() {
  const today = getLocalDateKey();
  const saudiSeason = await getSaudiLeagueSeason();
  const todayUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsday.php?d=${today}&s=Soccer`;
  const saudiSeasonUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsseason.php?id=${SAUDI_LEAGUE_ID}&s=${encodeURIComponent(saudiSeason)}`;
  const worldCupSeasonUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsseason.php?id=${WORLD_CUP_LEAGUE_ID}&s=${WORLD_CUP_SEASON}`;

  const [todayData, saudiData, worldCupData, githubWorldCup] = await Promise.all([
    fetchJson(todayUrl),
    fetchJson(saudiSeasonUrl),
    fetchJson(worldCupSeasonUrl),
    fetchWorldCupGithubFixtures().catch((error) => {
      logger.warn('World Cup GitHub fallback unavailable.', error);
      return [];
    })
  ]);

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
    .filter((event) => !['FT', 'AET', 'PEN'].includes(String(event.strStatus || '').toUpperCase()))
    .sort(compareSportsDbEvents)[0] || null;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
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
  return `${getEventDateKey(a)} ${a.strTimeLocal || a.strTime || ''}`.localeCompare(`${getEventDateKey(b)} ${b.strTimeLocal || b.strTime || ''}`);
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
