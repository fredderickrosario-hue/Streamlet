#!/bin/sh
# Everything that must pass before a push: build, smoke test, and the focus-ring check on TV and phone.
set -e
cd "$(dirname "$0")/.."
node build.js
node tests/smoke.js | tail -1
W=tv node tests/focus-audit.js | grep -v '^shot\|^setup'
W=phone PORT=8302 node tests/focus-audit.js | grep -v '^shot\|^setup'
