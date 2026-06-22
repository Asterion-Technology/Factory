#!/usr/bin/env bash
# Sync mcp.factory.json into Claude Code's global MCP configuration
# Idempotent — safe to run multiple times
set -euo pipefail

FACTORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_SOURCE="${FACTORY_ROOT}/mcp/mcp.factory.json"

if [[ ! -f "$MCP_SOURCE" ]]; then
  echo "[fail] mcp/mcp.factory.json not found at $MCP_SOURCE"
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

# Extract only enabled (non-disabled) servers from mcp.factory.json
# and write them in the format Claude Code expects
if command -v jq &>/dev/null; then
  jq '{mcpServers: (.mcpServers | to_entries | map(select(.value.disabled != true)) | from_entries | map_values({command, args, env: (.env // {})} | with_entries(select(.value != null))))}' \
    "$MCP_SOURCE" > "$CLAUDE_MCP_FILE"
  echo "[ok]  Claude Code MCP config written to: $CLAUDE_MCP_FILE"
  echo "[ok]  Enabled servers: $(jq '.mcpServers | keys | length' "$CLAUDE_MCP_FILE")"
  echo "[ok]  Disabled (Phase 3) servers skipped: $(jq '[.mcpServers | to_entries[] | select(.value.disabled == true)] | length' "$MCP_SOURCE")"
else
  # Fallback: copy the full file (Claude Code will ignore disabled servers if it supports the field)
  cp "$MCP_SOURCE" "$CLAUDE_MCP_FILE"
  echo "[warn] jq not found — copied full mcp.factory.json (disabled stubs included)"
  echo "[warn] Install jq for proper filtering: https://jqlang.github.io/jq/"
fi

# Also sync to VS Code settings if workspace settings exist
VSCODE_SETTINGS="${FACTORY_ROOT}/.vscode/settings.json"
if [[ -f "$VSCODE_SETTINGS" ]]; then
  echo "[info] VS Code settings found — manual MCP sync to VS Code not yet automated"
  echo "[info] Restart Claude Code extension in VS Code to pick up new MCP config"
fi

echo ""
echo "[ok]  MCP sync complete. Restart Claude Code to load new servers."
