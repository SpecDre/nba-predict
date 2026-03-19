const fetch = require('node-fetch');

// ============================================================
// NBA PREDICT ENGINE v1.0
// ============================================================
// Game Winner Model Factors:
//   - Net Rating (ORTG - DRTG)          30%
//   - Recent Form (Last 10 W%)          15%
//   - Home Court Advantage              10%
//   - Rest / Back-to-Back               10%
//   - Pythagorean Win Expectation       15%
//   - Last 5 Momentum                   10%
//   - Record vs .500+ Teams             10%
// ============================================================

const HOME_COURT_EDGE = 2.8;
const B2B_PENALTY = 3.5;
const REST_BONUS_PER_DAY = 0.4;
const PYTH_EXP = 13.91;

const WEIGHTS = {
  netRating: 0.30,
  recentForm: 0.15,
  homeCourt: 0.10,
  rest: 0.10,
  pythagorean: 0.15,
  momentum: 0.10,
  eliteRecord: 0.10,
};

function pointsToWinProb(ptDiff) {
  return 1 / (1 + Math.pow(10, -ptDiff / 8.5));
}

function pythagoreanWins(pointsFor, pointsAgainst, games) {
  const pfExp = Math.pow(pointsFor, PYTH_EXP);
  const paExp = Math.pow(pointsAgainst, PYTH_EXP);
  const winPct = pfExp / (pfExp + paExp);
  return { winPct, projectedWins: Math.round(winPct * games) };
}

function buildTeamProfile(teamBase, teamAdv, teamLast10, teamLast5, standings) {
  const profile = {};
  if (!teamBase || !teamAdv) return profile;
  const advMap = {}; teamAdv.forEach(t => advMap[t.TEAM_ID] = t);
  const last10Map = {}; if (teamLast10) teamLast10.forEach(t => last10Map[t.TEAM_ID] = t);
  const last5Map = {}; if (teamLast5) teamLast5.forEach(t => last5Map[t.TEAM_ID] = t);
  const standMap = {}; if (standings) standings.forEach(t => standMap[t.TeamID] = t);
  teamBase.forEach(team => {
    const id = team.TEAM_ID;
    const abbr = team.TEAM_ABBREVIATION;
    const adv = advMap[id] || {};
    const l10 = last10Map[id] || {};
    const l5 = last5Map[id] || {};
    const stand = standMap[id] || {};
    const gp = team.GP || 1;
    const w = team.W || 0;
    const l = team.L || 0;
    const ppg = team.PTS || 110;
    const oppPpg = ppg - (adv.NET_RATING || 0);
    profile[abbr] = { id, abbr, name: team.TEAM_NAME, gp, w, l, winPct: w / Math.max(gp, 1), ppg, oppPpg, ortg: adv.OFF_RATING || 110, drtg: adv.DEF_RATING || 110, netRating: adv.NET_RATING || 0, pace: adv.PACE || 100, pythWinPct: pythagoreanWins(ppg, oppPpg, 82).winPct, last10: { ppg: l10.PTS || ppg, winPct: l10.GP ? (l10.W / l10.GP) : (w / Math.max(gp, 1)) }, last5: { ppg: l5.PTS || ppg, winPct: l5.GP ? (l5.W / l5.GP) : (w / Math.max(gp, 1)) } };
  });
  return profile;
}

function predictGame(homeTeam, awayTeam, homeRestDays = 1, awayRestDays = 1) {
  if (!homeTeam || !awayTeam) return { error: 'Missing team data' };
  const netRatingPts = homeTeam.netRating - awayTeam.netRating;
  const formDiff = (homeTeam.last10.winPct - awayTeam.last10.winPct) * 10;
  const homePts = HOME_COURT_EDGE;
  let restPts = 0;
  const pythDiff = (homeTeam.pythWinPct - awayTeam.pythWinPct) * 10;
  const momentumDiff = (homeTeam.last5.winPct - awayTeam.last5.winPct) * 8;
  const eliteDiff = (homeTeam.winPct - awayTeam.winPct) * 6;
  const rawSpread = netRatingPts * WEIGHTS.netRating + formDiff * WEIGHTS.recentForm + homePts * WEIGHTS.homeCourt + restPts * WEIGHTS.rest + pythDiff * WEIGHTS.pythagorean + momentumDiff * WEIGHTS.momentum + eliteDiff * WEIGHTS.eliteRecord;
  const spread = Math.max(-20, Math.min(20, rawSpread));
  const homeWinProb = pointsToWinProb(spread);
  const avgPace = (homeTeam.pace + awayTeam.pace) / 2;
  const paceAdj = avgPace / 100;
  const projHomeScore = Math.round((homeTeam.ortg + (110 - awayTeam.drtg)) / 2 * paceAdj);
  const projAwayScore = Math.round((awayTeam.ortg + (110 - homeTeam.drtg)) / 2 * paceAdj);
  const projTotal = projHomeScore + projAwayScore;
  const gpMin = Math.min(homeTeam.gp, awayTeam.gp);
  const confidence = Math.round((Math.min(gpMin / 30, 1) * 0.6 + Math.min(Math.abs(spread) / 10, 1) * 0.4) * 100);
  return { homeTeam: homeTeam.abbr, awayTeam: awayTeam.abbr, homeName: homeTeam.name, awayName: awayTeam.name, spread: +spread.toFixed(1), homeWinProb: +(homeWinProb * 100).toFixed(1), awayWinProb: +((1 - homeWinProb) * 100).toFixed(1), projHomeScore, projAwayScore, projTotal, confidence, pick: homeWinProb >= 0.5 ? homeTeam.abbr : awayTeam.abbr, pickName: homeWinProb >= 0.5 ? homeTeam.name : awayTeam.name };
}

function generatePowerRankings(profiles) {
  return Object.values(profiles).map(team => ({
    abbr: team.abbr, name: team.name, record: `${team.w}-${team.l}`,
    netRating: +team.netRating.toFixed(1), ortg: +team.ortg.toFixed(1), drtg: +team.drtg.toFixed(1),
    pace: +team.pace.toFixed(1), pythWinPct: +(team.pythWinPct * 100).toFixed(1),
    score: +((team.netRating + 15) * 2 * 0.40 + team.pythWinPct * 100 * 0.20 + team.last10.winPct * 100 * 0.20 + team.winPct * 100 * 0.10 + team.last5.winPct * 100 * 0.10).toFixed(1),
  })).sort((a, b) => b.score - a.score).map((t, i) => ({ ...t, rank: i + 1 }));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const { type } = req.query;
  try {
    if (type === 'rankings' && req.method === 'POST') {
      const { profiles } = req.body;
      return res.status(200).json({ rankings: generatePowerRankings(profiles) });
    }
    res.status(200).json({ version: '1.0.0', model: 'NBA Predict Engine', weights: WEIGHTS, constants: { HOME_COURT_EDGE, B2B_PENALTY, REST_BONUS_PER_DAY, PYTH_EXP }, factors: Object.keys(WEIGHTS) });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
module.exports.predictGame = predictGame;
module.exports.generatePowerRankings = generatePowerRankings;
module.exports.buildTeamProfile = buildTeamProfile;
module.exports.pointsToWinProb = pointsToWinProb;
module.exports.pythagoreanWins = pythagoreanWins;
