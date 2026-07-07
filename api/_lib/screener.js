import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_PATH = path.join(ROOT, "data", "latest-run.json");
const PREVIOUS_DATA_PATH = path.join(ROOT, "data", "previous-run.json");

const SORT_DESC = {
  composite: (a, b) => (b.composite_score ?? -1) - (a.composite_score ?? -1),
  under: (a, b) => b.undervalued_count - a.undervalued_count || SORT_DESC.composite(a, b),
  piotroski: (a, b) => (b.quality_piotroski ?? -1) - (a.quality_piotroski ?? -1),
  altman: (a, b) => (b.quality_altman ?? -1) - (a.quality_altman ?? -1),
  price: (a, b) => (b.price ?? -1) - (a.price ?? -1),
  market_cap: (a, b) => (b.market_cap ?? -1) - (a.market_cap ?? -1),
  p_fcf: (a, b) => (b.p_fcf ?? -1) - (a.p_fcf ?? -1),
  week52_off: (a, b) => (b.week52_off_pct ?? -1) - (a.week52_off_pct ?? -1),
};

function altmanZone(row, zone) {
  const z = row.quality_altman;
  if (zone === "safe") return z != null && z > 3;
  if (zone === "grey") return z != null && z >= 1.8 && z <= 3;
  if (zone === "distress") return z != null && z < 1.8;
  return true;
}

function marketCapBucket(mcap) {
  if (typeof mcap !== "number" || !Number.isFinite(mcap)) return null;
  if (mcap >= 10e9) return "large";
  if (mcap >= 2e9) return "mid";
  return "small";
}

function sectorCounts(rows = []) {
  const counts = {};
  for (const row of rows) {
    if (!row.sector) continue;
    counts[row.sector] = (counts[row.sector] || 0) + 1;
  }
  return counts;
}

function filterRows(allRows, params = {}) {
  const {
    sector,
    minUnder = 0,
    minPiotroski = 0,
    maxOver,
    maxCaution,
    altmanZone: altmanFilter,
    requireQuality = false,
    marketCapBucket: capFilter,
    q,
  } = params;

  const sectors = sector
    ? sector.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  let rows = [...allRows];
  const query = (q || "").trim().toUpperCase();

  if (query) {
    rows = rows.filter(
      (r) => r.ticker.includes(query) || (r.name || "").toUpperCase().includes(query),
    );
  }
  if (sectors.length) {
    rows = rows.filter((r) => sectors.includes(r.sector));
  }
  if (minUnder > 0) {
    rows = rows.filter((r) => r.undervalued_count >= minUnder);
  }
  if (minPiotroski > 0) {
    rows = rows.filter((r) => (r.quality_piotroski ?? 0) >= minPiotroski);
  }
  if (maxOver > 0 && !Number.isNaN(maxOver)) {
    rows = rows.filter((r) => (r.overvalued_count ?? 0) <= maxOver);
  }
  if (maxCaution > 0 && !Number.isNaN(maxCaution)) {
    rows = rows.filter((r) => (r.caution_count ?? 0) <= maxCaution);
  }
  if (altmanFilter) {
    rows = rows.filter((r) => altmanZone(r, altmanFilter));
  }
  if (requireQuality) {
    rows = rows.filter((r) => r.quality_piotroski != null && r.quality_altman != null);
  }
  if (capFilter) {
    rows = rows.filter((r) => marketCapBucket(r.market_cap) === capFilter);
  }

  return rows;
}

function sortRows(rows, sort = "composite", sortDir = "desc") {
  const sorter = SORT_DESC[sort] || SORT_DESC.composite;
  const compare = sortDir === "asc" ? (a, b) => sorter(b, a) : sorter;
  return [...rows].sort(compare);
}

function isComparablePreviousRun(currentSnapshot, previousSnapshot) {
  const currentCount = currentSnapshot?.rows?.length ?? 0;
  const previousCount = previousSnapshot?.rows?.length ?? 0;
  if (previousCount < 100 || currentCount < 100) return false;
  return previousCount >= currentCount * 0.5;
}

function computeNewMatches(snapshot, previousSnapshot, params) {
  if (!isComparablePreviousRun(snapshot, previousSnapshot)) return [];
  const previousTickers = new Set(
    filterRows(previousSnapshot.rows || [], params).map((r) => r.ticker),
  );
  return filterRows(snapshot.rows || [], params)
    .map((r) => r.ticker)
    .filter((ticker) => !previousTickers.has(ticker));
}

export function loadLatestRun() {
  if (!fs.existsSync(DATA_PATH)) {
    return {
      runId: null,
      startedAt: null,
      finishedAt: null,
      asOf: null,
      strategySet: "balanced",
      tickersOk: 0,
      tickersFailed: 0,
      rows: [],
    };
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

export function loadPreviousRun() {
  if (!fs.existsSync(PREVIOUS_DATA_PATH)) return null;
  return JSON.parse(fs.readFileSync(PREVIOUS_DATA_PATH, "utf8"));
}

export function queryScreener(snapshot, params = {}) {
  const {
    sort = "composite",
    sortDir = "desc",
    limit = 200,
    offset = 0,
  } = params;

  const allRows = snapshot.rows || [];
  const filtered = filterRows(allRows, params);
  const rows = sortRows(filtered, sort, sortDir);
  const previousSnapshot = loadPreviousRun();
  const newMatches = computeNewMatches(snapshot, previousSnapshot, params);

  return {
    asOf: snapshot.asOf,
    runId: snapshot.runId,
    startedAt: snapshot.startedAt,
    finishedAt: snapshot.finishedAt,
    strategySet: snapshot.strategySet,
    tickersOk: snapshot.tickersOk,
    tickersFailed: snapshot.tickersFailed,
    total: rows.length,
    limit,
    offset,
    rows: rows.slice(offset, offset + limit),
    sectors: [...new Set(allRows.map((r) => r.sector).filter(Boolean))].sort(),
    sectorCounts: sectorCounts(allRows),
    newMatches,
    previousRunId: previousSnapshot?.runId ?? null,
    previousAsOf: previousSnapshot?.asOf ?? null,
  };
}

export function parseScreenerParams(searchParams) {
  const maxOverRaw = searchParams.get("maxOver");
  const maxCautionRaw = searchParams.get("maxCaution");
  const capBucket = searchParams.get("marketCap") || undefined;

  return {
    sector: searchParams.get("sector") || undefined,
    minUnder: Number(searchParams.get("minUnder") || 0),
    minPiotroski: Number(searchParams.get("minPiotroski") || 0),
    maxOver: maxOverRaw != null && maxOverRaw !== "" ? Number(maxOverRaw) : undefined,
    maxCaution: maxCautionRaw != null && maxCautionRaw !== "" ? Number(maxCautionRaw) : undefined,
    altmanZone: searchParams.get("altmanZone") || undefined,
    requireQuality: searchParams.get("requireQuality") === "1",
    marketCapBucket: ["large", "mid", "small"].includes(capBucket) ? capBucket : undefined,
    q: searchParams.get("q") || undefined,
    sort: searchParams.get("sort") || "composite",
    sortDir: searchParams.get("sortDir") === "asc" ? "asc" : "desc",
    limit: Math.min(500, Math.max(1, Number(searchParams.get("limit") || 200))),
    offset: Math.max(0, Number(searchParams.get("offset") || 0)),
  };
}

export { DATA_PATH, PREVIOUS_DATA_PATH, ROOT };
