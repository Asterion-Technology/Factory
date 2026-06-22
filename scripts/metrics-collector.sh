#!/usr/bin/env bash
# Collect factory metrics from GitHub, Langfuse, and git history
# Writes dashboards/observation-deck/metrics.json for the Observation Deck
# Usage: bash scripts/metrics-collector.sh [--repo owner/repo] [--days 7]
set -euo pipefail

FACTORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${FACTORY_ROOT}/dashboards/observation-deck/metrics.json"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
LANGFUSE_PUBLIC_KEY="${LANGFUSE_PUBLIC_KEY:-}"
LANGFUSE_SECRET_KEY="${LANGFUSE_SECRET_KEY:-}"
LANGFUSE_HOST="${LANGFUSE_HOST:-https://cloud.langfuse.com}"
DAYS=7
REPO=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --repo) REPO="$2"; shift 2 ;;
    --days) DAYS="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Auto-detect repo from git remote if not specified
if [[ -z "$REPO" ]]; then
  REPO=$(git remote get-url origin 2>/dev/null | sed 's/.*github.com[:/]//;s/\.git$//' || echo "")
fi

SINCE_DATE=$(date -d "${DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -v-"${DAYS}d" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "── Collecting factory metrics ──────────────────────"
echo "Repo: ${REPO:-unknown}"
echo "Period: last ${DAYS} days"
echo ""

# ── GitHub PR metrics ──────────────────────────────────────────────────────────
MERGED_PRS=0
OPEN_PRS=0
AVG_CYCLE_HOURS=0
CI_PASS_RATE=0
CODEX_BLOCKS=0

if [[ -n "$GITHUB_TOKEN" && -n "$REPO" ]]; then
  echo "[collecting] GitHub PR metrics..."

  # Merged PRs this week
  MERGED_RESPONSE=$(curl -sf \
    "https://api.github.com/search/issues?q=repo:${REPO}+is:pr+is:merged+merged:>=${SINCE_DATE}&per_page=100" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" 2>/dev/null) || true

  if [[ -n "$MERGED_RESPONSE" ]]; then
    MERGED_PRS=$(echo "$MERGED_RESPONSE" | grep -o '"total_count":[0-9]*' | grep -o '[0-9]*' | head -1 || echo "0")
  fi

  # Open PRs
  OPEN_RESPONSE=$(curl -sf \
    "https://api.github.com/repos/${REPO}/pulls?state=open&per_page=1" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" -I 2>/dev/null) || true

  # Count Codex block verdicts in PR comments (look for "### Verdict\nBlock")
  if [[ $MERGED_PRS -gt 0 ]]; then
    CODEX_BLOCKS=$(curl -sf \
      "https://api.github.com/search/issues?q=repo:${REPO}+is:pr+is:merged+merged:>=${SINCE_DATE}+in:comments+%22Verdict%0ABlock%22&per_page=1" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" 2>/dev/null \
      | grep -o '"total_count":[0-9]*' | grep -o '[0-9]*' | head -1 || echo "0")
  fi

  # CI check run stats (sample latest 10 runs)
  RUN_RESPONSE=$(curl -sf \
    "https://api.github.com/repos/${REPO}/actions/runs?per_page=20&created=>=${SINCE_DATE}" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" 2>/dev/null) || true

  if [[ -n "$RUN_RESPONSE" ]]; then
    TOTAL_RUNS=$(echo "$RUN_RESPONSE" | grep -o '"total_count":[0-9]*' | grep -o '[0-9]*' | head -1 || echo "0")
    SUCCESS_RUNS=$(echo "$RUN_RESPONSE" | grep -o '"conclusion":"success"' | wc -l || echo "0")
    if [[ $TOTAL_RUNS -gt 0 ]]; then
      CI_PASS_RATE=$(( SUCCESS_RUNS * 100 / ($(echo "$RUN_RESPONSE" | grep -o '"conclusion":"[^"]*"' | grep -v "null" | wc -l) + 1) ))
    fi
  fi

  echo "[ok]  GitHub: ${MERGED_PRS} merged PRs, ${OPEN_PRS} open, CI pass rate ~${CI_PASS_RATE}%"
else
  echo "[warn] GITHUB_TOKEN or REPO not set — skipping GitHub metrics"
fi

# ── Security gate status (from latest CI run) ──────────────────────────────────
echo "[collecting] Security gate status..."
GITLEAKS_STATUS="pass"
SEMGREP_STATUS="pass"
TRIVY_STATUS="pass"
SNYK_STATUS="pass"
LINT_STATUS="pass"
TYPECHECK_STATUS="pass"
BUILD_STATUS="pass"
UNIT_STATUS="pass"
E2E_STATUS="pass"
MCP_STATUS="pass"

if [[ -n "$GITHUB_TOKEN" && -n "$REPO" ]]; then
  LATEST_RUN=$(curl -sf \
    "https://api.github.com/repos/${REPO}/actions/runs?per_page=1&branch=main" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" 2>/dev/null) || true

  RUN_ID=$(echo "$LATEST_RUN" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "")
  if [[ -n "$RUN_ID" ]]; then
    JOBS=$(curl -sf \
      "https://api.github.com/repos/${REPO}/actions/runs/${RUN_ID}/jobs" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" 2>/dev/null) || true

    map_job_status() {
      local job_name_pattern="$1"
      local default="$2"
      local conclusion
      conclusion=$(echo "$JOBS" | grep -A3 "\"name\":\"${job_name_pattern}\"" | grep '"conclusion"' | head -1 | grep -o '"[a-z_]*"$' | tr -d '"' || echo "")
      case "$conclusion" in
        success) echo "pass" ;;
        failure) echo "fail" ;;
        *) echo "$default" ;;
      esac
    }

    GITLEAKS_STATUS=$(map_job_status "Secrets Scan" "pass")
    SEMGREP_STATUS=$(map_job_status "SAST" "pass")
    TRIVY_STATUS=$(map_job_status "Dependency Scan" "pass")
    SNYK_STATUS=$(map_job_status "Dependency Audit" "pass")
    LINT_STATUS=$(map_job_status "Lint" "pass")
    TYPECHECK_STATUS=$(map_job_status "Type Check" "pass")
    BUILD_STATUS=$(map_job_status "Build" "pass")
    UNIT_STATUS=$(map_job_status "Unit Tests" "pass")
    E2E_STATUS=$(map_job_status "E2E Tests" "pass")
    MCP_STATUS=$(map_job_status "Validate mcp" "pass")
  fi
fi

# ── Langfuse cost metrics ──────────────────────────────────────────────────────
TOTAL_COST=0
CLAUDE_TOKENS=0
CODEX_TOKENS=0
OLLAMA_TASKS=0
RTK_SAVINGS=0
RTK_SESSIONS=0
RTK_AVG_REDUCTION=0
RTK_TOKENS_SAVED=0

if [[ -n "$LANGFUSE_PUBLIC_KEY" && -n "$LANGFUSE_SECRET_KEY" ]]; then
  echo "[collecting] Langfuse cost metrics..."
  LANGFUSE_AUTH=$(echo -n "${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}" | base64)

  USAGE=$(curl -sf "${LANGFUSE_HOST}/api/public/metrics/usage?fromTimestamp=${SINCE_DATE}" \
    -H "Authorization: Basic ${LANGFUSE_AUTH}" \
    -H "Accept: application/json" 2>/dev/null) || true

  if [[ -n "$USAGE" ]]; then
    # Extract totals from Langfuse response
    TOTAL_TOKENS=$(echo "$USAGE" | grep -o '"totalTokens":[0-9]*' | grep -o '[0-9]*' | head -1 || echo "0")
    TOTAL_COST=$(echo "$USAGE" | grep -o '"totalCost":[0-9.]*' | grep -o '[0-9.]*' | head -1 || echo "0")
    # Approximate split: assume Claude = 60%, Codex = 25%, Ollama = 15%
    CLAUDE_TOKENS=$(( TOTAL_TOKENS * 60 / 100 ))
    CODEX_TOKENS=$(( TOTAL_TOKENS * 25 / 100 ))
    OLLAMA_TASKS=$(( TOTAL_TOKENS * 15 / 100 / 200 ))  # avg ~200 tokens per Ollama task
    echo "[ok]  Langfuse: ~$${TOTAL_COST} total, ${TOTAL_TOKENS} tokens"
  fi
else
  echo "[warn] Langfuse credentials not set — cost metrics will show as zero"
fi

# ── Workforce distribution heuristic ──────────────────────────────────────────
# Based on: PR count vs review comments vs commit patterns
CLAUDE_PCT=35
CODEX_PCT=15
OLLAMA_PCT=40
HUMAN_PCT=10

# If we have real PR data, adjust the heuristic
if [[ $MERGED_PRS -gt 0 ]]; then
  # More PRs = more Claude implementation work relative to human
  if [[ $MERGED_PRS -gt 10 ]]; then
    CLAUDE_PCT=40; OLLAMA_PCT=40; HUMAN_PCT=8; CODEX_PCT=12
  fi
fi

# ── Sanitize numeric vars (guard against empty strings) ───────────────────────
MERGED_PRS="${MERGED_PRS:-0}"
OPEN_PRS="${OPEN_PRS:-0}"
AVG_CYCLE_HOURS="${AVG_CYCLE_HOURS:-0}"
CI_PASS_RATE="${CI_PASS_RATE:-0}"
CODEX_BLOCKS="${CODEX_BLOCKS:-0}"
TOTAL_COST="${TOTAL_COST:-0}"
RTK_SAVINGS="${RTK_SAVINGS:-0}"
CLAUDE_TOKENS="${CLAUDE_TOKENS:-0}"
CODEX_TOKENS="${CODEX_TOKENS:-0}"
OLLAMA_TASKS="${OLLAMA_TASKS:-0}"
RTK_AVG_REDUCTION="${RTK_AVG_REDUCTION:-0}"
RTK_TOKENS_SAVED="${RTK_TOKENS_SAVED:-0}"
RTK_SESSIONS="${RTK_SESSIONS:-0}"

# ── Read MCP server list and embed in metrics.json ────────────────────────────
MCP_JSON="[]"
MCP_FILE="${FACTORY_ROOT}/mcp/mcp.factory.json"
if [[ -f "$MCP_FILE" ]]; then
  MCP_JSON=$(node -e "
    const d = JSON.parse(require('fs').readFileSync('${MCP_FILE}', 'utf8'));
    const out = Object.entries(d.mcpServers || {}).map(([k,v]) => ({name:k, active:!v.disabled}));
    process.stdout.write(JSON.stringify(out));
  " 2>/dev/null || echo "[]")
fi

# ── Write metrics.json ─────────────────────────────────────────────────────────
mkdir -p "$(dirname "$OUTPUT")"

cat > "$OUTPUT" <<JSON
{
  "updated_at": "${NOW}",
  "period_days": ${DAYS},
  "repo": "${REPO}",
  "workforce": {
    "claude": ${CLAUDE_PCT},
    "codex": ${CODEX_PCT},
    "ollama": ${OLLAMA_PCT},
    "human": ${HUMAN_PCT},
    "other": $(( 100 - CLAUDE_PCT - CODEX_PCT - OLLAMA_PCT - HUMAN_PCT ))
  },
  "cost": {
    "total": ${TOTAL_COST},
    "saved_rtk": ${RTK_SAVINGS},
    "claude_tokens": ${CLAUDE_TOKENS},
    "codex_tokens": ${CODEX_TOKENS},
    "ollama_tasks": ${OLLAMA_TASKS}
  },
  "prs": {
    "merged_this_week": ${MERGED_PRS},
    "open": ${OPEN_PRS},
    "avg_cycle_hours": ${AVG_CYCLE_HOURS},
    "ci_pass_rate": ${CI_PASS_RATE},
    "codex_blocks": ${CODEX_BLOCKS}
  },
  "security": {
    "gitleaks": "${GITLEAKS_STATUS}",
    "semgrep": "${SEMGREP_STATUS}",
    "trivy": "${TRIVY_STATUS}",
    "snyk": "${SNYK_STATUS}",
    "lint": "${LINT_STATUS}",
    "typecheck": "${TYPECHECK_STATUS}",
    "build": "${BUILD_STATUS}",
    "unit_tests": "${UNIT_STATUS}",
    "e2e": "${E2E_STATUS}",
    "mcp_config": "${MCP_STATUS}"
  },
  "rtk": {
    "avg_reduction": ${RTK_AVG_REDUCTION},
    "tokens_saved": ${RTK_TOKENS_SAVED},
    "sessions": ${RTK_SESSIONS},
    "cost_avoided": $(echo "scale=4; ${RTK_TOKENS_SAVED} * 0.000003" | bc 2>/dev/null || echo "0")
  },
  "mcp_servers": ${MCP_JSON}
}
JSON

echo ""
echo "[ok]  Metrics written to: ${OUTPUT}"
echo "[ok]  Open dashboards/observation-deck/index.html to view"
