import { useState } from "react";

/* ————— Value Ledger — undervalued stock screener —————
   Design: cool sage paper, deep pine ink, ledger rows with
   ink-stamp verdicts. Fraunces display / IBM Plex body+mono. */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root{
  --paper:#EFF2EE; --card:#FBFCFA; --ink:#152720; --sub:#5C6B62;
  --line:#D5DCD4; --green:#1E7A5A; --greenSoft:#E3F0E9;
  --amber:#A87415; --amberSoft:#F5EDDA; --red:#A93B2A; --redSoft:#F4E4E0;
}
.vl-root{font-family:'IBM Plex Sans',sans-serif;color:var(--ink);background:var(--paper);min-height:100vh;}
.vl-display{font-family:'Fraunces',serif;}
.vl-mono{font-family:'IBM Plex Mono',monospace;}
.vl-stamp{display:inline-block;transform:rotate(-4deg);border:2px solid currentColor;border-radius:4px;
  padding:1px 8px;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:500;letter-spacing:.08em;}
.vl-row{border-bottom:1px solid var(--line);}
.vl-row:last-child{border-bottom:none;}
.vl-chk:focus-visible,.vl-btn:focus-visible,.vl-input:focus-visible,.vl-exp:focus-visible{outline:2px solid var(--green);outline-offset:2px;}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important;}}
@keyframes vl-pulse{0%,100%{opacity:.35}50%{opacity:1}}
`;

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
  under:   { label: "UNDERVALUED", color: "var(--green)", soft: "var(--greenSoft)" },
  fair:    { label: "FAIR",        color: "var(--amber)", soft: "var(--amberSoft)" },
  over:    { label: "OVERVALUED",  color: "var(--red)",   soft: "var(--redSoft)" },
  caution: { label: "CAUTION",     color: "var(--red)",   soft: "var(--redSoft)" },
  na:      { label: "NO DATA",     color: "var(--sub)",   soft: "transparent" },
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
  return <span className="vl-stamp" style={{ color: m.color, background: m.soft }}>{m.label}</span>;
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
    <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--line)", background: "var(--paper)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="vl-display" style={{ fontSize: 34, fontWeight: 650 }}>
          {isNum(d.price) ? `${d.currency === "USD" || !d.currency ? "$" : d.currency + " "}${fmt(d.price)}` : "—"}
        </span>
        {isNum(chg) && (
          <span className="vl-mono" style={{ fontSize: 15, fontWeight: 500, color: chg >= 0 ? "var(--green)" : "var(--red)" }}>
            {chg >= 0 ? "▲" : "▼"} {fmt(Math.abs(chg))}% today
          </span>
        )}
        {d.as_of && <span className="vl-mono" style={{ fontSize: 12, color: "var(--sub)" }}>as of {d.as_of}</span>}
      </div>

      {hasRange && (
        <div style={{ marginTop: 18 }}>
          <div style={{ position: "relative", height: 8, borderRadius: 999, background: "var(--line)" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pos * 100}%`,
                          borderRadius: 999, background: pos < 0.33 ? "var(--green)" : pos < 0.7 ? "var(--amber)" : "var(--red)" }} />
            <div title={`Current price $${fmt(d.price)}`}
                 style={{ position: "absolute", left: `calc(${pos * 100}% - 7px)`, top: -4, width: 14, height: 16,
                          borderRadius: 4, background: "var(--ink)", border: "2px solid var(--card)" }} />
            {tPos !== null && (
              <div title={`Analyst target $${fmt(d.analyst_target)}`}
                   style={{ position: "absolute", left: `calc(${tPos * 100}% - 1px)`, top: -7, width: 2, height: 22,
                            background: "var(--sub)" }} />
            )}
          </div>
          <div className="vl-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--sub)", marginTop: 8 }}>
            <span>52-wk low ${fmt(d.week52_low)}</span>
            <span>price sits {pct(pos)} up the range{tPos !== null ? " · | = analyst target" : ""}</span>
            <span>52-wk high ${fmt(d.week52_high)}</span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginTop: 16 }}>
        {stats.map(([k, v]) => (
          <div key={k} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontSize: 11, color: "var(--sub)", letterSpacing: ".04em", textTransform: "uppercase" }}>{k}</div>
            <div className="vl-mono" style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpinionPanel({ report }) {
  if (report.opinionStatus === "loading") {
    return (
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
        <div className="vl-mono" style={{ fontSize: 13, color: "var(--sub)", animation: "vl-pulse 1.4s ease-in-out infinite" }}>
          Writing the Ledger's read from the strategy verdicts…
        </div>
      </div>
    );
  }
  if (report.opinionStatus === "error") return null;
  if (!report.opinion) return null;
  return (
    <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--line)", borderLeft: "4px solid var(--green)" }}>
      <div className="vl-mono" style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--green)", marginBottom: 8 }}>
        The Ledger's read
      </div>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65 }}>{report.opinion}</p>
      <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 8 }}>
        AI-written synthesis of the signals above — a perspective, not a recommendation.
      </div>
    </div>
  );
}

