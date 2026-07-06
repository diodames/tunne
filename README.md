# Tausta

**Tausta** (*background* in Finnish) — valuation, range, peers, and street pulse from live Yahoo Finance data.

Search up to three symbols, choose **strategy presets** or toggle individual methods, and get a tagged verdict per strategy.

Use **Screener** (`/screener`) to browse a pre-computed S&P 500 ranking from the local batch job — filter by sector, verdict count, and quality scores.

## What it does

Enter a ticker (or company name — e.g. `AAPL`, `Tesla`, `PETR4.SA`) and Tausta builds a report with:

- **12 valuation strategies** — each returns an **under / fair / over / caution** tag with a short explanation
- **Sector-aware thresholds** — P/B, P/FCF, and EV/EBITDA bands adjust by sector; P/E compares to industry peer median
- **Weighted score** — an overall read from the strategies you have selected, with score drivers and conflict warnings
- **Side-by-side comparison** — when analyzing 2–3 tickers, a comparison table plus tabbed detail views
- **Price chart** — intraday through multi-year ranges
- **52-week range** — where the current price sits in the band (price context only — does not drag down the composite score near highs)
- **Peer comparison** — normalized performance vs industry peers (with market caps shown) and the S&P 500
- **Extended fundamentals** — revenue/EPS growth, margins, ROE, debt, payout ratio, 5Y price percentile, next earnings date
- **Forward outlook** — sector/industry context and key forward metrics
- **Street pulse** — recent headlines and (with an API key) an AI TL;DR; StockTwits demoted to optional retail mood
- **Tausta's read** — (with an API key) a short AI summary of price context, strategy read, and key caveats

### Getting started

On first visit, a sample **BRK.B** report loads automatically. The home screen offers **starter packs** (value vs growth, megacap trio, dividend income, banks, global ADRs, and more) — each applies a matching strategy preset and runs the tickers.

Below the search bar:

- **Recent** and **Saved** chips when you have history or a watchlist
- **Popular** quick picks (`AAPL`, `MSFT`, `KO`, `INTC`) when you have neither

Share an analysis via the **Share** button (copies a URL with tickers and strategies). Press **`/`** to focus the search box. Click **Tausta** in the header to return home.

### Strategies

| Group | Methods |
| --- | --- |
| Valuation ratios | P/E vs. industry, forward vs. trailing P/E, P/B, PEG, P/FCF, EV/EBITDA, dividend yield |
| Intrinsic value | Graham Number (off by default), analyst fair-value gap |
| Price context | 52-week range position (context only — excluded from composite) |
| Quality & risk | Piotroski F-Score, Altman Z-Score |

Open the strategies menu (sliders icon with a count badge) to pick a **preset** or toggle methods individually:

| Preset | What it selects |
| --- | --- |
| All methodologies | All 12 strategies |
| Balanced (default) | All except Graham Number |
| Deep value | Value ratios, Graham, quality scores, 52-week range |
| Quality at reasonable price | Earnings multiples, cash flow, analyst gap, quality scores |
| Dividend sustainability | Yield, cash flow, P/E, quality scores |

Your selection is remembered in the browser. Use **clear** in the preset header to deselect everything.

## Run locally

**Requirements:** [Node.js](https://nodejs.org/) 18+ and npm.

```bash
git clone <your-repo-url>
cd stock-screener
npm install
```

### Environment (optional)

Copy the example env file and add an Anthropic key if you want AI summaries:

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

| Feature | Without API key | With API key |
| --- | --- | --- |
| Live metrics & all 12 strategies | Yes | Yes |
| Charts, peers, outlook data | Yes | Yes |
| News & StockTwits counts | Yes | Yes |
| Tausta's read | No | Yes |
| Street pulse AI TL;DR | No | Yes |
| Forward outlook narrative | Data only | Data + AI narrative |

The app runs without a key; AI sections are simply skipped or show data-only fallbacks.

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

In dev, Vite serves the React app and mounts API routes under `/api/*` (metrics, chart, peers, search, sentiment, outlook, and an Anthropic proxy for opinions). Restart the dev server after changing `.env`.

Example shareable URL: `http://localhost:5173/?t=AAPL,MSFT&s=pe_industry,pfcf,piotroski`

### Production build

```bash
npm run build
npm run preview
```

Preview serves the built app at [http://localhost:4173](http://localhost:4173) by default.

The repo includes a `vercel.json` for [Vercel](https://vercel.com/) deploys. Set `ANTHROPIC_API_KEY` in the project environment variables on Vercel for AI features in production.

## Discovery screener (S&P 500 batch)

Tausta can screen the full S&P 500 using a **local batch job** that reuses the same strategy engine. Results are exported to `data/latest-run.json` and served by `/api/screener` (no database on Vercel).

### Workflow

1. **Universe** — `universe/sp500.csv` (refresh monthly):

   ```bash
   npm run universe:refresh
   ```

2. **Batch run** — analyzes each ticker with throttling (~25–35 min for full universe):

   ```bash
   npm run batch:test   # first 5 tickers (smoke test)
   npm run batch        # full S&P 500
   npm run batch:resume # continue an interrupted run
   ```

   Progress is stored in local SQLite (`data/tausta.db`, gitignored). On completion, `data/latest-run.json` is updated.

3. **Deploy screener data** — commit `data/latest-run.json` so production `/screener` has data:

   ```bash
   git add data/latest-run.json && git commit -m "Update screener batch"
   ```

4. **Browse** — open [/screener](http://localhost:5173/screener) for filters, presets, and ranking. Row click opens live ticker analysis at `/?t=TICKER`.

### Screener presets

| Preset | Filters |
| --- | --- |
| Deep value | ≥6 undervalued verdicts, sort by count |
| Quality + cheap | ≥4 undervalued, F-Score ≥6 |
| Contrarian | ≥5 undervalued, Altman distress zone |

### Scheduling (Option 1 — JSON + cron)

A helper script runs the batch, commits `data/latest-run.json` when it changes, and pushes to `main`:

```bash
npm run batch:nightly   # manual run (same as cron)
```

Install the weeknight cron job (2:00 AM Mon–Fri, logs to `data/nightly-batch.log`):

```bash
chmod +x scripts/nightly-batch.sh
(crontab -l 2>/dev/null; echo "0 2 * * 1-5 /Users/diodames/git-local/stock-screener/scripts/nightly-batch.sh") | crontab -
```

Verify: `crontab -l`

## Stack

- React 19 + Vite 6
- Tailwind CSS 4 + shadcn/ui
- Recharts
- [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) for market data

## Disclaimer

Live Yahoo financial data — educational tool — not financial advice. Figures may be delayed or approximate. Strategy tags are rule-of-thumb screens, not proof of intrinsic value. Verify anything important with primary sources or a licensed adviser.

Built by [Martin Andrle](https://martinandrle.com).
