// Liveness probes for the Factory status view.
//
// Local stdio MCP servers can't be handshaken casually (Claude Code owns their
// processes), so MCP liveness is derived from: registry status, dependency
// checks (ports/env), and recent-call evidence from the tool-event counters.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

export async function httpOk(url, timeoutMs = 3000) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: res.status < 500, status: res.status, ms: Date.now() - t0 };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - t0 };
  }
}

function portOpen(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (ok) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.on('connect', () => done(true));
    sock.on('error', () => done(false));
  });
}

export function dockerContainers() {
  const r = spawnSync('docker', ['ps', '-a', '--format', '{{json .}}'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  if (r.status !== 0) return { engine: false, containers: [] };
  const containers = r.stdout.trim().split('\n').filter(Boolean).map((l) => {
    try {
      const j = JSON.parse(l);
      return { name: j.Names, image: j.Image, state: j.State, status: j.Status };
    } catch { return null; }
  }).filter(Boolean);
  return { engine: true, containers };
}

export async function ollamaStatus() {
  const tags = await httpOk(`${OLLAMA_HOST}/api/tags`);
  if (!tags.ok) return { live: false, models: [], loaded: [] };
  let models = [];
  let loaded = [];
  try {
    const j = await (await fetch(`${OLLAMA_HOST}/api/tags`)).json();
    models = (j.models || []).map((m) => m.name);
  } catch { /* best effort */ }
  try {
    const j = await (await fetch(`${OLLAMA_HOST}/api/ps`)).json();
    loaded = (j.models || []).map((m) => m.name);
  } catch { /* best effort */ }
  return { live: true, ms: tags.ms, models, loaded };
}

// registry: parsed mcp/registry.json; lastCallByServer: {name: isoTs} from counters
export async function mcpStatuses(factoryRoot, lastCallByServer) {
  const registry = JSON.parse(fs.readFileSync(path.join(factoryRoot, 'mcp', 'registry.json'), 'utf8'));
  const out = [];
  for (const [name, entry] of Object.entries(registry.servers)) {
    if (entry.status === 'retired') continue;
    const row = {
      name,
      displayName: entry.displayName || name,
      origin: entry.origin,
      hosted: entry.origin === 'hosted-claude-ai',
      lastCall: lastCallByServer[name] || null,
      notes: entry.notes || null,
    };
    if (entry.origin === 'hosted-claude-ai') {
      row.state = 'hosted'; // lives inside Claude; no local process to probe
    } else if (entry.status === 'windows-dead') {
      row.state = 'dead';
    } else {
      let depsOk = true;
      const failedDeps = [];
      for (const dep of entry.dependsOn || []) {
        if (dep.kind === 'port') {
          const open = await portOpen(dep.value);
          if (!open) { depsOk = false; failedDeps.push(`${dep.service || 'port'}:${dep.value}`); }
        } else if (dep.kind === 'env' && !process.env[dep.value]) {
          depsOk = false;
          failedDeps.push(`env:${dep.value}`);
        }
      }
      row.state = depsOk ? 'ready' : 'degraded';
      if (failedDeps.length) row.failedDeps = failedDeps;
    }
    out.push(row);
  }
  return out;
}
