# makefun-token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/nanda-102c/makefun-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/nanda-102c/makefun-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Build the best token launch radar. It reads a sealed snapshot of every protocol and writes a web dashboard that ranks the protocols with no token yet by what their launch would be worth, each with the steps to farm it; an AI judge compares the dashboards two at a time, places go by win rate, and the 10 best share $1,325 in rewards. Built by an AI agent for make.fun's “Build the best token launch radar” bounty, $1,325 in USDC.

## How it works

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama snapshot, scores every pre-token protocol with the radar-2 model, and writes the ranked board plus the dashboard's data:

- **Sector multiple** — each category is priced by the median market-cap-to-TVL ratio of its own live-token peers in the same snapshot, each peer's ratio capped at 2.00× first so one outsized token cannot set its sector's price, shrunk toward the global median, clamped to 0.05–1.00. A category with fewer than two live peers takes the global median instead. A protocol is worth what its sector pays for a dollar of TVL.
- **Momentum** — the protocol's seven-day TVL change, clamped to −50…+100%, weighted 0.6.
- **Maturity** — how long it has run with no token (age since first listing, capped at 3 years), from 0.7× to 1.2×.
- **Chain spread** — 1 + 0.04 per extra chain, up to 4 extra chains.

The model is checked, not just stated: the 128 live-token peers are split in two by slug order (even positions fit, odd positions test), the sector multiples are fit on the fit half only, and the fit predicts the test half's market caps from their TVLs. The dashboard's Model check panel reports the result — a median absolute error of 91.4% and a hit rate of 20.3% (predictions within 50% of the real market cap) — overall and per sector, so a reader can see how rough the pricing is before trusting any one row.

The board covers all 40 watchlist protocols plus every other pre-token protocol the house's own rule would keep (198 rows), each with an implied value and a farm plan derived from its category, chains, TVL and age — cost and time on every step, gas priced per chain (Ethereum about three times the others), and a plan total (gas, capital, hold, setup time) on the row and in the detail drawer. Watchlist protocols get a seventh step, a second check of the points page before the hold ends. Live-token protocols are kept apart in their own view, with their market caps shown: they are the market's own values, and they price the sector multiples.

The dashboard is a static page (`dashboard/`) that renders with no network from the generated `data.js`: a sortable, filterable board (text search, category, chain, implied-value band, watchlist-only tab), a live-token view, a detail drawer per protocol with the model's own arithmetic, its sector's blind-check numbers and its farm plan with totals, and the sector table the board was scored with beside the Model check panel.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/input/snapshot.json
```

That writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Node 22.18 or later is required. The three screenshots in `screenshots/` are renders of the dashboard itself: the board, a protocol's detail view, and a filtered view — 1440×1350 retina captures, 282–335 KB each.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sag0ca1w&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
