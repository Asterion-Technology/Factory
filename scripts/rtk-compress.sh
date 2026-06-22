#!/usr/bin/env bash
# RTK Context Compression — reduce token count before passing output to LLMs
# Reads from stdin, writes compressed summary to stdout
# Usage:
#   git diff | scripts/rtk-compress.sh
#   git log --oneline -50 | scripts/rtk-compress.sh
#   cat build.log | scripts/rtk-compress.sh --model codellama:7b
set -euo pipefail

MODEL="${RTK_MODEL:-mistral:7b}"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --model) MODEL="$2"; shift 2 ;;
    *) shift ;;
  esac
done

INPUT="$(cat)"

if [[ -z "$INPUT" ]]; then
  exit 0
fi

INPUT_TOKENS=$(echo "$INPUT" | wc -w)

# Skip compression for small inputs — overhead not worth it
if [[ $INPUT_TOKENS -lt 200 ]]; then
  echo "$INPUT"
  exit 0
fi

# Check Ollama availability
if ! curl -sf "${OLLAMA_HOST}/api/tags" &>/dev/null; then
  # Ollama not available — apply rule-based compression as fallback
  echo "$INPUT" | awk '
    /^[[:space:]]*$/ { blank++; if (blank <= 1) print; next }
    { blank=0; print }
  ' | head -200
  exit 0
fi

PROMPT="You are a context compression engine. Your job is to reduce the following technical output to its essential information only.

Rules:
- Preserve all error messages, stack traces, and security findings verbatim
- Preserve all file paths, line numbers, and function names
- Collapse repeated log lines: instead of 20 identical lines, write 'x20: <line>'
- Strip timestamps and process IDs (e.g. [2024-01-15 12:34:56], PID 12345)
- Remove decorative separators and banners
- Summarize informational/verbose output in 1 sentence per logical block
- Target: 70% token reduction while preserving all actionable content
- Output only the compressed content — no preamble, no explanation

INPUT:
${INPUT}"

RESPONSE=$(curl -sf "${OLLAMA_HOST}/api/generate" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg model "$MODEL" --arg prompt "$PROMPT" '{model: $model, prompt: $prompt, stream: false}')" \
  2>/dev/null) || true

if [[ -n "$RESPONSE" ]]; then
  COMPRESSED=$(echo "$RESPONSE" | jq -r '.response // empty' 2>/dev/null || echo "")
  if [[ -n "$COMPRESSED" ]]; then
    OUTPUT_TOKENS=$(echo "$COMPRESSED" | wc -w)
    SAVINGS=$(( (INPUT_TOKENS - OUTPUT_TOKENS) * 100 / INPUT_TOKENS ))
    echo "$COMPRESSED"
    echo "" >&2
    echo "[rtk] ${INPUT_TOKENS} → ${OUTPUT_TOKENS} tokens (${SAVINGS}% reduction)" >&2
    exit 0
  fi
fi

# Fallback: rule-based deduplication if Ollama response failed
echo "$INPUT" | sort -u | head -150
