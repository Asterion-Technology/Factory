#!/usr/bin/env node
// factory-hub — local status/spend/dashboard service for the Factory.
// Serves the Observation Deck UI and the APIs behind it on :3099.
// Zero npm dependencies (node:http / node:fs only).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TranscriptAggregator } from './lib/transcripts.mjs';
import { dockerContainers, ollamaStatus, mcpStatuses } from './lib/probes.mjs';
import { loadPricing, costUsd, providerFor } from './lib/pricing.mjs';

const FACTORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DECK_DIR = path.join(FACTORY_ROOT, 'dashboards', 'observation-deck');
const DATA_DIR = path.join(FACTORY_ROOT, 'tools', 'factory-hub', 'data');
const COUNTERS_PATH = path.join(DECK_DIR, 'counters.json');
const EVENTS_PATH = path.join(DECK_DIR, 'events.jsonl');
const PORT = Number(process.env.FACTORY_HUB_PORT || 3099);
const STARTED = Date.now();

const pricing = loadPricing(FACTORY_ROOT);
const transcripts = new TranscriptAggregator({ dataDir: DATA_DIR });

function sweepTranscripts() {
  try {
    const s = transcripts.sweep();
    if (s.bytesRead > 0) console.log(`[sweep] ${s.filesTouched} files, ${s.bytesRead} bytes, ${s.ms}ms`);
  } catch (e) {
    console.error('[sweep] failed:', e.message);
  }
}
sweepTranscripts();
setInterval(sweepTranscripts, 60_000).unref();

// status probes are cached briefly so UI polling doesn't hammer docker/ollama
let statusCache = { at: 0, value: null };
async function getStatus() {
  if (Date.now() - statusCache.at < 10_000 && statusCache.value) return statusCache.value;
  const counters = readJson(COUNTERS_PATH) || {};
  const [docker, ollama, mcp] = await Promise.all([
    Promise.resolve(dockerContainers()),
    ollamaStatus(),
    mcpStatuses(FACTORY_ROOT, counters.lastCallByServer || {}),
  ]);
  const local = mcp.filter((s) => !s.hosted);
  const hosted = mcp.filter((s) => s.hosted);
  const value = {
    generatedAt: new Date().toISOString(),
    docker,
    ollama,
    mcp: {
      local,
      hosted,
      counts: {
        local_total: local.length,
        local_ready: local.filter((s) => s.state === 'ready').length,
        local_degraded: local.filter((s) => s.state === 'degraded').length,
        local_dead: local.filter((s) => s.state === 'dead').length,
        hosted_total: hosted.length,
      },
    },
  };
  statusCache = { at: Date.now(), value };
  return value;
}

function getSpend() {
  const days = transcripts.agg.days || {};
  const byDay = {};
  const providerTotals = { anthropic: emptyProvider(), openai: emptyProvider(), ollama: emptyProvider() };
  for (const [day, dayAgg] of Object.entries(days)) {
    const d = (byDay[day] = { models: {}, usd: 0 });
    for (const [model, u] of Object.entries(dayAgg.models)) {
      const usd = costUsd(pricing, model, u);
      const provider = providerFor(pricing, model);
      d.models[model] = { ...u, usd: round2(usd), provider };
      d.usd += usd;
      const pt = providerTotals[provider] || (providerTotals[provider] = emptyProvider());
      pt.in += u.in; pt.out += u.out;
      pt.cacheWrite += (u.cacheWrite5m || 0) + (u.cacheWrite1h || 0);
      pt.cacheRead += u.cacheRead || 0;
      pt.requests += u.requests || 0;
      pt.usd += usd;
    }
    d.usd = round2(d.usd);
  }
  for (const pt of Object.values(providerTotals)) pt.usd = round2(pt.usd);
  const today = localToday();
  return {
    note: pricing.claude_equiv_note,
    today: byDay[today] || { models: {}, usd: 0 },
    days: byDay,
    providers: providerTotals,
    lastSweep: transcripts.lastSweep,
  };
}

function getEvents() {
  const counters = readJson(COUNTERS_PATH) || { days: {} };
  let feed = [];
  try {
    const lines = fs.readFileSync(EVENTS_PATH, 'utf8').trim().split('\n');
    feed = lines.slice(-100).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* no events yet */ }
  const today = localToday();
  return { today: counters.days?.[today] || { total: 0, byServer: {}, byOrigin: {} }, days: counters.days || {}, feed };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jsonl': 'application/x-ndjson', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  try {
    switch (url.pathname) {
      case '/api/health':
        return send(200, { ok: true, uptimeSec: Math.round((Date.now() - STARTED) / 1000), lastSweep: transcripts.lastSweep, version: '1.0.0' });
      case '/api/status':
        return send(200, await getStatus());
      case '/api/spend':
        return send(200, getSpend());
      case '/api/events':
        return send(200, getEvents());
      case '/api/metrics':
        return send(200, readJson(path.join(DECK_DIR, 'metrics.json')) || {});
      default: {
        // static Observation Deck files
        const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const file = path.normalize(path.join(DECK_DIR, rel));
        if (!file.startsWith(DECK_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return send(404, { error: 'not found' });
        }
        return send(200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
      }
    }
  } catch (e) {
    console.error(`[http] ${url.pathname}:`, e.message);
    return send(500, { error: 'internal error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`factory-hub listening on http://localhost:${PORT} (root: ${FACTORY_ROOT})`);
});

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function emptyProvider() { return { in: 0, out: 0, cacheWrite: 0, cacheRead: 0, requests: 0, usd: 0 }; }
function round2(n) { return Math.round(n * 100) / 100; }
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
