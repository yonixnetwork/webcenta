#!/usr/bin/env bash
# Restore drill: restores a dump into an EMPTY scratch database and compares row counts with the source.
# Usage: SOURCE_URL=... SCRATCH_URL=... bash scripts/restore-drill.sh <dump-file>
set -euo pipefail
: "${SOURCE_URL:?}" "${SCRATCH_URL:?}"; DUMP="${1:?dump file}"
TABLES=$(psql "$SCRATCH_URL" -Atc "select count(*) from pg_tables where schemaname='public'")
[ "$TABLES" = "0" ] || { echo "Refusing: scratch database is not empty"; exit 1; }
psql "$SCRATCH_URL" -qc "CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;"
pg_restore --no-owner --no-privileges --schema=public --dbname="$SCRATCH_URL" "$DUMP"
Q="select string_agg(t || '=' || n, ',' order by t) from (select relname t, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', relname), false, true, '')))[1]::text n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r') x"
A=$(psql "$SOURCE_URL" -Atc "$Q"); B=$(psql "$SCRATCH_URL" -Atc "$Q")
if [ "$A" = "$B" ]; then echo "RESTORE OK: $(echo "$A" | tr ',' '\n' | wc -l) tables, identical row counts"; else echo "MISMATCH"; diff <(echo "$A" | tr ',' '\n') <(echo "$B" | tr ',' '\n'); exit 1; fi
# Integrity spot-checks on the restored copy
psql "$SCRATCH_URL" -Atc "select 'rls_disabled_tables=' || count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"
psql "$SCRATCH_URL" -Atc "select 'search_trigger_works=' || (select \"searchVector\" is not null from \"Listing\" limit 1)"
