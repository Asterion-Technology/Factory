#!/usr/bin/env bash
# Sync the registry-generated .mcp.json into Claude Code's global MCP configuration.
# The source of truth is mcp/registry.json — .mcp.json is regenerated first.
# Idempotent — safe to run multiple times.
set -euo pipefail

FACTORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_SOURCE="${FACTORY_ROOT}/.mcp.json"

node "${FACTORY_ROOT}/scripts/gen-mcp-config.mjs"

if [[ ! -f "$MCP_SOURCE" ]]; then
  echo "[fail] .mcp.json not found at $MCP_SOURCE (generator failed?)"
  exit 1
fi

# Claude Code MCP config locations by platform
if [[ "$OSTYPE" == "darwin"* ]]; then
  CLAUDE_CONFIG_DIR="${HOME}/Library/Application Support/Claude"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  CLAUDE_CONFIG_DIR="${HOME}/.config/Claude"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  CLAUDE_CONFIG_DIR="${APPDATA}/Claude"
else
  CLAUDE_CONFIG_DIR="${HOME}/.config/Claude"
fi

CLAUDE_MCP_FILE="${CLAUDE_CONFIG_DIR}/claude_mcp_config.json"
mkdir -p "$CLAUDE_CONFIG_DIR"

cp "$MCP_SOURCE" "$CLAUDE_MCP_FILE"
echo "[ok]  Claude Code MCP config written to: $CLAUDE_MCP_FILE"
if command -v jq &>/dev/null; then
  echo "[ok]  Servers: $(jq '.mcpServers | keys | length' "$CLAUDE_MCP_FILE")"
fi

echo ""
echo "[ok]  MCP sync complete. Restart Claude Code to load new servers."
