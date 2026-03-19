# NBA Predict 🏀

NBA prediction engine with game winner picks, O/U projections, power rankings, and model-vs-Vegas value plays.

## Live Stack
- **Frontend:** Vanilla HTML/CSS/JS (single-page app)
- **Backend:** Vercel serverless functions (Node.js)
- **Data:** NBA Stats API + The Odds API

## Features
- **Game Predictions** — Net rating, Pythagorean wins, recent form, home court, momentum
- **Model vs Vegas** — Side-by-side comparison with value play detection (3%+ edge)
- **Over/Under** — Pace-adjusted total projections vs Vegas lines
- **Power Rankings** — Composite scoring: net rating, Pythagorean, form, record
- **Player Props** — Coming soon

## Prediction Model Weights
| Factor | Weight |
|---|---|
| Net Rating (ORTG - DRTG) | 30% |
| Pythagorean Win Expectation | 15% |
| Recent Form (Last 10) | 15% |
| Home Court Advantage (+2.8 pts) | 10% |
| Rest / Back-to-Back | 10% |
| Momentum (Last 5) | 10% |
| Season Record | 10% |

## Setup

### 1. Create Vercel Project
```bash
npm i -g vercel
vercel
```

### 2. Add Environment Variables
Get a free API key from [The Odds API](https://the-odds-api.com):
```bash
vercel env add ODDS_API_KEY
```

### 3. Deploy
```bash
vercel --prod
```

## API Endpoints
| Endpoint | Description |
|---|---|
| `/api/data?type=all` | Full data bundle (scoreboard + team stats + standings) |
| `/api/data?type=scoreboard` | Today's games |
| `/api/data?type=teamstats` | Season team stats (base + advanced + last 10 + last 5) |
| `/api/odds` | Sportsbook odds with consensus lines |
| `/api/predictions` | Engine config & model info |

## Architecture
```
nba-predict/
├── api/
│   ├── data.js          # NBA Stats API fetcher
│   ├── odds.js          # The Odds API integration
│   └── predictions.js   # Server-side prediction engine
├── public/
│   └── index.html       # Full SPA with client-side engine
├── vercel.json
├── package.json
└── README.md
```

## Coming Soon
- [ ] Player props with matchup defense analysis
- [ ] Accuracy tracking (30-day rolling)
- [ ] Playoff series predictions
- [ ] Injury impact adjustments
- [ ] Historical backtesting

---
*For entertainment purposes only. Not financial advice.*
