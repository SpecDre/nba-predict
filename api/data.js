const fetch = require('node-fetch');

const CDN_BASE = 'https://cdn.nba.com/static/json/liveData';
const STATS_BASE = 'https://stats.nba.com/stats';

const CDN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
};

const STATS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.nba.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  'Origin': 'https://www.nba.com',
  'Connection': 'keep-alive',
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

const TEAM_NAMES = {
  'ATL':'Hawks','BOS':'Celtics','CLE':'Cavaliers','NOP':'Pelicans',
  'CHI':'Bulls','DAL':'Mavericks','DEN':'Nuggets','GSW':'Warriors',
  'HOU':'Rockets','LAC':'Clippers','LAL':'Lakers','MIA':'Heat',
  'MIL':'Bucks','MIN':'Timberwolves','BKN':'Nets','NYK':'Knicks',
  'ORL':'Magic','IND':'Pacers','PHI':'76ers','PHX':'Suns',
  'POR':'Trail Blazers','SAC':'Kings','SAS':'Spurs','OKC':'Thunder',
  'TOR':'Raptors','UTA':'Jazz','MEM':'Grizzlies','WAS':'Wizards',
  'DET':'Pistons','CHA':'Hornets',
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

// Today's scoreboard from NBA CDN (never blocks servers)
async function getScoreboard() {
  try {
    const res = await fetch(CDN_BASE + '/scoreboard/todaysScoreboard_00.json', {
      headers: CDN_HEADERS, timeout: 8000
    });
    if (!res.ok) throw new Error('CDN ' + res.status);
    const data = await res.json();
    const games = (data.scoreboard && data.scoreboard.games || []).map(function(g) {
      return {
        HOME_TEAM_ID: g.homeTeam ? (g.homeTeam.teamTricode || g.homeTeam.teamAbbreviation) : '',
        VISITOR_TEAM_ID: g.awayTeam ? (g.awayTeam.teamTricode || g.awayTeam.teamAbbreviation) : '',
        GAME_ID: g.gameId,
        status: g.gameStatusText || String(g.gameStatus),
        GAME_STATUS_ID: g.gameStatus,
        homeScore: g.homeTeam ? g.homeTeam.score : 0,
        awayScore: g.awayTeam ? g.awayTeam.score : 0,
      };
    });
    return { games: games, lineScores: [], date: new Date().toISOString().split('T')[0].replace(/-/g, '') };
  } catch (e) {
    console.error('CDN scoreboard error:', e.message);
    return { games: [], lineScores: [], date: '' };
  }
}

function parseStatsResponse(data, setIndex) {
  if (!setIndex) setIndex = 0;
  if (!data || !data.resultSets || !data.resultSets[setIndex]) return [];
  var set = data.resultSets[setIndex];
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
  var res = await fetch(url.toString(), { headers: STATS_HEADERS, timeout: 12000 });
  if (!res.ok) throw new Error('Stats API ' + res.status + ': ' + res.statusText);
  return res.json();
}

async function getTeamStats(season) {
  try {
    var data = await fetchStats('leaguedashteamstats', {
      Conference:'',DateFrom:'',DateTo:'',Division:'',
      GameScope:'',GameSegment:'',Height:'',ISTRound:'',
      LastNGames:'0',LeagueID:'00',Location:'',
      MeasureType:'Base',
      Month:'0',OpponentTeamID:'0',Outcome:'',PORound:'0',
      PaceAdjust:'N',PerMode:'PerGame',Period:'0',
      PlayerExperience:'',PlayerPosition:'',PlusMinus:'N',Rank:'N',
      Season:season,SeasonSegment:'',SeasonType:'Regular Season',
      ShotClockRange:'',StarterBench:'',TeamID:'0',TwoWay:'0',
      VsConference:'',VsDivision:''
    });
    return parseStatsResponse(data);
  } catch (e) {
    console.error('Team stats error:', e.message);
    return [];
  }
}

async function getTeamAdvanced(season) {
  try {
    var data = await fetchStats('leaguedashteamstats', {
      Conference:'',DateFrom:'',DateTo:'',Division:'',
      GameScope:'',GameSegment:'',Height:'',ISTRound:'',
      LastNGames:'0',LeagueID:'00',Location:'',
      MeasureType:'Advanced',
      Month:'0',OpponentTeamID:'0',Outcome:'',PORound:'0',
      PaceAdjust:'N',PerMode:'PerGame',Period:'0',
      PlayerExperience:'',PlayerPosition:'',PlusMinus:'N',Rank:'N',
      Season:season,SeasonSegment:'',SeasonType:'Regular Season',
      ShotClockRange:'',StarterBench:'',TeamID:'0',TwoWay:'0',
      VsConference:'',VsDivision:''
    });
    return parseStatsResponse(data);
  } catch (e) {
    console.error('Advanced stats error:', e.message);
    return [];
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  var type = req.query.type;
  var szn = req.query.season || '2025-26';

  try {
    var result = {};

    if (type === 'scoreboard') {
      result = await getScoreboard();

    } else if (type === 'all') {
      // Scoreboard from CDN (never blocks)
      var sb = await getScoreboard();

      // Only 2 calls to stats.nba.com (down from 6)
      var teamBase = [];
      var teamAdv = [];
      try {
        var statsResults = await Promise.all([
          getTeamStats(szn),
          getTeamAdvanced(szn),
        ]);
        teamBase = statsResults[0];
        teamAdv = statsResults[1];
      } catch (e) {
        console.error('Stats fetch failed:', e.message);
      }

      result = {
        scoreboard: sb,
        teamStats: { base: teamBase, advanced: teamAdv, last10: [], last5: [] },
        standings: [],
        meta: { season: szn, timestamp: new Date().toISOString() },
        teamMap: TEAM_MAP,
        teamNames: TEAM_NAMES,
        teamColors: TEAM_COLORS,
      };

    } else {
      return res.status(400).json({ error: 'Invalid type. Use: scoreboard, all' });
    }

    res.status(200).json(result);
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
  }
};
