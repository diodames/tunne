import { useEffect, useState } from "react";
import { ChevronDownIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/* ————— Value Ledger — undervalued stock screener —————
   Design: cool sage paper, deep pine ink, ledger rows with
   ink-stamp verdicts. Fraunces display / IBM Plex body+mono. */

/* ————— Strategy catalogue ————— */
const STRATEGIES = [
  {
    id: "pe_industry", group: "Valuation ratios", name: "P/E vs. industry",
    how: "Compares trailing price-to-earnings against the industry average. A discount to peers can signal undervaluation.",
    pros: "Simple, widely available, comparable across peers.",
    cons: "Earnings can be distorted or cyclical; a low P/E may just reflect weak prospects (value trap).",
    evaluate: (d) => {
      if (!isNum(d.pe_ttm) || !isNum(d.industry_avg_pe)) return na();
      if (d.pe_ttm <= 0) return verdict("caution", `P/E ${fmt(d.pe_ttm)} — negative earnings, ratio not meaningful`);
      const disc = (d.industry_avg_pe - d.pe_ttm) / d.industry_avg_pe;
      if (disc > 0.15) return verdict("under", `P/E ${fmt(d.pe_ttm)} vs. industry ${fmt(d.industry_avg_pe)} (${pct(disc)} discount)`);
      if (disc > -0.1) return verdict("fair", `P/E ${fmt(d.pe_ttm)} near industry ${fmt(d.industry_avg_pe)}`);
      return verdict("over", `P/E ${fmt(d.pe_ttm)} above industry ${fmt(d.industry_avg_pe)}`);
    },
  },
  {
    id: "forward_pe", group: "Valuation ratios", name: "Forward vs. trailing P/E",
    how: "A forward P/E clearly below trailing implies analysts expect earnings growth that the price may not fully reflect.",
    pros: "Forward-looking; captures expected earnings momentum.",
    cons: "Relies on analyst estimates, which are frequently wrong or optimistic.",
    evaluate: (d) => {
      if (!isNum(d.pe_forward) || !isNum(d.pe_ttm) || d.pe_ttm <= 0 || d.pe_forward <= 0) return na();
      const drop = (d.pe_ttm - d.pe_forward) / d.pe_ttm;
      if (drop > 0.12) return verdict("under", `Forward ${fmt(d.pe_forward)} vs. trailing ${fmt(d.pe_ttm)} — earnings expected to grow ${pct(drop)}`);
      if (drop > -0.05) return verdict("fair", `Forward ${fmt(d.pe_forward)} ≈ trailing ${fmt(d.pe_ttm)}`);
      return verdict("over", `Forward ${fmt(d.pe_forward)} above trailing ${fmt(d.pe_ttm)} — earnings expected to shrink`);
    },
  },
  {
    id: "pb", group: "Valuation ratios", name: "Price-to-book (P/B)",
    how: "Price against accounting book value. Graham favored P/B under ~1.5; under 1 means paying less than net assets.",
    pros: "Grounded in the balance sheet; useful for banks and asset-heavy firms.",
    cons: "Misses intangibles, so modern tech/service firms look 'expensive' by default; book value can be stale.",
    evaluate: (d) => {
      if (!isNum(d.pb)) return na();
      if (d.pb < 1) return verdict("under", `P/B ${fmt(d.pb)} — trading below book value`);
      if (d.pb <= 1.5) return verdict("under", `P/B ${fmt(d.pb)} — within Graham's ≤1.5 zone`);
      if (d.pb <= 3.5) return verdict("fair", `P/B ${fmt(d.pb)}`);
      return verdict("over", `P/B ${fmt(d.pb)} — rich vs. book value`);
    },
  },
  {
    id: "peg", group: "Valuation ratios", name: "PEG ratio",
    how: "P/E divided by expected earnings growth. Under 1 suggests the price under-counts growth (Peter Lynch's rule of thumb).",
    pros: "Adjusts P/E for growth, so fast growers aren't unfairly penalized.",
    cons: "Growth forecasts are guesses; breaks down for low-growth or cyclical firms.",
    evaluate: (d) => {
      if (!isNum(d.peg)) return na();
      if (d.peg <= 0) return verdict("caution", `PEG ${fmt(d.peg)} — not meaningful (negative earnings or growth)`);
      if (d.peg < 1) return verdict("under", `PEG ${fmt(d.peg)} — growth looks under-priced`);
      if (d.peg <= 1.6) return verdict("fair", `PEG ${fmt(d.peg)}`);
      return verdict("over", `PEG ${fmt(d.peg)} — paying up for growth`);
    },
  },
  {
    id: "pfcf", group: "Valuation ratios", name: "Price-to-free-cash-flow",
    how: "Price against cash actually generated after capex. Value investors often look for P/FCF under ~15.",
    pros: "Cash is harder to manipulate than earnings.",
    cons: "FCF is lumpy year to year; punishes firms investing heavily for the future.",
    evaluate: (d) => {
      if (!isNum(d.p_fcf)) return na();
      if (d.p_fcf <= 0) return verdict("caution", `P/FCF ${fmt(d.p_fcf)} — negative free cash flow`);
      if (d.p_fcf < 15) return verdict("under", `P/FCF ${fmt(d.p_fcf)} — cheap on cash generation`);
      if (d.p_fcf <= 25) return verdict("fair", `P/FCF ${fmt(d.p_fcf)}`);
      return verdict("over", `P/FCF ${fmt(d.p_fcf)}`);
    },
  },
  {
    id: "ev_ebitda", group: "Valuation ratios", name: "EV / EBITDA",
    how: "Enterprise value over operating cash earnings; capital-structure neutral. Roughly, under ~10 reads cheap for most sectors.",
    pros: "Comparable across firms with different debt loads; standard in M&A.",
    cons: "Ignores capex and working capital; 'cheap' varies a lot by sector.",
    evaluate: (d) => {
      if (!isNum(d.ev_ebitda)) return na();
      if (d.ev_ebitda <= 0) return verdict("caution", `EV/EBITDA ${fmt(d.ev_ebitda)} — negative EBITDA`);
      if (d.ev_ebitda < 10) return verdict("under", `EV/EBITDA ${fmt(d.ev_ebitda)}`);
      if (d.ev_ebitda <= 14) return verdict("fair", `EV/EBITDA ${fmt(d.ev_ebitda)}`);
      return verdict("over", `EV/EBITDA ${fmt(d.ev_ebitda)}`);
    },
  },
  {
    id: "dividend", group: "Valuation ratios", name: "Dividend yield",
    how: "An unusually high yield vs. history can flag a beaten-down price — if the payout is sustainable.",
    pros: "Tangible cash return; yield spikes often mark pessimism lows.",
    cons: "A sky-high yield often precedes a dividend cut — the classic yield trap.",
    evaluate: (d) => {
      if (!isNum(d.dividend_yield_pct)) return na();
      if (d.dividend_yield_pct === 0) return verdict("na", "No dividend paid");
      if (d.dividend_yield_pct > 6) return verdict("caution", `Yield ${fmt(d.dividend_yield_pct)}% — high enough to question sustainability`);
      if (d.dividend_yield_pct >= 3) return verdict("under", `Yield ${fmt(d.dividend_yield_pct)}% — attractive income level`);
      return verdict("fair", `Yield ${fmt(d.dividend_yield_pct)}%`);
    },
  },
  {
    id: "graham", group: "Intrinsic value", name: "Graham Number",
    how: "√(22.5 × EPS × book value per share). Price below this classic ceiling suggests a Graham-style bargain.",
    pros: "Conservative, formulaic, hard to fudge.",
    cons: "Built for 1970s industrials; rejects nearly every asset-light growth company.",
    evaluate: (d) => {
      if (!isNum(d.eps_ttm) || !isNum(d.bvps) || !isNum(d.price)) return na();
      if (d.eps_ttm <= 0 || d.bvps <= 0) return verdict("caution", "Negative EPS or book value — formula not applicable");
      const g = Math.sqrt(22.5 * d.eps_ttm * d.bvps);
      const gap = (g - d.price) / g;
      if (d.price < g) return verdict("under", `Price $${fmt(d.price)} vs. Graham № $${fmt(g)} (${pct(gap)} below)`);
      if (d.price < g * 1.2) return verdict("fair", `Price $${fmt(d.price)} slightly above Graham № $${fmt(g)}`);
      return verdict("over", `Price $${fmt(d.price)} well above Graham № $${fmt(g)}`);
    },
  },
  {
    id: "analyst", group: "Intrinsic value", name: "Analyst fair value gap",
    how: "Compares price with the consensus 12-month analyst target as a proxy for estimated fair value.",
    pros: "Aggregates professional models you don't have to build.",
    cons: "Targets herd together, lag the market, and skew optimistic.",
    evaluate: (d) => {
      if (!isNum(d.analyst_target) || !isNum(d.price)) return na();
      const up = (d.analyst_target - d.price) / d.price;
      if (up > 0.15) return verdict("under", `Target $${fmt(d.analyst_target)} implies ${pct(up)} upside`);
      if (up > -0.05) return verdict("fair", `Target $${fmt(d.analyst_target)} ≈ price`);
      return verdict("over", `Target $${fmt(d.analyst_target)} below price (${pct(up)})`);
    },
  },
  {
    id: "week52", group: "Price context", name: "52-week range position",
    how: "Where price sits in its yearly range. The bottom third attracts contrarians and mean-reversion buyers.",
    pros: "Flags pessimism; good timing overlay on fundamental signals.",
    cons: "'Cheap vs. itself' isn't cheap vs. value — falling knives keep falling.",
    evaluate: (d) => {
      if (!isNum(d.week52_low) || !isNum(d.week52_high) || !isNum(d.price)) return na();
      const span = d.week52_high - d.week52_low;
      if (span <= 0) return na();
      const pos = (d.price - d.week52_low) / span;
      if (pos < 0.33) return verdict("under", `${pct(pos)} up the 52-wk range ($${fmt(d.week52_low)}–$${fmt(d.week52_high)}) — near lows`);
      if (pos < 0.7) return verdict("fair", `${pct(pos)} up the 52-wk range`);
      return verdict("over", `${pct(pos)} up the 52-wk range — near highs`);
    },
  },
  {
    id: "piotroski", group: "Quality & risk", name: "Piotroski F-Score",
    how: "Nine accounting checks (0–9) on profitability, leverage and efficiency. 7+ separates healthy cheap stocks from traps.",
    pros: "Evidence-backed filter against value traps.",
    cons: "Backward-looking; a score alone says nothing about price.",
    evaluate: (d) => {
      if (!isNum(d.piotroski)) return na();
      if (d.piotroski >= 7) return verdict("under", `F-Score ${d.piotroski}/9 — strong fundamentals support the value case`);
      if (d.piotroski >= 4) return verdict("fair", `F-Score ${d.piotroski}/9 — middling quality`);
      return verdict("caution", `F-Score ${d.piotroski}/9 — weak fundamentals, value-trap risk`);
    },
  },
  {
    id: "altman", group: "Quality & risk", name: "Altman Z-Score",
    how: "Bankruptcy-risk composite. Above 3 = safe zone; below 1.8 = distress. A trap detector, not a bargain finder.",
    pros: "Catches balance-sheet rot that cheap ratios hide.",
    cons: "Calibrated for manufacturers; misleading for banks and utilities.",
    evaluate: (d) => {
      if (!isNum(d.altman_z)) return na();
      if (d.altman_z > 3) return verdict("under", `Z-Score ${fmt(d.altman_z)} — safe zone, low distress risk`);
      if (d.altman_z >= 1.8) return verdict("fair", `Z-Score ${fmt(d.altman_z)} — grey zone`);
      return verdict("caution", `Z-Score ${fmt(d.altman_z)} — distress zone, cheapness may be deserved`);
    },
  },
];

const GROUPS = ["Valuation ratios", "Intrinsic value", "Price context", "Quality & risk"];

/* ————— helpers ————— */
function isNum(v) { return typeof v === "number" && isFinite(v); }
function fmt(v) { return isNum(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : "—"; }
function pct(v) { return `${(v * 100).toFixed(0)}%`; }
function verdict(kind, detail) { return { kind, detail }; }
function na() { return { kind: "na", detail: "Data not available for this metric" }; }

const KIND_META = {
  under:   { label: "UNDERVALUED", text: "text-under", soft: "bg-under-soft", border: "border-under" },
  fair:    { label: "FAIR",        text: "text-fair",  soft: "bg-fair-soft",  border: "border-fair" },
  over:    { label: "OVERVALUED",  text: "text-over",  soft: "bg-over-soft",  border: "border-over" },
  caution: { label: "CAUTION",     text: "text-over",  soft: "bg-over-soft",  border: "border-over" },
  na:      { label: "NO DATA",     text: "text-muted-foreground", soft: "bg-transparent", border: "border-border" },
};

/* ————— live data via Yahoo Finance (server endpoint) ————— */
async function fetchMetrics(ticker) {
  const response = await fetch(`/api/metrics/${encodeURIComponent(ticker)}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Metrics request failed (${response.status})`);
  }
  return response.json();
}

async function fetchOpinion(ticker, d, results) {
  const lines = results
    .filter((r) => r.result.kind !== "na")
    .map((r) => `- ${r.strat.name}: ${KIND_META[r.result.kind].label} (${r.result.detail})`)
    .join("\n");
  const prompt = `You are a neutral, careful equity analysis writer. Below are current metrics and rule-of-thumb valuation verdicts for ${d.company_name || ticker} (${ticker}), price ${d.currency || "USD"} ${d.price}${d.as_of ? ` as of ${d.as_of}` : ""}, market cap ${d.market_cap || "n/a"}, sector ${d.sector || "n/a"}.

Verdicts from the screening strategies:
${lines}

Write a concise 4-6 sentence plain-text read of this stock for an educational screening tool. Cover: (1) where the price currently stands (e.g. relative to its 52-week range of ${d.week52_low}-${d.week52_high} and the analyst target of ${d.analyst_target}); (2) the overall balance of the strategy verdicts and what the strongest signals for and against undervaluation are; (3) the most important caveat or value-trap risk given these specific numbers. Be balanced and factual. Do NOT tell the reader to buy or sell, do not use phrases like "you should", and do not use markdown or bullet points — plain prose only.`;

  const response = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Opinion request failed (${response.status})`);
  }
  const data = await response.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

/* ————— UI pieces ————— */
function Stamp({ kind }) {
  const m = KIND_META[kind];
  return <span className={cn("stamp", m.text, m.soft)}>{m.label}</span>;
}

function SectionLabel({ children, className }) {
  return (
    <div className={cn("text-xs font-medium text-muted-foreground", className)}>
      {children}
    </div>
  );
}

function PriceContext({ d }) {
  const hasRange = isNum(d.week52_low) && isNum(d.week52_high) && isNum(d.price) && d.week52_high > d.week52_low;
  const pos = hasRange ? Math.min(1, Math.max(0, (d.price - d.week52_low) / (d.week52_high - d.week52_low))) : null;
  const tPos = hasRange && isNum(d.analyst_target)
    ? Math.min(1, Math.max(0, (d.analyst_target - d.week52_low) / (d.week52_high - d.week52_low)))
    : null;
  const chg = d.day_change_pct;
  const stats = [
    ["Market cap", d.market_cap || "—"],
    ["Sector", d.sector || "—"],
    ["P/E (ttm)", fmt(d.pe_ttm)],
    ["EPS (ttm)", isNum(d.eps_ttm) ? fmt(d.eps_ttm) : "—"],
    ["Div. yield", isNum(d.dividend_yield_pct) ? `${fmt(d.dividend_yield_pct)}%` : "—"],
    ["Analyst target", isNum(d.analyst_target) ? `$${fmt(d.analyst_target)}` : "—"],
  ];
  return (
    <div className="border-b bg-background/60 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-4xl font-bold tabular-nums">
          {isNum(d.price) ? `${d.currency === "USD" || !d.currency ? "$" : d.currency + " "}${fmt(d.price)}` : "—"}
        </span>
        {isNum(chg) && (
          <span className={cn("font-mono text-sm font-medium tabular-nums", chg >= 0 ? "text-under" : "text-over")}>
            {chg >= 0 ? "▲" : "▼"} {fmt(Math.abs(chg))}% today
          </span>
        )}
        {d.as_of && <span className="font-mono text-xs text-muted-foreground">as of {d.as_of}</span>}
      </div>

      {hasRange && (
        <div className="mt-4">
          <div className="relative h-2 rounded-full bg-border">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                pos < 0.33 ? "bg-under" : pos < 0.7 ? "bg-fair" : "bg-over"
              )}
              style={{ width: `${pos * 100}%` }}
            />
            <div
              title={`Current price $${fmt(d.price)}`}
              className="absolute -top-1 h-4 w-3.5 rounded-sm border-2 border-card bg-foreground"
              style={{ left: `calc(${pos * 100}% - 7px)` }}
            />
            {tPos !== null && (
              <div
                title={`Analyst target $${fmt(d.analyst_target)}`}
                className="absolute -top-1.5 h-5 w-0.5 bg-muted-foreground"
                style={{ left: `calc(${tPos * 100}% - 1px)` }}
              />
            )}
          </div>
          <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground tabular-nums">
            <span>52-wk low ${fmt(d.week52_low)}</span>
            <span className="max-sm:hidden">price sits {pct(pos)} up the range{tPos !== null ? " · | = analyst target" : ""}</span>
            <span>52-wk high ${fmt(d.week52_high)}</span>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="font-mono text-sm font-medium tabular-nums">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ————— price chart ————— */
const CHART_RANGES = [
  ["1d", "1D"], ["5d", "5D"], ["1mo", "1M"], ["6mo", "6M"],
  ["ytd", "YTD"], ["1y", "1Y"], ["5y", "5Y"], ["max", "All"],
];

function tickFormatterFor(range) {
  if (range === "1d") return (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (range === "5d") return (t) => new Date(t).toLocaleDateString([], { weekday: "short" });
  if (range === "5y" || range === "max") return (t) => new Date(t).getFullYear();
  return (t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
}

function tooltipLabelFor(range, t) {
  const d = new Date(t);
  if (range === "1d" || range === "5d") {
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function ChartPriceTooltip({ active, payload, range, symbol }) {
  if (!active || !payload?.length) return null;
  const { t, p } = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-2.5 py-1.5 font-mono text-xs shadow-md">
      <div className="text-muted-foreground">{tooltipLabelFor(range, t)}</div>
      <div className="mt-0.5 font-medium tabular-nums">{symbol}{fmt(p)}</div>
    </div>
  );
}

function PriceChart({ ticker, currency }) {
  const [range, setRange] = useState("1d");
  const [cache, setCache] = useState({});
  const [error, setError] = useState(null);

  const data = cache[range];

  useEffect(() => {
    if (cache[range]) return;
    let alive = true;
    setError(null);
    fetch(`/api/chart/${encodeURIComponent(ticker)}?range=${range}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `Chart request failed (${res.status})`);
        }
        return res.json();
      })
      .then((chart) => { if (alive) setCache((prev) => ({ ...prev, [range]: chart })); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [ticker, range, cache]);

  const symbol = currency === "USD" || !currency ? "$" : `${currency} `;
  const points = data?.points || [];
  const baseline = range === "1d" && isNum(data?.previousClose) ? data.previousClose : points[0]?.p;
  const last = points[points.length - 1]?.p;
  const up = isNum(last) && isNum(baseline) ? last >= baseline : true;
  const change = isNum(last) && isNum(baseline) && baseline !== 0 ? (last - baseline) / baseline : null;
  const color = up ? "var(--under)" : "var(--over)";
  const gradId = `vl-chart-${ticker.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className="border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {change !== null ? (
          <span className={cn("font-mono text-xs font-medium tabular-nums", up ? "text-under" : "text-over")}>
            {up ? "▲" : "▼"} {pct(Math.abs(change))} {range === "1d" ? "today" : "over period"}
          </span>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">price history</span>
        )}
        <ToggleGroup
          type="single"
          size="sm"
          spacing={1}
          className="ml-auto"
          value={range}
          onValueChange={(v) => v && setRange(v)}
        >
          {CHART_RANGES.map(([value, label]) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="relative h-6 min-w-8 px-2 font-mono text-[11px] text-muted-foreground after:absolute after:inset-x-0 after:-inset-y-2 data-[state=on]:bg-secondary data-[state=on]:font-medium data-[state=on]:text-foreground"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="mt-3">
        {error ? (
          <div className="flex h-48 items-center justify-center font-mono text-xs text-muted-foreground">
            Couldn't load chart — {error}
          </div>
        ) : !data ? (
          <Skeleton className="h-48 w-full" />
        ) : points.length === 0 ? (
          <div className="flex h-48 items-center justify-center font-mono text-xs text-muted-foreground">
            No price history for this range
          </div>
        ) : (
          <ChartContainer config={{ p: { label: "Price" } }} className="h-48 w-full aspect-auto">
            <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={tickFormatterFor(range)}
                tickLine={false}
                axisLine={false}
                minTickGap={48}
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
              />
              <YAxis
                dataKey="p"
                orientation="right"
                domain={[
                  (dataMin) => Math.min(dataMin, isNum(baseline) ? baseline : dataMin) * 0.998,
                  (dataMax) => Math.max(dataMax, isNum(baseline) ? baseline : dataMax) * 1.002,
                ]}
                tickFormatter={(v) => fmt(v)}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
              />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
                content={<ChartPriceTooltip range={range} symbol={symbol} />}
              />
              {range === "1d" && isNum(baseline) && (
                <ReferenceLine y={baseline} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.6} />
              )}
              <Area
                dataKey="p"
                type="linear"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#${gradId})`}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}

