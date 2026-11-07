#!/usr/bin/env bash
# Fails if the retired brand ("WebCenter" / webcenter.com) appears anywhere in
# tracked source, docs, config or tests — including split wordmarks such as
# Web<span>Center</span>. The official brand is Webcenta (webcenta.com).
set -euo pipefail
cd "$(dirname "$0")/.."
pattern='web[[:space:]_-]*center|>[[:space:]]*Center[[:space:]]*<'
# git grep covers tracked files only (no node_modules, build output or test results).
if hits=$(git grep -nIiE "$pattern" -- . ':!scripts/check-brand.sh' ':!package-lock.json'); then
  echo "Old brand references found:" >&2
  echo "$hits" >&2
  exit 1
fi
# Untracked-but-not-ignored files (new work not yet added).
if hits=$(git ls-files --others --exclude-standard -z -- . ":!scripts/check-brand.sh" | xargs -0 -r grep -nIiE "$pattern" -- 2>/dev/null); then
  echo "Old brand references found in untracked files:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "Brand check passed: no references to the retired brand."
