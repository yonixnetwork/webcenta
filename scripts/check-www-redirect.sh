#!/usr/bin/env bash
# Verifies www → apex redirect is absolute when public origin differs from the request host.
# Requires a completed `next build`. Usage: bash scripts/check-www-redirect.sh
set -euo pipefail
PORT=${PORT:-3199}
PUBLIC_ORIGIN=https://webcenta.com PORT="$PORT" HOSTNAME=127.0.0.1 node .next/standalone/server.js >/dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -fs -o /dev/null "http://127.0.0.1:$PORT/icons/favicon-32.png" && break; sleep 1; done
LOC=$(curl -s -o /dev/null -w '%{redirect_url}' -H 'Host: www.webcenta.com' "http://127.0.0.1:$PORT/c/ai?x=1")
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: www.webcenta.com' "http://127.0.0.1:$PORT/c/ai?x=1")
echo "www redirect: $CODE -> $LOC"
[ "$CODE" = "308" ] && [ "$LOC" = "https://webcenta.com/c/ai?x=1" ]
