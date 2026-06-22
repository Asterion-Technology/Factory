# Agentic DevSecOps Factory

A fully portable, security-first, AI-native software factory for building, reviewing, testing, deploying, monitoring, and maintaining production web applications.

## Quick start

```bash
git clone https://github.com/<org>/devops-control-plane.git
cd devops-control-plane
code .   # → "Reopen in Container" when prompted
```

Then set your environment variables and run:

```bash
bash scripts/bootstrap.sh
```

Claude Code is your starting point. It reads `CLAUDE.md` automatically.

## Architecture

```
Human
 │
 ▼
Linear (work management — source of truth for all tasks)
 │
 ▼
Claude (Senior Principal Engineer + Factory Controller)
 │
 ├── Implementation → GitHub branch → Pull Request
 │
 ├── Commodity tasks → Ollama (docs, changelogs, summaries — zero cost)
 │
 └── Review → Codex (independent PR review — never reviews its own work)
              │
              ▼
           GitHub CI (10 security + quality gates)
              │
              ▼
           Railway Preview → Staging
              │
              ▼
           Human Approval
              │
              ▼
           Production → Sentry + Observation Deck
```

## AI Workforce

| Agent | Model | Role | Cost tier |
|---|---|---|---|
| Claude | claude-sonnet-4-6 | Senior Principal Engineer, Factory Controller | Frontier (primary) |
| Codex | gpt-4o-2024-08-06 | Independent Reviewer | Frontier (review only) |
| Ollama | mistral:7b / codellama:7b | Commodity Execution | Local (zero API cost) |

Model routing is handled by LiteLLM. Ollama handles 50-60% of task volume at zero cost. If Ollama fails twice, Claude takes over automatically.

## MCP Integrations

### Standard (9 — active)

| Server | Purpose |
|---|---|
| linear | Issue management, project tracking |
| github | Code search, branch + PR creation |
| sentry | Error monitoring, release tracking |
| context7 | Framework + dependency documentation |
| playwright | E2E testing, UI automation |
| neon | PostgreSQL schema inspection (read-only) |
| mongodb | Collection inspection (read-only) |
| railway | Deployment inspection, preview control |
| figma | Design inspection, spec export |

### Custom wrappers (10 — Phase 3, complete)

| Server | Purpose |
|---|---|
| factory-clerk | User lookup, session inspection (read-only) |
| factory-idme | Identity workflow inspection |
| factory-meilisearch | Index inspection, search testing |
| factory-snyk | Dependency + container scanning |
| factory-semgrep | SAST rule execution, findings retrieval |
| factory-sonarqube | Code quality reports, tech debt metrics |
| factory-resend | Email template review, sandbox test sends |
| factory-r2 | Object inspection, bucket review (no deletes) |
| factory-railway | Deployment inspection, preview control (no prod deploys) |
| factory-magic21 | UI/UX generation, API execution |
| factory-knowledge | Semantic search over ADRs, threat models, runbooks (ChromaDB + nomic-embed-text) |

All 19 entries are defined in `mcp/mcp.factory.json`. Run `scripts/install-mcps.sh` to sync to Claude Code.

## Human approval gates

Claude cannot do any of the following without human approval:
- Deploy to production
- Approve database migrations
- Merge to `main` or `staging`
- Modify or rotate secrets
- Approve its own Pull Requests
- Grant security exceptions

See `policies/human-approval-gates.md` for the full gate list.

## Security

Every PR passes 10 mandatory CI gates:
Gitleaks · Semgrep SAST · Trivy · Lint · Type Check · Build · Unit Tests · Snyk · E2E Tests · MCP Config Validation

Codex provides independent security review on all PRs to main.

## Repository structure

```
Factory/
├── CLAUDE.md                    ← Claude's operating manual (read this first)
├── context.md                   ← Master system design brief
├── TODO.md                      ← Out-of-scope issues and future enhancements
├── .claude/settings.json        ← Pre-approved permissions for Claude Code
├── .devcontainer/               ← Portable development environment
├── .github/workflows/           ← CI gates + Codex review
├── mcp/mcp.factory.json         ← All MCP server definitions (single source)
├── config/litellm.yaml          ← Model routing: Claude / Ollama / Codex
├── agents/                      ← Agent capability cards
├── prompts/                     ← Task-type prompts routed to each agent
├── policies/                    ← Human approval gates, routing, branch rules
├── knowledge/                   ← Phase 6: ChromaDB docker-compose + ingestion pipeline
├── scripts/                     ← bootstrap, install-mcps, rtk-compress, start-issue, changelog, metrics-collector
├── dashboards/observation-deck/ ← VS Code agent monitoring dashboard
├── docs/                        ← ADRs, threat models, security findings, runbooks
└── bootstrap/first-run.md       ← Environment variable setup guide
```

## Portability

A developer can move between laptop, desktop, workstation, or cloud box by:
1. Cloning this repository
2. Opening in VS Code with Dev Containers
3. Setting environment variables
4. Running `bash scripts/bootstrap.sh`

The devcontainer installs all tools. The bootstrap script syncs all MCP servers. Claude is ready with no manual configuration.

## Cost optimization

- **RTK compression**: Run `scripts/rtk-compress.sh` before passing large outputs to Claude
- **Ollama routing**: 50-60% of tasks handled locally at zero API cost
- **Langfuse telemetry**: Track spend per model via `config/langfuse.env.example`
- **Token limits**: Claude Haiku used for quick lookups; Sonnet for complex work

## Phased implementation

| Phase | Description | Status |
|---|---|---|
| 1 | Control-plane repo, devcontainer, bootstrap | ✅ Complete |
| 2 | Ollama, LiteLLM, RTK compression | ✅ Complete |
| 3 | MCP ecosystem — all 10 custom wrappers | ✅ Complete |
| 4 | GitHub CI (10 gates), Codex review, Railway environments | ✅ Complete |
| 5 | Observation Deck (Chart.js, metrics-collector, 6-hour cron) | ✅ Complete |
| 6 | Knowledge platform (ChromaDB + nomic-embed-text + factory-knowledge MCP) | ✅ Complete |
| 7 | Full workflow machinery — Linear sync, changelog, metrics, docs | ✅ Complete |

## Setup

See `bootstrap/first-run.md` for environment variable configuration.  
See `docs/workflow/first-project.md` for the step-by-step first-project walkthrough.  
See `docs/workflow/guide.md` for the full workflow reference.  
See `docs/runbooks/onboarding.md` for the full onboarding guide.
