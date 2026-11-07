#!/usr/bin/env bash
# Local helper: creates a brand-new disposable database, prepares it and runs Playwright.
# Usage: E2E_DB_BASE=mysql://USER:PASSWORD@127.0.0.1:3306 bash tests/e2e/run-fresh.sh [playwright args]
# (a MySQL / MariaDB user allowed to CREATE DATABASE; never a production server)
set -euo pipefail
: "${E2E_DB_BASE:?E2E_DB_BASE (mysql://user:pass@host:port, allowed to CREATE DATABASE) is required}"
NAME="webcenta_e2e_$(date +%s)"
npx tsx tests/e2e/db-util.ts create-db "$E2E_DB_BASE" "$NAME"
export E2E_DATABASE_URL="${E2E_DB_BASE%/}/${NAME}"
echo "Using fresh database $NAME"
bash tests/e2e/prepare.sh
npx playwright test "$@"
