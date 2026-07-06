#!/usr/bin/env node
/**
 * Refresh universe/sp500.csv from Wikipedia's S&P 500 constituents table.
 * Run manually ~monthly: npm run universe:refresh
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "universe", "sp500.csv");
const WIKI_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";

function escapeCsv(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseWikipediaTable(html) {
  const start = html.indexOf('id="constituents"');
  if (start < 0) throw new Error("Could not find constituents table on Wikipedia page");
  const tableHtml = html.slice(start, start + 800000);

  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRe.exec(tableHtml)) !== null) {
    const cells = [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&#160;/g, " ").trim());
    if (cells.length < 3) continue;
    const ticker = cells[0].replace(/\./g, "-");
    const name = cells[1];
    const sector = cells[2];
    if (!ticker || ticker === "Symbol" || !/^[A-Z0-9.-]+$/i.test(ticker)) continue;
    rows.push({ ticker: ticker.toUpperCase(), name, sector });
  }
  return rows;
}

async function main() {
  console.log("Fetching S&P 500 from Wikipedia…");
  const res = await fetch(WIKI_URL, {
    headers: { "User-Agent": "TaustaStockScreener/1.0 (universe refresh)" },
  });
  if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
  const html = await res.text();
  const rows = parseWikipediaTable(html);
  if (rows.length < 400) {
    throw new Error(`Expected ~500 rows, got ${rows.length} — Wikipedia HTML may have changed`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const lines = ["ticker,name,sector", ...rows.map((r) =>
    [escapeCsv(r.ticker), escapeCsv(r.name), escapeCsv(r.sector)].join(",")
  )];
  fs.writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`Wrote ${rows.length} tickers to ${OUT}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
