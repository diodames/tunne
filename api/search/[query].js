import { searchYahooSymbols } from "../_lib/yahoo.js";

export default async function handler(req, res) {
  const query = (req.query.query || "").trim();
  res.setHeader("Content-Type", "application/json");

  if (!query) {
    res.status(400).json({ error: { message: "Missing query" } });
    return;
  }

  try {
    const results = await searchYahooSymbols(query);
    res.status(200).json(results);
  } catch (err) {
    res.status(502).json({ error: { message: err.message } });
  }
}
