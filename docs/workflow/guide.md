# Factory Workflow Guide

## Overview

Every piece of work in this factory follows the same pipeline. No coding begins without a Linear issue. No code lands in main without CI passing and a human approving. This document walks through the full cycle.

```
Linear Issue → Branch → Implement (Claude) → Push → CI → Codex Review → Human Approval → Merge → Changelog → Deploy
```

---

## The Standard Workflow

### 1. Create or find a Linear issue

All work must trace to a Linear issue. No issue = no branch = no code.

- Go to your Linear workspace and create an issue in the Engineering team
- Give it a clear title: start with a verb (`Add`, `Fix`, `Remove`, `Refactor`, `Secure`)
- Add acceptance criteria in the description — these become your PR checklist
- Assign it to yourself and set status to **Todo**

### 2. Start the issue

Run the factory helper to create the branch and update the Linear issue atomically:

```bash
bash scripts/start-issue.sh ENG-42
```

This will:
- Fetch the issue title from Linear
- Create a typed branch: `feature/ENG-42-add-search-endpoint`
- Push the branch to origin
- Update the Linear issue status to **In Progress**

Supported branch types (auto-detected from the issue title):
- `feature/` — default for new functionality
- `fix/` — triggered by titles starting with "Fix", "Bug", "Patch", "Hotfix"
- `security/` — triggered by titles starting with "Security", "Vuln", "CVE", "Sec"

### 3. Implement (Claude is your starting point)

Open Claude Code. Claude reads `CLAUDE.md` at session start and loads all MCP servers automatically.

Claude's role:
- Architect the solution
- Write the implementation
- Run security checks via Semgrep and Snyk MCP tools
- Write or update tests
- Self-review against the acceptance criteria

Do not start by searching the internet. Start by asking Claude:

```
I'm working on ENG-42 — Add full-text search to the user dashboard.
The acceptance criteria are: [paste from Linear]
What's the best approach given the current codebase?
```

Claude will:
1. Inspect the existing repo structure
2. Check what search infrastructure exists (Meilisearch MCP)
3. Propose an approach
4. Implement after you agree

### 4. Push and open a PR

When implementation is done and tests pass locally:

```bash
git push origin feature/ENG-42-add-search-endpoint
gh pr create --fill
```

GitHub will populate the PR template. Fill in every required field:
- Linear issue URL (required)
- Acceptance criteria checklist
- Threat model summary
- Test plan

### 5. CI runs automatically

All 10 gates run on every PR:

| Gate | Tool | Fails on |
|---|---|---|
| Secrets scan | Gitleaks | Any detected secret |
| SAST | Semgrep | Any high/critical finding |
| Dependency scan | Trivy | Critical/high CVEs |
| Dependency audit | Snyk | High severity vulnerabilities |
| Lint | ESLint | Any lint error |
| Type check | TypeScript | Any type error |
| Build | Vite/Next/etc | Any build error |
| Unit tests | Vitest/Jest | Any failing test |
| E2E tests | Playwright | Any failing scenario |
| MCP config | Python | Missing required servers |

If any gate fails, fix the issue and push again. Do not bypass gates.

### 6. Codex review (automatic)

When all CI gates pass, the Codex review workflow fires automatically. GPT-4o reads the diff and posts a structured review comment with a verdict:

- **Pass** — proceed to human review
- **Conditional** — address the noted concerns before merging
- **Block** — significant issues found; CI fails, branch cannot merge until resolved

Codex review is an independent second opinion, not a replacement for human review.

### 7. Human approval

When Codex says Pass or Conditional (with your response), request a human reviewer via GitHub. The reviewer must:
- Verify all checklist items are checked
- Confirm Codex review is addressed
- Approve the PR in GitHub

Human approval is required before merging. Claude cannot approve its own PRs.

### 8. Merge to main

Use the **Squash and merge** strategy. GitHub enforces this via branch protection rules.

After merge:
- The Linear issue state syncs to **Done** automatically (via `linear-sync.yml`)
- A changelog entry is generated and committed automatically (via `changelog.yml`)
- Metrics are refreshed within 6 hours (via `metrics.yml`)

### 9. Deploy

Merging to `main` triggers a Railway deployment to the **staging** environment automatically.

Promotion to **production** requires a human approval gate — see `policies/human-approval-gates.md`.

---

## Working with the AI Workforce

### What Claude handles

- Architecture decisions and design questions
- All implementation coding
- Security analysis (STRIDE, threat modeling)
- Code reviews and refactoring suggestions
- Database query analysis
- Infrastructure inspection via Railway MCP

Claude cannot:
- Deploy to production
- Merge its own PRs
- Approve human approval gates
- Rotate secrets

### What Codex/GPT-4o handles

- Independent PR review (automated, via `codex-review.yml`)
- Verification that implementation matches spec
- Alternative approach suggestions

Do not ask Codex to implement features. Its role is review-only.

### What Ollama handles

- Changelog generation (via `scripts/changelog.sh`)
- Log and diff compression (via `scripts/rtk-compress.sh`)
- Commit message drafting
- Documentation summaries

Ollama runs locally. If Ollama is unavailable, scripts fall back gracefully — changelog.sh uses a git-log template, rtk-compress.sh applies rule-based deduplication.

---

## RTK Context Compression

Long git diffs and log outputs are automatically compressed before being sent to LLMs. This reduces token cost by ~70%.

```bash
git diff HEAD~5 | bash scripts/rtk-compress.sh
git log --oneline -50 | bash scripts/rtk-compress.sh
```

RTK compression is automatic in `changelog.sh` for inputs over 500 words.

---

## Secrets and Environment Variables

All secrets are stored as Railway environment variables or GitHub Actions secrets. Nothing is hardcoded.

Required for factory operation: see `bootstrap/first-run.md` for the full list and where to obtain each one.

Never commit `.env` files. `gitleaks` will catch it and fail CI.

---

## Branch Naming Convention

| Type | Pattern | Example |
|---|---|---|
| Feature | `feature/<ISSUE-ID>-<slug>` | `feature/ENG-42-add-search` |
| Bug fix | `fix/<ISSUE-ID>-<slug>` | `fix/ENG-91-null-pointer-crash` |
| Security | `security/<ISSUE-ID>-<slug>` | `security/ENG-107-xss-sanitization` |

Branches with other names cannot be pushed — `.claude/settings.json` only pre-approves `feature/*`, `fix/*`, and `security/*` pushes. Main and staging pushes are blocked.

---

## Observation Deck

Open `dashboards/observation-deck/index.html` in a browser to see:
- AI workforce breakdown (Claude/Codex/Ollama/Human percentages)
- Cost this week
- PR velocity and CI pass rate
- Security gate status for all 10 checks
- MCP server status
- RTK compression savings

The dashboard reads `metrics.json` and auto-refreshes every 60 seconds. Metrics are collected every 6 hours by the `metrics.yml` workflow.
