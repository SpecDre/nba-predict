const fetch = require('node-fetch');

const CDN_BASE = 'https://cdn.nba.com/static/json/liveData';
const STATS_BASE = 'https://stats.nba.com/stats';

const CDN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
};

const STATS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://www.nba.com/',
  'Accept': 'application/json',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  'Origin': 'https://www.nba.com',
};

const TEAM_COLORS = {
  'ATL':'#E03A3E','BOS':'#007A33','CLE':'#860038','NOP':'#0C2340',
  'CHI':'#CE1141','DAL':'#00538C','DEN':'#0E2240','GSW':'#1D428A',
  'HOU':'#CE1141','LAC':'#C8102E','LAL':'#552583','MIA':'#98002E',
  'MIL':'#00471B','MIN':'#0C2340','BKN':'#000000','NYK':'#006BB6',
  'ORL':'#0077C0','IND':'#002D62','PHI':'#006BB6','PHX':'#1D1160',
  'POR':'#E03A3E','SAC':'#5A2D81','SAS':'#C4CED4','OKC':'#007AC1',
  'TOR':'#CE1141','UTA':'#002B5C','MEM':'#5D76A9','WAS':'#002B5C',
  'DET':'#C8102E','CHA':'#1D1160',
};

// Embedded team stats — updated March 19 2026. Used when stats.nba.com is unavailable.
const EMBEDDED_STATS = [
  {TEAM_ID:'OKC',TEAM_ABBREVIATION:'OKC',TEAM_NAME:'Thunder',GP:70,W:55,L:15,PTS:120,FG_PCT:0.492,FG3_PCT:0.381,FT_PCT:0.802,FGA:89,FG3A:37,FTA:22,TOV:12,OREB:11,REB:46,AST:28,STL:9,BLK:6},
  {TEAM_ID:'SAS',TEAM_ABBREVIATION:'SAS',TEAM_NAME:'Spurs',GP:69,W:51,L:18,PTS:119,FG_PCT:0.488,FG3_PCT:0.374,FT_PCT:0.810,FGA:90,FG3A:36,FTA:23,TOV:13,OREB:11,REB:45,AST:27,STL:8,BLK:5},
  {TEAM_ID:'DET',TEAM_ABBREVIATION:'DET',TEAM_NAME:'Pistons',GP:68,W:49,L:19,PTS:117,FG_PCT:0.478,FG3_PCT:0.368,FT_PCT:0.790,FGA:90,FG3A:35,FTA:22,TOV:13,OREB:11,REB:46,AST:26,STL:8,BLK:5},
  {TEAM_ID:'BOS',TEAM_ABBREVIATION:'BOS',TEAM_NAME:'Celtics',GP:69,W:46,L:23,PTS:118,FG_PCT:0.482,FG3_PCT:0.379,FT_PCT:0.808,FGA:91,FG3A:38,FTA:21,TOV:12,OREB:10,REB:45,AST:27,STL:7,BLK:5},
  {TEAM_ID:'NYK',TEAM_ABBREVIATION:'NYK',TEAM_NAME:'Knicks',GP:70,W:45,L:25,PTS:116,FG_PCT:0.476,FG3_PCT:0.365,FT_PCT:0.795,FGA:89,FG3A:36,FTA:23,TOV:13,OREB:11,REB:45,AST:26,STL:8,BLK:5},
  {TEAM_ID:'LAL',TEAM_ABBREVIATION:'LAL',TEAM_NAME:'Lakers',GP:69,W:44,L:25,PTS:115,FG_PCT:0.474,FG3_PCT:0.361,FT_PCT:0.788,FGA:90,FG3A:35,FTA:22,TOV:13,OREB:10,REB:44,AST:26,STL:8,BLK:5},
  {TEAM_ID:'MIN',TEAM_ABBREVIATION:'MIN',TEAM_NAME:'Timberwolves',GP:70,W:43,L:27,PTS:116,FG_PCT:0.475,FG3_PCT:0.370,FT_PCT:0.800,FGA:90,FG3A:37,FTA:21,TOV:13,OREB:11,REB:46,AST:26,STL:8,BLK:6},
  {TEAM_ID:'CLE',TEAM_ABBREVIATION:'CLE',TEAM_NAME:'Cavaliers',GP:69,W:42,L:27,PTS:120,FG_PCT:0.490,FG3_PCT:0.378,FT_PCT:0.805,FGA:89,FG3A:37,FTA:22,TOV:12,OREB:10,REB:44,AST:28,STL:7,BLK:5},
  {TEAM_ID:'DEN',TEAM_ABBREVIATION:'DEN',TEAM_NAME:'Nuggets',GP:70,W:42,L:28,PTS:117,FG_PCT:0.480,FG3_PCT:0.371,FT_PCT:0.795,FGA:90,FG3A:36,FTA:22,TOV:13,OREB:11,REB:45,AST:27,STL:7,BLK:5},
  {TEAM_ID:'HOU',TEAM_ABBREVIATION:'HOU',TEAM_NAME:'Rockets',GP:68,W:41,L:27,PTS:114,FG_PCT:0.470,FG3_PCT:0.358,FT_PCT:0.780,FGA:91,FG3A:38,FTA:21,TOV:14,OREB:12,REB:47,AST:25,STL:9,BLK:6},
  {TEAM_ID:'TOR',TEAM_ABBREVIATION:'TOR',TEAM_NAME:'Raptors',GP:68,W:39,L:29,PTS:115,FG_PCT:0.472,FG3_PCT:0.362,FT_PCT:0.792,FGA:90,FG3A:36,FTA:22,TOV:13,OREB:11,REB:45,AST:26,STL:8,BLK:5},
  {TEAM_ID:'PHX',TEAM_ABBREVIATION:'PHX',TEAM_NAME:'Suns',GP:69,W:39,L:30,PTS:114,FG_PCT:0.468,FG3_PCT:0.360,FT_PCT:0.800,FGA:90,FG3A:37,FTA:21,TOV:13,OREB:10,REB:44,AST:26,STL:7,BLK:5},
  {TEAM_ID:'ORL',TEAM_ABBREVIATION:'ORL',TEAM_NAME:'Magic',GP:68,W:38,L:30,PTS:110,FG_PCT:0.462,FG3_PCT:0.348,FT_PCT:0.775,FGA:89,FG3A:34,FTA:22,TOV:13,OREB:12,REB:46,AST:24,STL:8,BLK:6},
  {TEAM_ID:'ATL',TEAM_ABBREVIATION:'ATL',TEAM_NAME:'Hawks',GP:69,W:38,L:31,PTS:118,FG_PCT:0.478,FG3_PCT:0.365,FT_PCT:0.785,FGA:92,FG3A:38,FTA:23,TOV:14,OREB:11,REB:44,AST:28,STL:8,BLK:5},
  {TEAM_ID:'MIA',TEAM_ABBREVIATION:'MIA',TEAM_NAME:'Heat',GP:69,W:38,L:31,PTS:112,FG_PCT:0.465,FG3_PCT:0.355,FT_PCT:0.790,FGA:89,FG3A:35,FTA:22,TOV:13,OREB:10,REB:43,AST:25,STL:7,BLK:4},
  {TEAM_ID:'PHI',TEAM_ABBREVIATION:'PHI',TEAM_NAME:'76ers',GP:69,W:37,L:32,PTS:115,FG_PCT:0.472,FG3_PCT:0.362,FT_PCT:0.800,FGA:90,FG3A:36,FTA:22,TOV:13,OREB:10,REB:44,AST:26,STL:7,BLK:5},
  {TEAM_ID:'CHA',TEAM_ABBREVIATION:'CHA',TEAM_NAME:'Hornets',GP:69,W:35,L:34,PTS:113,FG_PCT:0.468,FG3_PCT:0.358,FT_PCT:0.782,FGA:90,FG3A:36,FTA:22,TOV:14,OREB:11,REB:45,AST:25,STL:8,BLK:5},
  {TEAM_ID:'POR',TEAM_ABBREVIATION:'POR',TEAM_NAME:'Trail Blazers',GP:70,W:34,L:36,PTS:112,FG_PCT:0.462,FG3_PCT:0.352,FT_PCT:0.778,FGA:91,FG3A:37,FTA:21,TOV:14,OREB:11,REB:44,AST:25,STL:7,BLK:5},
  {TEAM_ID:'LAC',TEAM_ABBREVIATION:'LAC',TEAM_NAME:'Clippers',GP:69,W:34,L:35,PTS:113,FG_PCT:0.466,FG3_PCT:0.356,FT_PCT:0.788,FGA:90,FG3A:36,FTA:22,TOV:13,OREB:10,REB:44,AST:25,STL:7,BLK:5},
  {TEAM_ID:'GSW',TEAM_ABBREVIATION:'GSW',TEAM_NAME:'Warriors',GP:69,W:33,L:36,PTS:114,FG_PCT:0.470,FG3_PCT:0.365,FT_PCT:0.792,FGA:91,FG3A:38,FTA:21,TOV:14,OREB:10,REB:43,AST:27,STL:7,BLK:5},
  {TEAM_ID:'MIL',TEAM_ABBREVIATION:'MIL',TEAM_NAME:'Bucks',GP:68,W:28,L:40,PTS:116,FG_PCT:0.475,FG3_PCT:0.360,FT_PCT:0.795,FGA:91,FG3A:37,FTA:22,TOV:14,OREB:11,REB:45,AST:26,STL:7,BLK:5},
  {TEAM_ID:'CHI',TEAM_ABBREVIATION:'CHI',TEAM_NAME:'Bulls',GP:69,W:28,L:41,PTS:114,FG_PCT:0.468,FG3_PCT:0.355,FT_PCT:0.785,FGA:91,FG3A:37,FTA:22,TOV:14,OREB:11,REB:44,AST:25,STL:7,BLK:5},
  {TEAM_ID:'NOP',TEAM_ABBREVIATION:'NOP',TEAM_NAME:'Pelicans',GP:70,W:24,L:46,PTS:111,FG_PCT:0.460,FG3_PCT:0.345,FT_PCT:0.772,FGA:90,FG3A:35,FTA:22,TOV:14,OREB:11,REB:44,AST:24,STL:7,BLK:5},
  {TEAM_ID:'MEM',TEAM_ABBREVIATION:'MEM',TEAM_NAME:'Grizzlies',GP:68,W:24,L:44,PTS:113,FG_PCT:0.464,FG3_PCT:0.350,FT_PCT:0.780,FGA:91,FG3A:36,FTA:22,TOV:14,OREB:11,REB:45,AST:25,STL:8,BLK:5},
  {TEAM_ID:'DAL',TEAM_ABBREVIATION:'DAL',TEAM_NAME:'Mavericks',GP:70,W:23,L:47,PTS:112,FG_PCT:0.462,FG3_PCT:0.348,FT_PCT:0.778,FGA:91,FG3A:37,FTA:21,TOV:14,OREB:10,REB:43,AST:25,STL:7,BLK:4},
  {TEAM_ID:'UTA',TEAM_ABBREVIATION:'UTA',TEAM_NAME:'Jazz',GP:69,W:20,L:49,PTS:110,FG_PCT:0.455,FG3_PCT:0.342,FT_PCT:0.770,FGA:91,FG3A:37,FTA:21,TOV:15,OREB:11,REB:44,AST:24,STL:7,BLK:5},
  {TEAM_ID:'SAC',TEAM_ABBREVIATION:'SAC',TEAM_NAME:'Kings',GP:70,W:18,L:52,PTS:115,FG_PCT:0.468,FG3_PCT:0.358,FT_PCT:0.782,FGA:92,FG3A:38,FTA:22,TOV:15,OREB:10,REB:43,AST:26,STL:7,BLK:4},
  {TEAM_ID:'BKN',TEAM_ABBREVIATION:'BKN',TEAM_NAME:'Nets',GP:69,W:17,L:52,PTS:109,FG_PCT:0.454,FG3_PCT:0.340,FT_PCT:0.768,FGA:90,FG3A:36,FTA:21,TOV:15,OREB:10,REB:43,AST:24,STL:7,BLK:4},
  {TEAM_ID:'WAS',TEAM_ABBREVIATION:'WAS',TEAM_NAME:'Wizards',GP:68,W:16,L:52,PTS:111,FG_PCT:0.458,FG3_PCT:0.345,FT_PCT:0.775,FGA:91,FG3A:37,FTA:22,TOV:15,OREB:11,REB:44,AST:24,STL:7,BLK:4},
  {TEAM_ID:'IND',TEAM_ABBREVIATION:'IND',TEAM_NAME:'Pacers',GP:70,W:15,L:55,PTS:116,FG_PCT:0.472,FG3_PCT:0.358,FT_PCT:0.788,FGA:93,FG3A:38,FTA:23,TOV:15,OREB:10,REB:42,AST:27,STL:7,BLK:4},
];

