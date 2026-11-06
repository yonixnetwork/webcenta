#!/usr/bin/env bash
# Verifies www → apex redirect is absolute when public origin differs from the request host.
# Requires a completed `next build`. Usage: bash scripts/check-www-redirect.sh
set -euo pipefail
PORT=${PORT:-3199}
PUBLIC_ORIGIN=https://webcenter.com npx next start -p "$PORT" >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -fs -o /dev/null "http://localhost:$PORT/icon.svg" && break; sleep 1; done
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -H 'Host: www.webcenter.com' "http://localhost:$PORT/c/ai?x=1")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: www.webcenter.com' "http://localhost:$PORT/c/ai?x=1")
echo "www redirect: $CODE -> $LOC"
[ "$CODE" = "308" ] && [ "$LOC" = "https://webcenter.com/c/ai?x=1" ]
