import { loadLatestRun, parseScreenerParams, queryScreener } from "./_lib/screener.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  try {
    const url = new URL(req.url || "/", "http://localhost");
    const params = parseScreenerParams(url.searchParams);
    const snapshot = loadLatestRun();
    const result = queryScreener(snapshot, params);

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
}
