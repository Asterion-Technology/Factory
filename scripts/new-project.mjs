#!/usr/bin/env node
// factory-new-project — scaffold a standalone repo the Factory operates on.
//
//   node scripts/new-project.mjs --name my-app [options]
//
// Options:
//   --name <slug>          required; ^[a-z][a-z0-9-]{1,60}$
//   --template <t>         node | static | none        (default: node)
//   --visibility <v>       private | public            (default: private)
//   --org <org>            GitHub owner                (default: Asterion-Technology)
//   --description "<...>"  README/registry description
//   --role <r>             app | infra | library | scratchpad (default: app)
//   --no-remote            skip GitHub repo creation (local repo + registry only)
//   --linear               print the Linear-project instruction for the session to run
//
// The repo lands at <base>/<name> (base from config/repos.yaml, i.e. d:/REPO),
// with its own git history and GitHub remote — the Factory registers it in
// config/repos.yaml and operates ON it; it does not live inside the monorepo.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FACTORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(FACTORY_ROOT, 'config', 'repos.yaml');
const TEMPLATES = path.join(FACTORY_ROOT, 'templates', 'new-project');

const args = parseArgs(process.argv.slice(2));
const NAME = args.name;
const TEMPLATE = args.template || 'node';
const VISIBILITY = args.visibility || 'private';
const ORG = args.org || 'Asterion-Technology';
const DESCRIPTION = args.description || `${NAME} — managed by the Agentic DevSecOps Factory.`;
const ROLE = args.role || 'app';

function fail(msg) { console.error(`[fail] ${msg}`); process.exit(1); }
function ok(msg) { console.log(`[ok]   ${msg}`); }
function info(msg) { console.log(`[info] ${msg}`); }

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'linear' || key === 'no-remote') { out[key.replace('-', '_')] = true; continue; }
    out[key] = argv[++i];
  }
  return out;
}

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...opts });
  return { ok: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

// ── validate inputs ───────────────────────────────────────────────────────────
if (!NAME) fail('missing --name');
if (!/^[a-z][a-z0-9-]{1,60}$/.test(NAME)) fail(`invalid name "${NAME}" — use lowercase letters, digits, hyphens (^[a-z][a-z0-9-]{1,60}$)`);
if (!['node', 'static', 'none'].includes(TEMPLATE)) fail(`unknown template "${TEMPLATE}"`);
if (!['private', 'public'].includes(VISIBILITY)) fail(`visibility must be private|public`);
if (!fs.existsSync(path.join(TEMPLATES, TEMPLATE))) fail(`template dir missing: ${TEMPLATE}`);

const manifest = fs.readFileSync(MANIFEST, 'utf8');
const baseMatch = manifest.match(/^\s*base:\s*"?([^"\n]+)"?/m);
if (!baseMatch) fail('config/repos.yaml has no factory.base');
const BASE = baseMatch[1].trim().replace(/\\/g, '/');
const TARGET = path.join(BASE, NAME);

const existingIds = [...manifest.matchAll(/^\s*- id:\s*(\S+)/gm)].map((m) => m[1]);
if (existingIds.includes(NAME)) fail(`id "${NAME}" already registered in config/repos.yaml`);
if (fs.existsSync(TARGET)) fail(`${TARGET} already exists`);

// ── scaffold local repo ───────────────────────────────────────────────────────
fs.mkdirSync(TARGET, { recursive: true });
ok(`created ${TARGET}`);

const gitInit = run('git', ['init', '-b', 'main'], { cwd: TARGET });
if (!gitInit.ok) fail(`git init failed: ${gitInit.stderr}`);

const STACKS = { node: ['node'], static: ['html', 'js'], none: [] };
for (const entry of fs.readdirSync(path.join(TEMPLATES, TEMPLATE))) {
  const src = path.join(TEMPLATES, TEMPLATE, entry);
  const destName = entry.replace(/\.tmpl$/, '');
  const content = fs.readFileSync(src, 'utf8')
    .split('{{NAME}}').join(NAME)
    .split('{{ID}}').join(NAME)
    .split('{{DESCRIPTION}}').join(DESCRIPTION);
  fs.writeFileSync(path.join(TARGET, destName), content, 'utf8');
}
ok(`seeded ${TEMPLATE} template (README, .gitignore, CLAUDE.md${TEMPLATE === 'node' ? ', package.json' : ''})`);

const add = run('git', ['add', '-A'], { cwd: TARGET });
if (!add.ok) fail(`git add failed: ${add.stderr}`);
const commit = run('git', ['commit', '-m', `chore: scaffold ${NAME} via factory-new-project`], { cwd: TARGET });
if (!commit.ok) fail(`git commit failed: ${commit.stderr}`);
ok('initial commit created');

// ── GitHub remote ─────────────────────────────────────────────────────────────
let remoteUrl = '';
if (!args.no_remote) {
  // explicit owner in the repo argument — this org redirects/renames have bitten
  // default-owner flows before; never rely on gh's inferred owner
  const gh = run('gh', ['repo', 'create', `${ORG}/${NAME}`, `--${VISIBILITY}`, '--source=.', '--remote=origin', '--push', '--description', DESCRIPTION], { cwd: TARGET });
  if (!gh.ok) {
    console.error(`[warn] gh repo create failed: ${gh.stderr || gh.stdout}`);
    console.error('[warn] local repo + registry entry will still be created; push manually or re-run with --no-remote next time');
  } else {
    remoteUrl = `https://github.com/${ORG}/${NAME}.git`;
    ok(`GitHub repo created and pushed: ${ORG}/${NAME} (${VISIBILITY})`);
  }
}

// ── register in config/repos.yaml ─────────────────────────────────────────────
const displayName = NAME.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const entry = `
  - id: ${NAME}
    name: "${displayName}"
    local_path: ${NAME}
    remote: "${remoteUrl}"
    role: ${ROLE}
    description: "${DESCRIPTION.replace(/"/g, "'")}"
    stack: [${STACKS[TEMPLATE].join(', ')}]
    linear_project: ""
`;
const candidate = manifest.replace(/\s*$/, '\n') + entry;
// dry-validate against the same regexes resolve-repo.sh uses before writing
const ids = [...candidate.matchAll(/^\s*- id:\s*(\S+)/gm)].map((m) => m[1]);
const paths_ = [...candidate.matchAll(/^\s*local_path:\s*"?([^"\n]+)"?/gm)].map((m) => m[1].trim());
if (ids.length !== paths_.length || ids[ids.length - 1] !== NAME || paths_[paths_.length - 1] !== NAME) {
  fail('registry entry failed dry-validation — repos.yaml NOT modified');
}
fs.writeFileSync(MANIFEST, candidate, 'utf8');
ok(`registered "${NAME}" in config/repos.yaml`);

// ── proof + next steps ────────────────────────────────────────────────────────
const resolved = run('bash', [path.join(FACTORY_ROOT, 'scripts', 'resolve-repo.sh'), NAME]);
info(`resolve-repo.sh ${NAME} → ${resolved.stdout || '(resolver unavailable)'}`);
if (args.linear) {
  info(`Linear: create a project named "${displayName}" via the linear MCP (save_project), then set linear_project: "${displayName}" in config/repos.yaml`);
}
console.log(`\nDone. ${TARGET} is a standalone repo${remoteUrl ? ` with remote ${remoteUrl}` : ' (no remote yet)'}.`);
console.log('The Factory registry knows it — commit the config/repos.yaml change in d:/REPO/Factory.');
