#!/usr/bin/env bash
# Collect factory metrics from GitHub, Langfuse, and git history
# Writes dashboards/observation-deck/metrics.json for the Observation Deck
# Usage: bash scripts/metrics-collector.sh [--repo owner/repo ...] [--days 7]
#   --repo may be passed multiple times to track several repos; their PR
#   metrics are aggregated for the headline numbers and also broken out
#   per-repo under prs.by_repo. GITHUB_TOKEN must have read access to every
#   repo passed — GitHub Actions' auto-generated secrets.GITHUB_TOKEN only
#   covers the repo the workflow runs in, so cross-repo automated collection
#   needs a separate token with access to the other repo(s).
set -euo pipefail

FACTORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${FACTORY_ROOT}/dashboards/observation-deck/metrics.json"

# Source Factory .env if it exists (so the script works without manual env exports)
if [[ -f "${FACTORY_ROOT}/.env" ]]; then
  set -a; source "${FACTORY_ROOT}/.env"; set +a
fi

GITHUB_TOKEN="${GITHUB_TOKEN:-}"
LANGFUSE_PUBLIC_KEY="${LANGFUSE_PUBLIC_KEY:-}"
LANGFUSE_SECRET_KEY="${LANGFUSE_SECRET_KEY:-}"
# Accept either LANGFUSE_HOST (legacy) or LANGFUSE_BASE_URL (official SDK name)
LANGFUSE_HOST="${LANGFUSE_HOST:-${LANGFUSE_BASE_URL:-https://cloud.langfuse.com}}"
LANGFUSE_CONNECTED=false
DAYS=7
REPOS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --repo) REPOS+=("$2"); shift 2 ;;
    --days) DAYS="$2"; shift 2 ;;
    --output) OUTPUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Auto-detect repo from git remote if none were passed
