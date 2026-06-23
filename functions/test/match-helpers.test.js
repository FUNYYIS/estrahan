const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildUpcomingMatchesFromSources,
  chunk,
  getMatchKey,
  getMatchKickoffDate,
  getMatchNotificationTeams,
  isNotifiableMatch,
  parseWorldCupLocalDate,
  renderMatchNotification,
  translateTeamName
} = require('../match-helpers');

test('translates known team names and trims unknown names', () => {
  assert.equal(translateTeamName('Saudi Arabia'), 'السعودية');
  assert.equal(translateTeamName(' Al Hilal '), 'الهلال');
  assert.equal(translateTeamName('Custom FC'), 'Custom FC');
});

test('builds notification teams from supported API field names', () => {
  assert.deepEqual(getMatchNotificationTeams({
    strHomeTeam: 'Saudi Arabia',
    strAwayTeam: 'Japan'
  }), {
    homeTeam: 'السعودية',
    awayTeam: 'اليابان'
  });

  assert.equal(getMatchNotificationTeams({
    strHomeTeam: 'TBD',
    strAwayTeam: 'Japan'
  }), null);
});

test('parses kickoff dates in Riyadh time and rejects invalid dates', () => {
  const kickoff = getMatchKickoffDate({
    dateEvent: '2026-06-23',
    strTime: '19:30:00'
  });

  assert.equal(kickoff.toISOString(), '2026-06-23T16:30:00.000Z');
  assert.equal(getMatchKickoffDate({ dateEvent: 'bad-date', strTime: '19:30:00' }), null);
});

test('generates stable match keys from date time and teams', () => {
  assert.equal(getMatchKey({
    dateEvent: '2026-06-23',
    strTime: '19:30:00',
    strHomeTeam: 'Al Hilal',
    strAwayTeam: 'Al Nassr'
  }), '2026-06-23|19:30:00|Al Hilal|Al Nassr');
});

test('identifies notifiable and non-notifiable match statuses', () => {
  assert.equal(isNotifiableMatch({ strStatus: 'NS' }), true);
  assert.equal(isNotifiableMatch({ strStatus: 'FT' }), false);
  assert.equal(isNotifiableMatch({ strStatus: 'POSTPONED' }), false);
});

test('renders notification templates without changing wording', () => {
  assert.equal(
    renderMatchNotification('⚽ {{homeTeam}} ضد {{awayTeam}}', {
      homeTeam: 'الهلال',
      awayTeam: 'النصر'
    }),
    '⚽ الهلال ضد النصر'
  );
});

test('chunks arrays for multicast sending', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 500), []);
});

test('parses World Cup local date strings', () => {
  assert.deepEqual(parseWorldCupLocalDate('6/11/2026 18:00'), {
    date: '2026-06-11',
    time: '18:00:00'
  });
  assert.deepEqual(parseWorldCupLocalDate('bad'), { date: '', time: '' });
});

test('builds upcoming matches while tolerating invalid source payloads', () => {
  const result = buildUpcomingMatchesFromSources({
    today: '2026-06-23',
    saudiLeagueId: '4668',
    worldCupLeagueId: '4429',
    todayData: {
      events: [
        {
          idLeague: '4668',
          dateEvent: '2026-06-23',
          strTime: '19:00:00',
          strHomeTeam: 'Al Hilal',
          strAwayTeam: 'Al Nassr',
          strStatus: 'NS'
        },
        {
          idLeague: '4668',
          dateEvent: '2026-06-23',
          strTime: '20:00:00',
          strHomeTeam: 'Al Ahli',
          strAwayTeam: 'Al Ittihad',
          strStatus: 'FT'
        }
      ]
    },
    saudiData: { events: 'not-an-array' },
    worldCupData: {},
    githubWorldCup: null
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].strHomeTeam, 'Al Hilal');
});
