const fetch = require('node-fetch');

const NBA_BASE = 'https://stats.nba.com/stats';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://www.nba.com/',
  'Accept': 'application/json',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

// Team ID -> Abbreviation mapping
const TEAM_MAP = {
  1610612737: 'ATL', 1610612738: 'BOS', 1610612739: 'CLE', 1610612740: 'NOP',
  1610612741: 'CHI', 1610612742: 'DAL', 1610612743: 'DEN', 1610612744: 'GSW',
  1610612745: 'HOU', 1610612746: 'LAC', 1610612747: 'LAL', 1610612748: 'MIA',
  1610612749: 'MIL', 1610612750: 'MIN', 1610612751: 'BKN', 1610612752: 'NYK',
  1610612753: 'ORL', 1610612754: 'IND', 1610612755: 'PHI', 1610612756: 'PHX',
  1610612757: 'POR', 1610612758: 'SAC', 1610612759: 'SAS', 1610612760: 'OKC',
  1610612761: 'TOR', 1610612762: 'UTA', 1610612763: 'MEM', 1610612764: 'WAS',
  1610612765: 'DET', 1610612766: 'CHA',
};

const TEAM_NAMES = {
  'ATL': 'Hawks', 'BOS': 'Celtics', 'CLE': 'Cavaliers', 'NOP': 'Pelicans',
  'CHI': 'Bulls', 'DAL': 'Mavericks', 'DEN': 'Nuggets', 'GSW': 'Warriors',
  'HOU': 'Rockets', 'LAC': 'Clippers', 'LAL': 'Lakers', 'MIA': 'Heat',
  'MIL': 'Bucks', 'MIN': 'Timberwolves', 'BKN': 'Nets', 'NYK': 'Knicks',
  'ORL': 'Magic', 'IND': 'Pacers', 'PHI': '76ers', 'PHX': 'Suns',
  'POR': 'Trail Blazers', 'SAC': 'Kings', 'SAS': 'Spurs', 'OKC': 'Thunder',
  'TOR': 'Raptors', 'UTA': 'Jazz', 'MEM': 'Grizzlies', 'WAS': 'Wizards',
  'DET': 'Pistons', 'CHA': 'Hornets',
};

