#!/usr/bin/env bash
# Sync mcp.factory.json to Claude Code, Cursor, and VS Code settings
# Idempotent — safe to run multiple times
set -euo pipefail

FACTORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_SOURCE="${FACTORY_ROOT}/mcp/mcp.factory.json"

if [[ ! -f "$MCP_SOURCE" ]]; then
  echo "[fail] mcp/mcp.factory.json not found"
  exit 1
fi

echo "── Syncing MCP config to all editors ───────────────"

# Claude Code
bash "${FACTORY_ROOT}/scripts/install-mcps.sh" && echo "[ok]  Claude Code synced" || echo "[warn] Claude Code sync failed"

# Cursor (~/.cursor/mcp.json or %APPDATA%\Cursor\mcp.json)
if [[ "$OSTYPE" == "darwin"* ]]; then
  CURSOR_DIR="${HOME}/.cursor"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  CURSOR_DIR="${APPDATA}/Cursor"
else
  CURSOR_DIR="${HOME}/.config/Cursor"
fi

if [[ -d "$CURSOR_DIR" ]]; then
  if command -v jq &>/dev/null; then
    jq '{mcpServers: (.mcpServers | to_entries | map(select(.value.disabled != true)) | from_entries)}' \
      "$MCP_SOURCE" > "${CURSOR_DIR}/mcp.json"
    echo "[ok]  Cursor MCP config written to: ${CURSOR_DIR}/mcp.json"
  else
    cp "$MCP_SOURCE" "${CURSOR_DIR}/mcp.json"
    echo "[warn] Cursor MCP config copied (jq not available for filtering)"
  fi
else
  echo "[info] Cursor not detected — skipping"
fi

# VS Code workspace settings (update .vscode/mcp.json if directory exists)
VSCODE_DIR="${FACTORY_ROOT}/.vscode"
mkdir -p "$VSCODE_DIR"
if command -v jq &>/dev/null; then
  jq '{servers: (.mcpServers | to_entries | map(select(.value.disabled != true)) | map({key: .key, value: {command: .value.command, args: .value.args, env: (.value.env // {})}}) | from_entries)}' \
    "$MCP_SOURCE" > "${VSCODE_DIR}/mcp.json"
  echo "[ok]  VS Code MCP config written to: ${VSCODE_DIR}/mcp.json"
else
  echo "[warn] jq not available — VS Code MCP config not written"
fi

echo ""
echo "[ok]  Sync complete. Restart editors to load updated MCP servers."
