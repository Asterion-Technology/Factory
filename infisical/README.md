# Infisical (self-hosted secrets manager)

Local instance for Factory dev tooling secrets (MCP servers, CLIs). Replaces
scattered `setx` machine env vars as the source of truth.

- **UI**: http://localhost:8085 — admin login is in `infisical/.env.admin.local`
  (gitignored; change the password after first login if you like)
- **Stack**: `docker compose -f infisical/docker-compose.yml up -d`
  (Postgres + Redis + migration + server; data persists in the `infisical-pg` volume)
- **Project**: `factory` (id in `.infisical.json` at repo root) with `dev`,
  `staging`, `prod` environments; secrets live in `dev` at path `/`

## Daily use

The CLI (`@infisical/cli` via npm; on Windows call `infisical.exe`) reads
`.infisical.json` from the repo root, so from anywhere in the repo:

```powershell
# interactive (once per ~8h): browser login against the local instance
infisical login --domain http://localhost:8085/api

# run anything with all dev secrets injected as env vars
infisical run -- pnpm test
infisical run -- node scripts/whatever.js

# non-interactive (agents/CI): machine identity token from .env.admin.local
infisical run --token $env:INFISICAL_IDENTITY_TOKEN -- <command>

# add/update a secret
infisical secrets set NEW_KEY=value
```

## Notes

- `infisical/.env` holds the *instance's own* crypto secrets (generated, not
  obtained anywhere) — losing ENCRYPTION_KEY makes stored data unrecoverable,
  so back it up somewhere safe.
- The bootstrap machine identity token (in `.env.admin.local`) has admin
  rights and a ~90-day TTL; mint scoped identities in the UI for anything
  beyond local dev.
- VS Code / `.mcp.json` `${VAR}` expansion reads process env vars. To source
  them from Infisical instead of `setx` machine vars, launch VS Code via
  `powershell -File scripts\code-with-secrets.ps1` (pin it to the taskbar).
  Once you trust that flow, the `setx` copies can be deleted — after that,
  plain VS Code launches will have no MCP secrets, by design.
