#!/bin/sh
# Regenerates dist/senselike-cards.js from www/senselike-cards/*.js.
# Each file is wrapped in its own block so top-level declarations (e.g. resolveDeviceList)
# stay file-scoped; module code rejects duplicate top-level declarations.
# Run from the repo root before tagging a release.
set -e
cd "$(dirname "$0")/.."

{
  echo "// Bundled build of www/senselike-cards/*.js — regenerate with dist/build.sh before tagging a release."
  for f in \
    www/senselike-cards/senselike-device-bubbles-card.js \
    www/senselike-cards/senselike-power-meter-card.js \
    www/senselike-cards/senselike-goals-card.js \
    www/senselike-cards/senselike-usage-trend-card.js \
    www/senselike-cards/senselike-timeline-card.js
  do
    echo ""
    echo "// ---- $f ----"
    echo "{"
    cat "$f"
    echo ""
    echo "}"
  done
} > dist/senselike-cards.js

node_check_dir=$(mktemp -d)
cp dist/senselike-cards.js "$node_check_dir/senselike-cards.mjs"
node --check "$node_check_dir/senselike-cards.mjs"
rm -rf "$node_check_dir"
