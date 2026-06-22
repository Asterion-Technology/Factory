#!/usr/bin/env bash
# Factory bootstrap — idempotent setup for any workstation
# Usage: bash scripts/bootstrap.sh [--check]
set -euo pipefail

FACTORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

# Auto-load .devcontainer/.env if running outside a devcontainer
ENV_FILE="${FACTORY_ROOT}/.devcontainer/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
fi

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[ok]${NC}  $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
fail() { echo -e "${RED}[fail]${NC} $1"; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Agentic DevSecOps Factory — Bootstrap       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Required env vars ───────────────────────────────────────────────────────
REQUIRED_VARS=(
  "LINEAR_API_KEY"
  "GITHUB_TOKEN"
  "RAILWAY_TOKEN"
  "OPENAI_API_KEY"
  "SENTRY_TOKEN"
  "SENTRY_ORG"
  "SENTRY_PROJECT"
  "FIGMA_ACCESS_TOKEN"
  "NEON_API_KEY"
  "DATABASE_URL"
  "MONGODB_URI"
)

OPTIONAL_VARS=(
  "MEILI_HOST"
  "MEILI_MASTER_KEY"
  "SNYK_TOKEN"
  "SEMGREP_APP_TOKEN"
  "SONAR_TOKEN"
  "SONAR_HOST_URL"
  "RESEND_API_KEY"
  "R2_ACCESS_KEY_ID"
  "R2_SECRET_ACCESS_KEY"
  "R2_BUCKET"
  "R2_ACCOUNT_ID"
  "IDME_API_KEY"
  "CLERK_SECRET_KEY"
  "MAGIC21_API_KEY"
  "LANGFUSE_PUBLIC_KEY"
  "LANGFUSE_SECRET_KEY"
)

missing_required=0
echo "── Required environment variables ─────────────────"
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    fail "$var is not set"
    missing_required=$((missing_required + 1))
  else
    ok "$var"
  fi
done

echo ""
echo "── Optional environment variables ─────────────────"
for var in "${OPTIONAL_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    warn "$var not set (Phase 3 feature — skip if not yet configured)"
  else
    ok "$var"
  fi
done

if $CHECK_ONLY; then
  echo ""
  if [[ $missing_required -gt 0 ]]; then
    fail "$missing_required required variable(s) missing. See bootstrap/first-run.md."
    exit 1
  else
    ok "All required env vars present."
    exit 0
  fi
fi

# ── Claude Code ─────────────────────────────────────────────────────────────
echo ""
echo "── Claude Code ─────────────────────────────────────"
if command -v claude &>/dev/null; then
  ok "Claude Code installed: $(claude --version 2>/dev/null || echo 'version unknown')"
else
  warn "Claude Code not found — installing..."
  npm install -g @anthropic-ai/claude-code || {
    fail "Claude Code install failed. Install manually: npm install -g @anthropic-ai/claude-code"
  }
fi

# ── Sync MCP config ─────────────────────────────────────────────────────────
echo ""
echo "── MCP configuration ───────────────────────────────"
bash "${FACTORY_ROOT}/scripts/install-mcps.sh" && ok "MCP config synced to Claude Code" || warn "MCP sync failed — run scripts/install-mcps.sh manually"

# ── GitHub CLI ──────────────────────────────────────────────────────────────
echo ""
echo "── GitHub CLI ──────────────────────────────────────"
if command -v gh &>/dev/null; then
  ok "GitHub CLI: $(gh --version | head -1)"
  if gh auth status &>/dev/null; then
    ok "GitHub CLI authenticated"
  else
    warn "GitHub CLI not authenticated — run: gh auth login"
  fi
else
  fail "GitHub CLI not installed. Install: https://cli.github.com/"
fi

# ── Railway CLI ─────────────────────────────────────────────────────────────
echo ""
echo "── Railway CLI ─────────────────────────────────────"
if command -v railway &>/dev/null; then
  ok "Railway CLI: $(railway --version 2>/dev/null || echo 'version unknown')"
else
  warn "Railway CLI not installed — install: npm install -g @railway/cli"
fi

# ── Ollama ───────────────────────────────────────────────────────────────────
echo ""
echo "── Ollama ──────────────────────────────────────────"
if curl -s "${OLLAMA_HOST:-http://localhost:11434}/api/tags" &>/dev/null; then
  ok "Ollama reachable at ${OLLAMA_HOST:-http://localhost:11434}"
  warn "Model pull skipped — run manually if needed:"
  warn "  ollama pull mistral:7b"
  warn "  ollama pull codellama:7b"
  warn "  ollama pull nomic-embed-text"
else
  warn "Ollama not reachable. Start it or run via Docker:"
  warn "  docker run -d -v ollama:/root/.ollama -p 11434:11434 ollama/ollama"
fi

# ── Docker / LiteLLM ─────────────────────────────────────────────────────────
echo ""
echo "── LiteLLM ─────────────────────────────────────────"
if command -v docker &>/dev/null; then
  ok "Docker available"
  warn "To start LiteLLM: docker compose -f config/docker-compose.yml up -d"
else
  warn "Docker not found — LiteLLM model routing requires Docker"
fi

# ── Security tools ────────────────────────────────────────────────────────────
echo ""
echo "── Security tools ──────────────────────────────────"
for tool in gitleaks trivy semgrep; do
  if command -v "$tool" &>/dev/null; then
    ok "$tool installed"
  else
    warn "$tool not installed (required for CI gates)"
  fi
done

# ── Node.js ───────────────────────────────────────────────────────────────────
echo ""
echo "── Node.js / npm ───────────────────────────────────"
if command -v node &>/dev/null; then
  ok "Node.js: $(node --version)"
else
  fail "Node.js not installed — required for MCP servers and scripts"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
if [[ $missing_required -eq 0 ]]; then
  echo "║  Factory ready. Claude is your entry point.  ║"
else
  echo "║  Setup incomplete — $missing_required required var(s) missing.   ║"
fi
echo "╚══════════════════════════════════════════════╝"
echo ""

if [[ $missing_required -gt 0 ]]; then
  echo "See bootstrap/first-run.md for setup instructions."
  exit 1
fi
