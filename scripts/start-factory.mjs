#!/usr/bin/env node
// start Factory — one command to bring up the whole local stack and report status.
//
//   node scripts/start-factory.mjs            start everything, print status table
//   node scripts/start-factory.mjs --status   read-only health check, no starts
//   node scripts/start-factory.mjs --stop     stop compose stacks + factory-hub
//   node scripts/start-factory.mjs --full     also start LiteLLM (off by default; no
//                                             interactive-session caller today)
//
// Exit code: 0 = no failures (warnings allowed), 1 = at least one [fail].

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FACTORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HUB_DIR = path.join(FACTORY_ROOT, 'tools', 'factory-hub');
const HUB_PID_FILE = path.join(HUB_DIR, 'data', 'hub.pid');
const HUB_URL = 'http://localhost:3099';

const args = process.argv.slice(2);
const STATUS_ONLY = args.includes('--status');
const STOP = args.includes('--stop');
const FULL = args.includes('--full');

const rows = [];
let failures = 0;

function report(state, service, detail, port = '', ms = null) {
  const tag = state === 'ok' ? '[ok]  ' : state === 'warn' ? '[warn]' : state === 'info' ? '[info]' : '[fail]';
  if (state === 'fail') failures++;
  console.log(`${tag} ${service}: ${detail}`);
  rows.push({ state, service, detail, port, ms });
}

function sh(cmd, cmdArgs, { timeout = 15000 } = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', timeout, shell: false, windowsHide: true });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

async function httpOk(url, timeoutMs = 4000) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: res.status < 500, status: res.status, ms: Date.now() - t0, res };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - t0, res: null };
  }
}

async function pollUntil(fn, { totalMs, everyMs = 3000 }) {
  const deadline = Date.now() + totalMs;
  for (;;) {
    const r = await fn();
    if (r.ok) return r;
    if (Date.now() >= deadline) return r;
    await new Promise((res) => setTimeout(res, everyMs));
  }
}

function detach(cmd, cmdArgs, opts = {}) {
  const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true, ...opts });
  child.unref();
  return child;
}

const STACKS = [
  { name: 'infisical', file: 'infisical/docker-compose.yml', url: 'http://localhost:8085/api/status', port: 8085, bootMs: 90000 },
  { name: 'chromadb', file: 'knowledge/docker-compose.yml', url: 'http://localhost:8000/api/v2/heartbeat', port: 8000, bootMs: 45000 },
  { name: 'litellm', file: 'config/docker-compose.yml', url: 'http://localhost:4000/health/liveliness', port: 4000, bootMs: 60000, optIn: true },
];

const REQUIRED_VARS = ['LINEAR_API_KEY', 'GITHUB_TOKEN', 'RAILWAY_TOKEN', 'OPENAI_API_KEY', 'SENTRY_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT', 'FIGMA_ACCESS_TOKEN', 'NEON_API_KEY', 'DATABASE_URL', 'MONGODB_URI'];
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const REQUIRED_MODELS = ['mistral:7b', 'codellama:7b', 'nomic-embed-text'];

// ── stop mode ─────────────────────────────────────────────────────────────────
async function stopAll() {
  for (const s of STACKS) {
    const r = sh('docker', ['compose', '-f', path.join(FACTORY_ROOT, s.file), 'down'], { timeout: 60000 });
    report(r.ok ? 'ok' : 'warn', s.name, r.ok ? 'stopped' : `compose down failed: ${(r.stderr || '').trim().slice(0, 120)}`);
  }
  try {
    const pid = parseInt(fs.readFileSync(HUB_PID_FILE, 'utf8').trim(), 10);
    process.kill(pid);
    fs.unlinkSync(HUB_PID_FILE);
    report('ok', 'factory-hub', `stopped (pid ${pid})`);
  } catch {
    report('info', 'factory-hub', 'not running (no pid file or process already gone)');
  }
  process.exit(failures ? 1 : 0);
}

