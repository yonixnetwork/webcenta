#!/usr/bin/env bash
# Restore drill: restores a backup into an EMPTY scratch database and compares exact
# row counts with the source, then checks constraints, indexes and collations.
# Usage: SOURCE_URL=mysql://… SCRATCH_URL=mysql://…/scratch bash scripts/restore-drill.sh <backup.sql.gz>
set -euo pipefail
: "${SOURCE_URL:?}" "${SCRATCH_URL:?}"; DUMP="${1:?backup file}"
[ "$(npx tsx scripts/db-tool.ts tables "$SCRATCH_URL")" = "0" ] || { echo "Refusing: scratch database is not empty"; exit 1; }
CLIENT=$(command -v mariadb || command -v mysql) || { echo "mariadb or mysql client is required" >&2; exit 1; }
CNF=$(mktemp); chmod 600 "$CNF"; trap 'rm -f "$CNF"' EXIT
npx tsx scripts/db-tool.ts cnf "$SCRATCH_URL" > "$CNF"
gunzip -c "$DUMP" | "$CLIENT" --defaults-extra-file="$CNF" "$(npx tsx scripts/db-tool.ts database "$SCRATCH_URL")"
A=$(npx tsx scripts/db-tool.ts counts "$SOURCE_URL"); B=$(npx tsx scripts/db-tool.ts counts "$SCRATCH_URL")
if [ "$A" = "$B" ]; then echo "RESTORE OK: $(echo "$A" | wc -l) tables, identical row counts"; else echo "MISMATCH"; diff <(echo "$A") <(echo "$B"); exit 1; fi
S=$(npx tsx scripts/db-tool.ts integrity "$SOURCE_URL"); R=$(npx tsx scripts/db-tool.ts integrity "$SCRATCH_URL")
echo "$R"
[ "$S" = "$R" ] || { echo "INTEGRITY MISMATCH"; diff <(echo "$S") <(echo "$R"); exit 1; }
echo "INTEGRITY OK: constraints, foreign keys, FULLTEXT indexes and collations match the source"
