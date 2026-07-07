export const MAX_WATCHLIST = 20;
const STORAGE_WATCHLIST = "tausta-watchlist";

export function loadWatchlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_WATCHLIST) || "[]");
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((t) => typeof t === "string" && t.trim()).map((t) => t.toUpperCase()))].slice(0, MAX_WATCHLIST);
  } catch {
    return [];
  }
}

function saveWatchlist(tickers) {
  try {
    localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(tickers));
  } catch {
    // ignore
  }
  return tickers;
}

export function addToWatchlist(ticker) {
  const sym = ticker.toUpperCase();
  const next = [sym, ...loadWatchlist().filter((t) => t !== sym)].slice(0, MAX_WATCHLIST);
  return saveWatchlist(next);
}

export function removeFromWatchlist(ticker) {
  const sym = ticker.toUpperCase();
  return saveWatchlist(loadWatchlist().filter((t) => t !== sym));
}

export function toggleWatchlist(ticker) {
  const sym = ticker.toUpperCase();
  if (loadWatchlist().includes(sym)) return removeFromWatchlist(sym);
  return addToWatchlist(sym);
}
