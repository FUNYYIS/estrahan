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
            .filter((event) => event.idLeague === WORLD_CUP_LEAGUE_ID)
            .map((event) => ({ ...event, strSource: 'TheSportsDB' }));
        const worldCupUpcoming = mergeWorldCupFixtures(sportsDbWorldCup, githubWorldCup)
            .filter((event) => getEventDateKey(event) >= today)
            .filter(matchHasKnownTeams)
            .sort(compareSportsDbEvents)
            .slice(0, limit);
        queueNextMatchNotification([
            ...todayMatches,
            ...saudiUpcoming,
            ...worldCupUpcoming
        ]);

        if (compact) {
            const compactMatches = [
                ...todayMatches,
                ...saudiUpcoming,
                ...worldCupUpcoming
            ].filter(matchHasKnownTeams).slice(0, limit);
            container.innerHTML = compactMatches.length
                ? compactMatches.map(renderSportsDbMatchCard).join('')
                : '<div class="empty card">ما فيه مباريات متاحة حالياً.</div>';
            bindMatchImageFallbacks(container);
            return;
        }

        container.innerHTML = `
            <div class="panel">
                <div class="panel-head"><h2>مباريات اليوم</h2><span class="badge scheduled">اليوم</span></div>
                <div class="cards-grid matches-grid">
                    ${todayMatches.length ? todayMatches.map(renderSportsDbMatchCard).join('') : '<div class="empty card">ما فيه مباريات اليوم.</div>'}
                </div>
            </div>
            <div class="panel">
                <div class="panel-head"><h2>الدوري السعودي</h2><span class="badge scheduled">قادمة</span></div>
                <div class="cards-grid matches-grid">
                    ${saudiUpcoming.length ? saudiUpcoming.map(renderSportsDbMatchCard).join('') : '<div class="empty card">ما فيه مباريات جاية للدوري السعودي حالياً.</div>'}
                </div>
            </div>
            <div class="panel">
                <div class="panel-head"><h2>كأس العالم 2026</h2><span class="badge scheduled">الجدول</span></div>
                <div class="cards-grid matches-grid">
                    ${worldCupUpcoming.length ? worldCupUpcoming.map(renderSportsDbMatchCard).join('') : '<div class="empty card">ما فيه جدول كأس العالم متاح حالياً.</div>'}
                </div>
            </div>
        `;
        bindMatchImageFallbacks(container);

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
        strHomeTeam: home?.name_en || 'لم يتحدد',
        strAwayTeam: away?.name_en || 'لم يتحدد',
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
    const [dateValue = '', timeValue = ''] = String(value).split(' ');
    const [month, day, year] = dateValue.split('/');
    const date = year && month && day
        ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        : '';
    const time = timeValue ? `${timeValue}:00`.slice(0, 8) : '';
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

const FIFA_TO_FLAG_CODE = {
    ksa: 'sa',
    sau: 'sa',
    usa: 'us',
    uae: 'ae',
    qatar: 'qa',
    qat: 'qa',
    kuwait: 'kw',
    kuw: 'kw',
    bahrain: 'bh',
    bhr: 'bh',
    oman: 'om',
    omn: 'om',
    jordan: 'jo',
    jor: 'jo',
    iraq: 'iq',
    irq: 'iq',
    egypt: 'eg',
    egy: 'eg',
    morocco: 'ma',
    mar: 'ma',
    tunisia: 'tn',
    tun: 'tn',
    algeria: 'dz',
    alg: 'dz',
    england: 'gb-eng',
    eng: 'gb-eng',
    wales: 'gb-wls',
    wal: 'gb-wls',
    scotland: 'gb-sct',
    sco: 'gb-sct',
    germany: 'de',
    ger: 'de',
    france: 'fr',
    fra: 'fr',
    spain: 'es',
    esp: 'es',
    portugal: 'pt',
    por: 'pt',
    argentina: 'ar',
    arg: 'ar',
    brazil: 'br',
    bra: 'br',
    mexico: 'mx',
    mex: 'mx',
    canada: 'ca',
    can: 'ca',
    japan: 'jp',
    jpn: 'jp',
    korea: 'kr',
    kor: 'kr',
    australia: 'au',
    aus: 'au',
    italy: 'it',
    ita: 'it',
    netherlands: 'nl',
    ned: 'nl',
    belgium: 'be',
    bel: 'be',
    croatia: 'hr',
    cro: 'hr',
    switzerland: 'ch',
    sui: 'ch',
    uruguay: 'uy',
    uru: 'uy',
    colombia: 'co',
    col: 'co'
};

function safeFlagUrl(code) {
    const normalized = String(code || '').trim().toLowerCase();
    if (!normalized) return '';

    const flagCode = FIFA_TO_FLAG_CODE[normalized] || normalized;

    if (!/^[a-z]{2}(?:-[a-z]{3})?$/.test(flagCode)) return '';
    return `https://flagcdn.com/w80/${flagCode}.png`;
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

    const homeTeam = normalizeMatchTeamName(event.strHomeTeam);
    const awayTeam = normalizeMatchTeamName(event.strAwayTeam);

    const homeLogo = matchTeamIsKnown(homeTeam) ? safeExternalUrl(event.strHomeTeamBadge, '') : '';
    const awayLogo = matchTeamIsKnown(awayTeam) ? safeExternalUrl(event.strAwayTeamBadge, '') : '';

    const homeMark = renderTeamMark(homeLogo, homeTeam);
    const awayMark = renderTeamMark(awayLogo, awayTeam);

    return `
        <article class="match-card card">
            <span class="badge ${statusClass}">${statusLabel}</span>
            <p class="muted">${escapeHtml(event.strLeague || 'Saudi Pro League')}${event.strSource ? ` · ${escapeHtml(event.strSource)}` : ''}</p>
            <div class="match-teams">
                <span>${homeMark} ${escapeHtml(homeTeam)}</span>
                <span>${awayMark} ${escapeHtml(awayTeam)}</span>
            </div>
            <div class="match-score">${escapeHtml(score)}</div>
            <p class="muted">${escapeHtml(formatSaudiMatchDate(event))} · بتوقيت السعودية</p>
        </article>
    `;
}

function normalizeMatchTeamName(value = '') {
    const team = String(value || '').trim();
    return matchTeamIsKnown(team) ? team : 'لم يتحدد';
}

function matchTeamIsKnown(value = '') {
    const team = String(value || '').trim().toLowerCase();
    if (!team) return false;
    return !/^(tbd|to be determined|unknown|null|undefined|لم يتحدد|فريق|-|\[object object\])$/i.test(team);
}

function matchHasKnownTeams(event = {}) {
    return matchTeamIsKnown(event.strHomeTeam) && matchTeamIsKnown(event.strAwayTeam);
}

function renderTeamMark(src, teamName = '') {
    const initial = getTeamInitial(teamName);

    if (src) {
        return `<img src="${escapeHtml(src)}" alt="" class="team-logo" data-team-initial="${escapeHtml(initial)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
    }

    return `<span class="team-logo team-initial">${escapeHtml(initial)}</span>`;
}

function bindMatchImageFallbacks(container) {
    container?.querySelectorAll('img.team-logo').forEach((image) => {
        image.addEventListener('error', () => {
            const fallback = document.createElement('span');
            fallback.className = 'team-logo team-initial';
            fallback.textContent = image.dataset.teamInitial || 'FC';
            image.replaceWith(fallback);
        }, { once: true });
    });
}

function getTeamInitial(teamName = '') {
    const clean = String(teamName || '').trim();
    if (!matchTeamIsKnown(clean)) return '—';
    return clean.slice(0, 2).toUpperCase();
}
