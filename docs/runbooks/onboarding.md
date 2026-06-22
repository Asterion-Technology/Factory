# Runbook: Developer Onboarding

## Prerequisites

- Git
- VS Code with Dev Containers extension
- Docker Desktop
- A GitHub account with access to this repository

## Step 1: Clone and open

```bash
git clone https://github.com/<org>/devops-control-plane.git
cd devops-control-plane
code .
```

When VS Code prompts "Reopen in Container" — click it. This installs all tools automatically.

## Step 2: Set environment variables

Copy the example file and fill in your values:

```bash
cp config/langfuse.env.example .env
```

Required variables (see `bootstrap/first-run.md` for where to get each):

```
LINEAR_API_KEY=
GITHUB_TOKEN=
RAILWAY_TOKEN=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
SENTRY_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
FIGMA_ACCESS_TOKEN=
NEON_API_KEY=
DATABASE_URL=
MONGODB_URI=
```

## Step 3: Run bootstrap

```bash
bash scripts/bootstrap.sh
```

This will:
- Verify environment variables
- Sync MCP servers to Claude Code
- Check GitHub CLI authentication
- Check Railway CLI
- Check Ollama availability
- Report any missing tools

## Step 4: Start local services (optional)

If you want Ollama for commodity tasks:

```bash
# Via Docker:
docker run -d -v ollama:/root/.ollama -p 11434:11434 ollama/ollama
ollama pull mistral:7b
ollama pull codellama:7b
ollama pull nomic-embed-text

# Start LiteLLM routing proxy:
docker compose -f config/docker-compose.yml up -d
```

## Step 5: Open Claude Code

Claude Code is pre-installed in the devcontainer. Open it in VS Code via the sidebar or run:

```bash
claude
```

Claude will read `CLAUDE.md` automatically and is ready to take tasks.

## Step 6: Verify MCP servers

In Claude Code, type: `What MCP servers are available?`

Claude should report: linear, github, sentry, context7, playwright, neon, mongodb, railway, figma (and 10 disabled Phase 3 stubs).

## Switching workstations

1. Push any in-progress work to a feature branch
2. On the new machine: clone, reopen in container, set env vars, run bootstrap
3. Claude Code picks up the same MCP config automatically via the mounted `~/.claude` directory
