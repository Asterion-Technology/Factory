# First Project Walkthrough

This is the step-by-step guide for the first time you run a real project through the Agentic DevSecOps Factory. Follow these steps in order. By the end, you will have:

- All environment variables configured
- All MCP servers running
- A test Linear issue moved through the full pipeline
- The Observation Deck showing live data

---

## Prerequisites

Complete `bootstrap/first-run.md` before starting this guide. You need:
- All required secrets configured (Linear, GitHub, Railway, etc.)
- `bash scripts/bootstrap.sh` runs without errors
- Ollama running locally with `mistral:7b` pulled

---

## Part 1: Verify the factory is healthy

### Check MCP servers

Open Claude Code. At session start, Claude will auto-verify MCP server connectivity. You should see no errors in the status output.

Alternatively, check manually:

```bash
# List configured MCP servers (reads from installed config)
cat ~/.config/claude/claude_mcp_config.json | python3 -m json.tool | grep '"name"'
```

You should see all 19 servers (9 standard + 10 custom).

### Check Ollama

```bash
curl http://localhost:11434/api/tags
```

Should return a JSON list including `mistral:7b`.

### Run bootstrap check

```bash
bash scripts/bootstrap.sh --check
```

All required environment variables should show `[ok]`. Fix any that show `[missing]` before continuing.

---

## Part 2: Create your first Linear issue

1. Open your Linear workspace
2. Navigate to the Engineering team
3. Create an issue:

```
Title: Add factory health check endpoint

Description:
Create a /health endpoint that returns the status of all factory components:
- Ollama connection
- Database connectivity  
- MCP server count
- LiteLLM availability

Acceptance Criteria:
- GET /health returns 200 with JSON body
- JSON body includes: ollama, database, mcp_servers, litellm fields
- Each field has status: "ok" | "degraded" | "unavailable"
- Responds in < 500ms
- No authentication required (public endpoint)
```

4. Set priority: Low
5. Set assignee: yourself
6. Note the issue ID (e.g., `ENG-1`)

---

## Part 3: Start work via factory tooling

```bash
bash scripts/start-issue.sh ENG-1
```

Confirm the output shows:
- Issue found with correct title
- Branch created: `feature/ENG-1-add-factory-health-check-endpoint`
- Linear status updated to In Progress

---

## Part 4: Implement with Claude

Open Claude Code. The working branch is now `feature/ENG-1-...`.

Tell Claude:

```
I'm working on ENG-1 — Add factory health check endpoint.

Please implement a /health endpoint. The implementation should:
1. Check Ollama at OLLAMA_HOST (env var, default http://localhost:11434)
2. Check the database using the existing DB connection
3. Count configured MCP servers from mcp/registry.json
4. Check LiteLLM at LITELLM_HOST (env var, default http://localhost:4000)
5. Return 200 with structured JSON, respond in < 500ms

Please inspect the current routing setup first, then implement.
```

Let Claude implement. Review the changes it proposes before accepting.

After implementation, have Claude:
1. Run the existing test suite: `npm test`
2. Run the linter: `npm run lint`
3. Check for TypeScript errors: `npx tsc --noEmit`

---

## Part 5: Commit and push

Once tests pass:

```bash
git status           # confirm only expected files changed
git add -p           # review each diff chunk
git commit -m "feat(ENG-1): add /health endpoint with factory component status"
git push origin feature/ENG-1-add-factory-health-check-endpoint
```

---

## Part 6: Open the PR

```bash
gh pr create --fill
```

Fill in the PR template:
- Paste the Linear issue URL
- Copy the acceptance criteria from Linear
- Write the threat model: "GET endpoint, no auth, no user input. Returns internal status — confirm no sensitive config or credentials exposed in response."
- Document your test plan

---

## Part 7: Watch CI run

Go to the GitHub Actions tab on your repository. Watch the `ci.yml` workflow:
- Each of the 10 gates should turn green within ~5 minutes
- If any gate fails, click it to see the error, fix it, and push again

After CI passes, `codex-review.yml` fires. Read the Codex verdict comment on your PR.

---

## Part 8: Merge

When:
- All 10 CI gates are green
- Codex verdict is Pass or Conditional (with your response)
- A human has reviewed and approved

Click **Squash and merge**.

Within 2 minutes you should see:
- Linear issue status changed to **Done**
- A new commit on `main` with a changelog entry in `CHANGELOG.md`
- Railway staging deploy triggered

---

## Part 9: Check the Observation Deck

Open `dashboards/observation-deck/index.html` in a browser.

To collect live metrics immediately (instead of waiting for the 6-hour cron):

```bash
bash scripts/metrics-collector.sh --repo your-org/your-repo --days 7
```

Refresh the dashboard. You should see:
- PR Velocity: 1 merged this week
- Security Gates: all green
- MCP Server Status: 19 active

---

## Part 10: Generate the changelog manually (optional)

The `changelog.yml` workflow runs automatically on merge, but you can also run it manually to see the output:

```bash
bash scripts/changelog.sh --pr 1 --output CHANGELOG.md
```

The `CHANGELOG.md` at the root should now contain a `[Unreleased]` entry describing the health endpoint.

---

## Troubleshooting

### "LINEAR_API_KEY is not set"
Run `bash scripts/bootstrap.sh --check` to see which vars are missing. Check `bootstrap/first-run.md` for where to get each key.

### "MCP server not found"
Re-run `bash scripts/install-mcps.sh`. This regenerates `.mcp.json` from `mcp/registry.json` and re-syncs it to the Claude Code global config.

### "Ollama unavailable"
Check Docker: `docker ps | grep ollama`. If not running: `docker run -d -p 11434:11434 ollama/ollama`.
Then pull the model: `docker exec <container> ollama pull mistral:7b`.

### CI gate failing: Semgrep
The finding is real — fix it rather than suppressing. Run locally:
```bash
semgrep scan --config auto src/
```

### CI gate failing: Gitleaks
You may have accidentally staged a secret. Audit with:
```bash
gitleaks detect --source . --verbose
```
Never commit secrets. Remove from history before pushing if needed.

### Codex verdict: Block
Read the Codex comment carefully. The finding is typically real. Fix the issue, push, and CI + Codex will re-run automatically.

---

## What's next

After your first project completes the full cycle:

1. **Add a real feature** — Pick a real Linear issue from the backlog and run it through
2. **Configure Langfuse** — Wire up `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` to get real cost tracking in the Observation Deck
3. **Tune model routing** — Adjust `config/litellm.yaml` based on your actual usage patterns
4. **Review the TODO** — `TODO.md` at the root lists all known out-of-scope items and technical debt
