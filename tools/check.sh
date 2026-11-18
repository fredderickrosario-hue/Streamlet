#!/bin/sh
# Before a push: build and smoke test always; the focus-ring check only when styles or page layout changed since the last push.
set -e
cd "$(dirname "$0")/.."
node build.js >/dev/null
node tests/smoke.js | tail -1
changed=$( { git diff --name-only @{u} 2>/dev/null; git diff --name-only; } | sort -u )
if echo "$changed" | grep -q '^src/css/\|^src/body.html'; then
  W=tv node tests/focus-audit.js | grep -v '^shot\|^setup'
  W=phone PORT=8302 node tests/focus-audit.js | grep -v '^shot\|^setup'
else echo "no style or layout change: focus check skipped"; fi
