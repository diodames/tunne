import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_PATH = path.join(ROOT, "data", "latest-run.json");

const SORT_KEYS = {
  composite: (a, b) => (b.composite_score ?? -1) - (a.composite_score ?? -1),
  under: (a, b) => b.undervalued_count - a.undervalued_count || SORT_KEYS.composite(a, b),
  piotroski: (a, b) => (b.quality_piotroski ?? -1) - (a.quality_piotroski ?? -1),
  altman: (a, b) => (b.quality_altman ?? -1) - (a.quality_altman ?? -1),
};

function altmanZone(row, zone) {
  const z = row.quality_altman;
  if (zone === "safe") return z != null && z > 3;
  if (zone === "grey") return z != null && z >= 1.8 && z <= 3;
  if (zone === "distress") return z != null && z < 1.8;
  return true;
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

export function queryScreener(snapshot, params = {}) {
  const {
    sector,
    minUnder = 0,
    minPiotroski = 0,
    altmanZone: altmanFilter,
    sort = "composite",
    limit = 200,
    offset = 0,
  } = params;

  const sectors = sector
    ? sector.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  let rows = [...(snapshot.rows || [])];

  if (sectors.length) {
    rows = rows.filter((r) => sectors.includes(r.sector));
  }
  if (minUnder > 0) {
    rows = rows.filter((r) => r.undervalued_count >= minUnder);
  }
  if (minPiotroski > 0) {
    rows = rows.filter((r) => (r.quality_piotroski ?? 0) >= minPiotroski);
  }
  if (altmanFilter) {
    rows = rows.filter((r) => altmanZone(r, altmanFilter));
  }

  const sorter = SORT_KEYS[sort] || SORT_KEYS.composite;
  rows.sort(sorter);

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);

  return {
    asOf: snapshot.asOf,
    runId: snapshot.runId,
    startedAt: snapshot.startedAt,
    finishedAt: snapshot.finishedAt,
    strategySet: snapshot.strategySet,
    tickersOk: snapshot.tickersOk,
    tickersFailed: snapshot.tickersFailed,
    total,
    rows: page,
  };
}

export function parseScreenerParams(searchParams) {
  return {
    sector: searchParams.get("sector") || undefined,
    minUnder: Number(searchParams.get("minUnder") || 0),
    minPiotroski: Number(searchParams.get("minPiotroski") || 0),
    altmanZone: searchParams.get("altmanZone") || undefined,
    sort: searchParams.get("sort") || "composite",
    limit: Math.min(500, Math.max(1, Number(searchParams.get("limit") || 200))),
    offset: Math.max(0, Number(searchParams.get("offset") || 0)),
  };
}

export { DATA_PATH, ROOT };
