#!/usr/bin/env bash
# Generate a changelog entry for a merged PR using Ollama (Tier 1 — zero API cost)
# Usage: bash scripts/changelog.sh [--pr <PR_NUMBER>] [--version <vX.Y.Z>] [--output <file>]
# Can also be piped: echo "PR description" | bash scripts/changelog.sh
set -euo pipefail

PR_NUMBER=""
VERSION=""
OUTPUT_FILE="CHANGELOG.md"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
OLLAMA_MODEL="${RTK_MODEL:-mistral:7b}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --pr) PR_NUMBER="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --output) OUTPUT_FILE="$2"; shift 2 ;;
    --model) OLLAMA_MODEL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

TODAY=$(date +%Y-%m-%d)

# ── Gather PR context ──────────────────────────────────────────────────────────
PR_CONTEXT=""

if [[ -n "$PR_NUMBER" && -n "$GITHUB_TOKEN" ]]; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
  if [[ -n "$REPO" ]]; then
    PR_DATA=$(gh pr view "$PR_NUMBER" --json title,body,files,commits 2>/dev/null) || true
    if [[ -n "$PR_DATA" ]]; then
      PR_TITLE=$(echo "$PR_DATA" | grep -o '"title":"[^"]*"' | head -1 | sed 's/"title":"//;s/"//')
      PR_BODY=$(echo "$PR_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('body','')[:2000])" 2>/dev/null || echo "")
      PR_CONTEXT="PR #${PR_NUMBER}: ${PR_TITLE}\n\n${PR_BODY}"
    fi
  fi
fi

# Fall back to git diff and log if no PR context
if [[ -z "$PR_CONTEXT" ]]; then
  PR_CONTEXT=$(git log --oneline -10 2>/dev/null | head -200 || echo "No git log available")
  DIFF_SUMMARY=$(git diff HEAD~1 --stat 2>/dev/null | head -30 || echo "")
  PR_CONTEXT="${PR_CONTEXT}\n\nChanged files:\n${DIFF_SUMMARY}"
fi

# RTK-compress if input is large
CONTEXT_WORDS=$(echo -e "$PR_CONTEXT" | wc -w)
if [[ $CONTEXT_WORDS -gt 500 ]]; then
  COMPRESSED=$(echo -e "$PR_CONTEXT" | bash "$(dirname "${BASH_SOURCE[0]}")/rtk-compress.sh" 2>/dev/null || echo -e "$PR_CONTEXT")
  PR_CONTEXT="$COMPRESSED"
fi

# ── Generate changelog entry via Ollama ───────────────────────────────────────
PROMPT="You are a technical writer generating a changelog entry for a software release.

Given the following pull request information, generate a changelog entry in Keep a Changelog format.

PR Information:
${PR_CONTEXT}

Rules:
- Write for end users and developers who use this software, not for the implementation team
- Do NOT mention internal file names, function names, Linear ticket IDs, or implementation details
- Do NOT include filler phrases like 'This PR' or 'We have'
- Each item must be one concise sentence describing the user-visible change
- Only include sections that have actual changes (Added/Changed/Fixed/Security/Removed)
- If no meaningful user-facing change, write 'No user-facing changes'

Output ONLY the changelog content in this exact format, nothing else:

### Added
- [What users can now do that they couldn't before]

### Changed
- [What behavior changed and why it's better]

### Fixed
- [What was broken and is now correct]

### Security
- [What security issue was resolved]

### Removed
- [What was removed and migration path if needed]"

# Check if Ollama is available
OLLAMA_AVAILABLE=false
if curl -sf "${OLLAMA_HOST}/api/tags" &>/dev/null; then
  OLLAMA_AVAILABLE=true
fi

ENTRY=""

if $OLLAMA_AVAILABLE; then
  RESPONSE=$(curl -sf "${OLLAMA_HOST}/api/generate" \
    -H "Content-Type: application/json" \
    -d "$(printf '{"model":"%s","prompt":%s,"stream":false}' "$OLLAMA_MODEL" "$(echo "$PROMPT" | jq -Rs .)")" \
    2>/dev/null) || true

  if [[ -n "$RESPONSE" ]]; then
    ENTRY=$(echo "$RESPONSE" | grep -o '"response":"[^"]*"' | sed 's/"response":"//;s/"$//' | sed 's/\\n/\n/g;s/\\t/\t/g;s/\\"/"/g' 2>/dev/null || true)
  fi
fi

# Fallback: template-based entry if Ollama unavailable or failed
if [[ -z "$ENTRY" ]]; then
  echo "[warn] Ollama unavailable — generating template-based changelog entry" >&2
  ENTRY="### Changed
- $(git log --oneline -1 2>/dev/null | sed 's/^[a-f0-9]* //' || echo 'Updates applied')"
fi

# ── Build full changelog header ────────────────────────────────────────────────
if [[ -n "$VERSION" ]]; then
  HEADER="## [${VERSION}] — ${TODAY}"
else
  HEADER="## [Unreleased] — ${TODAY}"
fi

CHANGELOG_BLOCK="${HEADER}

${ENTRY}
"

# ── Write to CHANGELOG.md ──────────────────────────────────────────────────────
if [[ -f "$OUTPUT_FILE" ]]; then
  # Insert after the first line (# Changelog header) or after line 1 if no header
  FIRST_LINE=$(head -1 "$OUTPUT_FILE")
  if echo "$FIRST_LINE" | grep -q "^# "; then
    # Prepend after the title line
    REST=$(tail -n +2 "$OUTPUT_FILE")
    printf "%s\n\n%s\n%s" "$FIRST_LINE" "$CHANGELOG_BLOCK" "$REST" > "$OUTPUT_FILE"
  else
    # Prepend to beginning
    printf "%s\n%s" "$CHANGELOG_BLOCK" "$(cat "$OUTPUT_FILE")" > "$OUTPUT_FILE"
  fi
else
  # Create new CHANGELOG.md
  printf "# Changelog\n\nAll notable changes are documented here.\n\n%s\n" "$CHANGELOG_BLOCK" > "$OUTPUT_FILE"
fi

echo "[ok]  Changelog entry written to: ${OUTPUT_FILE}"
echo ""
echo "--- Entry ---"
echo "$CHANGELOG_BLOCK"
