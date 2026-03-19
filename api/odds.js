const fetch = require('node-fetch');

// The Odds API - free tier: 500 requests/month
// User sets ODDS_API_KEY in Vercel env vars
const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports';
const SPORT = 'basketball_nba';

async function getOdds(apiKey, markets = 'h2h,spreads,totals') {
  const url = `${ODDS_BASE}/${SPORT}/odds/?apiKey=${apiKey}&regions=us&markets=${markets}&oddsFormat=american&bookmakers=fanduel,draftkings,betmgm,caesars`;
  
  const res = await fetch(url, { timeout: 10000 });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API ${res.status}: ${text}`);
  }
  return res.json();
}

async function getPlayerProps(apiKey) {
  // Player prop markets
  const propMarkets = ['player_points', 'player_rebounds', 'player_assists'];
  const results = {};
  
  for (const market of propMarkets) {
    try {
      const url = `${ODDS_BASE}/${SPORT}/events/?apiKey=${apiKey}&regions=us&markets=${market}&oddsFormat=american`;
      const res = await fetch(url, { timeout: 10000 });
      if (res.ok) {
        results[market] = await res.json();
      }
    } catch (e) {
      console.error(`Props error (${market}):`, e.message);
    }
  }
  
  return results;
}

// Convert American odds to implied probability
function americanToProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

// Convert implied probability to American odds
function probToAmerican(prob) {
  if (prob >= 0.5) return Math.round(-100 * prob / (1 - prob));
  return Math.round(100 * (1 - prob) / prob);
}

// Find consensus odds across books
function getConsensusOdds(game) {
  const consensus = { h2h: {}, spreads: {}, totals: {} };
  
  if (!game.bookmakers || game.bookmakers.length === 0) return consensus;
  
  game.bookmakers.forEach(book => {
    book.markets.forEach(market => {
      if (market.key === 'h2h') {
        market.outcomes.forEach(outcome => {
          if (!consensus.h2h[outcome.name]) consensus.h2h[outcome.name] = [];
          consensus.h2h[outcome.name].push(outcome.price);
        });
      }
      if (market.key === 'spreads') {
        market.outcomes.forEach(outcome => {
          if (!consensus.spreads[outcome.name]) consensus.spreads[outcome.name] = { prices: [], points: [] };
          consensus.spreads[outcome.name].prices.push(outcome.price);
          consensus.spreads[outcome.name].points.push(outcome.point);
        });
      }
      if (market.key === 'totals') {
        market.outcomes.forEach(outcome => {
          if (!consensus.totals[outcome.name]) consensus.totals[outcome.name] = { prices: [], points: [] };
          consensus.totals[outcome.name].prices.push(outcome.price);
          consensus.totals[outcome.name].points.push(outcome.point);
        });
      }
    });
  });
  
  // Average them out
  const result = { h2h: {}, spreads: {}, totals: {} };
  
  Object.entries(consensus.h2h).forEach(([team, prices]) => {
    const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    result.h2h[team] = { odds: avgPrice, impliedProb: americanToProb(avgPrice) };
  });
  
  Object.entries(consensus.spreads).forEach(([team, data]) => {
    const avgPrice = Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length);
    const avgSpread = +(data.points.reduce((a, b) => a + b, 0) / data.points.length).toFixed(1);
    result.spreads[team] = { odds: avgPrice, spread: avgSpread, impliedProb: americanToProb(avgPrice) };
  });
  
  Object.entries(consensus.totals).forEach(([label, data]) => {
    const avgPrice = Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length);
    const avgTotal = +(data.points.reduce((a, b) => a + b, 0) / data.points.length).toFixed(1);
    result.totals[label] = { odds: avgPrice, total: avgTotal, impliedProb: americanToProb(avgPrice) };
  });
  
  return result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      error: 'ODDS_API_KEY not set',
      message: 'Add your free API key from https://the-odds-api.com to Vercel env vars',
      games: []
    });
  }
  
  const { type } = req.query;
  
  try {
    if (type === 'props') {
      const props = await getPlayerProps(apiKey);
      return res.status(200).json(props);
    }
    
    const oddsData = await getOdds(apiKey);
    
    // Process each game
    const games = oddsData.map(game => ({
      id: game.id,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      startTime: game.commence_time,
      consensus: getConsensusOdds(game),
      bookmakers: game.bookmakers.map(b => ({
        name: b.title,
        markets: b.markets.reduce((acc, m) => {
          acc[m.key] = m.outcomes;
          return acc;
        }, {})
      }))
    }));
    
    res.status(200).json({ games, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Odds API Error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Export helpers for prediction engine
module.exports.americanToProb = americanToProb;
module.exports.probToAmerican = probToAmerican;
