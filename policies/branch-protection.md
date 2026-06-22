# Policy: Branch Protection & Git Workflow

## Branch model

| Branch | Environment | Protection | Who can push |
|---|---|---|---|
| `main` | Production | Protected — requires PR + approval + CI | Nobody directly |
| `staging` | Staging | Protected — requires PR + CI | Nobody directly |
| `feature/<id>-<slug>` | Preview (Railway) | None | Claude, developers |
| `fix/<id>-<slug>` | Preview (Railway) | None | Claude, developers |
| `security/<id>-<slug>` | Preview (Railway) | None | Claude, developers |

## Naming conventions

Branch names follow: `<type>/<linear-issue-id>-<short-slug>`

Examples:
- `feature/ENG-142-user-search`
- `fix/ENG-155-session-timeout`
- `security/ENG-161-csrf-protection`

The Linear issue ID is mandatory. No coding without a Linear issue.

## Workflow

```
1. Linear issue created (Goal, AC, Threat Model, Test Plan, Rollback Plan all present)
2. Claude creates branch: git checkout -b feature/<id>-<slug>
3. Claude implements and pushes to feature branch
4. Claude creates PR via GitHub MCP or gh CLI
5. CI runs all gates automatically
6. Codex independent review posts findings
7. Human reviews PR, Codex findings, and CI results
8. Human approves and merges (Claude cannot merge)
9. Railway auto-deploys to Preview
10. Human approves promotion to Staging
11. Staging tested and approved for Production
12. Human triggers Production deploy approval in Railway
```

## Required CI gates before merge

Every PR must pass:
- Gitleaks (secrets scan)
- Semgrep SAST
- Trivy dependency/container scan
- ESLint / language linter
- Type check (tsc or equivalent)
- Build
- Unit tests
- Playwright E2E tests (where applicable)
- Snyk (dependency audit)
- Codex independent review (advisory; Block verdict requires human override)

## Commit message format

```
<type>(<scope>): <short summary>

[optional body explaining WHY, not WHAT]

Refs: ENG-NNN
```

Types: `feat`, `fix`, `security`, `refactor`, `test`, `docs`, `chore`

Example:
```
feat(auth): add MFA enforcement for admin accounts

Admin accounts now require TOTP on every login. Existing sessions
are invalidated on next request to enforce re-auth.

Refs: ENG-142
```

## Protected branch configuration (GitHub)

Apply these rules to `main` and `staging` via GitHub branch protection:
- Require pull request before merging: YES
- Required approvals: 1
- Dismiss stale reviews: YES
- Require status checks: YES (all CI gates listed above)
- Require branches to be up to date before merging: YES
- Restrict who can push: NO direct pushes from anyone
- Allow force pushes: NO
- Allow deletions: NO
