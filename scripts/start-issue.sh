#!/usr/bin/env bash
# Start work on a Linear issue — fetches issue details, creates branch, updates issue status
# Usage: bash scripts/start-issue.sh <LINEAR_ISSUE_ID> [branch-slug]
# Example: bash scripts/start-issue.sh ENG-42
#          bash scripts/start-issue.sh ENG-42 add-search-endpoint
set -euo pipefail

ISSUE_ID="${1:-}"
CUSTOM_SLUG="${2:-}"
LINEAR_GQL="https://api.linear.app/graphql"
LINEAR_KEY="${LINEAR_API_KEY:-}"

if [[ -z "$ISSUE_ID" ]]; then
  echo "Usage: bash scripts/start-issue.sh <ISSUE_ID> [branch-slug]"
  echo "Example: bash scripts/start-issue.sh ENG-42"
  exit 1
fi

if [[ -z "$LINEAR_KEY" ]]; then
  echo "[fail] LINEAR_API_KEY is not set. Run: bash scripts/bootstrap.sh --check"
  exit 1
fi

echo "── Fetching issue ${ISSUE_ID} from Linear ──────────────"

# Query Linear for issue details
QUERY=$(cat <<GQL
{
  "query": "query(\$id: String!) { issue(id: \$id) { id identifier title description state { name } team { key } url } }",
  "variables": { "id": "${ISSUE_ID}" }
}
GQL
)

RESPONSE=$(curl -sf "$LINEAR_GQL" \
  -H "Authorization: ${LINEAR_KEY}" \
  -H "Content-Type: application/json" \
  -d "$QUERY") || {
    echo "[fail] Linear API call failed. Check LINEAR_API_KEY and issue ID."
    exit 1
  }

# Check for errors
if echo "$RESPONSE" | grep -q '"errors"'; then
  echo "[fail] Linear returned errors:"
  echo "$RESPONSE" | grep -o '"message":"[^"]*"' | head -5
  exit 1
fi

TITLE=$(echo "$RESPONSE" | grep -o '"title":"[^"]*"' | head -1 | sed 's/"title":"//;s/"//')
STATE=$(echo "$RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | sed 's/"name":"//;s/"//')
ISSUE_URL=$(echo "$RESPONSE" | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//;s/"//')

if [[ -z "$TITLE" ]]; then
  echo "[fail] Issue ${ISSUE_ID} not found in Linear."
  exit 1
fi

echo "[ok]  Found: ${ISSUE_ID} — ${TITLE}"
echo "[ok]  State: ${STATE}"
echo "[ok]  URL:   ${ISSUE_URL}"

# Determine branch type from state or title
BRANCH_TYPE="feature"
if echo "${TITLE,,}" | grep -qE "^(fix|bug|patch|hotfix)"; then
  BRANCH_TYPE="fix"
elif echo "${TITLE,,}" | grep -qE "^(security|vuln|cve|sec)"; then
  BRANCH_TYPE="security"
fi

# Generate slug from title if not provided
if [[ -z "$CUSTOM_SLUG" ]]; then
  SLUG=$(echo "${TITLE,,}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-40)
else
  SLUG="$CUSTOM_SLUG"
fi

BRANCH_NAME="${BRANCH_TYPE}/${ISSUE_ID,,}-${SLUG}"

echo ""
echo "── Creating branch ─────────────────────────────────"
echo "Branch: ${BRANCH_NAME}"

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[warn] Working tree has uncommitted changes — stash or commit before switching branches"
  git status --short
  echo ""
  read -r -p "Continue anyway? [y/N] " yn
  [[ "${yn,,}" == "y" ]] || exit 1
fi

# Ensure we're up to date with remote
git fetch origin --quiet

# Create branch from latest main
git checkout -b "$BRANCH_NAME" origin/main 2>/dev/null || git checkout -b "$BRANCH_NAME"
echo "[ok]  Branch created: ${BRANCH_NAME}"

# Update Linear issue status to "In Progress"
echo ""
echo "── Updating Linear issue status ─────────────────────"

IN_PROGRESS_QUERY=$(cat <<GQL
{
  "query": "mutation(\$id: String!, \$stateId: String) { issueUpdate(id: \$id, input: { stateId: \$stateId }) { success issue { state { name } } } }",
  "variables": { "id": "${ISSUE_ID}" }
}
GQL
)

# First find the "In Progress" state ID for this team
STATES_QUERY=$(cat <<GQL
{
  "query": "query(\$id: String!) { issue(id: \$id) { team { states { nodes { id name } } } } }",
  "variables": { "id": "${ISSUE_ID}" }
}
GQL
)

STATES_RESPONSE=$(curl -sf "$LINEAR_GQL" \
  -H "Authorization: ${LINEAR_KEY}" \
  -H "Content-Type: application/json" \
  -d "$STATES_QUERY" 2>/dev/null) || true

# Extract "In Progress" state ID (look for name containing "progress" case-insensitive)
IN_PROGRESS_ID=$(echo "$STATES_RESPONSE" | grep -oE '"id":"[^"]*","name":"[^"]*[Pp]rogress[^"]*"' | grep -oE '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')

if [[ -n "$IN_PROGRESS_ID" ]]; then
  UPDATE_QUERY=$(cat <<GQL
{
  "query": "mutation(\$id: String!, \$stateId: String!) { issueUpdate(id: \$id, input: { stateId: \$stateId }) { success } }",
  "variables": { "id": "${ISSUE_ID}", "stateId": "${IN_PROGRESS_ID}" }
}
GQL
)
  UPDATE_RESPONSE=$(curl -sf "$LINEAR_GQL" \
    -H "Authorization: ${LINEAR_KEY}" \
    -H "Content-Type: application/json" \
    -d "$UPDATE_QUERY" 2>/dev/null) || true

  if echo "$UPDATE_RESPONSE" | grep -q '"success":true'; then
    echo "[ok]  Linear issue status updated to: In Progress"
  else
    echo "[warn] Could not update Linear issue status automatically"
  fi
else
  echo "[warn] Could not find 'In Progress' state for this team — update manually in Linear"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Ready to implement ${ISSUE_ID}                  "
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Branch:  ${BRANCH_NAME}"
echo "  Issue:   ${ISSUE_URL}"
echo ""
echo "Next steps:"
echo "  1. Implement the work (Claude is your starting point)"
echo "  2. Run tests: npm test"
echo "  3. Push: git push origin ${BRANCH_NAME}"
echo "  4. Open PR: gh pr create --fill"