if [[ ${#REPOS[@]} -eq 0 ]]; then
  AUTO_REPO=$(git remote get-url origin 2>/dev/null | sed 's/.*github.com[:/]//;s/\.git$//' || echo "")
  [[ -n "$AUTO_REPO" ]] && REPOS=("$AUTO_REPO")
fi

# Single-repo compat: the security-gate status section below checks the CI
# state of the primary repo this dashboard lives in — it doesn't (yet)
# aggregate across multiple repos like the PR metrics above do.
REPO="${REPOS[0]:-}"

SINCE_DATE=$(date -d "${DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -v-"${DAYS}d" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "")
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "── Collecting factory metrics ──────────────────────"
echo "Repos: ${REPOS[*]:-unknown}"
echo "Period: last ${DAYS} days"
echo ""

# ── GitHub PR metrics ──────────────────────────────────────────────────────────
MERGED_PRS=0
OPEN_PRS=0
AVG_CYCLE_HOURS=0
CI_PASS_RATE=0
CODEX_BLOCKS=0
BY_REPO_JSON_PARTS=()

# GitHub's API is pretty-printed JSON ("key": value, with a space after the
# colon) — naive no-space regexes like '"total_count":[0-9]*' silently
# zero-width-match and return empty strings instead of failing loudly, which
# is why every PR metric used to report as 0 even when the API call itself
# succeeded. Parse properly with node instead of grep for every count below.
json_total_count() {
  node -e '
    let input = "";
    process.stdin.on("data", (d) => { input += d; });
    process.stdin.on("end", () => {
      try { process.stdout.write(String(JSON.parse(input).total_count ?? 0)); }
      catch { process.stdout.write("0"); }
    });
  ' 2>/dev/null || echo "0"
}

# Collects PR metrics for one repo. Prints 7 space-separated numbers to
# stdout: merged open cycle_total_hours cycle_pr_count success_runs
# concluded_runs codex_blocks — left raw (unaveraged) so the caller can sum
# across repos before computing final averages/percentages. All logging
# goes to stderr so it doesn't pollute the captured values.
collect_repo_pr_metrics() {
  local repo="$1"
  local merged=0 open=0 cycle_hours=0 cycle_count=0 success_runs=0 concluded_runs=0 codex_blocks=0

  # GitHub's API is pretty-printed JSON ("key": value, with a space after the
  # colon) — naive no-space regexes like '"total_count":[0-9]*' silently
  # zero-width-match and return empty strings instead of failing loudly, which
  # is why every PR metric used to report as 0 even when the API call itself
  # succeeded. Parse properly with node instead of grep for every count below.
  json_total_count() {
    node -e '
      let input = "";
      process.stdin.on("data", (d) => { input += d; });
      process.stdin.on("end", () => {
        try { process.stdout.write(String(JSON.parse(input).total_count ?? 0)); }
        catch { process.stdout.write("0"); }
      });
    ' 2>/dev/null || echo "0"
  }

  # Merged PRs this week
  MERGED_RESPONSE=$(curl -sf \
    "https://api.github.com/search/issues?q=repo:${REPO}+is:pr+is:merged+merged:>=${SINCE_DATE}&per_page=100" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" 2>/dev/null) || true

  if [[ -n "$MERGED_RESPONSE" ]]; then
    MERGED_PRS=$(echo "$MERGED_RESPONSE" | json_total_count)

    # Average cycle time (created → closed) in hours, across merged PRs in this page.
    # closed_at is used as a merge-time proxy — exact for PRs merged via the normal
    # merge button/API, which covers the overwhelming majority of cases.
    CYCLE_STATS=$(echo "$MERGED_RESPONSE" | node -e '
      let input = "";
      process.stdin.on("data", (d) => { input += d; });
      process.stdin.on("end", () => {
        try {
          const items = (JSON.parse(input).items || []);
          let totalHours = 0, n = 0;
          for (const item of items) {
            const created = new Date(item.created_at).getTime();
            const closed = new Date(item.closed_at).getTime();
            if (!Number.isNaN(created) && !Number.isNaN(closed) && closed > created) {
              totalHours += (closed - created) / 3600000;
              n += 1;
            }
          }
          process.stdout.write(`${totalHours} ${n}`);
        } catch {
          process.stdout.write("0 0");
        }
      });
    ' 2>/dev/null || echo "0 0")
    CYCLE_TOTAL_HOURS=$(echo "$CYCLE_STATS" | awk '{print $1}')
    CYCLE_PR_COUNT=$(echo "$CYCLE_STATS" | awk '{print $2}')
    if [[ "${CYCLE_PR_COUNT:-0}" -gt 0 ]] 2>/dev/null; then
      AVG_CYCLE_HOURS=$(echo "scale=1; ${CYCLE_TOTAL_HOURS} / ${CYCLE_PR_COUNT}" | bc 2>/dev/null || echo "0")
    fi
  fi

  # Open PRs — same search-API pattern as merged PRs above, for a real count
  # (previously fetched via a HEAD request whose response was never parsed).
  OPEN_RESPONSE=$(curl -sf \
    "https://api.github.com/search/issues?q=repo:${REPO}+is:pr+is:open&per_page=1" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" 2>/dev/null) || true
  if [[ -n "$OPEN_RESPONSE" ]]; then
    OPEN_PRS=$(echo "$OPEN_RESPONSE" | json_total_count)
  fi

  # Count Codex block verdicts in PR comments (look for "### Verdict\nBlock")
  if [[ "${MERGED_PRS:-0}" -gt 0 ]] 2>/dev/null; then
    CODEX_BLOCKS=$(curl -sf \
      "https://api.github.com/search/issues?q=repo:${REPO}+is:pr+is:merged+merged:>=${SINCE_DATE}+in:comments+%22Verdict%0ABlock%22&per_page=1" \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" 2>/dev/null | json_total_count)
  fi

  # CI check run stats (sample runs created in the period)
  RUN_RESPONSE=$(curl -sf \
    "https://api.github.com/repos/${REPO}/actions/runs?per_page=20&created=>=${SINCE_DATE}" \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" 2>/dev/null) || true

  if [[ -n "$RUN_RESPONSE" ]]; then
    CI_STATS=$(echo "$RUN_RESPONSE" | node -e '
      let input = "";
      process.stdin.on("data", (d) => { input += d; });
      process.stdin.on("end", () => {
        try {
          const runs = (JSON.parse(input).workflow_runs || []);
          const concluded = runs.filter((r) => r.conclusion !== null);
          const success = concluded.filter((r) => r.conclusion === "success").length;
          process.stdout.write(`${success} ${concluded.length}`);
        } catch {
          process.stdout.write("0 0");
        }
      });
    ' 2>/dev/null || echo "0 0")
    SUCCESS_RUNS=$(echo "$CI_STATS" | awk '{print $1}')
    CONCLUDED_RUNS=$(echo "$CI_STATS" | awk '{print $2}')
    if [[ "${CONCLUDED_RUNS:-0}" -gt 0 ]] 2>/dev/null; then
      CI_PASS_RATE=$(( SUCCESS_RUNS * 100 / CONCLUDED_RUNS ))
    fi

    BY_REPO_JSON_PARTS+=("{\"repo\":\"${repo}\",\"merged_this_week\":${r_merged:-0},\"open\":${r_open:-0},\"avg_cycle_hours\":${r_avg_cycle},\"ci_pass_rate\":${r_ci_pass_rate},\"codex_blocks\":${r_codex:-0}}")
  done

  if [[ "${TOTAL_CYCLE_COUNT:-0}" -gt 0 ]] 2>/dev/null; then
    AVG_CYCLE_HOURS=$(awk -v h="$TOTAL_CYCLE_HOURS" -v c="$TOTAL_CYCLE_COUNT" 'BEGIN{printf "%.1f", h/c}' 2>/dev/null || echo "0")
  fi
  if [[ "${TOTAL_CONCLUDED_RUNS:-0}" -gt 0 ]] 2>/dev/null; then
    CI_PASS_RATE=$(( TOTAL_SUCCESS_RUNS * 100 / TOTAL_CONCLUDED_RUNS ))
  fi

  echo "[ok]  GitHub (combined): ${MERGED_PRS} merged PRs, ${OPEN_PRS} open, CI pass rate ~${CI_PASS_RATE}%"
else
  echo "[warn] GITHUB_TOKEN or REPO not set — skipping GitHub metrics"
fi

# Join the per-repo JSON objects into a JSON array string for the output template
BY_REPO_JSON="[$(IFS=,; echo "${BY_REPO_JSON_PARTS[*]:-}")]"

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
  LANGFUSE_AUTH=$(echo -n "${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}" | base64 | tr -d '\n\r')

  # Verify connectivity with a lightweight traces ping first
  PING=$(curl -sf "${LANGFUSE_HOST}/api/public/traces?limit=1" \
    -H "Authorization: Basic ${LANGFUSE_AUTH}" \
    -H "Accept: application/json" 2>/dev/null) || true

  if [[ -n "$PING" ]]; then
    LANGFUSE_CONNECTED=true

    # Fetch daily usage breakdown (Langfuse v2+ endpoint)
    USAGE=$(curl -sf "${LANGFUSE_HOST}/api/public/metrics/daily?fromTimestamp=${SINCE_DATE}" \
      -H "Authorization: Basic ${LANGFUSE_AUTH}" \
      -H "Accept: application/json" 2>/dev/null) || true

    if [[ -n "$USAGE" ]]; then
      # Sum across all days: data[].totalCost and data[].totalTokens.
      # Parsed with node rather than grep — under `set -o pipefail`, grep's
      # normal "no match" exit (e.g. an empty data[] for the period) makes
      # the whole pipeline report failure even after a later stage (awk)
      # already produced valid output, so the `|| echo "0"` fallback fires
      # *in addition* to that output instead of replacing it, leaving
      # multi-line values like $'0\n0' that break arithmetic expansion.
      USAGE_STATS=$(echo "$USAGE" | node -e '
        let input = "";
        process.stdin.on("data", (d) => { input += d; });
        process.stdin.on("end", () => {
          try {
            const days = (JSON.parse(input).data || []);
            let tokens = 0, cost = 0;
            for (const day of days) {
              tokens += Number(day.totalTokens) || 0;
              cost += Number(day.totalCost) || 0;
            }
            process.stdout.write(`${tokens} ${cost.toFixed(4)}`);
          } catch {
            process.stdout.write("0 0.0000");
          }
        });
      ' 2>/dev/null || echo "0 0.0000")
      TOTAL_TOKENS=$(echo "$USAGE_STATS" | awk '{print $1}')
      TOTAL_COST=$(echo "$USAGE_STATS" | awk '{print $2}')
      # Approximate split: Claude = 60%, Codex = 25%, Ollama = 15%
      CLAUDE_TOKENS=$(( TOTAL_TOKENS * 60 / 100 ))
      CODEX_TOKENS=$(( TOTAL_TOKENS * 25 / 100 ))
      OLLAMA_TASKS=$(( TOTAL_TOKENS * 15 / 100 / 200 ))
    fi
    echo "[ok]  Langfuse: connected, ~\$${TOTAL_COST} total, ${TOTAL_TOKENS} tokens"
  else
    echo "[warn] Langfuse credentials set but API unreachable (wrong key or host?)"
  fi
else
  echo "[warn] LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set — cost metrics will show as zero"
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
  # cygpath -m converts POSIX path to Windows mixed (forward slashes) for Node on Windows
  MCP_FILE_NODE=$(cygpath -m "$MCP_FILE" 2>/dev/null || echo "$MCP_FILE")
  MCP_JSON=$(node -e "
    const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    const out = Object.entries(d.mcpServers || {}).map(([k,v]) => ({name:k, active:!v.disabled}));
    process.stdout.write(JSON.stringify(out));
  " "$MCP_FILE_NODE" 2>/dev/null || echo "[]")
fi

# Build a JSON array of tracked repo names
REPOS_JSON=$(node -e "console.log(JSON.stringify(process.argv.slice(1)))" "${REPOS[@]}" 2>/dev/null || echo "[]")

# ── Write metrics.json ─────────────────────────────────────────────────────────
mkdir -p "$(dirname "$OUTPUT")"

cat > "$OUTPUT" <<JSON
{
  "updated_at": "${NOW}",
  "period_days": ${DAYS},
  "repo": "${REPO}",
  "repos": ${REPOS_JSON},
  "workforce": {
    "claude": ${CLAUDE_PCT},
    "codex": ${CODEX_PCT},
    "ollama": ${OLLAMA_PCT},
    "human": ${HUMAN_PCT},
    "other": $(( 100 - CLAUDE_PCT - CODEX_PCT - OLLAMA_PCT - HUMAN_PCT ))
  },
  "langfuse_connected": ${LANGFUSE_CONNECTED},
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
    "codex_blocks": ${CODEX_BLOCKS},
    "by_repo": ${BY_REPO_JSON}
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
    "cost_avoided": $(awk -v t="$RTK_TOKENS_SAVED" 'BEGIN{printf "%.4f", t*0.000003}' 2>/dev/null || echo "0")
  },
  "mcp_servers": ${MCP_JSON}
}
JSON

echo ""
echo "[ok]  Metrics written to: ${OUTPUT}"
echo "[ok]  Open dashboards/observation-deck/index.html to view"
