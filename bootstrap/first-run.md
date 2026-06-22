# First-Run Setup Guide

Complete these steps in order. Each step is self-contained.

---

## Step 1: Set your environment variables

### Where to set them

Choose one location based on how you run the factory:

**Devcontainer (recommended)**  
Create the file `.devcontainer/.env` in the repo root — it is gitignored automatically. VS Code picks it up when the container starts.

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
CHROMA_TOKEN=
```

**Windows (native, no devcontainer)**  
Open your PowerShell profile and add each variable there so it persists across sessions:
```powershell
notepad $PROFILE
```
```powershell
$env:LINEAR_API_KEY    = "your-value"
$env:GITHUB_TOKEN      = "your-value"
$env:RAILWAY_TOKEN     = "your-value"
$env:ANTHROPIC_API_KEY = "your-value"
$env:OPENAI_API_KEY    = "your-value"
$env:CHROMA_TOKEN      = "your-value"
# add the rest below
```

**macOS / Linux (native, no devcontainer)**  
Add to `~/.bashrc` or `~/.zshrc`:
```bash
export LINEAR_API_KEY="your-value"
export GITHUB_TOKEN="your-value"
# add the rest below
```

**GitHub Actions (CI)**  
Go to your repo → Settings → Secrets and Variables → Actions → New repository secret. Add each variable individually.

**Railway (production runtime)**  
Add via Railway dashboard → your project → Variables.

---

### Required variables

#### LINEAR_API_KEY
1. Go to [linear.app](https://linear.app) → Settings → API → Personal API Keys
2. Create a key with read/write access to your workspace
3. Set expiry to 180 days

#### GITHUB_TOKEN
1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens
2. Create a token scoped to your target repositories with:
   - Contents: Read and Write
   - Pull requests: Read and Write
   - Issues: Read and Write
   - Actions: Read
   - Metadata: Read
3. Set expiry to 90 days

#### RAILWAY_TOKEN
1. Go to [railway.app](https://railway.app) → Account Settings → Tokens
2. Create a **project-scoped** token (not account-scoped) with:
   - Deployments: Read
   - Environments: Read
   - Services: Read
   - Logs: Read

#### ANTHROPIC_API_KEY
1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys
2. Create a key and set a monthly spend limit

#### OPENAI_API_KEY
1. Go to [platform.openai.com](https://platform.openai.com) → API Keys
2. Create a key and set usage limits (Codex is used only for PR review — low volume)

#### SENTRY_TOKEN, SENTRY_ORG, SENTRY_PROJECT
1. Go to your Sentry organization → Settings → Developer Settings → Auth Tokens
2. Create a token with scopes: `project:read`, `org:read`, `event:read`
3. `SENTRY_ORG` — your org slug (visible in Sentry URLs)
4. `SENTRY_PROJECT` — your project slug

#### FIGMA_ACCESS_TOKEN
1. Go to Figma → Account Settings → Personal access tokens
2. Create a token (read-only is sufficient)

#### NEON_API_KEY
1. Go to [console.neon.tech](https://console.neon.tech) → Account → API Keys
2. Create a key
3. In your Neon project, create a read-only database role for the MCP connection

#### DATABASE_URL
Your Neon PostgreSQL connection string — found in Neon console → Connection Details.  
Format: `postgresql://user:password@host/dbname?sslmode=require`

#### MONGODB_URI
Your MongoDB connection string.  
Format: `mongodb+srv://user:password@cluster.mongodb.net/dbname`  
Use a read-only database user.

---

### Optional variables (Phase 3 — custom MCP wrappers)

Set these to activate the corresponding MCP server. Leave blank to skip that integration.

