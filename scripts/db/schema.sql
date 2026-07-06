CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  strategy_set TEXT NOT NULL,
  tickers_ok INTEGER DEFAULT 0,
  tickers_failed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ticker_results (
  run_id INTEGER NOT NULL REFERENCES runs(id),
  ticker TEXT NOT NULL,
  name TEXT,
  sector TEXT,
  price REAL,
  composite_score REAL,
  undervalued_count INTEGER DEFAULT 0,
  fair_count INTEGER DEFAULT 0,
  overvalued_count INTEGER DEFAULT 0,
  caution_count INTEGER DEFAULT 0,
  quality_piotroski INTEGER,
  quality_altman REAL,
  as_of TEXT,
  PRIMARY KEY (run_id, ticker)
);

CREATE TABLE IF NOT EXISTS strategy_verdicts (
  run_id INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  strategy TEXT NOT NULL,
  verdict TEXT NOT NULL,
  value REAL,
  detail TEXT,
  PRIMARY KEY (run_id, ticker, strategy)
);

CREATE INDEX IF NOT EXISTS idx_ticker_results_run ON ticker_results(run_id);
CREATE INDEX IF NOT EXISTS idx_ticker_results_sector ON ticker_results(run_id, sector);
CREATE INDEX IF NOT EXISTS idx_ticker_results_composite ON ticker_results(run_id, composite_score);
