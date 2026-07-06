import { isNum } from "./format.js";
import { STRATEGIES } from "./strategies.js";
import { STRATEGY_PERSONAS } from "./personas.js";

export const SCORE_BANDS = [
  { min: 75, label: "Strong value", kind: "under" },
  { min: 60, label: "Attractive", kind: "under" },
  { min: 40, label: "Fair", kind: "fair" },
  { min: 25, label: "Expensive", kind: "over" },
  { min: -Infinity, label: "Value trap risk", kind: "caution" },
];

export function computeComposite(strategies, d) {
  const scored = strategies
    .filter((s) => s.composite !== false)
    .map((s) => ({ id: s.id, weight: s.weight, score: s.score(d) }))
    .filter((s) => s.score !== null);
  const totalW = scored.reduce((sum, s) => sum + s.weight, 0);
  if (totalW === 0) return null;

  let value = scored.reduce((sum, s) => sum + s.score * s.weight, 0) / totalW;

  const distressed =
    (isNum(d.altman_z) && d.altman_z < 1.8) ||
    (isNum(d.piotroski) && d.piotroski <= 2);
  const capped = distressed && value > 50;
  if (capped) value = 50;

  const rounded = Math.round(value);
  const band = SCORE_BANDS.find((b) => rounded >= b.min);
  return { value: rounded, band, capped, counted: scored.length, scored };
}

export function computeScoreDrivers(strategies, d) {
  const scored = strategies
    .filter((s) => s.composite !== false)
    .map((s) => ({ name: s.name, id: s.id, weight: s.weight, score: s.score(d) }))
    .filter((s) => s.score !== null);
  const bullish = [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
  const bearish = [...scored].sort((a, b) => a.score - b.score).slice(0, 3);
  return { bullish, bearish };
}

export function detectConflicts(d, results) {
  const conflicts = [];
  const underCount = results.filter((r) => r.result.kind === "under").length;
  const overCount = results.filter((r) => r.result.kind === "over").length;
  const distressed = (isNum(d.altman_z) && d.altman_z < 1.8) || (isNum(d.piotroski) && d.piotroski <= 2);

  if (underCount >= 3 && distressed) {
    conflicts.push("Cheap on ratios but distress signals (Z-Score or F-Score) — classic value-trap pattern");
  }
  if (underCount >= 2 && overCount >= 2) {
    conflicts.push("Mixed verdicts — some metrics cheap, others expensive; sector norms may be pulling both ways");
  }
  if (isNum(d.p_fcf) && d.p_fcf < 15 && isNum(d.piotroski) && d.piotroski <= 3) {
    conflicts.push("Attractive cash-flow multiple but weak F-Score — verify earnings quality");
  }
  return conflicts;
}

export function reportComposite(report, selected) {
  if (report.status !== "done" || !report.data) return null;
  const active = STRATEGIES.filter((s) => selected.has(s.id));
  return computeComposite(active, report.data);
}

export function detectActivePersona(selected) {
  const ids = [...selected].sort().join(",");
  for (const [key, persona] of Object.entries(STRATEGY_PERSONAS)) {
    if ([...persona.ids].sort().join(",") === ids) return { key, ...persona };
  }
  return null;
}

export function compositeScoreSummary(composite, results) {
  if (!composite) return null;
  const under = results.filter((r) => r.result.kind === "under").length;
  const fair = results.filter((r) => r.result.kind === "fair").length;
  const over = results.filter((r) => r.result.kind === "over").length;
  const parts = [];
  if (under) parts.push(`${under} undervalued`);
  if (fair) parts.push(`${fair} fair`);
  if (over) parts.push(`${over} overvalued`);
  if (parts.length === 0) return `Based on ${composite.counted} selected checks`;
  return `${parts.join(", ")} on ${composite.counted} selected checks`;
}

export const KIND_META = {
  under: { label: "Undervalued", text: "text-under", dot: "bg-under", halo: "bg-under/30" },
  fair: { label: "Fair", text: "text-fair", dot: "bg-fair", halo: "bg-fair/30" },
  over: { label: "Overvalued", text: "text-over", dot: "bg-over", halo: "bg-over/30" },
  caution: { label: "Caution", text: "text-over", dot: "bg-over", halo: "bg-over/30" },
  context: { label: "Extended", text: "text-muted-foreground", dot: "bg-muted-foreground/70", halo: "bg-muted-foreground/25" },
  na: { label: "No data", text: "text-muted-foreground", dot: "bg-muted-foreground/70", halo: "bg-muted-foreground/25" },
};

export function summarizeGroupVerdicts(rows) {
  const counts = {};
  for (const { result } of rows) {
    counts[result.kind] = (counts[result.kind] || 0) + 1;
  }
  const parts = [];
  for (const kind of ["under", "fair", "over", "caution", "context", "na"]) {
    const n = counts[kind];
    if (!n) continue;
    parts.push(`${n} ${KIND_META[kind].label.toLowerCase()}`);
  }
  return parts.join(" · ");
}

export function countVerdicts(results) {
  const counts = { under: 0, fair: 0, over: 0, caution: 0, context: 0, na: 0 };
  for (const { result } of results) {
    if (counts[result.kind] !== undefined) counts[result.kind] += 1;
  }
  return counts;
}
