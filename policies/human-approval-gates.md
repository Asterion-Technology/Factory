# Policy: Human Approval Gates

## Purpose

This policy defines which actions require explicit human approval before proceeding. No AI agent — Claude, Codex, or Ollama — may bypass these gates.

## Approval gates

| Action | Gate type | Who must approve | Notes |
|---|---|---|---|
| Merge PR to `main` | GitHub Environment | Designated reviewer | Codex review must complete first |
| Merge PR to `staging` | GitHub branch rule | Any team member | CI must pass first |
| Deploy to Production | Railway Environment + GitHub Action | Designated approver | Separate from merge approval |
| Database migration (schema change) | PR label + manual step | DBA or senior engineer | Rollback plan must be documented in PR |
| Drop or truncate table | Manual only | Senior engineer + DBA | Never automated |
| Add or rotate production secrets | Railway dashboard or Vault | Owner | Never via PR or code |
| Modify `.github/workflows/` security gates | PR label + review | Security lead | Prevents CI bypass |
| Grant a security exception | Security exception doc | Security lead | Document in `docs/security/exceptions/` |
| Approve own Pull Request | **Prohibited** | N/A | Claude cannot approve PRs it authored |
| Modify auth, session, or MFA logic | Codex Block verdict override | Security lead | Codex must review first; Block overrides require human sign-off |
| Modify payment or billing logic | Codex Block verdict override | Engineering lead + Finance | Compliance check required |
| Enable or disable feature flags for >5% of users | Manual step | Product owner | Gradual rollout required |

## Enforcement

- GitHub branch protection rules enforce merge requirements for `main` and `staging`
- Railway deployment environment requires manual approval before production deploy
- CI workflow `codex-review.yml` posts Codex verdict as a required status check
- Security exception documents must be created in `docs/security/exceptions/` and linked in the relevant PR

## Override procedure

If a human needs to override a gate (e.g., emergency hotfix):

1. Document the reason in the PR description
2. Get approval from the appropriate person listed above
3. Create a follow-up Linear issue to restore normal process
4. Add a postmortem entry if the override was due to an incident

## What AI agents may do without human approval

- Create feature/fix/security branches
- Write and push code to non-protected branches
- Create Pull Requests
- Run tests and security scans
- Post PR comments and review findings
- Create or update Linear issues
- Query Railway logs and deployment status (inspect only)
- Read database schemas (read-only)
- Send test emails (sandbox only)
