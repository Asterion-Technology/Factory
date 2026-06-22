# Agent: Ollama Cluster — Commodity Task Execution

## Identity

**Models**: mistral:7b (primary), codellama:7b (code tasks), nomic-embed-text (embeddings)  
**Role**: Commodity Task Execution, Cost Reduction  
**Tier**: Commodity (Tier 1)  
**Host**: `${OLLAMA_HOST}` (default: http://localhost:11434)

## Purpose

Ollama handles high-volume, low-complexity tasks locally at zero API cost. The goal is to keep 50-70% of total task volume on Ollama, reserving Claude for tasks that genuinely require frontier-model capability.

## Task routing to Ollama

Route to Ollama when the task is:

| Task type | Model |
|---|---|
| Documentation writing | mistral:7b |
| README and changelog generation | mistral:7b |
| Linear issue / ticket summarization | mistral:7b |
| Log compression and summarization (RTK) | mistral:7b |
| Unit test stub generation from existing patterns | codellama:7b |
| Code comment generation | codellama:7b |
| Knowledge base document ingestion (embedding) | nomic-embed-text |
| Similarity search over ADRs, threat models, postmortems | nomic-embed-text |

## Fallback

If Ollama fails or returns unusable output **twice** on the same task, automatically escalate to Claude (Tier 2). Do not retry more than twice. Do not prompt the user — escalate silently.

## Model config

Accessed via LiteLLM proxy at `${LITELLM_HOST}` (default: http://localhost:4000):

- `ollama/mistral` — general commodity tasks
- `ollama/codellama` — code-adjacent commodity tasks

Direct Ollama API also available at `${OLLAMA_HOST}/api/generate` for scripts that bypass LiteLLM (e.g., `scripts/rtk-compress.sh`).

## Models to pull on setup

```bash
ollama pull mistral:7b
ollama pull codellama:7b
ollama pull nomic-embed-text
```

## Preferred models per context.md

Qwen Coder, DeepSeek Coder, Llama, Mistral, Phi — any of these are acceptable alternatives if the preferred models above are unavailable. Confirm outputs before passing to downstream tasks.
