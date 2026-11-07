#!/usr/bin/env bash
# Logical backup of the MySQL / MariaDB database (gzip-compressed SQL).
# Usage: DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE bash scripts/backup.sh [output-dir]
# Needs mariadb-dump or mysqldump. On Hostinger you can also use hPanel → Backups
# or phpMyAdmin → Export; run this from a trusted machine with Remote MySQL access.
set -euo pipefail
URL="${DIRECT_URL:-${DATABASE_URL:?DATABASE_URL required}}"
OUT="${1:-./backups}"; mkdir -p "$OUT"
FILE="$OUT/webcenta-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
DUMP=$(command -v mariadb-dump || command -v mysqldump) || { echo "mariadb-dump or mysqldump is required" >&2; exit 1; }
CNF=$(mktemp); chmod 600 "$CNF"; trap 'rm -f "$CNF"' EXIT
npx tsx scripts/db-tool.ts cnf "$URL" > "$CNF"
DB=$(npx tsx scripts/db-tool.ts database "$URL")
# MySQL's mysqldump (e.g. on GitHub runners) needs this flag against MariaDB servers.
EXTRA=(); "$DUMP" --help 2>/dev/null | grep -q -- "--column-statistics" && EXTRA+=(--column-statistics=0)
# --single-transaction: consistent snapshot without locking (InnoDB).
# --no-tablespaces: shared hosting users lack the PROCESS privilege.
"$DUMP" --defaults-extra-file="$CNF" "${EXTRA[@]}" --single-transaction --no-tablespaces --skip-triggers \
  --default-character-set=utf8mb4 --hex-blob "$DB" | gzip > "$FILE"
echo "$FILE"