const TEAM_COLORS = {
  'ATL': '#E03A3E', 'BOS': '#007A33', 'CLE': '#860038', 'NOP': '#0C2340',
  'CHI': '#CE1141', 'DAL': '#00538C', 'DEN': '#0E2240', 'GSW': '#1D428A',
  'HOU': '#CE1141', 'LAC': '#C8102E', 'LAL': '#552583', 'MIA': '#98002E',
  'MIL': '#00471B', 'MIN': '#0C2340', 'BKN': '#000000', 'NYK': '#006BB6',
  'ORL': '#0077C0', 'IND': '#002D62', 'PHI': '#006BB6', 'PHX': '#1D1160',
  'POR': '#E03A3E', 'SAC': '#5A2D81', 'SAS': '#C4CED4', 'OKC': '#007AC1',
  'TOR': '#CE1141', 'UTA': '#002B5C', 'MEM': '#5D76A9', 'WAS': '#002B5C',
  'DET': '#C8102E', 'CHA': '#1D1160',
};

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchNBA(endpoint, params = {}, retries = 2) {
  const url = new URL(`${NBA_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), { headers: HEADERS, timeout: 15000 });
      if (res.status === 429 || res.status === 403) {
        // Rate limited — wait and retry
        if (attempt < retries) {
          await delay(2000 * (attempt + 1));
          continue;
        }
      }
      if (!res.ok) throw new Error(`NBA API ${res.status}: ${res.statusText}`);
      const json = await res.json();
      // Check if NBA returned empty data (stealth rate limit)
      if (json.resultSets && json.resultSets[0] && json.resultSets[0].rowSet.length === 0 && attempt < retries) {
        await delay(1500 * (attempt + 1));
        continue;
      }
      return json;
    } catch (e) {
      if (attempt < retries) {
        await delay(2000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

function parseNBAResponse(data, setIndex = 0) {
  const set = data.resultSets[setIndex];
  const headers = set.headers;
  return set.rowSet.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

// Get today's scoreboard
async function getScoreboard() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  
  try {
    const data = await fetchNBA('scoreboardv2', {
      GameDate: `${today.getMonth()+1}/${today.getDate()}/${today.getFullYear()}`,
      LeagueID: '00',
      DayOffset: '0'
    });
    
    const games = parseNBAResponse(data, 0); // GameHeader
    const lineScores = parseNBAResponse(data, 1); // LineScore
    
    return { games, lineScores, date: dateStr };
  } catch (e) {
    console.error('Scoreboard error:', e.message);
    return { games: [], lineScores: [], date: dateStr };
  }
}

// Get team stats for the season
async function getTeamStats(season = '2025-26') {
  try {
    const data = await fetchNBA('leaguedashteamstats', {
      Conference: '',
      DateFrom: '',
      DateTo: '',
      Division: '',
      GameScope: '',
      GameSegment: '',
      Height: '',
      ISTRound: '',
      LastNGames: '0',
      LeagueID: '00',
      Location: '',
      MeasureType: 'Base',
      Month: '0',
      OpponentTeamID: '0',
      Outcome: '',
      PORound: '0',
      PaceAdjust: 'N',
      PerMode: 'PerGame',
      Period: '0',
      PlayerExperience: '',
      PlayerPosition: '',
      PlusMinus: 'N',
      Rank: 'N',
      Season: season,
      SeasonSegment: '',
      SeasonType: 'Regular Season',
      ShotClockRange: '',
      StarterBench: '',
      TeamID: '0',
      TwoWay: '0',
      VsConference: '',
      VsDivision: ''
    });
    return parseNBAResponse(data);
  } catch (e) {
    console.error('Team stats error:', e.message);
    return [];
  }
}

// Get advanced team stats (net rating, pace, etc.)
async function getTeamAdvanced(season = '2025-26') {
  try {
    const data = await fetchNBA('leaguedashteamstats', {
      Conference: '',
      DateFrom: '',
      DateTo: '',
      Division: '',
      GameScope: '',
      GameSegment: '',
      Height: '',
      ISTRound: '',
      LastNGames: '0',
      LeagueID: '00',
      Location: '',
      MeasureType: 'Advanced',
      Month: '0',
      OpponentTeamID: '0',
      Outcome: '',
      PORound: '0',
      PaceAdjust: 'N',
      PerMode: 'PerGame',
      Period: '0',
      PlayerExperience: '',
      PlayerPosition: '',
      PlusMinus: 'N',
      Rank: 'N',
      Season: season,
      SeasonSegment: '',
      SeasonType: 'Regular Season',
      ShotClockRange: '',
      StarterBench: '',
      TeamID: '0',
      TwoWay: '0',
      VsConference: '',
      VsDivision: ''
    });
    return parseNBAResponse(data);
  } catch (e) {
    console.error('Advanced stats error:', e.message);
    return [];
  }
}

// Get Four Factors (eFG%, TOV%, OREB%, FT Rate)
async function getTeamFourFactors(season = '2025-26') {
  try {
    const data = await fetchNBA('leaguedashteamstats', {
      Conference: '', DateFrom: '', DateTo: '', Division: '',
      GameScope: '', GameSegment: '', Height: '', ISTRound: '',
      LastNGames: '0', LeagueID: '00', Location: '',
      MeasureType: 'Four Factors',
      Month: '0', OpponentTeamID: '0', Outcome: '', PORound: '0',
      PaceAdjust: 'N', PerMode: 'PerGame', Period: '0',
      PlayerExperience: '', PlayerPosition: '', PlusMinus: 'N', Rank: 'N',
      Season: season, SeasonSegment: '', SeasonType: 'Regular Season',
      ShotClockRange: '', StarterBench: '', TeamID: '0', TwoWay: '0',
      VsConference: '', VsDivision: ''
    });
    return parseNBAResponse(data);
  } catch (e) {
    console.error('Four Factors error:', e.message);
    return [];
  }
}

// Get opponent stats (what teams allow)
async function getTeamOpponentStats(season = '2025-26') {
  try {
    const data = await fetchNBA('leaguedashteamstats', {
      Conference: '', DateFrom: '', DateTo: '', Division: '',
      GameScope: '', GameSegment: '', Height: '', ISTRound: '',
      LastNGames: '0', LeagueID: '00', Location: '',
      MeasureType: 'Opponent',
      Month: '0', OpponentTeamID: '0', Outcome: '', PORound: '0',
      PaceAdjust: 'N', PerMode: 'PerGame', Period: '0',
      PlayerExperience: '', PlayerPosition: '', PlusMinus: 'N', Rank: 'N',
      Season: season, SeasonSegment: '', SeasonType: 'Regular Season',
      ShotClockRange: '', StarterBench: '', TeamID: '0', TwoWay: '0',
      VsConference: '', VsDivision: ''
    });
    return parseNBAResponse(data);
  } catch (e) {
    console.error('Opponent stats error:', e.message);
    return [];
  }
}

// Get team stats for last N games
async function getTeamStatsLastN(n = 10, season = '2025-26') {
  try {
    const data = await fetchNBA('leaguedashteamstats', {
      Conference: '',
      DateFrom: '',
      DateTo: '',
      Division: '',
      GameScope: '',
      GameSegment: '',
      Height: '',
      ISTRound: '',
      LastNGames: String(n),
      LeagueID: '00',
      Location: '',
      MeasureType: 'Base',
      Month: '0',
      OpponentTeamID: '0',
      Outcome: '',
      PORound: '0',
      PaceAdjust: 'N',
      PerMode: 'PerGame',
      Period: '0',
      PlayerExperience: '',
      PlayerPosition: '',
      PlusMinus: 'N',
      Rank: 'N',
      Season: season,
      SeasonSegment: '',
      SeasonType: 'Regular Season',
      ShotClockRange: '',
      StarterBench: '',
      TeamID: '0',
      TwoWay: '0',
      VsConference: '',
      VsDivision: ''
    });
    return parseNBAResponse(data);
  } catch (e) {
    console.error(`Last ${n} stats error:`, e.message);
    return [];
  }
}

// Get standings
async function getStandings(season = '2025-26') {
  try {
    const data = await fetchNBA('leaguestandingsv3', {
      LeagueID: '00',
      Season: season,
      SeasonType: 'Regular Season',
      Section: 'overall'
    });
    return parseNBAResponse(data);
  } catch (e) {
    console.error('Standings error:', e.message);
    return [];
  }
}

// Get player stats
async function getPlayerStats(season = '2025-26') {
  try {
    const data = await fetchNBA('leaguedashplayerstats', {
      College: '',
      Conference: '',
      Country: '',
      DateFrom: '',
      DateTo: '',
      Division: '',
      DraftPick: '',
      DraftYear: '',
      GameScope: '',
      GameSegment: '',
      Height: '',
      ISTRound: '',
      LastNGames: '0',
      LeagueID: '00',
      Location: '',
      MeasureType: 'Base',
      Month: '0',
      OpponentTeamID: '0',
      Outcome: '',
      PORound: '0',
      PaceAdjust: 'N',
      PerMode: 'PerGame',
      Period: '0',
      PlayerExperience: '',
      PlayerPosition: '',
      PlusMinus: 'N',
      Rank: 'N',
      Season: season,
      SeasonSegment: '',
      SeasonType: 'Regular Season',
      ShotClockRange: '',
      StarterBench: '',
      TeamID: '0',
      TwoWay: '0',
      VsConference: '',
      VsDivision: '',
      Weight: ''
    });
    return parseNBAResponse(data);
  } catch (e) {
    console.error('Player stats error:', e.message);
    return [];
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
  
  const { type, season } = req.query;
  const szn = season || '2025-26';
  
  try {
    let result = {};
    
    switch (type) {
      case 'scoreboard':
        result = await getScoreboard();
        break;
      case 'teamstats':
        const [base, advanced, last10, last5] = await Promise.all([
          getTeamStats(szn),
          getTeamAdvanced(szn),
          getTeamStatsLastN(10, szn),
          getTeamStatsLastN(5, szn),
        ]);
        result = { base, advanced, last10, last5 };
        break;
      case 'standings':
        result = await getStandings(szn);
        break;
      case 'players':
        result = await getPlayerStats(szn);
        break;
      case 'all': {
        // Stagger calls to avoid NBA API rate limiting
        // Batch 1
        const [sb, teamBase] = await Promise.all([
          getScoreboard(),
          getTeamStats(szn),
        ]);
        await delay(500);
        // Batch 2
        const [teamAdv, stand] = await Promise.all([
          getTeamAdvanced(szn),
          getStandings(szn),
        ]);
        await delay(500);
        // Batch 3
        const [t10, t5] = await Promise.all([
          getTeamStatsLastN(10, szn),
          getTeamStatsLastN(5, szn),
        ]);
        result = {
          scoreboard: sb,
          teamStats: { base: teamBase, advanced: teamAdv, last10: t10, last5: t5 },
          standings: stand,
          meta: { season: szn, timestamp: new Date().toISOString() },
          teamMap: TEAM_MAP,
          teamNames: TEAM_NAMES,
          teamColors: TEAM_COLORS,
        };
        break;
      }
      default:
        return res.status(400).json({ error: 'Invalid type. Use: scoreboard, teamstats, standings, players, all' });
    }
    
    res.status(200).json(result);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
  }
};
