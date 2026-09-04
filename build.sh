#!/usr/bin/env bash
# Baut aus src/* eine einzelne, self-contained index.html
set -euo pipefail
cd "$(dirname "$0")"
OUT=index.html
{
  cat src/01-head.html
  echo '<style>'
  cat src/02-theme.css
  cat src/02a-fonts.css
  cat src/03-layout.css
  cat src/04-components.css
  echo '</style>'
  cat src/10-body.html
  echo '<script>'
  cat src/20-util.js
  cat src/20b-qr.js
  cat src/21-parse.js
  cat src/21b-vin.js
  cat src/21c-vcds.js
  cat src/22-metrics.js
  cat src/23-stats.js
  cat src/23b-events.js
  cat src/23c-shifts.js
  cat src/23d-physics.js
  cat src/24-chart.js
  cat src/25-map.js
  cat src/25b-limits.js
  cat src/26-profiles.js
  cat src/26b-gearbox.js
  cat src/26c-tyres.js
  cat src/27-diag.js
  cat src/28-ui.js
  cat src/29-ingest.js
  cat src/29b-share.js
  cat src/29c-live.js
  cat src/30-buycheck.js
  cat src/31-aiexport.js
  cat src/31b-akte.js
  cat src/31c-assist.js
  cat src/31d-dtc.js
  cat src/32-app.js
  cat src/33-report.js
  echo '</script>'
  cat src/99-tail.html
} > "$OUT"
BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo "index.html gebaut: $BYTES Bytes ($(( BYTES / 1024 )) KB)"
