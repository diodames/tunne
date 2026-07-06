import { DEFAULT_STRATEGY_IDS } from "./personas.js";
import { computeComposite, countVerdicts } from "./scoring.js";
import { STRATEGIES } from "./strategies.js";

export function evaluateStrategies(data, strategyIds = DEFAULT_STRATEGY_IDS) {
  const strategies = STRATEGIES.filter((s) => strategyIds.includes(s.id));
  const results = strategies.map((strat) => ({ strat, result: strat.evaluate(data) }));
  const composite = computeComposite(strategies, data);
  const counts = countVerdicts(results);
  return { strategies, results, composite, counts };
}

export async function analyzeTicker(fetchMetrics, ticker, strategyIds = DEFAULT_STRATEGY_IDS) {
  const data = await fetchMetrics(ticker);
  const evaluation = evaluateStrategies(data, strategyIds);
  return { ticker, data, ...evaluation };
}
