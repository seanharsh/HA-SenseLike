#!/bin/sh
# Regenerates dist/senselike-cards.js by concatenating www/senselike-cards/*.js.
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
    cat "$f"
  done
} > dist/senselike-cards.js