// Approximate advanced stats from base stats
const EMBEDDED_ADVANCED = EMBEDDED_STATS.map(function(t) {
  var winPct = t.W / Math.max(t.GP, 1);
  var netRating = (winPct - 0.5) * 20; // approximate from win%
  return {
    TEAM_ID: t.TEAM_ID,
    TEAM_ABBREVIATION: t.TEAM_ABBREVIATION,
    OFF_RATING: 108 + (t.PTS - 114) * 0.5,
    DEF_RATING: 108 - netRating,
    NET_RATING: netRating,
    PACE: 99 + (t.PTS - 114) * 0.3,
    EFG_PCT: t.FG_PCT + 0.5 * t.FG3_PCT * (t.FG3A / t.FGA),
    TS_PCT: t.PTS / (2 * (t.FGA + 0.44 * t.FTA)),
    OREB_PCT: t.OREB / (t.OREB + (45 - t.OREB)),
  };
});

async function getScoreboard() {
  try {
    var res = await fetch(CDN_BASE + '/scoreboard/todaysScoreboard_00.json', {
      headers: CDN_HEADERS, timeout: 8000
    });
    if (!res.ok) throw new Error('CDN ' + res.status);
    var data = await res.json();
    var games = (data.scoreboard && data.scoreboard.games || []).map(function(g) {
      return {
        HOME_TEAM_ID: g.homeTeam ? (g.homeTeam.teamTricode || '') : '',
        VISITOR_TEAM_ID: g.awayTeam ? (g.awayTeam.teamTricode || '') : '',
        GAME_ID: g.gameId,
        status: g.gameStatusText || String(g.gameStatus),
        GAME_STATUS_ID: g.gameStatus,
      };
    });
    return { games: games, lineScores: [], date: new Date().toISOString().split('T')[0].replace(/-/g,'') };
  } catch (e) {
    console.error('CDN error:', e.message);
    return { games: [], lineScores: [], date: '' };
  }
}

