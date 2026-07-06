import { STRATEGIES } from "./strategies.js";

export const DEFAULT_STRATEGY_IDS = STRATEGIES.filter((s) => s.id !== "graham").map((s) => s.id);

export const STRATEGY_PERSONAS = {
  all: {
    label: "All methodologies",
    ids: STRATEGIES.map((s) => s.id),
  },
  balanced: {
    label: "Balanced (default)",
    ids: DEFAULT_STRATEGY_IDS,
  },
  deep_value: {
    label: "Deep value",
    ids: ["pe_industry", "pb", "pfcf", "ev_ebitda", "graham", "piotroski", "altman", "week52"],
  },
  quality: {
    label: "Quality at reasonable price",
    ids: ["pe_industry", "forward_pe", "peg", "pfcf", "analyst", "piotroski", "altman"],
  },
  dividend: {
    label: "Dividend sustainability",
    ids: ["dividend", "pfcf", "pe_industry", "piotroski", "altman"],
  },
};
