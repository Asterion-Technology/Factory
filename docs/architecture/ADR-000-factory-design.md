# ADR-000: Agentic DevSecOps Factory Architecture

**Status**: Accepted  
**Date**: 2026-06-22  
**Author**: Claude  
**Reviewers**: Rick Marshall

## Context

Building and maintaining production web applications requires consistent execution of security, quality, testing, and deployment practices across every change. Manual enforcement is slow, inconsistent, and doesn't scale. The goal is a fully portable, security-first, AI-native software factory that can build, review, test, deploy, monitor, and maintain production applications while minimizing frontier-model costs.

## Decision

Deploy a three-tier AI workforce with defined roles, permissions, and routing rules:

1. **Claude** (Senior Principal Engineer, Primary Controller) — handles architecture, complex coding, security analysis, and infrastructure
2. **Codex / GPT-4o** (Independent Reviewer) — performs independent code and security review; never reviews its own work
3. **Ollama / local models** (Commodity Execution) — handles documentation, summaries, changelogs, and log compression at zero API cost

All work originates in **Linear** as the operational source of truth. All code changes flow through **GitHub** with branch protection and 10 mandatory CI gates. All deployments target **Railway** with environment-gated human approval before production.

A single `mcp/mcp.factory.json` defines all MCP server integrations and is auto-provisioned to Claude Code, Cursor, and VS Code on every workstation via `scripts/bootstrap.sh`. This provides seamless portability — a developer can clone the repo and have all tools available without manual configuration.

**LiteLLM** provides model routing with automatic fallback (Ollama → Claude if local fails twice). **RTK compression** reduces token spend by ~70% on logs and diffs before they reach any frontier model.

## Considered alternatives

**Single-model approach (Claude only)**: Simpler but expensive at scale. Ollama handles 50-60% of task volume at zero cost, making the factory economically sustainable.

**No independent reviewer**: Faster but creates a blind spot where Claude reviews its own work. Codex independence is a security control, not a preference.

**No MCP ecosystem**: Agents would operate blind to Linear issues, GitHub PRs, Sentry errors, and Railway deployments. The MCP layer is what makes the factory context-aware rather than text-in/text-out.

## Security considerations

- All MCP servers default to read-only or inspect-only permissions
- Human approval gates on production deploy, DB migrations, auth changes, secrets
- 10 mandatory CI gates including Gitleaks, Semgrep, Trivy, and Snyk
- Claude cannot approve its own PRs; Codex must provide independent review
- Secrets are never in code — all via environment variables, injected at runtime

## Consequences

**Positive**:
- Consistent security and quality controls on every change
- 50-70% cost reduction vs all-Claude approach
- Portable across workstations via devcontainer + bootstrap
- Audit trail in Linear, GitHub, and Langfuse

**Negative**:
- Setup complexity: 16 environment variables required
- Phase 3 custom MCP wrappers not yet built (10 wrappers pending)
- Requires Ollama running locally or via Docker for commodity tasks

**Risks**:
- Ollama model quality varies — verify outputs before critical use
- MCP server API stability depends on third-party packages
- LiteLLM proxy is a single point of failure for model routing

## Rollback

This is a meta-architecture, not a single deployment. Individual components (Ollama, LiteLLM, specific MCP servers) can be removed or replaced without affecting the rest of the factory. The fallback for any missing component is direct Claude calls without routing.
