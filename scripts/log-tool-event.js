#!/usr/bin/env node
'use strict';
// Claude Code PostToolUse hook — appends one JSONL line to events.jsonl and
// maintains uncapped daily counters in counters.json.
// Configured in .claude/settings.json PostToolUse hooks section.
//
// events.jsonl is a 500-line ring buffer for the live feed ONLY; the real
// counts live in counters.json, which never trims (this is what fixes the
// dashboard's "tool calls stop at 500" bug).
const fs = require('fs');
const path = require('path');

const DECK_DIR = path.join(__dirname, '..', 'dashboards', 'observation-deck');
const EVENT_FILE = path.join(DECK_DIR, 'events.jsonl');
const COUNTER_FILE = path.join(DECK_DIR, 'counters.json');
const MAX_EVENTS = 500; // display ring buffer only — counters.json is uncapped

// Claude Code MCP tool names: mcp__<server>__<tool>
// claude.ai-hosted connectors: mcp__claude_ai_<Server>__<tool> — tagged with
// origin "hosted" so the dashboard can delineate hosted vs local MCPs
// (previously the prefix was stripped, merging the two).
function parseToolName(raw) {
  if (!raw) return { server: 'builtin', tool: 'unknown', origin: 'builtin' };
  if (raw.startsWith('mcp__')) {
    const parts = raw.split('__');
    const serverRaw = parts[1] || 'mcp';
    const tool = parts.slice(2).join('__');
    const hosted = /^claude_ai_/i.test(serverRaw);
    const server = serverRaw.replace(/^claude_ai_/i, '').toLowerCase();
    return { server, tool, origin: hosted ? 'hosted' : 'local' };
  }
  return { server: 'builtin', tool: raw, origin: 'builtin' };
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

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function appendEvent(event) {
  try {
    fs.mkdirSync(DECK_DIR, { recursive: true });
    fs.appendFileSync(EVENT_FILE, JSON.stringify(event) + '\n', 'utf8');
    const content = fs.readFileSync(EVENT_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    if (lines.length > MAX_EVENTS) {
      fs.writeFileSync(EVENT_FILE, lines.slice(-MAX_EVENTS).join('\n') + '\n', 'utf8');
    }
  } catch {
    // Never block Claude on a logging failure
  }
}

function bumpCounters(event) {
  try {
    let counters = { days: {}, lastCallByServer: {} };
    try { counters = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8')); } catch {}
    if (!counters.days) counters.days = {};
    if (!counters.lastCallByServer) counters.lastCallByServer = {};
    const day = localDate(new Date());
    const d = counters.days[day] || (counters.days[day] = { total: 0, byServer: {}, byOrigin: {} });
    d.total += 1;
    const serverKey = event.origin === 'hosted' ? `${event.server} (hosted)` : event.server;
    d.byServer[serverKey] = (d.byServer[serverKey] || 0) + 1;
    d.byOrigin[event.origin] = (d.byOrigin[event.origin] || 0) + 1;
    counters.lastCallByServer[event.server] = event.ts;
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(counters), 'utf8');
  } catch {
    // Never block Claude on a counter failure
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let hookData = {};
  try { hookData = JSON.parse(raw); } catch {}

  const { server, tool, origin } = parseToolName(hookData.tool_name);
  const event = {
    ts: new Date().toISOString(),
    type: 'tool',
    server,
    tool,
    origin,
    summary: summarize(hookData.tool_input),
  };

  appendEvent(event);
  bumpCounters(event);

  process.exit(0);
});
