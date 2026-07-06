import { fmt, fmtMoney, isNum, lerpScore, na, pct, verdict } from "./format.js";
import { sectorBands } from "./sectors.js";

export const STRATEGIES = [
  {
    id: "pe_industry", group: "Valuation ratios", name: "P/E vs. industry",
    how: "Compares trailing price-to-earnings against the industry average. A discount to peers can signal undervaluation.",
    pros: "Simple, widely available, comparable across peers.",
    cons: "Earnings can be distorted or cyclical; a low P/E may just reflect weak prospects (value trap).",
    weight: 8,
    score: (d) => {
      if (!isNum(d.pe_ttm) || !isNum(d.industry_avg_pe) || d.pe_ttm <= 0 || d.industry_avg_pe <= 0) return null;
      return lerpScore(d.pe_ttm / d.industry_avg_pe, 0.6, 1.5);
    },
    evaluate: (d) => {
      if (!isNum(d.pe_ttm) || !isNum(d.industry_avg_pe)) return na();
      if (d.pe_ttm <= 0) return verdict("caution", `P/E ${fmt(d.pe_ttm)} — negative earnings, ratio not meaningful`);
      const disc = (d.industry_avg_pe - d.pe_ttm) / d.industry_avg_pe;
      const peerNote = d.industry ? ` (${d.industry} median)` : "";
      if (disc > 0.15) return verdict("under", `P/E ${fmt(d.pe_ttm)} vs. industry ${fmt(d.industry_avg_pe)}${peerNote} (${pct(disc)} discount)`);
      if (disc > -0.1) return verdict("fair", `P/E ${fmt(d.pe_ttm)} near industry ${fmt(d.industry_avg_pe)}${peerNote}`);
      return verdict("over", `P/E ${fmt(d.pe_ttm)} above industry ${fmt(d.industry_avg_pe)}${peerNote}`);
    },
  },
  {
    id: "forward_pe", group: "Valuation ratios", name: "Forward vs. trailing P/E",
    how: "A forward P/E clearly below trailing implies analysts expect earnings growth that the price may not fully reflect.",
    pros: "Forward-looking; captures expected earnings momentum.",
    cons: "Relies on analyst estimates, which are frequently wrong or optimistic.",
    weight: 6,
    score: (d) => {
      if (!isNum(d.pe_forward) || !isNum(d.pe_ttm) || d.pe_ttm <= 0 || d.pe_forward <= 0) return null;
      return lerpScore(d.pe_forward / d.pe_ttm, 0.75, 1.2);
    },
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
    weight: 5,
    score: (d) => {
      if (!isNum(d.pb) || d.pb <= 0) return null;
      const [under, fair] = sectorBands(d.sector).pb;
      const med = isNum(d.industry_median_pb) ? d.industry_median_pb : under * 2;
      return lerpScore(d.pb, under, Math.max(fair, med * 1.2));
    },
    evaluate: (d) => {
      if (!isNum(d.pb)) return na();
      const [under, fair] = sectorBands(d.sector).pb;
      const vsPeer = isNum(d.industry_median_pb)
        ? ` · industry median ${fmt(d.industry_median_pb)}`
        : "";
      if (d.pb < under) return verdict("under", `P/B ${fmt(d.pb)} — below ${d.sector || "sector"} norm (${under})${vsPeer}`);
      if (d.pb <= fair) return verdict("fair", `P/B ${fmt(d.pb)}${vsPeer}`);
      return verdict("over", `P/B ${fmt(d.pb)} — rich vs. book${vsPeer}`);
    },
  },
  {
    id: "peg", group: "Valuation ratios", name: "PEG ratio",
    how: "P/E divided by expected earnings growth. Under 1 suggests the price under-counts growth (Peter Lynch's rule of thumb).",
    pros: "Adjusts P/E for growth, so fast growers aren't unfairly penalized.",
    cons: "Growth forecasts are guesses; breaks down for low-growth or cyclical firms.",
    weight: 7,
    score: (d) => {
      if (!isNum(d.peg) || d.peg <= 0) return null;
      return lerpScore(d.peg, 0.5, 2.5);
    },
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
    weight: 10,
    score: (d) => {
      if (!isNum(d.p_fcf)) return null;
      if (d.p_fcf <= 0) return 0;
      const [under, fair] = sectorBands(d.sector).p_fcf;
      return lerpScore(d.p_fcf, under, fair + 15);
    },
    evaluate: (d) => {
      if (!isNum(d.p_fcf)) return na();
      const [under, fair] = sectorBands(d.sector).p_fcf;
      if (d.p_fcf <= 0) return verdict("caution", `P/FCF ${fmt(d.p_fcf)} — negative free cash flow`);
      if (d.p_fcf < under) return verdict("under", `P/FCF ${fmt(d.p_fcf)} — cheap on cash (${d.sector || "default"} band <${under})`);
      if (d.p_fcf <= fair) return verdict("fair", `P/FCF ${fmt(d.p_fcf)}`);
      return verdict("over", `P/FCF ${fmt(d.p_fcf)}`);
    },
  },
  {
    id: "ev_ebitda", group: "Valuation ratios", name: "EV / EBITDA",
    how: "Enterprise value over operating cash earnings; capital-structure neutral. Roughly, under ~10 reads cheap for most sectors.",
    pros: "Comparable across firms with different debt loads; standard in M&A.",
    cons: "Ignores capex and working capital; 'cheap' varies a lot by sector.",
    weight: 10,
    score: (d) => {
      if (!isNum(d.ev_ebitda)) return null;
      if (d.ev_ebitda <= 0) return 0;
      const [under, fair] = sectorBands(d.sector).ev_ebitda;
      const med = isNum(d.industry_median_ev_ebitda) ? d.industry_median_ev_ebitda : fair;
      return lerpScore(d.ev_ebitda, under, Math.max(fair, med * 1.15));
    },
    evaluate: (d) => {
      if (!isNum(d.ev_ebitda)) return na();
      const [under, fair] = sectorBands(d.sector).ev_ebitda;
      const vsPeer = isNum(d.industry_median_ev_ebitda)
        ? ` · industry median ${fmt(d.industry_median_ev_ebitda)}`
        : "";
      if (d.ev_ebitda <= 0) return verdict("caution", `EV/EBITDA ${fmt(d.ev_ebitda)} — negative EBITDA`);
      if (d.ev_ebitda < under) return verdict("under", `EV/EBITDA ${fmt(d.ev_ebitda)} (${d.sector || "default"} band <${under})${vsPeer}`);
      if (d.ev_ebitda <= fair) return verdict("fair", `EV/EBITDA ${fmt(d.ev_ebitda)}${vsPeer}`);
      return verdict("over", `EV/EBITDA ${fmt(d.ev_ebitda)}${vsPeer}`);
    },
  },
  {
    id: "dividend", group: "Valuation ratios", name: "Dividend yield",
    how: "An unusually high yield vs. history can flag a beaten-down price — if the payout is sustainable.",
    pros: "Tangible cash return; yield spikes often mark pessimism lows.",
    cons: "A sky-high yield often precedes a dividend cut — the classic yield trap.",
    weight: 4,
    score: (d) => {
      if (!isNum(d.dividend_yield_pct) || d.dividend_yield_pct === 0) return null;
      return Math.max(0, Math.min(100, 20 + ((d.dividend_yield_pct - 0.5) * 80) / 3.5));
    },
    evaluate: (d) => {
      if (!isNum(d.dividend_yield_pct)) return na();
      if (d.dividend_yield_pct === 0) return verdict("na", "No dividend paid");
      if (isNum(d.payout_ratio_pct) && d.payout_ratio_pct > 85) {
        return verdict("caution", `Yield ${fmt(d.dividend_yield_pct)}% with ${fmt(d.payout_ratio_pct)}% payout — cut risk`);
      }
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
    weight: 8,
    score: (d) => {
      if (!isNum(d.eps_ttm) || !isNum(d.bvps) || !isNum(d.price)) return null;
      if (d.eps_ttm <= 0 || d.bvps <= 0) return null;
      const g = Math.sqrt(22.5 * d.eps_ttm * d.bvps);
      return lerpScore(d.price / g, 0.7, 1.5);
    },
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
    weight: 12,
    score: (d) => {
      if (!isNum(d.analyst_target) || !isNum(d.price) || d.price <= 0) return null;
      return lerpScore((d.analyst_target - d.price) / d.price, 0.4, -0.2);
    },
    evaluate: (d) => {
      if (!isNum(d.analyst_target) || !isNum(d.price)) return na();
      const up = (d.analyst_target - d.price) / d.price;
      const countNote = isNum(d.analyst_count) ? ` · ${d.analyst_count} analysts` : "";
      const rangeNote = isNum(d.analyst_target_low) && isNum(d.analyst_target_high)
        ? ` · range ${fmtMoney(d.analyst_target_low, d.currency)}–${fmtMoney(d.analyst_target_high, d.currency)}`
        : "";
      if (up > 0.15) return verdict("under", `Target ${fmtMoney(d.analyst_target, d.currency)} implies ${pct(up)} upside${countNote}${rangeNote}`);
      if (up > -0.05) return verdict("fair", `Target ${fmtMoney(d.analyst_target, d.currency)} ≈ price${countNote}${rangeNote}`);
      return verdict("over", `Target ${fmtMoney(d.analyst_target, d.currency)} below price (${pct(up)})${countNote}${rangeNote}`);
    },
  },
  {
    id: "week52", group: "Price context", name: "52-week range position",
    how: "Where price sits in its yearly range. The bottom third attracts contrarians and mean-reversion buyers.",
    pros: "Flags pessimism; good timing overlay on fundamental signals.",
    cons: "'Cheap vs. itself' isn't cheap vs. value — falling knives keep falling.",
    weight: 5,
    composite: false,
    score: (d) => {
      if (!isNum(d.week52_low) || !isNum(d.week52_high) || !isNum(d.price)) return null;
      const span = d.week52_high - d.week52_low;
      if (span <= 0) return null;
      return lerpScore((d.price - d.week52_low) / span, 0, 1);
    },
    evaluate: (d) => {
      if (!isNum(d.week52_low) || !isNum(d.week52_high) || !isNum(d.price)) return na();
      const span = d.week52_high - d.week52_low;
      if (span <= 0) return na();
      const pos = (d.price - d.week52_low) / span;
      const lo = fmtMoney(d.week52_low, d.currency);
      const hi = fmtMoney(d.week52_high, d.currency);
      if (pos < 0.33) return verdict("under", `${pct(pos)} up the 52-wk range (${lo}–${hi}) — near lows`);
      if (pos < 0.7) return verdict("fair", `${pct(pos)} up the 52-wk range`);
      return verdict("context", `${pct(pos)} up the 52-wk range — extended near highs`);
    },
  },
  {
    id: "piotroski", group: "Quality & risk", name: "Piotroski F-Score",
    how: "Nine accounting checks (0–9) on profitability, leverage and efficiency. 7+ separates healthy cheap stocks from traps.",
    pros: "Evidence-backed filter against value traps.",
    cons: "Backward-looking; a score alone says nothing about price.",
    weight: 13,
    score: (d) => (isNum(d.piotroski) ? (d.piotroski / 9) * 100 : null),
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
    weight: 12,
    score: (d) => (isNum(d.altman_z) ? lerpScore(d.altman_z, 3, 1.8) : null),
    evaluate: (d) => {
      if (!isNum(d.altman_z)) return na();
      if (d.altman_z > 3) return verdict("under", `Z-Score ${fmt(d.altman_z)} — safe zone, low distress risk`);
      if (d.altman_z >= 1.8) return verdict("fair", `Z-Score ${fmt(d.altman_z)} — grey zone`);
      return verdict("caution", `Z-Score ${fmt(d.altman_z)} — distress zone, cheapness may be deserved`);
    },
  },
];

export const GROUPS = ["Valuation ratios", "Intrinsic value", "Price context", "Quality & risk"];
