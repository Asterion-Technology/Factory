#!/usr/bin/env node
'use strict';
// Claude Code PreToolUse hook (matcher: Bash) — nudges toward local-model
// compression when a command looks like it will dump large output into context.
//
// WARN-ONLY BY DESIGN: it always allows the command (rewriting or blocking a
// Bash command from a hook risks quoting corruption and, if the hook is buggy,
// bricks every Bash call). It fails open on any internal error.

const fs = require('fs');
const path = require('path');

const EVENT_FILE = path.join(__dirname, '..', 'dashboards', 'observation-deck', 'events.jsonl');
const DEADLINE = setTimeout(() => process.exit(0), 5000);
DEADLINE.unref();

// [detector, suggestion] — matched against the raw command string
const PATTERNS = [
  [/\bgit\s+log\b(?!.*(-n\s*\d|--oneline|-\d|--max-count))/, 'git log without a limit — add -n/--oneline or pipe through `node scripts/rtk-compress.js`'],
  [/\bgit\s+diff\b(?!.*(--stat|--shortstat|--name-only|--name-status|-- \S))/, 'full git diff — consider --stat first, or pipe through `node scripts/rtk-compress.js`'],
  [/\bdocker\s+(compose\s+)?logs\b(?!.*--tail)/, 'docker logs without --tail — add `--tail 100` or pipe through `node scripts/rtk-compress.js`'],
  [/\b(npm|pnpm|yarn)\s+(run\s+)?test\b(?!.*(\||--filter|-t\s))/, 'full test run — filter tests or pipe output through `node scripts/rtk-compress.js`'],
];

function logSuggestEvent(matchedNote) {
  try {
    fs.appendFileSync(EVENT_FILE, JSON.stringify({ ts: new Date().toISOString(), type: 'rtk-suggest', note: matchedNote.slice(0, 120) }) + '\n', 'utf8');
  } catch { /* best-effort */ }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    const hook = JSON.parse(raw);
    const command = (hook.tool_input && hook.tool_input.command) || '';
    // already compressed/limited pipelines don't need the nudge
    if (!command || /rtk-compress/.test(command)) return process.exit(0);
    for (const [re, note] of PATTERNS) {
      if (re.test(command)) {
        logSuggestEvent(note);
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'large-output pattern (warn-only)' },
          systemMessage: `RTK: ${note}`,
        }));
        return process.exit(0);
      }
    }
    process.exit(0);
  } catch {
    process.exit(0); // fail open — never delay or block a Bash call
  }
});
