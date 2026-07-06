export function isNum(v) {
  return typeof v === "number" && isFinite(v);
}

export function fmt(v) {
  return isNum(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : "—";
}

export function pct(v) {
  return `${(v * 100).toFixed(0)}%`;
}

export function moneySymbol(currency) {
  if (!currency || currency === "USD") return "$";
  return `${currency} `;
}

export function fmtMoney(v, currency) {
  if (!isNum(v)) return "—";
  const sym = moneySymbol(currency);
  const abs = Math.abs(v);
  const formatted = abs >= 1000
    ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sym}${formatted}`;
}

export function verdict(kind, detail) {
  return { kind, detail };
}

export function na() {
  return { kind: "na", detail: "Data not available for this metric" };
}

export function splitDetail(detail) {
  const sep = detail.indexOf(" — ");
  if (sep === -1) return { primary: detail, secondary: null };
  return { primary: detail.slice(0, sep), secondary: detail.slice(sep + 3) };
}

/** Linear interpolation: `good` → 100, `bad` → 0, clamped */
export function lerpScore(value, good, bad) {
  const t = (value - bad) / (good - bad);
  return Math.max(0, Math.min(100, t * 100));
}
