export const SECTOR_THRESHOLDS = {
  Technology: { ev_ebitda: [18, 28], pb: [8, 15], p_fcf: [25, 45] },
  "Financial Services": { ev_ebitda: [8, 12], pb: [1.2, 2.0], p_fcf: [12, 18] },
  "Communication Services": { ev_ebitda: [12, 18], pb: [3, 6], p_fcf: [18, 30] },
  Healthcare: { ev_ebitda: [12, 18], pb: [3, 6], p_fcf: [18, 32] },
  "Consumer Cyclical": { ev_ebitda: [10, 16], pb: [2.5, 5], p_fcf: [15, 28] },
  "Consumer Defensive": { ev_ebitda: [12, 16], pb: [3, 5], p_fcf: [18, 28] },
  Energy: { ev_ebitda: [6, 10], pb: [1.2, 2.5], p_fcf: [10, 18] },
  Industrials: { ev_ebitda: [10, 14], pb: [2, 4], p_fcf: [14, 24] },
  "Real Estate": { ev_ebitda: [14, 20], pb: [1.5, 3], p_fcf: [16, 28] },
  Utilities: { ev_ebitda: [8, 12], pb: [1.5, 2.5], p_fcf: [12, 20] },
  "Basic Materials": { ev_ebitda: [8, 12], pb: [1.5, 3], p_fcf: [12, 20] },
  default: { ev_ebitda: [10, 14], pb: [1.5, 3.5], p_fcf: [15, 25] },
};

export function sectorBands(sector) {
  return SECTOR_THRESHOLDS[sector] || SECTOR_THRESHOLDS.default;
}
