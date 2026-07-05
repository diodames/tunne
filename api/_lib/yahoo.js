import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function humanizeMarketCap(n) {
  if (typeof n !== "number" || !isFinite(n)) return null;
  const units = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
  ];
  for (const [div, suffix] of units) {
    if (n >= div) return `${(n / div).toFixed(1)}${suffix}`;
  }
  return String(n);
}

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

/* ————— quality scores from annual fundamentals ————— */

function computePiotroski(cur, prev) {
  const ratio = (a, b) => (num(a) !== null && num(b) !== null && b !== 0 ? a / b : null);
  // Long-term debt is often absent for debt-free companies; treat as 0 when the
  // balance sheet is otherwise present.
  const ltd = (y) => (num(y.totalAssets) !== null ? num(y.longTermDebt) ?? 0 : null);
  const shares = (y) => num(y.ordinarySharesNumber) ?? num(y.shareIssued);

  const roaCur = ratio(cur.netIncome, cur.totalAssets);
  const roaPrev = ratio(prev.netIncome, prev.totalAssets);
  const levCur = ratio(ltd(cur), cur.totalAssets);
  const levPrev = ratio(ltd(prev), prev.totalAssets);
  const crCur = ratio(cur.currentAssets, cur.currentLiabilities);
  const crPrev = ratio(prev.currentAssets, prev.currentLiabilities);
  const gmCur = ratio(cur.grossProfit, cur.totalRevenue);
  const gmPrev = ratio(prev.grossProfit, prev.totalRevenue);
  const atCur = ratio(cur.totalRevenue, cur.totalAssets);
  const atPrev = ratio(prev.totalRevenue, prev.totalAssets);

  const checks = [
    roaCur !== null ? roaCur > 0 : null,
    num(cur.operatingCashFlow) !== null ? cur.operatingCashFlow > 0 : null,
    roaCur !== null && roaPrev !== null ? roaCur > roaPrev : null,
    num(cur.operatingCashFlow) !== null && num(cur.netIncome) !== null
      ? cur.operatingCashFlow > cur.netIncome : null,
    levCur !== null && levPrev !== null ? levCur <= levPrev : null,
    crCur !== null && crPrev !== null ? crCur > crPrev : null,
    shares(cur) !== null && shares(prev) !== null ? shares(cur) <= shares(prev) : null,
    gmCur !== null && gmPrev !== null ? gmCur > gmPrev : null,
    atCur !== null && atPrev !== null ? atCur > atPrev : null,
  ];

  const available = checks.filter((c) => c !== null);
  if (available.length < 6) return null; // too little data for a meaningful score
  const passed = available.filter(Boolean).length;
  return Math.round((passed / available.length) * 9);
}

function computeAltmanZ(cur, marketCap) {
  const ta = num(cur.totalAssets);
  const wc = num(cur.workingCapital) ??
    (num(cur.currentAssets) !== null && num(cur.currentLiabilities) !== null
      ? cur.currentAssets - cur.currentLiabilities : null);
  const re = num(cur.retainedEarnings);
  const ebit = num(cur.EBIT);
  const tl = num(cur.totalLiabilitiesNetMinorityInterest);
  const rev = num(cur.totalRevenue);
  if ([ta, wc, re, ebit, tl, rev, num(marketCap)].some((v) => v === null) || ta === 0 || tl === 0) {
    return null;
  }
  return (
    1.2 * (wc / ta) +
    1.4 * (re / ta) +
    3.3 * (ebit / ta) +
    0.6 * (marketCap / tl) +
    1.0 * (rev / ta)
  );
}

async function fetchQualityScores(ticker, marketCap) {
  const rows = await yahooFinance.fundamentalsTimeSeries(ticker, {
    period1: new Date(Date.now() - 3 * 366 * 86400e3),
    period2: new Date(),
    type: "annual",
    module: "all",
  });
  const years = (rows || [])
    .filter((r) => num(r.totalAssets) !== null)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (years.length === 0) return { piotroski: null, altman_z: null };

  const cur = years[years.length - 1];
  const prev = years.length > 1 ? years[years.length - 2] : null;
  return {
    piotroski: prev ? computePiotroski(cur, prev) : null,
    altman_z: computeAltmanZ(cur, marketCap),
  };
}

