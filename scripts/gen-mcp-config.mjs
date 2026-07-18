#!/usr/bin/env node
// Generate .mcp.json and the enabledMcpjsonServers list from mcp/registry.json.
//
// Usage:
//   node scripts/gen-mcp-config.mjs                  write .mcp.json, print enabled list
//   node scripts/gen-mcp-config.mjs --check          exit 1 if .mcp.json or enabled list drift (no writes)
//   node scripts/gen-mcp-config.mjs --write-enabled  also update enabledMcpjsonServers in .claude/settings.local.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FACTORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(FACTORY_ROOT, 'mcp', 'registry.json');
const MCP_JSON_PATH = path.join(FACTORY_ROOT, '.mcp.json');
const SETTINGS_LOCAL_PATH = path.join(FACTORY_ROOT, '.claude', 'settings.local.json');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const WRITE_ENABLED = args.includes('--write-enabled');

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

const GENERATED_STATUSES = new Set(['active', 'windows-dead']);
const LOCAL_ORIGINS = new Set(['local-node', 'local-npx', 'remote-http']);

const mcpServers = {};
const enabled = [];
for (const [name, entry] of Object.entries(registry.servers)) {
  if (!LOCAL_ORIGINS.has(entry.origin)) continue;          // hosted connectors never enter .mcp.json
  if (!GENERATED_STATUSES.has(entry.status)) continue;     // retired stubs never enter .mcp.json
  if (!entry.config) {
    console.error(`[fail] registry entry "${name}" is ${entry.status} but has no config block`);
    process.exit(1);
  }
  mcpServers[name] = entry.config;
  enabled.push(name);
}

const generated = JSON.stringify({ mcpServers }, null, 2) + '\n';
JSON.parse(generated); // round-trip guard before any write

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function normalizedJson(text) {
  try { return JSON.stringify(JSON.parse(text)); } catch { return null; }
}

let drift = false;

const currentMcp = readIfExists(MCP_JSON_PATH);
const mcpMatches = currentMcp !== null && normalizedJson(currentMcp) === normalizedJson(generated);

const settingsLocalRaw = readIfExists(SETTINGS_LOCAL_PATH);
let enabledMatches = true;
if (settingsLocalRaw !== null) {
  const settingsLocal = JSON.parse(settingsLocalRaw);
  const current = settingsLocal.enabledMcpjsonServers ?? [];
  const want = [...enabled].sort();
  const have = [...current].sort();
  enabledMatches = JSON.stringify(want) === JSON.stringify(have);
  if (!enabledMatches) {
    const missing = want.filter((s) => !have.includes(s));
    const extra = have.filter((s) => !want.includes(s));
    if (missing.length) console.log(`[drift] enabledMcpjsonServers missing: ${missing.join(', ')}`);
    if (extra.length) console.log(`[drift] enabledMcpjsonServers stale: ${extra.join(', ')}`);
  }
}

if (CHECK) {
  if (!mcpMatches) {
    console.log('[drift] .mcp.json does not match registry-generated output');
    drift = true;
  } else {
    console.log(`[ok] .mcp.json matches registry (${enabled.length} servers)`);
  }
  if (!enabledMatches) {
    drift = true;
  } else if (settingsLocalRaw !== null) {
    console.log('[ok] enabledMcpjsonServers matches registry');
  }
  process.exit(drift ? 1 : 0);
}

if (!mcpMatches) {
  fs.writeFileSync(MCP_JSON_PATH, generated, 'utf8');
  console.log(`[ok] wrote .mcp.json (${enabled.length} servers)`);
} else {
  console.log(`[ok] .mcp.json already up to date (${enabled.length} servers)`);
}

if (WRITE_ENABLED && settingsLocalRaw !== null && !enabledMatches) {
  const settingsLocal = JSON.parse(settingsLocalRaw);
  settingsLocal.enabledMcpjsonServers = enabled;
  const out = JSON.stringify(settingsLocal, null, 2) + '\n';
  JSON.parse(out); // round-trip guard
  fs.writeFileSync(SETTINGS_LOCAL_PATH, out, 'utf8');
  console.log('[ok] updated enabledMcpjsonServers in .claude/settings.local.json');
} else if (!enabledMatches) {
  console.log('[info] run with --write-enabled to update .claude/settings.local.json, or set:');
  console.log(JSON.stringify(enabled, null, 2));
}

const hosted = Object.entries(registry.servers).filter(([, e]) => e.origin === 'hosted-claude-ai' && e.status === 'active');
console.log(`[info] ${hosted.length} hosted claude.ai connectors tracked in registry (not part of .mcp.json)`);
