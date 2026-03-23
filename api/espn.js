// /api/espn.js — Proxies ESPN's free scoreboard + injuries
// No auth needed, no API key, widely used public endpoint
// Supports ?date=YYYYMMDD and ?injuries=1

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const withInjuries = req.query.injuries === '1';
  // Injuries change slowly, cache longer
  res.setHeader('Cache-Control', withInjuries ? 's-maxage=300, stale-while-revalidate=120' : 's-maxage=15, stale-while-revalidate=10');

  try {
    const dateParam = req.query.date;
    let url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    if (dateParam && /^\d{8}$/.test(dateParam)) {
      url += `?dates=${dateParam}`;
    }

    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`ESPN returned ${resp.status}`);
    const data = await resp.json();

    // Collect team IDs for injury lookups
    const teamIdMap = {}; // ESPN abbrev -> team ID

    const games = (data.events || []).map(ev => {
      const comp = ev.competitions?.[0];
      const situation = comp?.situation;
      const headline = comp?.headlines?.[0]?.shortLinkText || null;

      const away = comp?.competitors?.find(c => c.homeAway === 'away');
      const home = comp?.competitors?.find(c => c.homeAway === 'home');

      // Store team IDs for injury fetching
      if (away?.team?.id) teamIdMap[away.team.abbreviation] = away.team.id;
      if (home?.team?.id) teamIdMap[home.team.abbreviation] = home.team.id;

      // Quarter scores
      const awayPeriods = (away?.linescores || []).map((ls, i) => ({
        period: i + 1,
        periodType: i < 4 ? 'REGULAR' : 'OVERTIME',
        score: parseInt(ls.value) || 0,
      }));
      const homePeriods = (home?.linescores || []).map((ls, i) => ({
        period: i + 1,
        periodType: i < 4 ? 'REGULAR' : 'OVERTIME',
        score: parseInt(ls.value) || 0,
      }));

      // Leaders
      const gameLeaders = comp?.leaders || [];
      let awayLeader = null;
      let homeLeader = null;
      const pointsLeaders = gameLeaders.find(l => l.name === 'points');
      if (pointsLeaders?.leaders) {
        pointsLeaders.leaders.forEach(l => {
          const leader = {
            name: l.athlete?.displayName || '',
            jerseyNum: l.athlete?.jersey || '',
            points: 0, rebounds: 0, assists: 0,
          };
          const val = l.displayValue || '';
          const ptsMatch = val.match(/(\d+)\s*PTS/i);
          const rebMatch = val.match(/(\d+)\s*REB/i);
          const astMatch = val.match(/(\d+)\s*AST/i);
          if (ptsMatch) leader.points = parseInt(ptsMatch[1]);
          if (rebMatch) leader.rebounds = parseInt(rebMatch[1]);
          if (astMatch) leader.assists = parseInt(astMatch[1]);
          const teamId = l.team?.id;
          if (teamId === away?.team?.id) awayLeader = leader;
          else if (teamId === home?.team?.id) homeLeader = leader;
        });
      }

      return {
        espnId: ev.id,
        name: ev.shortName,
        date: ev.date,
        status: ev.status?.type?.description,
        statusState: ev.status?.type?.state,
        detail: ev.status?.type?.shortDetail || ev.status?.type?.detail || null,
        period: ev.status?.period || 0,
        clock: ev.status?.displayClock || '',
        lastPlay: situation?.lastPlay?.text || null,
        playType: situation?.lastPlay?.type?.text || null,
        headline,
        awayAbbrev: away?.team?.abbreviation || '',
        homeAbbrev: home?.team?.abbreviation || '',
        awayScore: parseInt(away?.score) || 0,
        homeScore: parseInt(home?.score) || 0,
        awayPeriods,
        homePeriods,
        awayLeader,
        homeLeader,
        awayInjuries: [],
        homeInjuries: [],
      };
    });

    // ── INJURY FETCHING ──
    if (withInjuries && Object.keys(teamIdMap).length > 0) {
      const injByTeam = {};

      // Step 1: Fetch injury list for each team (parallel)
      const teamEntries = Object.entries(teamIdMap);
      const injLists = await Promise.all(
        teamEntries.map(async ([abbrev, id]) => {
          try {
            const r = await fetch(
              `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/teams/${id}/injuries?limit=15`,
              { signal: AbortSignal.timeout(4000) }
            );
            const d = await r.json();
            const refs = (d.items || []).map(i => i.$ref).filter(Boolean);
            return { abbrev, refs };
          } catch { return { abbrev, refs: [] }; }
        })
      );

      // Step 2: Follow all $refs for injury details (parallel)
      const allRefs = [];
      injLists.forEach(t => {
        t.refs.forEach(ref => allRefs.push({ ref: ref.replace('http://', 'https://'), abbrev: t.abbrev }));
      });

      const details = await Promise.all(
        allRefs.map(async ({ ref, abbrev }) => {
          try {
            const r = await fetch(ref, { signal: AbortSignal.timeout(3000) });
            const d = await r.json();

            // Parse player name from shortComment
            let name = 'Unknown';
            if (d.shortComment) {
              const m = d.shortComment.match(/^(.+?)\s+(is|has|will|won't|remains|could|might|may|missed|sat|exited|left|sustained)/i);
              if (m) name = m[1].replace(/[,.]$/, '');
            }

            return {
              abbrev,
              name,
              status: d.status || '',
              statusAbbrev: d.type?.abbreviation || '',
              comment: d.shortComment || '',
              injuryType: d.details?.type || '',
              side: d.details?.side || '',
              returnDate: d.details?.returnDate || '',
            };
          } catch { return null; }
        })
      );

      // Group by team
      details.filter(Boolean).forEach(inj => {
        if (!injByTeam[inj.abbrev]) injByTeam[inj.abbrev] = [];
        injByTeam[inj.abbrev].push(inj);
      });

      // Attach to games
      games.forEach(g => {
        g.awayInjuries = injByTeam[g.awayAbbrev] || [];
        g.homeInjuries = injByTeam[g.homeAbbrev] || [];
      });
    }

    res.status(200).json({
      success: true,
      date: data.day?.date || dateParam || null,
      games,
    });
  } catch (error) {
    console.error('ESPN proxy error:', error.message);
    res.status(200).json({ success: false, error: error.message, games: [] });
  }
}
