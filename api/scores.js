const fetch = require('node-fetch');

const NBA_BASE = 'https://stats.nba.com/stats';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://www.nba.com/',
  'Accept': 'application/json',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

const TEAM_MAP = {
  1610612737:'ATL',1610612738:'BOS',1610612739:'CLE',1610612740:'NOP',
  1610612741:'CHI',1610612742:'DAL',1610612743:'DEN',1610612744:'GSW',
  1610612745:'HOU',1610612746:'LAC',1610612747:'LAL',1610612748:'MIA',
  1610612749:'MIL',1610612750:'MIN',1610612751:'BKN',1610612752:'NYK',
  1610612753:'ORL',1610612754:'IND',1610612755:'PHI',1610612756:'PHX',
  1610612757:'POR',1610612758:'SAC',1610612759:'SAS',1610612760:'OKC',
  1610612761:'TOR',1610612762:'UTA',1610612763:'MEM',1610612764:'WAS',
  1610612765:'DET',1610612766:'CHA',
};

async function fetchNBA(endpoint, params = {}) {
  const url = new URL(`${NBA_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: HEADERS, timeout: 10000 });
  if (!res.ok) throw new Error(`NBA API ${res.status}: ${res.statusText}`);
  return res.json();
}

function parseNBAResponse(data, setIndex = 0) {
  const set = data.resultSets[setIndex];
  return set.rowSet.map(row => {
    const obj = {};
    set.headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

// Get scoreboard for a specific date
async function getScoreboardForDate(dateStr) {
  // dateStr format: MM/DD/YYYY
  const data = await fetchNBA('scoreboardv2', {
    GameDate: dateStr,
    LeagueID: '00',
    DayOffset: '0'
  });

  const games = parseNBAResponse(data, 0); // GameHeader
  const lineScores = parseNBAResponse(data, 1); // LineScore

  return { games, lineScores };
}

// Parse final scores from line scores
function parseFinalScores(games, lineScores) {
  const results = [];

  for (const game of games) {
    const gameId = game.GAME_ID;
    const status = game.GAME_STATUS_ID; // 3 = Final

    if (status !== 3) continue; // Only completed games

    const homeId = game.HOME_TEAM_ID;
    const awayId = game.VISITOR_TEAM_ID;
    const homeAbbr = TEAM_MAP[homeId] || 'UNK';
    const awayAbbr = TEAM_MAP[awayId] || 'UNK';

    // Get scores from line scores
    const homeLines = lineScores.filter(ls => ls.TEAM_ID === homeId && ls.GAME_ID === gameId);
    const awayLines = lineScores.filter(ls => ls.TEAM_ID === awayId && ls.GAME_ID === gameId);

    const homeScore = homeLines.length > 0 ? homeLines[0].PTS : null;
    const awayScore = awayLines.length > 0 ? awayLines[0].PTS : null;

    if (homeScore === null || awayScore === null) continue;

    results.push({
      gameId,
      date: game.GAME_DATE_EST?.split('T')[0] || '',
      homeTeam: homeAbbr,
      awayTeam: awayAbbr,
      homeScore,
      awayScore,
      totalScore: homeScore + awayScore,
      winner: homeScore > awayScore ? homeAbbr : awayAbbr,
      margin: Math.abs(homeScore - awayScore),
    });
  }

  return results;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  const { date, days } = req.query;

  try {
    // If specific date provided
    if (date) {
      const [y, m, d] = date.split('-');
      const dateStr = `${parseInt(m)}/${parseInt(d)}/${y}`;
      const { games, lineScores } = await getScoreboardForDate(dateStr);
      const results = parseFinalScores(games, lineScores);
      return res.status(200).json({ date, results, count: results.length });
    }

    // Default: fetch last N days (default 1 = yesterday)
    const numDays = Math.min(parseInt(days) || 1, 7);
    const allResults = [];

    for (let i = 1; i <= numDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      const isoDate = d.toISOString().split('T')[0];

      try {
        const { games, lineScores } = await getScoreboardForDate(dateStr);
        const results = parseFinalScores(games, lineScores);
        allResults.push({ date: isoDate, results, count: results.length });
      } catch (e) {
        console.error(`Error fetching ${isoDate}:`, e.message);
        allResults.push({ date: isoDate, results: [], count: 0, error: e.message });
      }
    }

    res.status(200).json({
      days: numDays,
      results: allResults,
      totalGames: allResults.reduce((sum, d) => sum + d.count, 0),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Scores API Error:', err);
    res.status(500).json({ error: err.message });
  }
};
