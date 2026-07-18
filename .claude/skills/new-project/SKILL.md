---
name: new-project
description: Scaffold a new standalone project repo at D:/REPO/{name} with its own GitHub remote, registered in the Factory. Use when the user says "new project", "create a project", "scaffold a repo", "start a new app", or names a project to create. The Factory operates ON repos — new projects never go inside the Factory monorepo.
---

# factory-new-project

Creates a standalone repo at `D:/REPO/{name}`: git init on `main`, template seed
files (README, .gitignore, CLAUDE.md pointing back at Factory conventions),
initial commit, GitHub remote under **Asterion-Technology** (pushed), and an
entry in `config/repos.yaml` so `resolve-repo.sh` and the Factory workflow know it.

## Inputs to collect (ask only for what's missing)

| Input | Default | Notes |
|---|---|---|
| name | — (required) | lowercase slug: `^[a-z][a-z0-9-]{1,60}$` |
| template | `node` | `node` \| `static` \| `none` |
| visibility | `private` | `private` \| `public` |
| description | generated | one sentence, lands in README + registry + GitHub |
| role | `app` | `app` \| `infra` \| `library` \| `scratchpad` |
| Linear project? | no | if yes, see below |

## Run

```
node d:/REPO/Factory/scripts/new-project.mjs --name <slug> --template node --visibility private --description "..."
```

Flags: `--no-remote` (local only), `--org <owner>` (non-default org), `--linear`.

## After the script

1. Relay the `[ok]` lines and the resolved path to the user.
2. Commit the `config/repos.yaml` change in the Factory repo (normal commit flow).
3. If the user wanted a Linear project: create it with the `linear` MCP
   (`save_project`, workspace asterion unless told otherwise), then edit the new
   `linear_project: ""` field in `config/repos.yaml` to the project name.
4. If `gh repo create` failed (warn line), the local repo and registry entry
   still exist — diagnose gh auth, then push manually with
   `git -C D:/REPO/<name> push -u origin main` after creating the remote.
