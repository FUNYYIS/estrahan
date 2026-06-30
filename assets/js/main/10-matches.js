async function loadMatches(container, limit = 10, compact = false) {
    if (!container) container = document.getElementById('matches-list');
    if (!container) return;

    container.innerHTML = `<p class="text-center">جاري تحميل المباريات...</p>`;

    const THE_SPORTS_DB_KEY = '3';
    const SAUDI_LEAGUE_ID = '4668';
    const WORLD_CUP_LEAGUE_ID = '4429';
    const WORLD_CUP_SEASON = '2026';
    const today = getLocalDateKey();

    try {
        const saudiSeason = await getSaudiLeagueSeason(THE_SPORTS_DB_KEY, SAUDI_LEAGUE_ID);
        const todayUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsday.php?d=${today}&s=Soccer`;
        const saudiSeasonUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsseason.php?id=${SAUDI_LEAGUE_ID}&s=${encodeURIComponent(saudiSeason)}`;
        const worldCupSeasonUrl = `https://www.thesportsdb.com/api/v1/json/${THE_SPORTS_DB_KEY}/eventsseason.php?id=${WORLD_CUP_LEAGUE_ID}&s=${WORLD_CUP_SEASON}`;
        const [todayResult, saudiResult, worldCupResult, githubResult] = await Promise.allSettled([
            fetchJsonWithTimeout(todayUrl),
            fetchJsonWithTimeout(saudiSeasonUrl),
            fetchJsonWithTimeout(worldCupSeasonUrl),
            fetchWorldCupGithubFixtures()
        ]);

        const todayData = getSettledValue(todayResult, { events: [] }, 'مباريات اليوم غير متاحة حالياً.');
        const saudiData = getSettledValue(saudiResult, { events: [] }, 'جدول الدوري السعودي غير متاح حالياً.');
        const worldCupData = getSettledValue(worldCupResult, { events: [] }, 'جدول كأس العالم من TheSportsDB غير متاح حالياً.');
        const githubWorldCup = getSettledValue(githubResult, [], 'جدول كأس العالم الاحتياطي غير متاح حالياً.');

        const saudiEvents = (saudiData.events || [])
            .filter((event) => event.idLeague === SAUDI_LEAGUE_ID)
            .sort(compareSportsDbEvents);
        const todayMatches = (todayData.events || [])
            .filter((event) => [SAUDI_LEAGUE_ID, WORLD_CUP_LEAGUE_ID].includes(event.idLeague))
            .slice(0, limit);
        const saudiUpcoming = saudiEvents.filter((event) => getEventDateKey(event) > today).slice(0, limit);
        const sportsDbWorldCup = (worldCupData.events || [])
            .filter((event) => event.idLeague === WORLD_CUP_LEAGUE_ID);
        const worldCupUpcoming = mergeWorldCupFixtures(sportsDbWorldCup, githubWorldCup)
            .filter((event) => getEventDateKey(event) >= today)
            .sort(compareSportsDbEvents)
            .slice(0, limit);
        queueNextMatchNotification([
            ...todayMatches,
            ...saudiUpcoming,
            ...worldCupUpcoming
        ]);

        const totalMatches = todayMatches.length + saudiUpcoming.length + worldCupUpcoming.length;

        if (compact) {
            const compactMatches = [
                ...todayMatches,
                ...saudiUpcoming,
                ...worldCupUpcoming
            ].slice(0, limit);
            container.innerHTML = compactMatches.length
                ? compactMatches.map(renderSportsDbMatchCard).join('')
                : '<div class="empty card">ما فيه مباريات متاحة الآن.</div>';
            return;
        }

        if (totalMatches === 0) {
            container.innerHTML = `
                <div class="panel">
                    <p class="text-center">ما قدرنا نجيب المباريات الآن. جرّب بعد قليل.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            ${todayMatches.length ? `
            <div class="panel">
                <div class="panel-head"><h2>مباريات اليوم</h2><span class="badge scheduled">اليوم</span></div>
                <div class="cards-grid matches-grid">
                    ${todayMatches.map(renderSportsDbMatchCard).join('')}
                </div>
            </div>` : ''}
            ${saudiUpcoming.length ? `
            <div class="panel">
                <div class="panel-head"><h2>الدوري السعودي</h2><span class="badge scheduled">قادمة</span></div>
                <div class="cards-grid matches-grid">
                    ${saudiUpcoming.map(renderSportsDbMatchCard).join('')}
                </div>
            </div>` : ''}
            ${worldCupUpcoming.length ? `
            <div class="panel">
                <div class="panel-head"><h2>كأس العالم 2026</h2><span class="badge scheduled">الجدول</span></div>
                <div class="cards-grid matches-grid">
                    ${worldCupUpcoming.map(renderSportsDbMatchCard).join('')}
                </div>
            </div>` : ''}
        `;

    } catch (error) {
        console.error("Error fetching matches:", error);
        container.innerHTML = `<p class="text-center">ما قدرنا نجيب المباريات. جرّب مرة ثانية.</p>`;
    }
}

async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
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

function getSettledValue(result, fallback, warning) {
    if (result.status === 'fulfilled') return result.value || fallback;
    console.warn(warning, result.reason);
    return fallback;
}

async function fetchWorldCupGithubFixtures() {
    const [matchesResponse, teamsResponse] = await Promise.all([
        fetch('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.matches.json'),
        fetch('https://raw.githubusercontent.com/rezarahiminia/worldcup2026/main/football.teams.json')
    ]);

    if (!matchesResponse.ok || !teamsResponse.ok) {
        throw new Error(`GitHub World Cup fixtures returned ${matchesResponse.status}/${teamsResponse.status}`);
    }

    const [matches, teams] = await Promise.all([
        matchesResponse.json(),
        teamsResponse.json()
    ]);
    const teamsById = new Map((teams || []).map((team) => [String(team.id), team]));

    return (matches || []).map((match) => normalizeGithubWorldCupMatch(match, teamsById));
}

function normalizeGithubWorldCupMatch(match, teamsById) {
    const home = teamsById.get(String(match.home_team_id));
    const away = teamsById.get(String(match.away_team_id));
    const dateParts = parseWorldCupLocalDate(match.local_date);
    const isFinished = String(match.finished).toUpperCase() === 'TRUE';
    const isLive = match.time_elapsed && !['notstarted', 'finished'].includes(String(match.time_elapsed).toLowerCase());

    return {
        idEvent: `github-wc2026-${match.id}`,
        idLeague: '4429',
        strLeague: 'FIFA World Cup 2026',
        strSeason: '2026',
        strSource: 'GitHub schedule',
        strHomeTeam: home?.name_en || 'TBD',
        strAwayTeam: away?.name_en || 'TBD',
        strHomeTeamBadge: safeFlagUrl(home?.iso2 || home?.fifa_code),
        strAwayTeamBadge: safeFlagUrl(away?.iso2 || away?.fifa_code),
        intHomeScore: isFinished ? Number(match.home_score || 0) : null,
        intAwayScore: isFinished ? Number(match.away_score || 0) : null,
        dateEvent: dateParts.date,
        dateEventLocal: dateParts.date,
        strTime: dateParts.time,
        strTimeLocal: dateParts.time,
        strStatus: isLive ? 'Live' : isFinished ? 'FT' : 'NS',
        strGroup: match.group,
        intRound: match.matchday
    };
}

function parseWorldCupLocalDate(value = '') {
    // Handle ISO (2026-06-12T15:00), ISO space (2026-06-12 15:00), and MM/DD/YYYY formats
    const str = String(value).trim().replace('T', ' ');
    const spaceIdx = str.indexOf(' ');
    const dateStr = spaceIdx >= 0 ? str.slice(0, spaceIdx) : str;
    const timeStr = spaceIdx >= 0 ? str.slice(spaceIdx + 1) : '';

    let date = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        date = dateStr;
    } else {
        const [month, day, year] = dateStr.split('/');
        if (year && month && day) {
            date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
    }

    const timeMatch = timeStr.match(/\d{1,2}:\d{2}(?::\d{2})?/);
    const time = timeMatch ? `${timeMatch[0]}:00`.slice(0, 8) : '';
    return { date, time };
}

function mergeWorldCupFixtures(primary = [], fallback = []) {
    const merged = new Map();
    fallback.forEach((event) => merged.set(getWorldCupMatchKey(event), event));
    primary.forEach((event) => merged.set(getWorldCupMatchKey(event), event));
    return Array.from(merged.values());
}

function getWorldCupMatchKey(event) {
    return [
        getEventDateKey(event),
        (event.strHomeTeam || '').toLowerCase(),
        (event.strAwayTeam || '').toLowerCase()
    ].join('|');
}

function compareSportsDbEvents(a, b) {
    const firstKickoff = getSportsDbKickoffDate(a)?.getTime() || 0;
    const secondKickoff = getSportsDbKickoffDate(b)?.getTime() || 0;
    return firstKickoff - secondKickoff;
}

function safeFlagUrl(code) {
    const normalized = String(code || '').trim().toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z]{3})?$/.test(normalized)) return '';
    return `https://flagcdn.com/w80/${normalized}.png`;
}

