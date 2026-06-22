#!/usr/bin/env bash
# Install dependencies for all Phase 3 MCP wrapper servers
set -euo pipefail

SERVERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SERVERS=(
  clerk
  idme
  meilisearch
  snyk
  semgrep
  sonarqube
  resend
  cloudflare-r2
  railway
  magic21
  knowledge
)

echo "── Installing MCP server dependencies (Phases 3 + 6) ──────"
for srv in "${SERVERS[@]}"; do
  dir="${SERVERS_DIR}/${srv}"
  if [[ -d "$dir" && -f "${dir}/package.json" ]]; then
    echo "[installing] ${srv}..."
    (cd "$dir" && npm install --silent) && echo "[ok] ${srv}" || echo "[fail] ${srv}"
  else
    echo "[skip] ${srv} — directory not found"
  fi
done

echo ""
echo "[ok] All MCP servers installed."
echo "     Restart Claude Code to load the updated servers."
echo ""
echo "Knowledge base setup (Phase 6):"
echo "  1. docker compose -f knowledge/docker-compose.yml up -d"
echo "  2. node knowledge/ingest.js  (or: npm run ingest:all --prefix knowledge)"