| Variable | Service | Where to get it |
|---|---|---|
| `CLERK_SECRET_KEY` | Clerk | Clerk dashboard → API Keys |
| `IDME_API_KEY` | id.me | id.me developer portal |
| `MEILI_HOST` | Meilisearch | Your Meilisearch instance URL |
| `MEILI_MASTER_KEY` | Meilisearch | Meilisearch dashboard |
| `SNYK_TOKEN` | Snyk | [app.snyk.io](https://app.snyk.io) → Account Settings → Auth Token |
| `SEMGREP_APP_TOKEN` | Semgrep | [semgrep.dev](https://semgrep.dev) → Settings → Tokens |
| `SONAR_TOKEN` | SonarQube | SonarQube → My Account → Security |
| `SONAR_HOST_URL` | SonarQube | Your SonarQube instance URL |
| `RESEND_API_KEY` | Resend | [resend.com](https://resend.com) → API Keys |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 | Cloudflare dashboard → R2 → Manage API tokens |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 | Same as above |
| `R2_BUCKET` | Cloudflare R2 | Your R2 bucket name |
| `R2_ACCOUNT_ID` | Cloudflare R2 | Cloudflare dashboard → top-right corner |
| `MAGIC21_API_KEY` | Magic21 | Magic21 developer portal |
| `LANGFUSE_PUBLIC_KEY` | Langfuse | [cloud.langfuse.com](https://cloud.langfuse.com) → Settings |
| `LANGFUSE_SECRET_KEY` | Langfuse | Same as above |

---

### Knowledge base variables (Phase 6 — ChromaDB)

These have working defaults for local development. **You must change `CHROMA_TOKEN` before any shared or production deployment.**

| Variable | Default | Description |
|---|---|---|
| `CHROMA_HOST` | `http://localhost:8000` | ChromaDB URL |
| `CHROMA_TOKEN` | `factory-chroma-token` | ChromaDB auth token — rotate this |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama URL (also used for RTK compression) |
| `EMBED_MODEL` | `nomic-embed-text` | Embedding model |

**Generate a strong CHROMA_TOKEN:**

bash:
```bash
openssl rand -hex 32
```

PowerShell:
```powershell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Set the same generated value in your environment, in `knowledge/docker-compose.yml` under `CHROMA_SERVER_AUTHN_CREDENTIALS`, and in your GitHub Actions secrets.

---

### Secret rotation schedule

| Variable | Interval | Note |
|---|---|---|
| `GITHUB_TOKEN` | 90 days | Set expiry at creation in GitHub |
| `RAILWAY_TOKEN` | 90 days | Manual — calendar reminder |
| `SNYK_TOKEN` | 90 days | Manual — calendar reminder |
| `LINEAR_API_KEY` | 180 days | Manual — calendar reminder |
| `ANTHROPIC_API_KEY` | 180 days | Manual — calendar reminder |
| `OPENAI_API_KEY` | 180 days | Manual — calendar reminder |
| `CHROMA_TOKEN` | 180 days | Regenerate with `openssl rand -hex 32`; update in all locations |
| `RESEND_API_KEY` | 180 days | Manual — calendar reminder |

If a token is accidentally committed: rotate it at the source immediately. Force-pushing the commit does not un-expose it — assume it is compromised.

---

## Step 2: Start services

Start all three backing services before running the factory.

### Ollama — LLM inference and embeddings

**Docker:**
```bash
docker run -d -p 11434:11434 --name ollama ollama/ollama
docker exec ollama ollama pull mistral:7b
docker exec ollama ollama pull codellama:7b
docker exec ollama ollama pull nomic-embed-text
```

**macOS/Linux native:**
```bash
brew install ollama   # or: curl -fsSL https://ollama.ai/install.sh | sh
ollama serve &
ollama pull mistral:7b
ollama pull codellama:7b
ollama pull nomic-embed-text
```

Verify: `curl http://localhost:11434/api/tags` — should list all three models.

---

### ChromaDB — knowledge base vector store

```bash
docker compose -f knowledge/docker-compose.yml up -d
```

Verify: `curl http://localhost:8000/api/v1/heartbeat` — should return `{"nanosecond heartbeat": ...}`.

---

### LiteLLM — model routing

```bash
docker compose -f ai/docker-compose.yml up -d
```

Verify: `curl http://localhost:4000/health`

---

## Step 3: Run bootstrap

```bash
bash scripts/bootstrap.sh
```

This validates environment variables, syncs MCP servers into Claude Code's global config, and checks all service connections. Every line should show `[ok]`.

Fix any `[missing]` variables by returning to Step 1. Fix any `[fail]` service checks by returning to Step 2.

To check env vars only without running the full bootstrap:
```bash
bash scripts/bootstrap.sh --check
```

---

## Step 4: Install MCP server dependencies

```bash
bash mcp/servers/install-all.sh
bash scripts/install-mcps.sh
```

The first command installs npm dependencies for all 11 custom MCP servers. The second syncs `mcp/mcp.factory.json` into Claude Code's global config.

Restart Claude Code after this step. All 20 MCP servers will be available in Claude's tool panel.

---

## Step 5: Build the knowledge base

Ingest all factory documentation into ChromaDB so Claude can search it semantically:

```bash
node knowledge/ingest.js
```

This walks all `.md` files in `docs/`, `policies/`, `agents/`, and `prompts/`, chunks each file by heading, embeds every chunk using `nomic-embed-text`, and stores the results in the `factory-knowledge` ChromaDB collection.

To ingest a specific directory only:
```bash
node knowledge/ingest.js --dir docs
```

To rebuild from scratch (clears existing data first):
```bash
node knowledge/ingest.js --clear
```

Re-run whenever you add or significantly update documents. Verify by asking Claude to call `search_knowledge("threat model")` — it should return relevant results from your docs.

---

## Step 6: Verify the factory is ready

Run through this checklist before starting your first issue:

- [ ] `bash scripts/bootstrap.sh --check` — all variables show `[ok]`
- [ ] `curl http://localhost:11434/api/tags` — Ollama lists mistral:7b, codellama:7b, nomic-embed-text
- [ ] `curl http://localhost:8000/api/v1/heartbeat` — ChromaDB responds
- [ ] Claude Code is open — MCP servers listed in tool panel (should show 20)
- [ ] `node knowledge/ingest.js` completed without errors
- [ ] `gh auth status` — GitHub CLI is authenticated
- [ ] `railway whoami` — Railway CLI is authenticated

When all items are checked, continue to `docs/workflow/first-project.md` for your first issue walkthrough.
