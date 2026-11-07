#!/usr/bin/env bash
# Creates a throwaway test CA and a TLS certificate for the fixture websites.
# Output: tests/fixtures/.certs/{ca.pem,ca.key,site.pem,site.key} (git-ignored).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/.certs"
[ -f "$DIR/site.pem" ] && exit 0
mkdir -p "$DIR"; cd "$DIR"
HOSTS="good-app journey-app phish-app evil-site evil-redirect down-app private-redirect download-app"
SAN="DNS:localhost"; for h in $HOSTS; do SAN="$SAN,DNS:$h.localhost"; done
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=WebCenter E2E Test CA" -keyout ca.key -out ca.pem 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=e2e.localhost" -keyout site.key -out site.csr 2>/dev/null
printf "subjectAltName=%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n" "$SAN" > ext.cnf
openssl x509 -req -in site.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 30 -extfile ext.cnf -out site.pem 2>/dev/null
echo "test certificates created in $DIR"
