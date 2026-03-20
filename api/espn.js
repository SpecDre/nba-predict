// /api/espn.js — Proxies ESPN's free scoreboard for last play + headlines
// No auth needed, no API key, widely used public endpoint

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=10');

  try {
    const resp = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      { signal: AbortSignal.timeout(5000) }
    );

    if (!resp.ok) throw new Error(`ESPN returned ${resp.status}`);
    const data = await resp.json();

    const games = (data.events || []).map(ev => {
      const comp = ev.competitions?.[0];
      const situation = comp?.situation;
      const headline = comp?.headlines?.[0]?.shortLinkText || null;

      // Map ESPN team abbreviations to match our keys
      const away = comp?.competitors?.find(c => c.homeAway === 'away');
      const home = comp?.competitors?.find(c => c.homeAway === 'home');

      return {
        espnId: ev.id,
        name: ev.shortName,
        status: ev.status?.type?.description,
        detail: ev.status?.type?.shortDetail || null,
        lastPlay: situation?.lastPlay?.text || null,
        playType: situation?.lastPlay?.type?.text || null,
        headline,
        awayAbbrev: away?.team?.abbreviation || '',
        homeAbbrev: home?.team?.abbreviation || '',
      };
    });

    res.status(200).json({ success: true, games });
  } catch (error) {
    console.error('ESPN proxy error:', error.message);
    res.status(200).json({ success: false, error: error.message, games: [] });
  }
}