export async function fetchYahooMetrics(ticker) {
  const [q, s] = await Promise.all([
    yahooFinance.quote(ticker),
    yahooFinance
      .quoteSummary(ticker, {
        modules: ["assetProfile", "defaultKeyStatistics", "financialData"],
      })
      .catch(() => ({})),
  ]);
  if (!q || num(q.regularMarketPrice) === null) {
    throw new Error(`No quote data found for "${ticker}"`);
  }

  const stats = s.defaultKeyStatistics || {};
  const fin = s.financialData || {};
  const mcap = num(q.marketCap);
  const fcf = num(fin.freeCashflow);
  const ev = num(stats.enterpriseValue);
  const ebitda = num(fin.ebitda);
  const quality = await fetchQualityScores(ticker, mcap).catch(() => ({
    piotroski: null,
    altman_z: null,
  }));

  return {
    company_name: q.longName || q.shortName || ticker,
    currency: q.currency || null,
    price: num(q.regularMarketPrice),
    day_change_pct: num(q.regularMarketChangePercent),
    market_cap: humanizeMarketCap(mcap),
    sector: s.assetProfile?.sector || null,
    eps_ttm: num(q.epsTrailingTwelveMonths),
    bvps: num(q.bookValue),
    pe_ttm: num(q.trailingPE),
    pe_forward: num(q.forwardPE),
    industry_avg_pe: null,
    pb: num(q.priceToBook),
    peg: num(stats.pegRatio),
    p_fcf: mcap && fcf && fcf !== 0 ? mcap / fcf : null,
    ev_ebitda: ev && ebitda && ebitda !== 0 ? ev / ebitda : null,
    dividend_yield_pct: num(q.dividendYield),
    analyst_target: num(fin.targetMeanPrice),
    week52_low: num(q.fiftyTwoWeekLow),
    week52_high: num(q.fiftyTwoWeekHigh),
    piotroski: quality.piotroski,
    altman_z: quality.altman_z,
    as_of: q.regularMarketTime
      ? new Date(q.regularMarketTime).toISOString().slice(0, 10)
      : null,
  };
}

const CHART_RANGES = {
  "1d":  { days: 5,    interval: "5m" },
  "5d":  { days: 12,   interval: "30m" },
  "1mo": { days: 31,   interval: "1h" },
  "6mo": { days: 183,  interval: "1d" },
  "ytd": { interval: "1d" },
  "1y":  { days: 366,  interval: "1d" },
  "5y":  { days: 1830, interval: "1wk" },
  "max": { interval: "1mo" },
};

export async function fetchYahooChart(ticker, range) {
  const cfg = CHART_RANGES[range] || CHART_RANGES["1d"];
  let period1;
  if (range === "ytd") period1 = new Date(new Date().getFullYear(), 0, 1);
  else if (range === "max") period1 = new Date("1970-01-01");
  else period1 = new Date(Date.now() - cfg.days * 86400e3);

  const r = await yahooFinance.chart(ticker, { period1, interval: cfg.interval });
  let quotes = (r.quotes || []).filter((q) => typeof q.close === "number");
  let previousClose = r.meta?.previousClose ?? r.meta?.chartPreviousClose ?? null;

  if (range === "1d") {
    const regular = r.meta?.currentTradingPeriod?.regular;
    if (regular?.start) {
      const start = new Date(regular.start).getTime();
      const end = regular.end ? new Date(regular.end).getTime() : Infinity;
      const before = quotes.filter((q) => new Date(q.date).getTime() < start);
      if (before.length) previousClose = before[before.length - 1].close;
      quotes = quotes.filter((q) => {
        const t = new Date(q.date).getTime();
        return t >= start && t <= end;
      });
    }
  } else if (range === "5d") {
    const dayOf = (q) => new Date(q.date).toISOString().slice(0, 10);
    const days = [...new Set(quotes.map(dayOf))].slice(-5);
    quotes = quotes.filter((q) => days.includes(dayOf(q)));
  }

  return {
    currency: r.meta?.currency || null,
    previousClose,
    points: quotes.map((q) => ({ t: new Date(q.date).getTime(), p: q.close })),
  };
}

