/**
 * factory-ollama MCP Server
 *
 * Gives Claude a callable surface for LOCAL models — the missing piece that
 * made "route commodity tasks to Ollama" a documentation-only policy. Use these
 * tools for summarization, context compression, changelog drafting, and other
 * commodity text work to keep frontier-token spend down.
 *
 * Tools:
 *   list_models       — models available on the local Ollama host
 *   ollama_generate   — raw generation on a local model
 *   summarize_text    — summarize long text locally
 *   compress_context  — RTK-style ~70% compression of logs/diffs
 *   draft_changelog   — draft a changelog entry from a diff or commit log
 *
 * Environment:
 *   OLLAMA_HOST   Ollama base URL (default: http://localhost:11434)
 *   RTK_MODEL     default model (default: mistral:7b)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.RTK_MODEL || 'mistral:7b';
const EVENT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dashboards', 'observation-deck', 'events.jsonl');

async function generate(model, prompt, system, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, system, stream: false }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama /api/generate → ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data.response) throw new Error('Ollama returned an empty response');
    return data.response;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`Ollama timed out after ${timeoutMs / 1000}s — is the model pulled and the host warm?`);
    throw new Error(`Ollama unreachable at ${OLLAMA_HOST}: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

function words(s) { return s.split(/\s+/).filter(Boolean).length; }

function emitRtkEvent(inputTokens, outputTokens, model) {
  try {
    const pct = inputTokens > outputTokens ? Math.round(((inputTokens - outputTokens) * 100) / inputTokens) : 0;
    fs.appendFileSync(EVENT_FILE, JSON.stringify({ ts: new Date().toISOString(), type: 'rtk', input_tokens: inputTokens, output_tokens: outputTokens, reduction_pct: pct, model }) + '\n', 'utf8');
  } catch { /* dashboard logging is best-effort */ }
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });

const server = new McpServer({ name: 'factory-ollama', version: '1.0.0' });

server.tool(
  'list_models',
  {},
  async () => {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`).catch(() => null);
    if (!res || !res.ok) return text(`Ollama unreachable at ${OLLAMA_HOST} — run "start Factory" or "ollama serve".`);
    const data = await res.json();
    const models = (data.models || []).map((m) => `${m.name} (${(m.size / 1e9).toFixed(1)}GB)`);
    return text(models.length ? `Local models:\n${models.join('\n')}` : 'No models pulled yet — ollama pull mistral:7b');
  },
);

server.tool(
  'ollama_generate',
  {
    prompt: z.string().min(1).describe('The prompt to run on the local model'),
    model: z.string().optional().describe(`Model name (default: ${DEFAULT_MODEL}; codellama:7b for code)`),
    system: z.string().optional().describe('Optional system prompt'),
  },
  async ({ prompt, model = DEFAULT_MODEL, system }) => text(await generate(model, prompt, system)),
);

server.tool(
  'summarize_text',
  {
    text: z.string().min(1).describe('The text to summarize'),
    max_words: z.number().int().min(20).max(1000).optional().default(150).describe('Target summary length in words (default 150)'),
    model: z.string().optional().describe(`Model name (default: ${DEFAULT_MODEL})`),
  },
  async ({ text: input, max_words = 150, model = DEFAULT_MODEL }) => {
    const out = await generate(model, `Summarize the following in at most ${max_words} words. Preserve error messages, file paths, and decisions verbatim. Output only the summary.\n\n${input}`);
    return text(out);
  },
);

server.tool(
  'compress_context',
  {
    text: z.string().min(1).describe('Logs, diffs, or verbose output to compress ~70% while keeping all actionable content'),
    model: z.string().optional().describe(`Model name (default: ${DEFAULT_MODEL})`),
  },
  async ({ text: input, model = DEFAULT_MODEL }) => {
    const out = await generate(model, `You are a context compression engine. Reduce the following technical output to its essential information only.

Rules:
- Preserve all error messages, stack traces, and security findings verbatim
- Preserve all file paths, line numbers, and function names
- Collapse repeated log lines: instead of 20 identical lines, write 'x20: <line>'
- Strip timestamps and process IDs
- Target: 70% token reduction while preserving all actionable content
- Output only the compressed content — no preamble

INPUT:
${input}`);
    emitRtkEvent(words(input), words(out), model);
    return text(out);
  },
);

server.tool(
  'draft_changelog',
  {
    diff_or_log: z.string().min(1).describe('A git diff or commit log to turn into a changelog entry'),
    model: z.string().optional().describe(`Model name (default: ${DEFAULT_MODEL})`),
  },
  async ({ diff_or_log, model = DEFAULT_MODEL }) => {
    const out = await generate(model, `Write a concise CHANGELOG entry (markdown bullet list, grouped Added/Changed/Fixed as applicable) for the following changes. Output only the entry.\n\n${diff_or_log}`);
    return text(out);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