function parseStatsResponse(data, idx) {
  if (!idx) idx = 0;
  if (!data || !data.resultSets || !data.resultSets[idx]) return [];
  var set = data.resultSets[idx];
  if (!set.rowSet || set.rowSet.length === 0) return [];
  return set.rowSet.map(function(row) {
    var obj = {};
    set.headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

async function fetchStats(endpoint, params) {
  var url = new URL(STATS_BASE + '/' + endpoint);
  Object.entries(params || {}).forEach(function(kv) { url.searchParams.set(kv[0], kv[1]); });
  var res = await fetch(url.toString(), { headers: STATS_HEADERS, timeout: 8000 });
  if (!res.ok) throw new Error('Stats ' + res.status);
  return res.json();
}

async function getTeamStats(season) {
  try {
    var data = await fetchStats('leaguedashteamstats', {
      Conference:'',DateFrom:'',DateTo:'',Division:'',GameScope:'',GameSegment:'',
      Height:'',ISTRound:'',LastNGames:'0',LeagueID:'00',Location:'',
      MeasureType:'Base',Month:'0',OpponentTeamID:'0',Outcome:'',PORound:'0',
      PaceAdjust:'N',PerMode:'PerGame',Period:'0',PlayerExperience:'',
      PlayerPosition:'',PlusMinus:'N',Rank:'N',Season:season,SeasonSegment:'',
      SeasonType:'Regular Season',ShotClockRange:'',StarterBench:'',TeamID:'0',
      TwoWay:'0',VsConference:'',VsDivision:''
    });
    var result = parseStatsResponse(data);
    return result.length > 0 ? result : null;
  } catch (e) {
    return null;
  }
}

async function getTeamAdvanced(season) {
  try {
    var data = await fetchStats('leaguedashteamstats', {
      Conference:'',DateFrom:'',DateTo:'',Division:'',GameScope:'',GameSegment:'',
      Height:'',ISTRound:'',LastNGames:'0',LeagueID:'00',Location:'',
      MeasureType:'Advanced',Month:'0',OpponentTeamID:'0',Outcome:'',PORound:'0',
      PaceAdjust:'N',PerMode:'PerGame',Period:'0',PlayerExperience:'',
      PlayerPosition:'',PlusMinus:'N',Rank:'N',Season:season,SeasonSegment:'',
      SeasonType:'Regular Season',ShotClockRange:'',StarterBench:'',TeamID:'0',
      TwoWay:'0',VsConference:'',VsDivision:''
    });
    var result = parseStatsResponse(data);
    return result.length > 0 ? result : null;
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  var type = req.query.type;
  var szn = req.query.season || '2025-26';

  try {
    if (type === 'scoreboard') {
      var sb = await getScoreboard();
      return res.status(200).json(sb);
    }

    if (type === 'all') {
      var sb = await getScoreboard();

      // Try live stats, fall back to embedded
      var teamBase = null;
      var teamAdv = null;
      try {
        var results = await Promise.all([getTeamStats(szn), getTeamAdvanced(szn)]);
        teamBase = results[0];
        teamAdv = results[1];
      } catch (e) {}

      var usingFallback = !teamBase || !teamAdv;

      return res.status(200).json({
        scoreboard: sb,
        teamStats: {
          base: teamBase || EMBEDDED_STATS,
          advanced: teamAdv || EMBEDDED_ADVANCED,
          last10: [],
          last5: [],
        },
        standings: [],
        meta: { season: szn, timestamp: new Date().toISOString(), fallback: usingFallback },
        teamMap: {},
        teamNames: {},
        teamColors: TEAM_COLORS,
      });
    }

    res.status(400).json({ error: 'Use: scoreboard, all' });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
  }
};
