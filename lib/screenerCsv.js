function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const CSV_COLUMNS = [
  { key: "ticker", label: "Ticker" },
  { key: "name", label: "Name" },
  { key: "sector", label: "Sector" },
  { key: "market_cap", label: "Market cap (USD)" },
  { key: "p_fcf", label: "P/FCF" },
  { key: "week52_off_pct", label: "Off 52w high (%)" },
  { key: "price", label: "Price" },
  { key: "composite_score", label: "Composite score" },
  { key: "undervalued_count", label: "Undervalued" },
  { key: "fair_count", label: "Fair" },
  { key: "overvalued_count", label: "Overvalued" },
  { key: "caution_count", label: "Caution" },
  { key: "quality_piotroski", label: "F-Score" },
  { key: "quality_altman", label: "Z-Score" },
];

export function rowsToCsv(rows) {
  const header = CSV_COLUMNS.map((col) => col.label).join(",");
  const body = rows.map((row) =>
    CSV_COLUMNS.map((col) => csvEscape(row[col.key])).join(","),
  );
  return [header, ...body].join("\n");
}

export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
