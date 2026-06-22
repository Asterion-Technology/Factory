# Pull Request

## Linear Issue

<!-- REQUIRED: Link to the Linear issue that authorizes this work -->
<!-- Format: https://linear.app/<team>/issue/<id>/<slug> -->
**Issue**: 

## Goal

<!-- What does this PR accomplish? Copy from the Linear issue Goal field. -->

## Acceptance Criteria

<!-- List the acceptance criteria this PR satisfies. Each item must be verifiable. -->
- [ ] 
- [ ] 
- [ ] 

## Threat Model Summary

<!-- What are the security implications of this change? -->
<!-- For low-risk changes: "No security impact — [reason]" -->
<!-- For any change touching auth, DB, payments, or external APIs: STRIDE summary required -->

**Security impact**: 

## Test Plan

<!-- How was this tested? What scenarios were covered? -->
- [ ] Unit tests updated/added
- [ ] E2E tests updated/added (if UI change)
- [ ] Manual testing performed
- [ ] Tested on staging

## Rollback Plan

<!-- How do we undo this if it causes a production issue? -->

## Checklist

### Implementation
- [ ] Code matches acceptance criteria
- [ ] No hardcoded secrets or credentials
- [ ] Input validation at API layer (not just UI)
- [ ] Parameterized queries (no string interpolation into SQL)
- [ ] Error responses are safe (no stack traces exposed to users)
- [ ] Dead code and debug artifacts removed
- [ ] TypeScript / linting errors resolved

### Security
- [ ] Gitleaks scan passes (no secrets in diff)
- [ ] Semgrep scan passes (no SAST findings)
- [ ] Snyk scan passes (no critical/high dependency vulnerabilities)
- [ ] New dependencies reviewed for security posture

### Testing
- [ ] All existing tests pass
- [ ] New tests cover the acceptance criteria
- [ ] CI passes (all 10 gates green)

### Review
- [ ] Codex independent review completed (see automated comment below)
- [ ] Human reviewer assigned

## AI Workforce

<!-- Which agents worked on this PR? -->
- [ ] Claude — implementation
- [ ] Codex — review
- [ ] Ollama — documentation / changelog
- [ ] Human — approval

## Cost Impact

<!-- Estimated API/infrastructure cost change (if any) -->
**Cost impact**: None / $X/month increase / $X/month decrease

## Notes for Reviewer

<!-- Anything the reviewer should pay special attention to, known limitations, or follow-up work -->