function StrategyRow({ strat, result }) {
  const [open, setOpen] = useState(false);
  const m = KIND_META[result.kind];
  return (
    <div className="vl-row" style={{ padding: "14px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 15, minWidth: 190 }}>{strat.name}</span>
        <Stamp kind={result.kind} />
        <button
          className="vl-exp"
          onClick={() => setOpen(!open)}
          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer",
                   color: "var(--sub)", fontSize: 13, fontFamily: "'IBM Plex Mono',monospace" }}
          aria-expanded={open}
        >
          {open ? "hide notes −" : "method notes +"}
        </button>
      </div>
      <div className="vl-mono" style={{ fontSize: 13, color: "var(--ink)", marginTop: 6 }}>{result.detail}</div>
      {open && (
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--sub)", lineHeight: 1.55,
                      borderLeft: `3px solid ${m.color}`, paddingLeft: 12 }}>
          <p style={{ margin: 0 }}>{strat.how}</p>
          <p style={{ margin: "6px 0 0" }}><strong style={{ color: "var(--green)" }}>Pro:</strong> {strat.pros}</p>
          <p style={{ margin: "4px 0 0" }}><strong style={{ color: "var(--red)" }}>Con:</strong> {strat.cons}</p>
        </div>
      )}
    </div>
  );
}

function TickerReport({ report, selected }) {
  if (report.status === "loading") {
    return (
      <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 28, marginTop: 24 }}>
        <div className="vl-mono" style={{ fontSize: 14, color: "var(--sub)", animation: "vl-pulse 1.4s ease-in-out infinite" }}>
          Pulling live figures for {report.ticker} — searching current price, ratios and quality scores…
        </div>
      </section>
    );
  }
  if (report.status === "error") {
    return (
      <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 28, marginTop: 24 }}>
        <div style={{ fontWeight: 600 }}>{report.ticker}</div>
        <p style={{ fontSize: 14, color: "var(--red)", margin: "8px 0 0" }}>
          Couldn't fetch data: {report.error}. Check the ticker symbol and run the analysis again.
        </p>
      </section>
    );
  }

  const d = report.data;
  const active = STRATEGIES.filter((s) => selected.has(s.id));
  const results = active.map((s) => ({ strat: s, result: s.evaluate(d) }));
  const counted = results.filter((r) => r.result.kind !== "na");
  const under = counted.filter((r) => r.result.kind === "under").length;
  const cautions = counted.filter((r) => r.result.kind === "caution").length;

  return (
    <section style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", marginTop: 24 }}>
      <header style={{ padding: "22px 20px 18px", borderBottom: "2px solid var(--ink)",
                       display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 16 }}>
        <h2 className="vl-display" style={{ margin: 0, fontSize: 26, fontWeight: 650 }}>
          {d.company_name || report.ticker} <span className="vl-mono" style={{ fontSize: 15, color: "var(--sub)" }}>({report.ticker})</span>
        </h2>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="vl-display" style={{ fontSize: 30, fontWeight: 650, color: under >= counted.length / 2 ? "var(--green)" : "var(--ink)" }}>
            {under}<span style={{ fontSize: 17, color: "var(--sub)" }}> / {counted.length}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--sub)" }}>signals read undervalued</div>
          {cautions > 0 && (
            <div className="vl-mono" style={{ fontSize: 12, color: "var(--red)", marginTop: 2 }}>
              ⚠ {cautions} caution flag{cautions > 1 ? "s" : ""} — check for a value trap
            </div>
          )}
        </div>
      </header>
      <PriceContext d={d} />
      <OpinionPanel report={report} />
      {GROUPS.map((g) => {
        const rows = results.filter((r) => r.strat.group === g);
        if (rows.length === 0) return null;
        return (
          <div key={g}>
            <div className="vl-mono" style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase",
                                              color: "var(--sub)", padding: "12px 20px 4px" }}>{g}</div>
            {rows.map((r) => <StrategyRow key={r.strat.id} strat={r.strat} result={r.result} />)}
          </div>
        );
      })}
    </section>
  );
}

