#!/usr/bin/env bash
# Serve the Factory Observation Deck on http://localhost:3099
# Real-time events require HTTP — opening index.html as file:// will not work
set -euo pipefail

DASHBOARD="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/dashboards/observation-deck"
PORT="${PORT:-3099}"

echo "────────────────────────────────────────────────"
echo "  Factory Observation Deck"
echo "  → http://localhost:${PORT}"
echo "  Ctrl+C to stop"
echo "────────────────────────────────────────────────"

if command -v npx &>/dev/null; then
  npx --yes serve "$DASHBOARD" -p "$PORT" --no-clipboard
elif command -v python3 &>/dev/null; then
  cd "$DASHBOARD" && python3 -m http.server "$PORT"
elif command -v python &>/dev/null; then
  cd "$DASHBOARD" && python -m SimpleHTTPServer "$PORT"
else
  echo "Error: Node.js (npx) or Python is required to serve the dashboard."
  exit 1
fi