async function getSaudiLeagueSeason(apiKey, leagueId) {
    const response = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/lookupleague.php?id=${leagueId}`);
    if (!response.ok) return '2025-2026';
    const data = await response.json();
    return data.leagues?.[0]?.strCurrentSeason || '2025-2026';
}

function getLocalDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function getEventDateKey(event = {}) {
    const kickoff = getSportsDbKickoffDate(event);
    if (kickoff) return getLocalDateKey(kickoff);
    return event.dateEvent || event.dateEventLocal || '';
}

function queueNextMatchNotification(matches = []) {
    if (!matches.length || localStorage.getItem('al-istiraha-matches-notification') !== 'true') return;
    console.log('Match notifications are scheduled through Firebase Cloud Functions.');
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
    return { homeTeam, awayTeam };
}

function cleanMatchTeamName(value) {
    const teamName = String(value || '').trim();
    if (!teamName || /^(tbd|فريق|-|null|undefined|\[object Object\])$/i.test(teamName)) return '';
    return teamName;
}

function getSportsDbKickoffDate(event = {}) {
    const timestampValue = String(event.strTimestamp || '').trim();
    if (timestampValue) {
        const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestampValue)
            ? timestampValue
            : `${timestampValue}Z`;
        const date = new Date(normalized);
        if (!Number.isNaN(date.getTime())) return date;
    }

    const isGithubWorldCupFallback = String(event.idEvent || '').startsWith('github-wc2026-');
    const utcDateValue = String(event.dateEvent || '').trim();
    const utcTimeMatch = String(event.strTime || '').match(/\d{1,2}:\d{2}(?::\d{2})?/);

    if (!isGithubWorldCupFallback && /^\d{4}-\d{2}-\d{2}$/.test(utcDateValue) && utcTimeMatch) {
        const utcTime = utcTimeMatch[0].length === 5 ? `${utcTimeMatch[0]}:00` : utcTimeMatch[0];
        const utcKickoff = new Date(`${utcDateValue}T${utcTime}Z`);
        if (!Number.isNaN(utcKickoff.getTime())) return utcKickoff;
    }

    const localDateValue = String(event.dateEventLocal || event.dateEvent || '').trim();
    const localTimeMatch = String(event.strTimeLocal || event.strTime || '').match(/\d{1,2}:\d{2}(?::\d{2})?/);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDateValue) || !localTimeMatch) return null;

    const localTime = localTimeMatch[0].length === 5 ? `${localTimeMatch[0]}:00` : localTimeMatch[0];
    const localKickoff = new Date(`${localDateValue}T${localTime}+03:00`);
    return Number.isNaN(localKickoff.getTime()) ? null : localKickoff;
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

function renderSportsDbMatchCard(event) {
    const status = event.strStatus || (event.intHomeScore !== null && event.intAwayScore !== null ? 'FT' : 'NS');
    const isFinished = status === 'FT' || (event.intHomeScore !== null && event.intAwayScore !== null);
    const isLive = ['Live', '1H', '2H', 'HT', 'ET', 'P'].includes(status);
    const statusClass = isLive ? 'live' : isFinished ? 'done' : 'scheduled';
    const statusLabel = isLive ? 'مباشر' : isFinished ? 'انتهت' : 'قادمة';
    const score = isFinished
        ? `${event.intHomeScore ?? 0} - ${event.intAwayScore ?? 0}`
        : formatSaudiMatchTime(event);
    const homeLogo = safeExternalUrl(event.strHomeTeamBadge, '');
    const awayLogo = safeExternalUrl(event.strAwayTeamBadge, '');
    const homeMark = renderTeamMark(homeLogo, event.strHomeTeam);
    const awayMark = renderTeamMark(awayLogo, event.strAwayTeam);

    return `
        <article class="match-card card">
            <span class="badge ${statusClass}">${statusLabel}</span>
            <p class="muted">${escapeHtml(event.strLeague || 'Saudi Pro League')}</p>
            <div class="match-teams">
                <span>${homeMark} ${escapeHtml(event.strHomeTeam || 'فريق')}</span>
                <span>${awayMark} ${escapeHtml(event.strAwayTeam || 'فريق')}</span>
            </div>
            <div class="match-score">${escapeHtml(score)}</div>
            <p class="muted">${escapeHtml(formatSaudiMatchDate(event))} · بتوقيت السعودية</p>
        </article>
    `;
}

function renderTeamMark(src, teamName = '') {
    if (src) {
        return `<img src="${escapeHtml(src)}" alt="" class="team-logo" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
    }
    return `<span class="team-logo team-initial">${escapeHtml(getTeamInitial(teamName))}</span>`;
}

function getTeamInitial(teamName = '') {
    const clean = String(teamName || '').trim();
    return clean ? clean.slice(0, 2).toUpperCase() : 'FC';
}
