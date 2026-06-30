#!/usr/bin/env node
'use strict';
// Claude Code PostToolUse hook — appends one JSONL line to events.jsonl
// Configured in .claude/settings.json PostToolUse hooks section
const fs = require('fs');
const path = require('path');

const EVENT_FILE = path.join(__dirname, '..', 'dashboards', 'observation-deck', 'events.jsonl');
const MAX_EVENTS = 500;

// Claude Code MCP tool names: mcp__<server>__<tool>
// claude.ai-hosted MCPs: mcp__claude_ai_Linear__get_issue → linear
function parseToolName(raw) {
  if (!raw) return { server: 'builtin', tool: 'unknown' };
  if (raw.startsWith('mcp__')) {
    const parts = raw.split('__');
    const serverRaw = parts[1] || 'mcp';
    const tool = parts.slice(2).join('__');
    return { server: normalizeServer(serverRaw), tool };
  }
  return { server: 'builtin', tool: raw };
}

function normalizeServer(raw) {
  // Strip hosted-MCP prefix: claude_ai_Linear → linear
  const s = raw.replace(/^claude_ai_/i, '').toLowerCase();
  const aliases = {
    'microsoft_365': 'microsoft365',
    'slidegpt': 'slidegpt',
  };
  return aliases[s] || s;
}

function summarize(input) {
  if (!input || typeof input !== 'object') return '';
  const keys = Object.keys(input);
  if (!keys.length) return '';
  const k = keys[0];
  const v = input[k];
  const vs = typeof v === 'string' ? v : JSON.stringify(v);
  return `${k}=${vs}`.slice(0, 100);
}

function appendEvent(event) {
  try {
    fs.mkdirSync(path.dirname(EVENT_FILE), { recursive: true });
    fs.appendFileSync(EVENT_FILE, JSON.stringify(event) + '\n', 'utf8');
    // Trim ring buffer only when over limit
    const content = fs.readFileSync(EVENT_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length > MAX_EVENTS) {
      fs.writeFileSync(EVENT_FILE, lines.slice(-MAX_EVENTS).join('\n') + '\n', 'utf8');
    }
  } catch {
    // Never block Claude on a logging failure
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let hookData = {};
  try { hookData = JSON.parse(raw); } catch {}

  const { server, tool } = parseToolName(hookData.tool_name);

  appendEvent({
    ts: new Date().toISOString(),
    type: 'tool',
    server,
    tool,
    summary: summarize(hookData.tool_input),
  });

  process.exit(0);
});
