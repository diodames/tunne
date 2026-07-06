#!/usr/bin/env bash
# Nightly S&P 500 batch: analyze, export JSON, commit, push.
# Scheduled via crontab (weeknights 2:00 AM). Manual run: npm run batch:nightly

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/data/nightly-batch.log"

export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

exec >> "$LOG" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') nightly batch start ==="

cd "$ROOT"

npm run batch

git add data/latest-run.json
if git diff --cached --quiet; then
  echo "No changes to latest-run.json — skip commit"
else
  git commit -m "Nightly screener batch ($(date '+%Y-%m-%d'))"
  git push origin main
  echo "Committed and pushed screener batch"
fi

echo "=== $(date '+%Y-%m-%d %H:%M:%S %Z') nightly batch done ==="
