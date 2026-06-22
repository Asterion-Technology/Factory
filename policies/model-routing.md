# Policy: Model Routing

## Purpose

Route tasks to the cheapest capable model. Minimize frontier-model token spend. Preserve Claude for tasks that genuinely require it.

## Routing decision tree

```
Is this task low complexity?
  ├── YES → Route to Ollama (Tier 1)
  │         mistral:7b for prose/docs
  │         codellama:7b for code stubs
  │         nomic-embed-text for embeddings
  │
  │   Did Ollama fail or return unusable output?
  │     ├── Once → Retry Ollama once
  │     └── Twice → Escalate to Claude (silent, no user prompt)
  │
  └── NO → Is this an independent review of Claude's work?
              ├── YES → Route to Codex (Tier 3)
              └── NO  → Route to Claude (Tier 2)
```

## Tier 1: Ollama (local, zero cost)

**When to use:**
- Documentation writing, README updates
- Changelog generation from commits or diffs
- Linear ticket summarization for standups
- Basic unit test stub generation (from existing patterns)
- CI log compression and summarization (RTK)
- Knowledge base ingestion (nomic-embed-text)
- Similarity search against ADR/threat model corpus

**When NOT to use:**
- Architecture decisions
- Security analysis or threat modeling
- Complex refactoring
- Anything where output quality directly affects production

**Fallback**: If Ollama fails twice → Claude automatically, no user prompt required.

## Tier 2: Claude (frontier, primary)

**When to use:**
- Architecture and system design
- Feature implementation beyond trivial
- Security analysis, STRIDE threat modeling, OWASP review
- Infrastructure design and IaC
- Technical design documents and ADRs
- Any Ollama escalation
- Multi-step reasoning tasks
- Tasks touching auth, payments, DB schema, or security config

**Minimize use for:**
- Tasks clearly in Tier 1 scope
- Simple string transformations
- Routine documentation that follows an existing template

## Tier 3: Codex / GPT-4o (frontier, reviewer only)

**When to use:**
- Independent review of PRs authored by Claude
- Security review of auth, DB migration, payment PRs
- Alternative implementation proposals
- Verification of acceptance criteria

**Never use for:**
- Implementing features (Codex is reviewer, not implementer)
- Reviewing code Codex participated in authoring

## Target workload distribution

| Agent | Target % | Rationale |
|---|---|---|
| Ollama | 50-60% | Commodity volume at zero cost |
| Claude | 25-35% | Complex work requiring frontier reasoning |
| Codex | 10-15% | Independent review only |
| Human | 5-10% | Approval gates, incident response |

## Cost controls

- Run RTK compression before passing any output > 500 tokens to Claude or Codex
- Prefer Claude Haiku (`claude/fast`) for quick lookups and simple classifications
- Track token spend in Langfuse; alert if weekly Claude spend exceeds threshold
- Monthly cost review: if Ollama < 40% of task volume, investigate routing drift
