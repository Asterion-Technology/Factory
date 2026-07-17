---
name: cease-subtree-sync
description: >
  Publish projects/stopallcalls changes from the Factory monorepo to the
  standalone GitHub repo radical-disruptive/cease (remote "cease"). Use after
  committing any StopAllCalls change when the user wants the cease repo
  updated, says "sync cease", "push to cease", or asks to publish
  stopallcalls — even if they don't say "subtree". Never force-push here.
metadata:
  author: claude-harvested
  verified: "2026-07-16 — 7 consecutive successful syncs (initial publish + 6 updates)"
---

# Sync projects/stopallcalls → radical-disruptive/cease

The Factory monorepo is the working tree; `radical-disruptive/cease` is a
published mirror of `projects/stopallcalls` only. The local branch
`cease-export` carries the mirror's history — **never delete it**: its merge
commits are what keep pushes fast-forward.

Failure pattern this avoids: a fresh `git subtree split` produces history that
does not contain the remote's merge/init commits, so a plain push is rejected
(non-fast-forward), and force-pushing is blocked by the auto-mode permission
classifier.

## Procedure

Run from `d:/REPO/Factory` after the monorepo commit exists:

```bash
# 1. Split the subtree (deterministic; fast after the first run)
git subtree split --prefix=projects/stopallcalls -b cease-sync

# 2. Merge into the persistent export branch via a throwaway worktree
#    (the main working tree usually has a branch checked out + dirty files)
git worktree add <scratchpad>/cease-wt cease-export
git -C <scratchpad>/cease-wt merge cease-sync -m "<same subject as the monorepo commit>"

# 3. Plain push — never --force
git push cease cease-export:main

# 4. Clean up (keep cease-export!)
git worktree remove <scratchpad>/cease-wt
git branch -D cease-sync
```

Remote `cease` = `https://github.com/radical-disruptive/cease.git` (recorded in
`config/repos.yaml`). Verify with `git remote -v` if pushes 404.

## What didn't work

- **`git push cease <split>:main --force`** — blocked by the auto-mode
  classifier; also unnecessary. Ruled out on the first publish.
- **Pushing the raw split output directly** — rejected non-fast-forward once
  the remote had its auto-init commit. Solved originally by one
  `git merge -s ours cease/main --allow-unrelated-histories` into the split
  (that merge commit lives in `cease-export`; it is why the branch must be
  kept).

## Gotchas

- If `cease-export` is ever lost: re-split, fetch `cease/main`, merge it into
  the split with `-s ours --allow-unrelated-histories`, push plainly, and
  rename that branch `cease-export`.
- The split only includes committed changes — commit to the monorepo first.
- Passing check per sync: the push output shows `<old>..<new> cease-export ->
  main` and `gh api repos/radical-disruptive/cease/commits` lists the new
  commit.
