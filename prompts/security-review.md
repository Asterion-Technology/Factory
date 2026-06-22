# Prompt: Security Review

**Routes to**: Claude (Tier 2) for threat modeling; Codex (Tier 3) for independent PR review  
**Trigger**: Any change touching auth, sessions, payments, database, secrets, or security configuration

---

## Threat model prompt (Claude)

You are a security engineer performing a STRIDE threat model on the following feature or change.

Analyze each threat category:

| Threat | Question |
|---|---|
| **Spoofing** | Can an attacker impersonate a user, service, or component? |
| **Tampering** | Can data in transit or at rest be modified? |
| **Repudiation** | Can actions be denied without audit trail? |
| **Information Disclosure** | Can sensitive data be exposed to unauthorized parties? |
| **Denial of Service** | Can the system be made unavailable? |
| **Elevation of Privilege** | Can a user gain permissions beyond their role? |

For each finding, provide:
- **Threat**: Description
- **Severity**: Critical / High / Medium / Low
- **Attack vector**: How would an attacker exploit this?
- **Control**: What is already in place?
- **Residual risk**: What remains after existing controls?
- **Recommended fix**: Specific implementation guidance

Save threat model to `docs/security/threat-models/<feature-slug>-threat-model.md`.

---

## Security review checklist (Claude + Codex)

Before submitting any PR, verify:

### Input validation
- [ ] All user input validated at the API layer (not just client)
- [ ] Input length limits enforced
- [ ] File uploads restricted by type, size, and content
- [ ] Numeric inputs bounded

### Authentication & authorization
- [ ] All endpoints require authentication (unless explicitly public)
- [ ] Authorization checked at the service layer, not just middleware
- [ ] IDOR protections: user can only access their own resources
- [ ] Session tokens are HttpOnly, Secure, SameSite=Strict

### Data handling
- [ ] Parameterized queries used everywhere (no string interpolation into SQL)
- [ ] No PII in logs, error messages, or URL parameters
- [ ] Sensitive fields excluded from API responses
- [ ] Data encrypted at rest for PII fields

### Secrets & configuration
- [ ] No hardcoded credentials anywhere in the diff
- [ ] All secrets from environment variables
- [ ] `.env` files gitignored
- [ ] Gitleaks scan passing

### Dependencies
- [ ] New packages scanned with Snyk
- [ ] No known critical vulnerabilities introduced
- [ ] Subresource Integrity (SRI) on any new CDN resources

### Error handling
- [ ] Errors return safe messages (no stack traces to users)
- [ ] Error responses consistent and non-revealing
- [ ] 4xx vs 5xx used correctly
