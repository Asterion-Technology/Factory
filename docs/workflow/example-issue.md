# Example: Complete Linear Issue Lifecycle

This document traces a real-world feature through the full factory pipeline — from Linear issue creation to production deployment.

---

## The Issue: ENG-47 — Add full-text search to the project dashboard

### Linear Issue (as created)

**Title**: Add full-text search to the project dashboard  
**Team**: Engineering  
**Priority**: Medium  
**Assignee**: You  

**Description**:

> Users have reported difficulty finding projects by partial name match. The current filter only supports exact prefix matching.
>
> **Goal**: Add a search bar to the project dashboard that supports partial word matching, case-insensitive search, and returns results ranked by relevance.
>
> **Acceptance Criteria**:
> - [ ] Search bar appears at the top of the project list
> - [ ] Typing 3+ characters triggers a live search (debounced 300ms)
> - [ ] Results are ranked by Meilisearch relevance score
> - [ ] Search state is preserved across page refreshes (URL param `?q=`)
> - [ ] Empty state shown when no results match
> - [ ] Works on mobile (min-width: 320px)
> - [ ] P50 latency < 200ms for typical queries

---

## Step 1: Start the issue

```bash
bash scripts/start-issue.sh ENG-47
```

Output:
```
── Fetching issue ENG-47 from Linear ──────────────
[ok]  Found: ENG-47 — Add full-text search to the project dashboard
[ok]  State: Todo
[ok]  URL:   https://linear.app/acme/issue/ENG-47/add-full-text-search

── Creating branch ─────────────────────────────────
Branch: feature/ENG-47-add-full-text-search-to-the-project-dashbo

── Updating Linear issue status ─────────────────────
[ok]  Linear issue status updated to: In Progress

╔══════════════════════════════════════════════════╗
║  Ready to implement ENG-47
╚══════════════════════════════════════════════════╝

  Branch:  feature/ENG-47-add-full-text-search-to-the-project-dashbo
  Issue:   https://linear.app/acme/issue/ENG-47/

Next steps:
  1. Implement the work (Claude is your starting point)
  2. Run tests: npm test
  3. Push: git push origin feature/ENG-47-add-full-text-search-to-the-project-dashbo
  4. Open PR: gh pr create --fill
```

Linear issue state is now **In Progress**.

---

## Step 2: Implementation session with Claude

Open Claude Code. The MCP servers are pre-loaded. Ask Claude to start:

```
I'm working on ENG-47 — Add full-text search to the project dashboard.

Acceptance criteria:
- Search bar at top of project list, live search, 300ms debounce
- Meilisearch for ranking
- URL param ?q= for state persistence
- Empty state when no results
- Mobile responsive, P50 < 200ms

Please inspect the current project list component and Meilisearch config, then propose an implementation plan.
```

**Claude's session flow (example)**:

1. Reads project list component from `src/components/ProjectList.tsx`
2. Calls `factory-meilisearch` MCP → `inspect_index` to see the `projects` index fields
3. Sees the index has `name`, `description`, `tags` as searchable attributes
4. Proposes: new `SearchBar` component + `useProjectSearch` hook + server action for Meilisearch queries
5. You approve the plan
6. Claude implements in 4 files:
   - `src/components/SearchBar.tsx` — input with debounce
   - `src/hooks/useProjectSearch.ts` — state + URL param sync
   - `src/actions/searchProjects.ts` — server action calling Meilisearch
   - `src/components/ProjectList.tsx` — integrates SearchBar, shows empty state

7. Claude runs `npm test` — all tests pass
8. Claude calls `factory-semgrep` MCP → `run_scan` on the new files — no findings
9. Claude calls `factory-snyk` MCP → no new vulnerable dependencies

---

## Step 3: Push and open PR

```bash
git add -p   # review what's being committed
git commit -m "feat(ENG-47): add full-text search to project dashboard

- SearchBar component with 300ms debounce
- useProjectSearch hook with URL param persistence
- Server action hitting Meilisearch projects index
- Empty state when no results match
- Responsive layout tested down to 320px"

git push origin feature/ENG-47-add-full-text-search-to-the-project-dashbo
gh pr create --fill
```

The PR template opens. Fill it in:

```markdown
## Linear Issue
**Issue**: https://linear.app/acme/issue/ENG-47/add-full-text-search

## Goal
Add full-text project search with Meilisearch, supporting partial matching, relevance ranking,
and URL-based state persistence.

## Acceptance Criteria
- [x] Search bar appears at top of project list
- [x] 3+ characters triggers live search (debounced 300ms)
- [x] Results ranked by Meilisearch relevance
- [x] ?q= URL param preserves search state
- [x] Empty state shown for no matches
- [x] Works at 320px viewport width
- [ ] P50 latency < 200ms (pending staging measurement)

## Threat Model Summary
User-controlled search query is passed to Meilisearch. Query is never interpolated into SQL —
Meilisearch client accepts a typed string param. XSS risk: output is rendered via React,
all text content auto-escaped. No auth change. Low risk.

## Test Plan
- [x] Unit tests: useProjectSearch hook (8 cases including debounce, URL sync, empty state)
- [x] Unit tests: searchProjects server action (mocked Meilisearch client)
- [ ] E2E tests: search flow on project dashboard
- [x] Manual testing: Chrome + Firefox + mobile Safari
- [ ] Tested on staging

## Rollback Plan
Revert the PR (single squash commit). Meilisearch index is read-only — no data changes.
```

---

## Step 4: CI runs

GitHub Actions triggers `ci.yml`. All 10 gates run:

```
✅ Secrets Scan (Gitleaks)      — pass
✅ SAST (Semgrep)               — pass
✅ Dependency Scan (Trivy)      — pass
✅ Dependency Audit (Snyk)      — pass
✅ Lint                         — pass
✅ Type Check                   — pass
✅ Build                        — pass
✅ Unit Tests                   — pass, 31 tests
✅ E2E Tests                    — pass, 12 scenarios
✅ Validate MCP Config          — pass, 19 servers present
```

Then `codex-review.yml` fires. Codex posts:

```
## Codex Review — ENG-47

### Verdict
Conditional

### Findings

🟡 **P50 latency not yet validated** — Acceptance criterion says < 200ms but the PR notes
   this is "pending staging measurement." Recommend measuring before merge or
   adding a Playwright performance assertion.

🟢 **Search input sanitization** — Correct. Meilisearch SDK accepts a typed string;
   no injection vector.

🟢 **URL state persistence** — useSearchParams implementation is idiomatic for Next.js 14.
   Correct use of router.replace for non-history-polluting updates.

🟢 **Empty state** — ProjectEmptyState component renders correctly in the empty branch.
   Accessible: uses role="status" aria-live="polite".

### Summary
Solid implementation. Address the latency validation before shipping to users.
```

---

## Step 5: Address Codex conditional

You add a Playwright performance assertion:

```typescript
// tests/e2e/search.spec.ts
test('search P50 latency < 200ms', async ({ page }) => {
  await page.goto('/projects?q=');
  const times: number[] = [];
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    await page.fill('[data-testid="search-input"]', `test${i}`);
    await page.waitForSelector('[data-testid="search-results"]');
    times.push(Date.now() - start);
  }
  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)];
  expect(p50).toBeLessThan(200);
});
```

Push the fix → CI passes → Codex re-reviews → verdict: **Pass**.

---

## Step 6: Human review and merge

Request review from a team member. They:
- Spot-check the Meilisearch query construction
- Verify empty state renders correctly in the Storybook preview
- Approve the PR

Merge via **Squash and merge**.

---

## Step 7: Automatic post-merge events

**Linear sync** (`linear-sync.yml` fires within ~1 minute):
```
[ok] Linear ENG-47 → Done
```

**Changelog** (`changelog.yml` fires within ~2 minutes):
```
CHANGELOG.md updated:

## [Unreleased] — 2026-06-22

### Added
- Project dashboard now supports full-text search with partial word matching and relevance ranking.
- Search state is preserved in the URL, allowing bookmarking and sharing of search results.
```

**Railway** deploys to staging automatically.

**Metrics** update within 6 hours showing the new merged PR in the observation deck.

---

## The complete timeline

| Time | Event |
|---|---|
| 0:00 | Linear issue ENG-47 created |
| 0:02 | `start-issue.sh` runs, branch created, Linear → In Progress |
| 0:05 | Claude Code session opens, MCP servers ready |
| 1:45 | Implementation complete, tests pass |
| 1:47 | PR opened, CI triggered |
| 1:55 | CI passes (all 10 gates) |
| 1:56 | Codex review posted — Conditional |
| 2:10 | Latency test added, pushed |
| 2:18 | CI passes again, Codex → Pass |
| 2:20 | Human reviewer approved |
| 2:21 | Merged to main |
| 2:22 | Linear → Done (auto) |
| 2:23 | Changelog entry committed (auto) |
| 2:24 | Railway staging deploy begins |
| 8:00 | Observation deck metrics updated |
