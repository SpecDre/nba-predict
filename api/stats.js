// /api/stats.js — Scrapes NBAstuffer.com for real-time NBA team stats
// Returns JSON with all 30 teams' stats for the v3 prediction engine

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800'); // Cache 1hr, stale OK for 30min

  try {
    const response = await fetch('https://www.nbastuffer.com/2025-2026-nba-team-stats/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`NBAstuffer returned ${response.status}`);
    }

    const html = await response.text();

    // Parse the HTML table for Regular Season stats
    // Table columns: RANK, TEAM, CONF, DIVISION, GP, PPG, oPPG, pDIFF, PACE, oEFF, dEFF, eDIFF, SoS, rSoS, SAR, CONS, A4F, W, L, WIN%, eWIN%, pWIN%, ACH, STRK
    const teams = parseStatsTable(html);

    if (!teams || teams.length === 0) {
      throw new Error('Failed to parse team stats from NBAstuffer');
    }

    res.status(200).json({
      success: true,
      updated: new Date().toISOString(),
      source: 'nbastuffer.com',
      teams,
    });
  } catch (error) {
    console.error('Stats scrape error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

// Team name → abbreviation mapping
const TEAM_ABBREVS = {
  'Atlanta': 'ATL', 'Boston': 'BOS', 'Brooklyn': 'BKN', 'Charlotte': 'CHO',
  'Chicago': 'CHI', 'Cleveland': 'CLE', 'Dallas': 'DAL', 'Denver': 'DEN',
  'Detroit': 'DET', 'Golden State': 'GSW', 'Houston': 'HOU', 'Indiana': 'IND',
  'LA Clippers': 'LAC', 'LA Lakers': 'LAL', 'Memphis': 'MEM', 'Miami': 'MIA',
  'Milwaukee': 'MIL', 'Minnesota': 'MIN', 'New Orleans': 'NOP', 'New York': 'NYK',
  'Oklahoma City': 'OKC', 'Orlando': 'ORL', 'Philadelphia': 'PHI', 'Phoenix': 'PHX',
  'Portland': 'POR', 'Sacramento': 'SAC', 'San Antonio': 'SAS', 'Toronto': 'TOR',
  'Utah': 'UTA', 'Washington': 'WAS',
};

const TEAM_NAMES = {
  'ATL': 'Hawks', 'BOS': 'Celtics', 'BKN': 'Nets', 'CHO': 'Hornets',
  'CHI': 'Bulls', 'CLE': 'Cavaliers', 'DAL': 'Mavericks', 'DEN': 'Nuggets',
  'DET': 'Pistons', 'GSW': 'Warriors', 'HOU': 'Rockets', 'IND': 'Pacers',
  'LAC': 'Clippers', 'LAL': 'Lakers', 'MEM': 'Grizzlies', 'MIA': 'Heat',
  'MIL': 'Bucks', 'MIN': 'Timberwolves', 'NOP': 'Pelicans', 'NYK': 'Knicks',
  'OKC': 'Thunder', 'ORL': 'Magic', 'PHI': '76ers', 'PHX': 'Suns',
  'POR': 'Trail Blazers', 'SAC': 'Kings', 'SAS': 'Spurs', 'TOR': 'Raptors',
  'UTA': 'Jazz', 'WAS': 'Wizards',
};

const TEAM_CITIES = {
  'ATL': 'Atlanta', 'BOS': 'Boston', 'BKN': 'Brooklyn', 'CHO': 'Charlotte',
  'CHI': 'Chicago', 'CLE': 'Cleveland', 'DAL': 'Dallas', 'DEN': 'Denver',
  'DET': 'Detroit', 'GSW': 'Golden State', 'HOU': 'Houston', 'IND': 'Indiana',
  'LAC': 'Los Angeles', 'LAL': 'Los Angeles', 'MEM': 'Memphis', 'MIA': 'Miami',
  'MIL': 'Milwaukee', 'MIN': 'Minnesota', 'NOP': 'New Orleans', 'NYK': 'New York',
  'OKC': 'Oklahoma City', 'ORL': 'Orlando', 'PHI': 'Philadelphia', 'PHX': 'Phoenix',
  'POR': 'Portland', 'SAC': 'Sacramento', 'SAS': 'San Antonio', 'TOR': 'Toronto',
  'UTA': 'Utah', 'WAS': 'Washington',
};

function calcElo(w, l) {
  if (w + l === 0) return 1500; // no games played, league average
  const pct = w / (w + l);
  if (pct <= 0.01) return 1200;
  if (pct >= 0.99) return 1800;
  return Math.round(1505 - 450 * Math.log10((1 / pct) - 1));
}

function parseStatsTable(html) {
  const teams = [];

  // Extract table rows using regex (no DOM parser in serverless)
  // Find the first table (Regular Season) 
  // Each row pattern: <td>...</td> cells
  const tableRegex = /<tbody[^>]*>([\s\S]*?)<\/tbody>/gi;
  const tables = [];
  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    tables.push(tableMatch[1]);
  }

  if (tables.length === 0) return null;

  // First tbody = Regular Season stats
  const seasonTable = tables[0];

  // Also grab L5 table if available (second tbody)
  const l5Table = tables.length > 1 ? tables[1] : null;
  const l5Data = {};

  // Parse L5 table for last-5-games win/loss
  if (l5Table) {
    const l5RowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let l5Row;
    while ((l5Row = l5RowRegex.exec(l5Table)) !== null) {
      const cells = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cell;
      while ((cell = cellRegex.exec(l5Row[1])) !== null) {
        cells.push(cell[1].replace(/<[^>]*>/g, '').trim());
      }
      if (cells.length >= 24) {
        const teamName = cells[1];
        const abbrev = TEAM_ABBREVS[teamName];
        if (abbrev) {
          const w5 = parseInt(cells[17]) || 0;
          const l5 = parseInt(cells[18]) || 0;
          const strk = parseInt(cells[23]) || 0;
          l5Data[abbrev] = { w5, l5, strk };
        }
      }
    }
  }

  // Parse Regular Season table
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(seasonTable)) !== null) {
    const cells = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }

    // Expect 24 columns: RANK, TEAM, CONF, DIV, GP, PPG, oPPG, pDIFF, PACE, oEFF, dEFF, eDIFF, SoS, rSoS, SAR, CONS, A4F, W, L, WIN%, eWIN%, pWIN%, ACH, STRK
    if (cells.length >= 24) {
      const teamName = cells[1];
      const abbrev = TEAM_ABBREVS[teamName];
      if (!abbrev) continue;

      const w = parseInt(cells[17]) || 0;
      const l = parseInt(cells[18]) || 0;
      const ppg = parseFloat(cells[5]) || 0;
      const papg = parseFloat(cells[6]) || 0;
      const pace = parseFloat(cells[8]) || 100;
      const offRtg = parseFloat(cells[9]) || 110;
      const defRtg = parseFloat(cells[10]) || 110;
      const netRtg = parseFloat(cells[11]) || 0;
      const streakNum = parseInt(cells[23]) || 0;
      const conf = cells[2] || 'East';

      // Calculate derived values
      const elo = calcElo(w, l);

      // Streak string
      const streak = streakNum > 0 ? `W${streakNum}` : `L${Math.abs(streakNum)}`;

      // Home/away estimates from overall record
      const totalG = w + l;
      const homeG = Math.round(totalG / 2);
      const awayG = totalG - homeG;
      const winPct = totalG > 0 ? w / totalG : 0.5;
      const homeWinPct = Math.min(0.95, winPct + 0.06);
      const awayWinPct = Math.max(0.05, winPct - 0.06);
      const homeW = Math.min(homeG, Math.round(homeG * homeWinPct));
      const homeL = homeG - homeW;
      const awayW = Math.max(0, w - homeW);
      const awayL = Math.max(0, l - homeL);

      // Last 10 from L5 data (doubled)
      const l5 = l5Data[abbrev];
      let last10 = '5-5'; // default
      if (l5) {
        const w10 = Math.min(10, l5.w5 * 2);
        last10 = `${w10}-${10 - w10}`;
      }

      teams.push({
        key: abbrev,
        name: TEAM_NAMES[abbrev] || teamName,
        city: TEAM_CITIES[abbrev] || teamName,
        conf: conf === 'East' ? 'East' : 'West',
        w, l, homeW, homeL, awayW, awayL,
        elo, netRtg, offRtg, defRtg,
        efg: 0, tov: 0, oreb: 0, ftRate: 0,
        pace, ppg, papg, streak, last10,
      });
    }
  }

  return teams;
}
