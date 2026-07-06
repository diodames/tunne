import { loadLatestRun } from "../_lib/screener.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  try {
    const snapshot = loadLatestRun();
    res.status(200).json({
      runId: snapshot.runId,
      asOf: snapshot.asOf,
      startedAt: snapshot.startedAt,
      finishedAt: snapshot.finishedAt,
      strategySet: snapshot.strategySet,
      tickersOk: snapshot.tickersOk,
      tickersFailed: snapshot.tickersFailed,
      rowCount: snapshot.rows?.length ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
}