/* ————— street pulse: news + social sentiment ————— */
function timeAgo(t) {
  if (!t) return "";
  const mins = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function SentimentPanel({ ticker }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetch(`/api/sentiment/${encodeURIComponent(ticker)}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error?.message || `Sentiment request failed (${res.status})`);
        }
        return res.json();
      })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [ticker]);

  if (error) return null;

  if (!data) {
    return (
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <Skeleton className="h-3.5 w-56" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    );
  }

  const st = data.stocktwits;
  const tagged = st ? st.bullish + st.bearish : 0;
  const bullPct = tagged > 0 ? Math.round((st.bullish / tagged) * 100) : null;
  if (!data.tldr && !st && data.news.length === 0) return null;

  return (
    <div className="border-b px-4 py-3">
      <SectionLabel className="mb-2">Street pulse — news & social TL;DR</SectionLabel>

      {data.tldr ? (
        <p className="m-0 text-sm leading-relaxed">{data.tldr}</p>
      ) : (
        <p className="m-0 text-[13px] text-muted-foreground">
          {data.tldrAvailable
            ? "Couldn't generate the AI summary right now — raw signals below."
            : "Add ANTHROPIC_API_KEY to .env to enable the AI-written TL;DR — raw signals below."}
        </p>
      )}

      {bullPct !== null && (
        <div className="mt-3.5">
          <div className="flex h-2 overflow-hidden rounded-full">
            <div className="bg-under" style={{ width: `${bullPct}%` }} />
            <div className="bg-over" style={{ width: `${100 - bullPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-xs tabular-nums">
            <span className="text-under">▲ {bullPct}% bullish ({st.bullish})</span>
            <span className="text-muted-foreground">last {st.total} StockTwits posts</span>
            <span className="text-over">▼ {100 - bullPct}% bearish ({st.bearish})</span>
          </div>
        </div>
      )}

      {data.news.length > 0 && (
        <ul className="m-0 mt-3.5 flex list-none flex-col gap-1.5 p-0">
          {data.news.slice(0, 4).map((n) => (
            <li key={n.link} className="flex items-baseline gap-2 text-[13px] leading-snug">
              <span aria-hidden className="text-muted-foreground">·</span>
              <span>
                <a href={n.link} target="_blank" rel="noreferrer" className="text-foreground hover:text-primary hover:underline">
                  {n.title}
                </a>
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  {n.publisher}{n.time ? ` · ${timeAgo(n.time)}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 text-[11px] text-muted-foreground">
        AI-read of recent headlines and StockTwits chatter — crowd mood, not a forecast.
      </div>
    </div>
  );
}

function OpinionPanel({ report }) {
  if (report.opinionStatus === "loading") {
    return (
      <div className="flex flex-col gap-2 border-b px-4 py-3">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
      </div>
    );
  }
  if (report.opinionStatus === "error" || !report.opinion) return null;
  return (
    <div className="border-b border-l-2 border-l-primary px-4 py-3">
      <SectionLabel className="mb-2 text-primary">The Ledger's read</SectionLabel>
      <p className="m-0 text-sm leading-relaxed">{report.opinion}</p>
      <div className="mt-2 text-xs text-muted-foreground">
        AI-written synthesis of the signals above — a perspective, not a recommendation.
      </div>
    </div>
  );
}

function StrategyRow({ strat, result }) {
  const [open, setOpen] = useState(false);
  const m = KIND_META[result.kind];
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b px-4 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="min-w-44 text-sm font-semibold">{strat.name}</span>
        <Stamp kind={result.kind} />
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Method notes"
            className="relative ml-auto -mr-1 self-center text-muted-foreground after:absolute after:-inset-2"
          >
            <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </CollapsibleTrigger>
      </div>
      <div className="mt-1 font-mono text-[13px] tabular-nums">{result.detail}</div>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-[vl-collapse-open_200ms_cubic-bezier(0.2,0,0,1)] data-[state=closed]:animate-[vl-collapse-close_150ms_cubic-bezier(0.2,0,0,1)]">
        <div className={cn("mt-3 border-l-2 pl-3 text-[13px] leading-relaxed text-muted-foreground", m.border)}>
          <p className="m-0">{strat.how}</p>
          <p className="m-0 mt-1.5"><strong className="font-semibold text-under">Pro:</strong> {strat.pros}</p>
          <p className="m-0 mt-1"><strong className="font-semibold text-over">Con:</strong> {strat.cons}</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TickerReport({ report, selected, index }) {
  if (report.status === "loading") {
    return (
      <Card className="rise mt-6 gap-0 py-0" style={{ animationDelay: `${index * 100}ms` }}>
        <div className="flex flex-col gap-3 p-6">
          <div className="flex items-center gap-3">
            <Spinner className="text-muted-foreground" />
            <span className="font-mono text-sm text-muted-foreground">
              Pulling live figures for {report.ticker}…
            </span>
          </div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </Card>
    );
  }
  if (report.status === "error") {
    return (
      <Alert variant="destructive" className="rise mt-6 px-5 py-4" style={{ animationDelay: `${index * 100}ms` }}>
        <TriangleAlertIcon />
        <AlertTitle>{report.ticker} — couldn't fetch data</AlertTitle>
        <AlertDescription>
          {report.error}. Check the ticker symbol and run the analysis again.
        </AlertDescription>
      </Alert>
    );
  }

  const d = report.data;
  const active = STRATEGIES.filter((s) => selected.has(s.id));
  const results = active.map((s) => ({ strat: s, result: s.evaluate(d) }));
  const counted = results.filter((r) => r.result.kind !== "na");
  const under = counted.filter((r) => r.result.kind === "under").length;
  const cautions = counted.filter((r) => r.result.kind === "caution").length;

  return (
    <Card className="rise mt-6 gap-0 py-0" style={{ animationDelay: `${index * 100}ms` }}>
      <header className="flex flex-wrap items-baseline gap-4 border-b px-4 pb-3 pt-4">
        <h2 className="font-display m-0 text-lg font-bold">
          {d.company_name || report.ticker}{" "}
          <span className="font-mono text-[13px] font-normal text-muted-foreground">({report.ticker})</span>
        </h2>
        <div className="ml-auto flex items-baseline gap-2 text-right">
          <div className={cn("font-display text-xl font-bold tabular-nums", under >= counted.length / 2 ? "text-under" : "text-foreground")}>
            {under}
            <span className="text-sm text-muted-foreground"> / {counted.length}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            undervalued signals
            {cautions > 0 && (
              <span className="text-over"> · {cautions} caution flag{cautions > 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
      </header>
      <PriceContext d={d} />
      <PriceChart ticker={report.ticker} currency={d.currency} />
      <SentimentPanel ticker={report.ticker} />
      <OpinionPanel report={report} />
      {GROUPS.map((g) => {
        const rows = results.filter((r) => r.strat.group === g);
        if (rows.length === 0) return null;
        return (
          <div key={g} className="last:pb-1">
            <SectionLabel className="px-4 pb-1 pt-3">{g}</SectionLabel>
            {rows.map((r) => <StrategyRow key={r.strat.id} strat={r.strat} result={r.result} />)}
          </div>
        );
      })}
    </Card>
  );
}

/* ————— main app ————— */
export default function ValueLedger() {
  const [tickerInput, setTickerInput] = useState("");
  const [selected, setSelected] = useState(new Set(STRATEGIES.map((s) => s.id)));
  const [reports, setReports] = useState([]);
  const [running, setRunning] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setGroupSelection = (group, values) => {
    setSelected((prev) => {
      const next = new Set(prev);
      STRATEGIES.filter((s) => s.group === group).forEach((s) => next.delete(s.id));
      values.forEach((id) => next.add(id));
      return next;
    });
  };

  const runAnalysis = async () => {
    const tickers = [...new Set(
      tickerInput.toUpperCase().split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)
    )].slice(0, 3);
    if (tickers.length === 0 || selected.size === 0 || running) return;
    setRunning(true);
    setReports(tickers.map((t) => ({ ticker: t, status: "loading" })));
    const active = STRATEGIES.filter((s) => selected.has(s.id));
    for (let i = 0; i < tickers.length; i++) {
      const t = tickers[i];
      try {
        const data = await fetchMetrics(t);
        setReports((prev) => prev.map((r) => (r.ticker === t ? { ...r, status: "done", data, opinionStatus: "loading" } : r)));
        try {
          const results = active.map((s) => ({ strat: s, result: s.evaluate(data) }));
          const opinion = await fetchOpinion(t, data, results);
          setReports((prev) => prev.map((r) => (r.ticker === t ? { ...r, opinion, opinionStatus: "done" } : r)));
        } catch {
          setReports((prev) => prev.map((r) => (r.ticker === t ? { ...r, opinionStatus: "error" } : r)));
        }
      } catch (e) {
        setReports((prev) => prev.map((r) => (r.ticker === t ? { ticker: t, status: "error", error: e.message } : r)));
      }
    }
    setRunning(false);
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-10">

        <header className="rise border-b pb-4">
          <div className="text-[11px] font-medium tracking-[0.14em] text-primary">LIVE VALUATION SCREEN</div>
          <h1 className="font-display mb-1 mt-0.5 text-3xl font-bold leading-tight">
            The Value Ledger
          </h1>
          <p className="m-0 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Search tickers, pick valuation strategies, and get a stamped verdict per method from live market figures.
          </p>
        </header>

        {/* controls */}
        <div className="mt-5">
          <div className="rise" style={{ animationDelay: "100ms" }}>
            <InputGroup className="h-10 bg-card">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                id="vl-tickers"
                aria-label="Tickers"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
                placeholder="Search up to 3 tickers — AAPL, PETR4.SA, VALE"
                className="font-mono text-sm uppercase placeholder:normal-case"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  variant="default"
                  className="px-3 active:scale-[0.96]"
                  onClick={runAnalysis}
                  disabled={running}
                >
                  {running && <Spinner data-icon="inline-start" />}
                  {running ? "Analyzing…" : "Analyze"}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>

          {/* strategy filters */}
          <div className="rise mt-2" style={{ animationDelay: "200ms" }}>
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
                  <ChevronDownIcon
                    data-icon="inline-start"
                    className={cn("transition-transform", filtersOpen && "rotate-180")}
                  />
                  Strategies
                  <Badge variant="secondary" className="font-mono tabular-nums">
                    {selected.size}/{STRATEGIES.length}
                  </Badge>
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=open]:animate-[vl-collapse-open_200ms_cubic-bezier(0.2,0,0,1)] data-[state=closed]:animate-[vl-collapse-close_150ms_cubic-bezier(0.2,0,0,1)]">
                <div className="pb-1 pt-2">
                  <div className="flex items-baseline gap-3">
                    <Button
                      variant="link" size="xs" className="relative px-0 after:absolute after:-inset-x-1 after:-inset-y-2"
                      onClick={() => setSelected(new Set(STRATEGIES.map((s) => s.id)))}
                    >
                      select all
                    </Button>
                    <Button
                      variant="link" size="xs" className="relative px-0 text-muted-foreground after:absolute after:-inset-x-1 after:-inset-y-2"
                      onClick={() => setSelected(new Set())}
                    >
                      clear
                    </Button>
                  </div>
                  {GROUPS.map((g) => (
                    <div key={g} className="mt-2.5">
                      <SectionLabel className="mb-1 text-[11px]">{g}</SectionLabel>
                      <ToggleGroup
                        type="multiple"
                        spacing={1}
                        className="flex-wrap"
                        value={STRATEGIES.filter((s) => s.group === g && selected.has(s.id)).map((s) => s.id)}
                        onValueChange={(values) => setGroupSelection(g, values)}
                      >
                        {STRATEGIES.filter((s) => s.group === g).map((s) => (
                          <ToggleGroupItem
                            key={s.id}
                            value={s.id}
                            size="sm"
                            variant="outline"
                            className="h-6 rounded-full bg-card px-2.5 text-xs font-normal text-muted-foreground active:scale-[0.96] data-[state=on]:border-primary/40 data-[state=on]:bg-accent data-[state=on]:font-medium data-[state=on]:text-accent-foreground"
                          >
                            {s.name}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {/* results */}
        {reports.map((r, i) => <TickerReport key={r.ticker} report={r} selected={selected} index={i} />)}

        <Separator className="mt-8" />
        <footer className="pt-4 text-[11px] leading-relaxed text-muted-foreground/80">
          Figures are pulled live from Yahoo Finance and may be delayed, approximate,
          or occasionally wrong — verify anything important against your broker or the company's filings.
          Signals are rule-of-thumb screens, not intrinsic-value proofs: a stock failing every test can still be
          a great buy, and one passing every test can be a value trap. Educational tool only, not financial advice.
        </footer>
      </div>
    </div>
  );
}
