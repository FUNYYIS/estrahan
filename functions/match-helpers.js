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

function buildUpcomingMatchesFromSources({
  todayData = {},
  saudiData = {},
  worldCupData = {},
  githubWorldCup = [],
  today = '',
  saudiLeagueId = '',
  worldCupLeagueId = ''
} = {}) {
  const todayEvents = Array.isArray(todayData.events) ? todayData.events : [];
  const saudiEvents = Array.isArray(saudiData.events) ? saudiData.events : [];
  const worldCupEvents = Array.isArray(worldCupData.events) ? worldCupData.events : [];
  const githubEvents = Array.isArray(githubWorldCup) ? githubWorldCup : [];
  const isValidEvent = (event) => event && typeof event === 'object' && !Array.isArray(event);

  const todayMatches = todayEvents
    .filter(isValidEvent)
    .filter((event) => [saudiLeagueId, worldCupLeagueId].includes(event.idLeague));
  const saudiUpcoming = saudiEvents
    .filter(isValidEvent)
    .filter((event) => event.idLeague === saudiLeagueId && getEventDateKey(event) >= today);
  const sportsDbWorldCup = worldCupEvents
    .filter(isValidEvent)
    .filter((event) => event.idLeague === worldCupLeagueId);
  const worldCupUpcoming = mergeWorldCupFixtures(
    sportsDbWorldCup,
    githubEvents.filter(isValidEvent)
  )
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

function mergeWorldCupFixtures(primary = [], fallback = []) {
  const merged = new Map();
  fallback.forEach((event) => merged.set(getMatchKey(event), event));
  primary.forEach((event) => merged.set(getMatchKey(event), event));
  return Array.from(merged.values());
}

function getMatchKey(event = {}) {
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

function getEventDateKey(event = {}) {
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

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

module.exports = {
  buildUpcomingMatchesFromSources,
  chunk,
  cleanMatchTeamName,
  compareSportsDbEvents,
  getEventDateKey,
  getLocalDateKey,
  getMatchKey,
  getMatchKickoffDate,
  getMatchNotificationTeams,
  isNotifiableMatch,
  mergeWorldCupFixtures,
  normalizeMatchTime,
  parseWorldCupLocalDate,
  renderMatchNotification,
  toDocId,
  translateTeamName
};
