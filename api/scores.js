// /api/scores.js — Fetches today's NBA scoreboard
// Tries multiple sources with proper headers to avoid IP blocks

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=15'); // Cache 30s for live games

  const today = new Date();
  const dateSlash = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

  // Headers that mimic a browser (NBA blocks bare server requests)
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.nba.com/',
    'Origin': 'https://www.nba.com',
  };

  // Source 1: NBA CDN (most reliable, has the format we need)
  try {
    const cdnResp = await fetch(
      'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json',
      { headers: browserHeaders, signal: AbortSignal.timeout(5000) }
    );
    if (cdnResp.ok) {
      const data = await cdnResp.json();
      if (data.scoreboard && data.scoreboard.games) {
        return res.status(200).json(data);
      }
    }
  } catch (e) {
    console.log('CDN source failed:', e.message);
  }

  // Source 2: NBA stats endpoint (older format)
  try {
    const statsResp = await fetch(
      `https://stats.nba.com/stats/scoreboardv2?GameDate=${encodeURIComponent(dateSlash)}&LeagueID=00&DayOffset=0`,
      { headers: { ...browserHeaders, 'x-nba-stats-origin': 'stats', 'x-nba-stats-token': 'true' }, signal: AbortSignal.timeout(5000) }
    );
    if (statsResp.ok) {
      const data = await statsResp.json();
      // Convert scoreboardv2 format to CDN format
      if (data.resultSets && data.resultSets[0]) {
        const gameHeaders = data.resultSets[0].headers;
        const rows = data.resultSets[0].rowSet;
        const lineHeaders = data.resultSets[1] ? data.resultSets[1].headers : [];
        const lineRows = data.resultSets[1] ? data.resultSets[1].rowSet : [];

        const games = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const gameId = row[gameHeaders.indexOf('GAME_ID')];
          const statusText = row[gameHeaders.indexOf('GAME_STATUS_TEXT')];
          const statusNum = row[gameHeaders.indexOf('GAME_STATUS_ID')];
          const homeId = row[gameHeaders.indexOf('HOME_TEAM_ID')];
          const awayId = row[gameHeaders.indexOf('VISITOR_TEAM_ID')];

          // Get scores from line score
          let homeScore = 0, awayScore = 0;
          let homeAbbrev = '', awayAbbrev = '';
          lineRows.forEach(lr => {
            const tid = lr[lineHeaders.indexOf('TEAM_ID')];
            const abbrev = lr[lineHeaders.indexOf('TEAM_ABBREVIATION')];
            const pts = lr[lineHeaders.indexOf('PTS')] || 0;
            if (tid === homeId) { homeScore = pts; homeAbbrev = abbrev; }
            if (tid === awayId) { awayScore = pts; awayAbbrev = abbrev; }
          });

          games.push({
            gameId: gameId,
            gameStatusText: statusText,
            gameStatus: statusNum,
            homeTeam: { teamTricode: homeAbbrev, score: homeScore },
            awayTeam: { teamTricode: awayAbbrev, score: awayScore },
          });
        }

        return res.status(200).json({ scoreboard: { games } });
      }
    }
  } catch (e) {
    console.log('Stats source failed:', e.message);
  }

  // Source 3: data.nba.com (legacy endpoint)
  // NBA season year = current year if Oct-Dec, previous year if Jan-Sep
  const seasonYear = today.getMonth() >= 9 ? today.getFullYear() : today.getFullYear() - 1;
  try {
    const legacyResp = await fetch(
      `https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/${seasonYear}/scores/00_todays_scores.json`,
      { headers: browserHeaders, signal: AbortSignal.timeout(5000) }
    );
    if (legacyResp.ok) {
      const data = await legacyResp.json();
      if (data.gs && data.gs.g) {
        const games = data.gs.g.map(g => ({
          gameId: g.gid,
          gameStatusText: g.stt,
          gameStatus: g.stt.includes('Final') ? 3 : g.stt.includes(':') ? 1 : 2,
          homeTeam: { teamTricode: g.h.ta, score: parseInt(g.h.s) || 0 },
          awayTeam: { teamTricode: g.v.ta, score: parseInt(g.v.s) || 0 },
        }));
        return res.status(200).json({ scoreboard: { games } });
      }
    }
  } catch (e) {
    console.log('Legacy source failed:', e.message);
  }

  // All sources failed
  res.status(200).json({
    scoreboard: { games: [] },
    error: 'All NBA score sources unavailable',
    fallback: true,
  });
}
