const fetch = require('node-fetch');

// ESPN API - free, no auth, works from serverless
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

const TEAM_ABBR_MAP = {
  'ATL':'ATL','BOS':'BOS','BKN':'BKN','CHA':'CHA','CHI':'CHI','CLE':'CLE',
  'DAL':'DAL','DEN':'DEN','DET':'DET','GS':'GSW','HOU':'HOU','IND':'IND',
  'LAC':'LAC','LAL':'LAL','MEM':'MEM','MIA':'MIA','MIL':'MIL','MIN':'MIN',
  'NO':'NOP','NY':'NYK','OKC':'OKC','ORL':'ORL','PHI':'PHI','PHX':'PHX',
  'POR':'POR','SAC':'SAC','SA':'SAS','TOR':'TOR','UTAH':'UTA','UTA':'UTA',
  'WAS':'WAS','GSW':'GSW','NYK':'NYK','NOP':'NOP','SAS':'SAS',
};

async function getScoreboard() {
  try {
    const res = await fetch(ESPN + '/scoreboard', { timeout: 10000 });
    const data = await res.json();
    const games = (data.events || []).map(ev => {
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find(c => c.homeAway === 'home');
      const away = comp?.competitors?.find(c => c.homeAway === 'away');
      return {
        id: ev.id,
        HOME_TEAM_ID: home?.team?.abbreviation,
        VISITOR_TEAM_ID: away?.team?.abbreviation,
        homeName: home?.team?.displayName,
        awayName: away?.team?.displayName,
        homeScore: home?.score,
        awayScore: away?.score,
        status: ev.status?.type?.description,
        startTime: ev.date,
      };
    });
    return { games, date: new Date().toISOString().split('T')[0].replace(/-/g,'') };
  } catch(e) { console.error('Scoreboard error:', e.message); return { games: [], date: '' }; }
}

async function getTeamStats() {
  try {
    const res = await fetch(ESPN + '/standings', { timeout: 10000 });
    const data = await res.json();
    const teams = [];
    for (const group of (data.children || [])) {
      for (const entry of (group.standings?.entries || [])) {
        const t = entry.team || {};
        const stats = {};
        for (const s of (entry.stats || [])) { stats[s.abbreviation || s.name] = s.value || s.displayValue; }
        const abbr = TEAM_ABBR_MAP[t.abbreviation] || t.abbreviation;
        teams.push({
          TEAM_ID: t.id, TEAM_ABBREVIATION: abbr, TEAM_NAME: t.displayName,
          GP: parseInt(stats.GP || stats.gamesPlayed || 0),
          W: parseInt(stats.W || stats.wins || 0),
          L: parseInt(stats.L || stats.losses || 0),
          PTS: parseFloat(stats.PPG || stats.avgPointsFor || 110),
          OPP_PTS: parseFloat(stats.OPPG || stats.avgPointsAgainst || 110),
          FG_PCT: parseFloat(stats['FG%'] || 0.46),
          FG3_PCT: parseFloat(stats['3P%'] || 0.36),
          REB: parseFloat(stats.RPG || 44),
          AST: parseFloat(stats.APG || 25),
          STL: parseFloat(stats.SPG || 7),
          BLK: parseFloat(stats.BPG || 5),
          TOV: parseFloat(stats.TPG || 14),
          DIFF: parseFloat(stats.DIFF || stats.differential || 0),
          STRK: stats.STRK || stats.streak || '',
        });
      }
    }
    return teams;
  } catch(e) { console.error('Team stats error:', e.message); return []; }
}

async function getTeamAdvanced(teams) {
  // Derive advanced stats from base ESPN data
  return teams.map(t => ({
    TEAM_ID: t.TEAM_ID,
    OFF_RATING: 100 + (t.PTS - 110) * 1.1 + (t.DIFF > 0 ? t.DIFF * 0.3 : t.DIFF * 0.3),
    DEF_RATING: 100 + (t.OPP_PTS - 110) * 1.1 - (t.DIFF > 0 ? t.DIFF * 0.3 : t.DIFF * 0.3),
    NET_RATING: t.DIFF * 1.0,
    PACE: 100,
    EFG_PCT: t.FG_PCT * 1.08,
    TS_PCT: t.FG_PCT * 1.12,
  }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const { type } = req.query;
  try {
    let result = {};
    switch(type) {
      case 'scoreboard':
        result = await getScoreboard(); break;
      case 'teamstats': {
        const teams = await getTeamStats();
        const adv = await getTeamAdvanced(teams);
        result = { base: teams, advanced: adv, last10: teams, last5: teams }; break;
      }
      case 'all': {
        const [sb, teams] = await Promise.all([getScoreboard(), getTeamStats()]);
        const adv = await getTeamAdvanced(teams);
        result = {
          scoreboard: sb,
          teamStats: { base: teams, advanced: adv, last10: teams, last5: teams },
          standings: [],
          meta: { season: '2025-26', timestamp: new Date().toISOString() },
        }; break;
      }
      default: return res.status(400).json({ error: 'Use: scoreboard, teamstats, all' });
    }
    res.status(200).json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
};