// ── main sequence ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`── start Factory ${STATUS_ONLY ? '(status only)' : ''} ─ ${FACTORY_ROOT}\n`);

  // 1. Docker Desktop
  let docker = sh('docker', ['info'], { timeout: 8000 });
  if (!docker.ok && !STATUS_ONLY) {
    const exe = 'C:/Program Files/Docker/Docker/Docker Desktop.exe';
    if (fs.existsSync(exe)) {
      report('info', 'docker', 'engine down — launching Docker Desktop (up to 120s)');
      detach(exe, []);
      await pollUntil(async () => ({ ok: sh('docker', ['info'], { timeout: 8000 }).ok }), { totalMs: 120000, everyMs: 5000 });
      docker = sh('docker', ['info'], { timeout: 8000 });
    }
  }
  report(docker.ok ? 'ok' : 'fail', 'docker', docker.ok ? 'engine running' : 'engine unreachable — start Docker Desktop manually');

  // 2. Compose stacks
  for (const s of STACKS) {
    if (s.optIn && !FULL) {
      report('info', s.name, 'skipped (opt-in — pass --full to start; no interactive-session caller)', s.port);
      continue;
    }
    if (!docker.ok) {
      report('fail', s.name, 'skipped — docker engine down', s.port);
      continue;
    }
    let health = await httpOk(s.url);
    if (health.ok) {
      report('ok', s.name, `already running (${health.ms}ms)`, s.port, health.ms);
      continue;
    }
    if (STATUS_ONLY) {
      report('fail', s.name, 'not responding', s.port);
      continue;
    }
    const up = sh('docker', ['compose', '-f', path.join(FACTORY_ROOT, s.file), 'up', '-d'], { timeout: 180000 });
    if (!up.ok) {
      report('fail', s.name, `compose up failed: ${(up.stderr || '').trim().slice(0, 160)}`, s.port);
      continue;
    }
    health = await pollUntil(() => httpOk(s.url), { totalMs: s.bootMs });
    report(health.ok ? 'ok' : 'warn', s.name, health.ok ? `started (${health.ms}ms)` : `started but not healthy after ${s.bootMs / 1000}s — check: docker compose -f ${s.file} logs`, s.port, health.ms);
  }

  // 3. Ollama
  let ollama = await httpOk(`${OLLAMA_HOST}/api/tags`);
  if (!ollama.ok && !STATUS_ONLY) {
    report('info', 'ollama', 'down — attempting `ollama serve` (detached)');
    try { detach('ollama', ['serve']); } catch { /* not on PATH */ }
    ollama = await pollUntil(() => httpOk(`${OLLAMA_HOST}/api/tags`), { totalMs: 15000 });
  }
  if (ollama.ok) {
    let missing = [];
    try {
      const tags = await (await fetch(`${OLLAMA_HOST}/api/tags`)).json();
      const have = (tags.models || []).map((m) => m.name);
      missing = REQUIRED_MODELS.filter((m) => !have.some((h) => h === m || h.startsWith(m + ':')));
    } catch { /* tag parse best-effort */ }
    report(missing.length ? 'warn' : 'ok', 'ollama', missing.length ? `running, missing models: ${missing.join(', ')} (ollama pull <model>)` : 'running, all models present', 11434, ollama.ms);
  } else {
    report('warn', 'ollama', 'unreachable — local model tools (factory-ollama, RTK) will fall back or fail', 11434);
  }

  // 4. factory-hub (serves the Observation Deck)
  let hub = await httpOk(`${HUB_URL}/api/health`);
  const hubEntry = path.join(HUB_DIR, 'server.mjs');
  if (!hub.ok && !STATUS_ONLY && fs.existsSync(hubEntry)) {
    fs.mkdirSync(path.dirname(HUB_PID_FILE), { recursive: true });
    const child = detach(process.execPath, [hubEntry], { cwd: FACTORY_ROOT });
    if (child.pid) fs.writeFileSync(HUB_PID_FILE, String(child.pid), 'utf8');
    hub = await pollUntil(() => httpOk(`${HUB_URL}/api/health`), { totalMs: 15000 });
  }
  if (!fs.existsSync(hubEntry)) {
    report('info', 'factory-hub', 'not installed (tools/factory-hub/server.mjs missing)', 3099);
  } else {
    report(hub.ok ? 'ok' : 'fail', 'factory-hub', hub.ok ? `dashboard live at ${HUB_URL}` : 'failed to start — run `node tools/factory-hub/server.mjs` for the error', 3099, hub.ms);
  }

  // 5. Environment + MCP config drift
  const missingVars = REQUIRED_VARS.filter((v) => !process.env[v]);
  report(missingVars.length ? 'warn' : 'ok', 'env', missingVars.length ? `missing: ${missingVars.join(', ')} (launch via scripts/code-with-secrets.ps1 for Infisical injection)` : 'all required vars set');

  const drift = sh(process.execPath, [path.join(FACTORY_ROOT, 'scripts', 'gen-mcp-config.mjs'), '--check'], { timeout: 15000 });
  report(drift.ok ? 'ok' : 'warn', 'mcp-config', drift.ok ? '.mcp.json in sync with registry' : 'drift detected — run: node scripts/gen-mcp-config.mjs --write-enabled');

  // 6. Status table
  console.log('\n── Factory status ───────────────────────────────────────────');
  const w = { service: 14, state: 6, port: 6 };
  console.log(`${'SERVICE'.padEnd(w.service)}${'STATE'.padEnd(w.state)}${'PORT'.padEnd(w.port)}DETAIL`);
  for (const r of rows) {
    console.log(`${r.service.padEnd(w.service)}${r.state.padEnd(w.state)}${String(r.port || '-').padEnd(w.port)}${r.detail}`);
  }
  console.log(failures ? `\n${failures} failure(s) — see above.` : '\nFactory is up. Dashboard: ' + HUB_URL);
  process.exit(failures ? 1 : 0);
}

if (STOP) stopAll(); else main();
