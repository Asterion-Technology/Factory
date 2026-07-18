---
name: start-factory
description: Start the Factory's local stack and report status. Use when the user says "start Factory", "start the factory", "bring the stack up", "spin up the factory", "factory status", or "stop the factory". Starts Docker Desktop, the Infisical and ChromaDB compose stacks, Ollama, and the factory-hub dashboard, then prints a health table.
---

# start Factory

One command brings up the whole local stack. Run it and relay the results — do not
start services by hand with raw `docker compose` commands (those are deny-listed for
a reason; the script is the approved path).

## Commands

| User intent | Run |
|---|---|
| "start Factory" | `node d:/REPO/Factory/scripts/start-factory.mjs` |
| "factory status" / "is the factory up?" | `node d:/REPO/Factory/scripts/start-factory.mjs --status` |
| "stop the factory" | `node d:/REPO/Factory/scripts/start-factory.mjs --stop` |
| "start everything including LiteLLM" | `node d:/REPO/Factory/scripts/start-factory.mjs --full` |

Notes:
- LiteLLM is **opt-in** (`--full`) — no interactive-session caller exists today.
- The script is idempotent; running it when everything is up just reports `[ok]`.
- It can take ~2 minutes if Docker Desktop itself has to boot.

## After running

1. Relay the final status table to the user verbatim (it is short).
2. If any line is `[fail]`:
   - For a compose stack, read the logs with `docker compose -f <file> logs --tail 50`
     (allowed) and summarize the actual error before suggesting fixes.
   - For `env` warnings, remind the user secrets come from the Infisical launcher
     (`scripts/code-with-secrets.ps1`) — do not offer to hardcode secrets.
3. If `mcp-config` reports drift, offer to run
   `node d:/REPO/Factory/scripts/gen-mcp-config.mjs --write-enabled` (requires a
   session restart to take effect).
4. The dashboard lives at http://localhost:3099 once factory-hub is up.