export async function searchYahooSymbols(query) {
  const r = await yahooFinance.search(query, { quotesCount: 6, newsCount: 0 });
  return (r.quotes || [])
    .filter((q) => q.symbol)
    .map((q) => ({
      symbol: q.symbol,
      name: q.shortname || q.longname || null,
      exchange: q.exchDisp || null,
      type: q.quoteType || null,
    }));
}

export async function fetchStreetData(ticker) {
  const stSymbol = ticker.split(".")[0];
  const [newsRes, stRes] = await Promise.allSettled([
    yahooFinance.search(ticker, { newsCount: 10, quotesCount: 0 }),
    fetch(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(stSymbol)}.json`)
      .then((r) => (r.ok ? r.json() : null)),
  ]);

  const news = newsRes.status === "fulfilled"
    ? (newsRes.value.news || []).map((n) => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        time: n.providerPublishTime ? new Date(n.providerPublishTime).getTime() : null,
      }))
    : [];

  let stocktwits = null;
  const messages = stRes.status === "fulfilled" ? stRes.value?.messages : null;
  if (messages?.length) {
    const tagged = (kind) => messages.filter((m) => m.entities?.sentiment?.basic === kind).length;
    stocktwits = {
      total: messages.length,
      bullish: tagged("Bullish"),
      bearish: tagged("Bearish"),
      sample: messages.slice(0, 15).map((m) => ({
        text: String(m.body || "").slice(0, 240),
        sentiment: m.entities?.sentiment?.basic || null,
      })),
    };
  }

  return { news, stocktwits };
}

export async function writeSentimentSummary(apiKey, ticker, { news, stocktwits }) {
  const empty = { tldr: null, headlineSentiments: [] };
  if (!apiKey) return empty;
  if (news.length === 0 && !stocktwits) return empty;

  const posts = stocktwits
    ? stocktwits.sample.map((p) => `- ${p.sentiment ? `[${p.sentiment}] ` : ""}${p.text.replace(/\s+/g, " ")}`).join("\n")
    : "(none available)";
  const counts = stocktwits
    ? `Of the last ${stocktwits.total} StockTwits posts, ${stocktwits.bullish} were tagged Bullish and ${stocktwits.bearish} Bearish by their authors.`
    : "";

  const prompt = `You are summarizing current market chatter about the stock ${ticker} for an educational screening tool.

Recent news headlines (numbered, in order):
${news.map((n, i) => `${i + 1}. ${n.title} (${n.publisher})`).join("\n") || "(none available)"}

Recent StockTwits posts (social media):
${posts}

${counts}

Respond with ONLY a JSON object (no markdown fences, no prose outside the JSON) with two keys:
- "tldr": a TL;DR of 2-4 sentences covering (1) the overall sentiment lean right now (bullish, bearish, or mixed) across news and social posts; (2) the dominant narrative or catalyst people are talking about; (3) the most notable concern or bearish counterpoint. Plain prose, no markdown, no investment advice, do not use the phrase "you should".
- "headline_sentiments": an array with exactly one entry per numbered headline above, in the same order, each being "bullish", "bearish", or "neutral" — how that headline reads for ${ticker} specifically.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) return empty;
  const data = await response.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  try {
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const valid = new Set(["bullish", "bearish", "neutral"]);
    return {
      tldr: typeof parsed.tldr === "string" && parsed.tldr.trim() ? parsed.tldr.trim() : null,
      headlineSentiments: Array.isArray(parsed.headline_sentiments)
        ? parsed.headline_sentiments.map((s) => (valid.has(s) ? s : "neutral"))
        : [],
    };
  } catch {
    // model ignored the JSON instruction — fall back to using the raw text as the TL;DR
    return { tldr: text || null, headlineSentiments: [] };
  }
}
