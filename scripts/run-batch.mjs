#!/usr/bin/env node
/**
 * Nightly-style batch: analyze S&P 500 universe, store in SQLite, export JSON.
 *
 * Usage:
 *   npm run batch              # new run
 *   npm run batch:resume       # continue incomplete latest run
 *   npm run batch -- --limit 5 # smoke test (first 5 tickers)
 *   npm run batch -- --dry-run # alias for --limit 5
 */
import { fetchYahooMetrics } from "../api/_lib/yahoo.js";
import { analyzeTicker } from "../lib/analyze.js";
import { DEFAULT_STRATEGY_IDS } from "../lib/personas.js";
import { openDb } from "./db/client.js";
import {
  finishRun,
  isTickerDone,
  loadUniverse,
  pruneOldRuns,
  saveTickerResult,
  startRun,
  writeLatestRunJson,
} from "./db/queries.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UNIVERSE_PATH = path.join(ROOT, "universe", "sp500.csv");

const args = process.argv.slice(2);
const resume = args.includes("--resume");
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = dryRun ? 5 : (limitIdx >= 0 ? Number(args[limitIdx + 1]) : null);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitteredDelay() {
  return 2000 + Math.random() * 2000;
}

async function withRetry(fn, ticker, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const backoff = 1000 * 2 ** (attempt - 1);
        console.warn(`  ${ticker}: attempt ${attempt} failed (${err.message}), retry in ${backoff}ms`);
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

function resolveRun(db) {
  if (resume) {
    const open = db.prepare(
      "SELECT id, started_at FROM runs WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1"
    ).get();
    if (open) {
      console.log(`Resuming run #${open.id} (started ${open.started_at})`);
      return { runId: open.id, startedAt: open.started_at };
    }
    console.log("No incomplete run found — starting new run.");
  }
  return startRun(db, "balanced");
}

async function main() {
  if (!limit && !dryRun) {
    console.log("Full S&P 500 batch (~25–35 min). Use --limit 5 for a quick test.");
  }

  const universe = loadUniverse(UNIVERSE_PATH);
  const tickers = limit ? universe.slice(0, limit) : universe;
  console.log(`Universe: ${tickers.length} tickers from ${UNIVERSE_PATH}`);

  const db = openDb();
  const { runId } = resolveRun(db);

  let ok = 0;
  let failed = 0;
  const started = Date.now();

  for (let i = 0; i < tickers.length; i++) {
    const u = tickers[i];
    if (isTickerDone(db, runId, u.ticker)) {
      ok++;
      continue;
    }

    process.stdout.write(`[${i + 1}/${tickers.length}] ${u.ticker}… `);

    try {
      const analysis = await withRetry(
        () => analyzeTicker(fetchYahooMetrics, u.ticker, DEFAULT_STRATEGY_IDS),
        u.ticker,
      );

      const { data, results, composite, counts } = analysis;
      const row = {
        ticker: u.ticker,
        name: data.company_name || u.name,
        sector: data.sector || u.sector,
        price: data.price,
        composite_score: composite?.value ?? null,
        undervalued_count: counts.under,
        fair_count: counts.fair,
        overvalued_count: counts.over,
        caution_count: counts.caution,
        quality_piotroski: data.piotroski ?? null,
        quality_altman: data.altman_z ?? null,
        as_of: data.as_of ?? null,
      };

      const verdicts = results.map(({ strat, result }) => ({
        strategy: strat.id,
        verdict: result.kind,
        value: null,
        detail: result.detail,
      }));

      saveTickerResult(db, runId, row, verdicts);
      ok++;
      console.log(`ok (score ${row.composite_score ?? "—"}, ${row.undervalued_count}U)`);
    } catch (err) {
      failed++;
      console.log(`SKIP (${err.message})`);
    }

    if (i < tickers.length - 1) await sleep(jitteredDelay());
  }

  finishRun(db, runId, { tickersOk: ok, tickersFailed: failed });
  pruneOldRuns(db, 30);
  const jsonPath = writeLatestRunJson(db);
  db.close();

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\nRun #${runId} done in ${mins} min — ${ok} ok, ${failed} failed`);
  console.log(`Exported → ${jsonPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
