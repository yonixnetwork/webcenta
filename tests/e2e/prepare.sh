#!/usr/bin/env bash
# Prepares an ISOLATED, EMPTY E2E database (never production): migrate + seed fictional fixtures.
# Non-destructive: it refuses to run on a database that already has data.
# Create a fresh database for each local run (CI gets a fresh service container).
set -euo pipefail
: "${E2E_DATABASE_URL:?E2E_DATABASE_URL must point to a disposable, empty test database}"
case "$E2E_DATABASE_URL" in *webcenter_e2e*|*_test*|*_ci*) ;; *) echo "Refusing: E2E_DATABASE_URL must name an e2e/test/ci database"; exit 1;; esac
bash tests/fixtures/certs.sh
DATABASE_URL="$E2E_DATABASE_URL" DIRECT_URL="" npx prisma migrate deploy < /dev/null > /dev/null
COUNT=$(DATABASE_URL="$E2E_DATABASE_URL" npx tsx -e 'import("pg").then(async({default:pg})=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query(`select count(*)::int n from "User"`);console.log(r.rows[0].n);await c.end()})')
[ "$COUNT" = "0" ] || { echo "Refusing: E2E database is not empty ($COUNT users). Use a fresh database."; exit 1; }
DATABASE_URL="$E2E_DATABASE_URL" DIRECT_URL="" ALLOW_DEV_FIXTURES=true npx tsx scripts/seed.ts --fixtures
rm -rf .e2e-storage
echo "E2E database ready"
