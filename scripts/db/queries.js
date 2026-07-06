import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, ROOT } from "./client.js";

export function startRun(db, strategySet) {
  const startedAt = new Date().toISOString();
  const result = db.prepare(
    "INSERT INTO runs (started_at, strategy_set) VALUES (?, ?)"
  ).run(startedAt, strategySet);
  return { runId: Number(result.lastInsertRowid), startedAt };
}

export function finishRun(db, runId, { tickersOk, tickersFailed }) {
  db.prepare(
    "UPDATE runs SET finished_at = ?, tickers_ok = ?, tickers_failed = ? WHERE id = ?"
  ).run(new Date().toISOString(), tickersOk, tickersFailed, runId);
}

export function isTickerDone(db, runId, ticker) {
  const row = db.prepare(
    "SELECT 1 FROM ticker_results WHERE run_id = ? AND ticker = ?"
  ).get(runId, ticker);
  return Boolean(row);
}

export function saveTickerResult(db, runId, row, verdicts) {
  const insertTicker = db.prepare(`
    INSERT OR REPLACE INTO ticker_results (
      run_id, ticker, name, sector, price, composite_score,
      undervalued_count, fair_count, overvalued_count, caution_count,
      quality_piotroski, quality_altman, as_of
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVerdict = db.prepare(`
    INSERT OR REPLACE INTO strategy_verdicts (run_id, ticker, strategy, verdict, value, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertTicker.run(
      runId,
      row.ticker,
      row.name,
      row.sector,
      row.price,
      row.composite_score,
      row.undervalued_count,
      row.fair_count,
      row.overvalued_count,
      row.caution_count,
      row.quality_piotroski,
      row.quality_altman,
      row.as_of,
    );
    for (const v of verdicts) {
      insertVerdict.run(runId, row.ticker, v.strategy, v.verdict, v.value, v.detail);
    }
  });
  tx();
}

export function exportLatestRun(db) {
  const run = db.prepare(
    "SELECT * FROM runs ORDER BY id DESC LIMIT 1"
  ).get();
  if (!run) return null;

  const rows = db.prepare(`
    SELECT ticker, name, sector, price, composite_score,
           undervalued_count, fair_count, overvalued_count, caution_count,
           quality_piotroski, quality_altman, as_of
    FROM ticker_results WHERE run_id = ?
    ORDER BY composite_score DESC
  `).all(run.id);

  const asOf = rows.reduce((latest, r) => {
    if (!r.as_of) return latest;
    return !latest || r.as_of > latest ? r.as_of : latest;
  }, null);

  return {
    runId: run.id,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
    asOf,
    strategySet: run.strategy_set,
    tickersOk: run.tickers_ok,
    tickersFailed: run.tickers_failed,
    rows,
  };
}

export function writeLatestRunJson(db) {
  const snapshot = exportLatestRun(db);
  if (!snapshot) return null;
  const outPath = path.join(ROOT, "data", "latest-run.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return outPath;
}

export function loadUniverse(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8").trim();
  const lines = text.split("\n");
  const header = lines[0].split(",");
  const tickerIdx = header.indexOf("ticker");
  const nameIdx = header.indexOf("name");
  const sectorIdx = header.indexOf("sector");

  return lines.slice(1).map((line) => {
    const parts = parseCsvLine(line);
    return {
      ticker: parts[tickerIdx]?.trim().toUpperCase(),
      name: parts[nameIdx]?.trim(),
      sector: parts[sectorIdx]?.trim(),
    };
  }).filter((r) => r.ticker);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function pruneOldRuns(db, keep = 30) {
  const old = db.prepare(
    "SELECT id FROM runs ORDER BY id DESC LIMIT -1 OFFSET ?"
  ).all(keep).map((r) => r.id);
  if (!old.length) return;
  const placeholders = old.map(() => "?").join(",");
  db.prepare(`DELETE FROM strategy_verdicts WHERE run_id IN (${placeholders})`).run(...old);
  db.prepare(`DELETE FROM ticker_results WHERE run_id IN (${placeholders})`).run(...old);
  db.prepare(`DELETE FROM runs WHERE id IN (${placeholders})`).run(...old);
}
