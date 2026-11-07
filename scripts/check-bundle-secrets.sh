#!/usr/bin/env bash
# Fails if server secrets or connection strings appear in client-delivered build output.
set -euo pipefail
DIR=.next/static
[ -d "$DIR" ] || { echo "Run next build first"; exit 1; }
PATTERNS=("postgresql://" "DATABASE_URL" "DIRECT_URL" "USER_AUTH_SECRET" "ADMIN_AUTH_SECRET" "FIELD_ENCRYPTION_KEY" "CRON_SECRET" "SMTP_PASSWORD" "S3_SECRET_ACCESS_KEY" "GOOGLE_CLIENT_SECRET" "APPLE_CLIENT_SECRET" "VIRUSTOTAL_API_KEY" "URLHAUS_AUTH_KEY" "GOOGLE_WEB_RISK_API_KEY" "BEGIN PRIVATE KEY")
for v in "${USER_AUTH_SECRET:-}" "${CRON_SECRET:-}" "${FIELD_ENCRYPTION_KEY:-}"; do [ -n "$v" ] && PATTERNS+=("$v"); done
FOUND=0
for p in "${PATTERNS[@]}"; do if grep -rlwF -- "$p" "$DIR" >/dev/null 2>&1; then echo "LEAK: '$p' found in $(grep -rlwF -- "$p" "$DIR" | head -3)"; FOUND=1; fi; done
MAPS=$(find "$DIR" -name '*.map' | wc -l)
[ "$MAPS" -eq 0 ] || { echo "Source maps present in client output ($MAPS)"; FOUND=1; }
[ $FOUND -eq 0 ] && echo "No secrets or source maps in client bundles ($(find "$DIR" -type f | wc -l) files checked)"
exit $FOUND
