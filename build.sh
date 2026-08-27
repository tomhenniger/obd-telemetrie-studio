#!/usr/bin/env bash
# Baut aus src/* eine einzelne, self-contained index.html
set -euo pipefail
cd "$(dirname "$0")"
OUT=index.html
{
  cat src/01-head.html
  echo '<style>'
  cat src/02-theme.css
  cat src/03-layout.css
  cat src/04-components.css
  echo '</style>'
  cat src/10-body.html
  echo '<script>'
  cat src/20-util.js
  cat src/21-parse.js
  cat src/22-metrics.js
  cat src/23-stats.js
  cat src/24-chart.js
  cat src/25-map.js
  cat src/26-diag.js
  cat src/27-ui.js
  cat src/28-ingest.js
  cat src/29-app.js
  echo '</script>'
  cat src/99-tail.html
} > "$OUT"
BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo "index.html gebaut: $BYTES Bytes ($(( BYTES / 1024 )) KB)"
