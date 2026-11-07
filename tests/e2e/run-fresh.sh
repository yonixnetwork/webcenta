#!/usr/bin/env bash
# Local helper: creates a brand-new disposable database, prepares it and runs Playwright.
# Usage: E2E_DB_BASE=postgresql://postgres@localhost:5432 [E2E_DB_QUERY='?host=/socket'] bash tests/e2e/run-fresh.sh [playwright args]
set -euo pipefail
: "${E2E_DB_BASE:?E2E_DB_BASE (server URL without database, role allowed to CREATE DATABASE) is required}"
NAME="webcenter_e2e_$(date +%s)"
psql "${E2E_DB_BASE}/postgres${E2E_DB_QUERY:-}" -qc "CREATE DATABASE $NAME"
export E2E_DATABASE_URL="${E2E_DB_BASE}/${NAME}${E2E_DB_QUERY:-}"
echo "Using fresh database $NAME"
bash tests/e2e/prepare.sh
npx playwright test "$@"
