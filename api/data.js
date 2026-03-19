const fetch = require('node-fetch');

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const ESPN_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2025';

const ABBR_FIX = {'GS':'GSW','NY':'NYK','NO':'NOP','SA':'SAS','UTAH':'UTA'};
function fixAbbr(a) { return ABBR_FIX[a] || a; }

function getStat(stats, name) {
  const s = stats.find(x => x.abbreviation === name || x.name === name);
  return s ? (parseFloat(s.displayValue) || parseFloat(s.value) || 0) : 0;
}

async function getScoreboard() {
  try {
    const res = await fetch(ESPN_SCOREBOARD, { timeout: 10000 });
    const data = await res.json();
    const games = (data.events || []).map(ev => {
      const c = ev.competitions?.[0];
      const home = c?.competitors?.find(x => x.homeAway === 'home');
      const away = c?.competitors?.find(x => x.homeAway === 'away');
      return {
        HOME_TEAM_ID: fixAbbr(home?.team?.abbreviation),
        VISITOR_TEAM_ID: fixAbbr(away?.team?.abbreviation),
        status: ev.status?.type?.description,
      };
    });
    return { games, date: new Date().toISOString().split('T')[0].replace(/-/g,'') };
  } catch(e) { return { games: [], date: '' }; }
}

async function getTeamStats() {
  try {
    const res = await fetch(ESPN_STANDINGS, { timeout: 10000 });
    const data = await res.json();
    const teams = [];
    for (const group of (data.children || [])) {
      for (const entry of (group.standings?.entries || [])) {
        const t = entry.team || {};
        const s = entry.stats || [];
        const abbr = fixAbbr(t.abbreviation);
        const w = getStat(s, 'W') || getStat(s, 'wins');
        const l = getStat(s, 'L') || getStat(s, 'losses');
        const ppg = getStat(s, 'PPG') || getStat(s, 'avgPointsFor') || 110;
        const oppPpg = getStat(s, 'OPP PPG') || getStat(s, 'avgPointsAgainst') || 110;
        const diff = getStat(s, 'DIFF') || getStat(s, 'differential') || 0;
        const strk = (s.find(x => x.abbreviation === 'STRK' || x.name === 'streak') || {}).displayValue || '';
        teams.push({
          TEAM_ID: t.id, TEAM_ABBREVIATION: abbr, TEAM_NAME: t.displayName || t.shortDisplayName,
          GP: w + l, W: w, L: l, PTS: ppg, OPP_PTS: oppPpg, DIFF: diff, STRK: strk,
          FG_PCT: 0.47, FG3_PCT: 0.36, REB: 44, AST: 25, STL: 7, BLK: 5, TOV: 14,
        });
      }
    }
    return teams;
  } catch(e) { console.error('Stats error:', e.message); return []; }
}

function deriveAdvanced(teams) {
  return teams.map(t => {
    const netRtg = t.DIFF * 0.75;
    return {
      TEAM_ID: t.TEAM_ID,
      OFF_RATING: 112 + (t.PTS - 112) * 0.9,
      DEF_RATING: 112 - (t.PTS - t.OPP_PTS) * 0.9 + (t.OPP_PTS - 112) * 0.9,
      NET_RATING: netRtg,
      PACE: 100,
    };
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const { type } = req.query;
  try {
    let result = {};
    switch(type) {
      case 'scoreboard': result = await getScoreboard(); break;
      case 'teamstats': {
        const base = await getTeamStats();
        result = { base, advanced: deriveAdvanced(base), last10: base, last5: base };
        break;
      }
      case 'all': {
        const [sb, base] = await Promise.all([getScoreboard(), getTeamStats()]);
        const adv = deriveAdvanced(base);
        result = {
          scoreboard: sb,
          teamStats: { base, advanced: adv, last10: base, last5: base },
          standings: [], meta: { season: '2025-26', timestamp: new Date().toISOString() },
        };
        break;
      }
      default: return res.status(400).json({ error: 'Use: scoreboard, teamstats, all' });
    }
    res.status(200).json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
};
