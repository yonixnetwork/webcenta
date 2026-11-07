#!/usr/bin/env bash
# Logical backup of the database (custom format, compressed). Uses DIRECT_URL (session pooler on Supabase).
# Usage: DIRECT_URL=... bash scripts/backup.sh [output-dir]
set -euo pipefail
URL="${DIRECT_URL:-${DATABASE_URL:?DIRECT_URL or DATABASE_URL required}}"
OUT="${1:-./backups}"; mkdir -p "$OUT"
FILE="$OUT/webcenter-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --schema=public --file="$FILE" "$URL"
echo "$FILE"
