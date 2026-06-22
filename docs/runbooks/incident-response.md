# Runbook: Incident Response

## Severity levels

| Level | Definition | Response time | Who responds |
|---|---|---|---|
| P0 | Production down, data loss, or active security breach | Immediate | On-call + lead engineer |
| P1 | Production degraded, significant user impact | 30 minutes | On-call engineer |
| P2 | Non-critical feature broken, workaround available | 2 hours | Team |
| P3 | Minor issue, no user impact | Next business day | Team |

## P0/P1 response procedure

### 1. Declare the incident

Create a Linear issue immediately:
- Title: `[P0] Brief description`
- State: `Incident`
- Assign to yourself

### 2. Assess

```bash
# Railway logs
railway logs --deployment <id>

# Sentry — latest errors
# Use Sentry MCP: "Show me the latest errors in production"

# Check deployment status
railway status
```

### 3. Identify impact

- How many users affected?
- What data is at risk?
- Is this a security incident? (If yes → proceed to Security Incident procedure)

### 4. Communicate

Post a status update to the team within 15 minutes of declaration.

### 5. Mitigate first, fix later

For P0: rollback the last deploy immediately, then investigate root cause.

```bash
# Railway rollback via dashboard
# OR: redeploy the last known-good image via Railway MCP
```

### 6. Fix and redeploy

Normal workflow applies — create a fix branch, implement, Codex review, human approve.

**Exception**: For P0 only, the human approval gate may be bypassed with verbal approval, documented in the Linear issue, with a follow-up review required within 24 hours.

### 7. Postmortem

For P0/P1: write a postmortem within 48 hours. Template: `docs/postmortems/template.md`

---

## Security incident procedure

If a security breach is suspected:

1. **Do not** push or commit anything until the scope is understood
2. Check Sentry for anomalous errors or access patterns
3. Check Gitleaks history: `gitleaks detect --source . --log-opts="HEAD~50..HEAD"`
4. Rotate any potentially exposed secrets immediately via Railway dashboard
5. Create a Linear issue: `[P0-SECURITY] Brief description` — keep details minimal until scope is known
6. Contact the security lead immediately
7. Preserve raw logs — do **not** compress or delete

Postmortem required within 24 hours of resolution.
