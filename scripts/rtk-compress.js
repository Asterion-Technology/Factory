#!/usr/bin/env node
'use strict';
// RTK Context Compression — cross-platform Node port of rtk-compress.sh.
// Reads stdin, writes compressed output to stdout; always exits 0 with
// best-effort output so it is safe in any pipeline.
//
//   git diff | node scripts/rtk-compress.js
//   node scripts/rtk-compress.js --model codellama:7b < build.log

const fs = require('fs');
const path = require('path');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EVENT_FILE = path.join(__dirname, '..', 'dashboards', 'observation-deck', 'events.jsonl');

let model = process.env.RTK_MODEL || 'mistral:7b';
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--model' && argv[i + 1]) model = argv[++i];
}

const PROMPT_HEADER = `You are a context compression engine. Your job is to reduce the following technical output to its essential information only.

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
`;

function words(s) {
  return s.split(/\s+/).filter(Boolean).length;
}

function emitEvent(inputTokens, outputTokens, usedModel) {
  try {
    const pct = inputTokens > outputTokens ? Math.round(((inputTokens - outputTokens) * 100) / inputTokens) : 0;
    const line = JSON.stringify({ ts: new Date().toISOString(), type: 'rtk', input_tokens: inputTokens, output_tokens: outputTokens, reduction_pct: pct, model: usedModel });
    fs.appendFileSync(EVENT_FILE, line + '\n', 'utf8');
    return pct;
  } catch { return 0; }
}

function ruleBasedFallback(input) {
  // collapse blank runs, then cap length — mirrors the shell fallback
  const lines = input.split('\n');
  const out = [];
  let blank = 0;
  for (const l of lines) {
    if (/^\s*$/.test(l)) { if (++blank <= 1) out.push(l); }
    else { blank = 0; out.push(l); }
  }
  return out.slice(0, 200).join('\n');
}

async function main() {
  const input = fs.readFileSync(0, 'utf8');
  if (!input.trim()) return;
  const inputTokens = words(input);
  if (inputTokens < 200) { process.stdout.write(input); return; }

  let compressed = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const tags = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (tags.ok) {
      const genCtrl = new AbortController();
      const genTimer = setTimeout(() => genCtrl.abort(), 120000);
      const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: PROMPT_HEADER + input, stream: false }),
        signal: genCtrl.signal,
      });
      clearTimeout(genTimer);
      if (res.ok) {
        const data = await res.json();
        if (data.response && data.response.trim()) compressed = data.response;
      }
    }
  } catch { /* Ollama unavailable — fall through */ }

  if (compressed !== null) {
    const outputTokens = words(compressed);
    const pct = emitEvent(inputTokens, outputTokens, model);
    process.stdout.write(compressed.endsWith('\n') ? compressed : compressed + '\n');
    process.stderr.write(`\n[rtk] ${inputTokens} → ${outputTokens} tokens (${pct}% reduction)\n`);
    return;
  }

  const fallback = ruleBasedFallback(input);
  emitEvent(inputTokens, words(fallback), 'fallback');
  process.stdout.write(fallback.endsWith('\n') ? fallback : fallback + '\n');
}

main().catch(() => process.exit(0));