/* ————— main app ————— */
export default function ValueLedger() {
  const [tickerInput, setTickerInput] = useState("");
  const [selected, setSelected] = useState(new Set(STRATEGIES.map((s) => s.id)));
  const [reports, setReports] = useState([]);
  const [running, setRunning] = useState(false);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
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
    <div className="vl-root">
      <style>{FONTS}</style>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 20px 80px" }}>

        <header style={{ borderBottom: "2px solid var(--ink)", paddingBottom: 22 }}>
          <div className="vl-mono" style={{ fontSize: 12, letterSpacing: ".18em", color: "var(--green)" }}>LIVE VALUATION SCREEN</div>
          <h1 className="vl-display" style={{ fontSize: "clamp(34px, 6vw, 52px)", fontWeight: 650, margin: "6px 0 8px", lineHeight: 1.05 }}>
            The Value Ledger
          </h1>
          <p style={{ fontSize: 15, color: "var(--sub)", maxWidth: 560, margin: 0, lineHeight: 1.55 }}>
            Enter up to three tickers, choose which valuation strategies to apply, and get a stamped
            verdict per method using figures pulled live from the web.
          </p>
        </header>

        {/* controls */}
        <div style={{ marginTop: 28 }}>
          <label htmlFor="vl-tickers" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Tickers <span style={{ color: "var(--sub)", fontWeight: 400 }}>(up to 3, e.g. AAPL, PETR4.SA, VALE)</span>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              id="vl-tickers" className="vl-input vl-mono" value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
              placeholder="AAPL, MSFT"
              style={{ flex: "1 1 260px", padding: "12px 14px", fontSize: 15, border: "1px solid var(--line)",
                       borderRadius: 8, background: "var(--card)", color: "var(--ink)" }}
            />
            <button
              className="vl-btn" onClick={runAnalysis} disabled={running}
              style={{ padding: "12px 26px", fontSize: 15, fontWeight: 600, border: "none", borderRadius: 8,
                       background: running ? "var(--sub)" : "var(--ink)", color: "var(--paper)", cursor: running ? "wait" : "pointer" }}
            >
              {running ? "Analyzing…" : "Run analysis"}
            </button>
          </div>

          {/* strategy filters */}
          <div style={{ marginTop: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Strategies</span>
              <button className="vl-exp" onClick={() => setSelected(new Set(STRATEGIES.map((s) => s.id)))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--green)", fontSize: 12 }}>select all</button>
              <button className="vl-exp" onClick={() => setSelected(new Set())}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--sub)", fontSize: 12 }}>clear</button>
            </div>
            {GROUPS.map((g) => (
              <div key={g} style={{ marginTop: 12 }}>
                <div className="vl-mono" style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--sub)", marginBottom: 6 }}>{g}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {STRATEGIES.filter((s) => s.group === g).map((s) => {
                    const on = selected.has(s.id);
                    return (
                      <button key={s.id} className="vl-chk" onClick={() => toggle(s.id)} aria-pressed={on}
                        style={{ padding: "7px 13px", fontSize: 13, borderRadius: 999, cursor: "pointer",
                                 border: `1px solid ${on ? "var(--green)" : "var(--line)"}`,
                                 background: on ? "var(--greenSoft)" : "var(--card)",
                                 color: on ? "var(--green)" : "var(--sub)", fontWeight: on ? 600 : 400 }}>
                        {on ? "✓ " : ""}{s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* results */}
        {reports.map((r) => <TickerReport key={r.ticker} report={r} selected={selected} />)}

        <footer style={{ marginTop: 36, paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 12.5, color: "var(--sub)", lineHeight: 1.6 }}>
          Figures are pulled live from Yahoo Finance and may be delayed, approximate,
          or occasionally wrong — verify anything important against your broker or the company's filings.
          Signals are rule-of-thumb screens, not intrinsic-value proofs: a stock failing every test can still be
          a great buy, and one passing every test can be a value trap. Educational tool only, not financial advice.
        </footer>
      </div>
    </div>
  );
}
