#!/usr/bin/env node
/**
 * Factory Knowledge Base Ingestion
 *
 * Walks markdown files from specified directories, chunks by heading,
 * embeds each chunk using Ollama nomic-embed-text, and stores in ChromaDB.
 *
 * Usage:
 *   node ingest.js [--dir <path>] [--collection <name>] [--clear]
 *   node ingest.js --dir ../docs --dir ../policies
 *
 * Environment:
 *   CHROMA_HOST       ChromaDB base URL (default: http://localhost:8000)
 *   CHROMA_TOKEN      ChromaDB auth token (default: factory-chroma-token)
 *   OLLAMA_HOST       Ollama base URL (default: http://localhost:11434)
 *   EMBED_MODEL       Embedding model (default: nomic-embed-text)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHROMA_HOST = process.env.CHROMA_HOST || 'http://localhost:8000';
const CHROMA_TOKEN = process.env.CHROMA_TOKEN || 'factory-chroma-token';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const DEFAULT_COLLECTION = 'factory-knowledge';

// ── CLI args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dirs = [];
let collection = DEFAULT_COLLECTION;
let clearCollection = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir' && args[i + 1]) { dirs.push(args[++i]); }
  else if (args[i] === '--collection' && args[i + 1]) { collection = args[++i]; }
  else if (args[i] === '--clear') { clearCollection = true; }
}

if (dirs.length === 0) {
  dirs.push(
    join(__dirname, '..', 'docs'),
    join(__dirname, '..', 'policies'),
    join(__dirname, '..', 'agents'),
    join(__dirname, '..', 'prompts'),
  );
}

// ── ChromaDB helpers ───────────────────────────────────────────────────────────
async function chromaRequest(method, path, body) {
  const res = await fetch(`${CHROMA_HOST}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHROMA_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ChromaDB ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function getOrCreateCollection(name) {
  const result = await chromaRequest('POST', '/collections', {
    name,
    get_or_create: true,
    metadata: { description: 'Factory knowledge base — ADRs, threat models, runbooks, policies' },
  });
  return result.id;
}

async function deleteCollection(name) {
  try {
    await chromaRequest('DELETE', `/collections/${name}`);
    console.log(`[ok]  Cleared collection: ${name}`);
  } catch {
    // Collection didn't exist — that's fine
  }
}

async function addToCollection(collectionId, ids, embeddings, documents, metadatas) {
  await chromaRequest('POST', `/collections/${collectionId}/add`, {
    ids,
    embeddings,
    documents,
    metadatas,
  });
}

// ── Ollama embedding ──────────────────────────────────────────────────────────
async function embed(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embed → ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.embedding;
}

// ── Document chunking ─────────────────────────────────────────────────────────
/**
 * Split markdown by headings (##, ###). Returns array of {heading, content}.
 * If no headings, returns the whole file as a single chunk.
 */
function chunkByHeadings(text, maxWords = 400) {
  const lines = text.split('\n');
  const chunks = [];
  let currentHeading = '';
  let currentLines = [];

  const flush = () => {
    const content = currentLines.join('\n').trim();
    if (content.length > 10) {
      // Sub-chunk if too long
      const words = content.split(/\s+/);
      if (words.length > maxWords) {
        for (let i = 0; i < words.length; i += maxWords) {
          chunks.push({
            heading: currentHeading,
            content: words.slice(i, i + maxWords).join(' '),
            subChunk: Math.floor(i / maxWords),
          });
        }
      } else {
        chunks.push({ heading: currentHeading, content, subChunk: 0 });
      }
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (/^#{1,3} /.test(line)) {
      flush();
      currentHeading = line.replace(/^#+\s*/, '');
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return chunks;
}

// ── File walker ───────────────────────────────────────────────────────────────
function walkMarkdown(dir) {
  const files = [];
  if (!statSync(dir, { throwIfNoEntry: false })) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdown(full));
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      files.push(full);
    }
  }
  return files;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('── Factory Knowledge Base Ingestion ─────────────────');
  console.log(`  ChromaDB: ${CHROMA_HOST}`);
  console.log(`  Ollama:   ${OLLAMA_HOST}`);
  console.log(`  Model:    ${EMBED_MODEL}`);
  console.log(`  Collection: ${collection}`);
  console.log('');

  // Health checks
  try {
    await fetch(`${CHROMA_HOST}/api/v1/heartbeat`);
  } catch {
    console.error('[fail] ChromaDB is not reachable. Run: docker compose -f knowledge/docker-compose.yml up -d');
    process.exit(1);
  }

  try {
    await fetch(`${OLLAMA_HOST}/api/tags`);
  } catch {
    console.error('[fail] Ollama is not reachable. Ensure Ollama is running with nomic-embed-text pulled.');
    process.exit(1);
  }

  // Verify embedding model is available
  try {
    const tags = await (await fetch(`${OLLAMA_HOST}/api/tags`)).json();
    const hasModel = tags.models?.some(m => m.name.startsWith(EMBED_MODEL));
    if (!hasModel) {
      console.log(`[warn] ${EMBED_MODEL} not found in Ollama. Pulling now...`);
      await fetch(`${OLLAMA_HOST}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: EMBED_MODEL, stream: false }),
      });
      console.log(`[ok]  ${EMBED_MODEL} pulled`);
    }
  } catch (err) {
    console.warn(`[warn] Could not verify embedding model: ${err.message}`);
  }

  if (clearCollection) {
    await deleteCollection(collection);
  }

  const collectionId = await getOrCreateCollection(collection);
  console.log(`[ok]  Collection ready: ${collection} (${collectionId})`);
  console.log('');

  // Collect files
  const allFiles = [];
  for (const dir of dirs) {
    allFiles.push(...walkMarkdown(dir));
  }
  console.log(`[scan] Found ${allFiles.length} markdown files`);

  let totalChunks = 0;
  let skipped = 0;

  for (const filePath of allFiles) {
    const label = relative(process.cwd(), filePath);
    let text;
    try {
      text = readFileSync(filePath, 'utf8');
    } catch {
      console.warn(`[skip] Cannot read: ${label}`);
      skipped++;
      continue;
    }

    const chunks = chunkByHeadings(text);
    if (chunks.length === 0) {
      console.log(`[skip] ${label} — empty`);
      skipped++;
      continue;
    }

    process.stdout.write(`[embed] ${label} (${chunks.length} chunks)...`);

    const ids = [];
    const embeddings = [];
    const documents = [];
    const metadatas = [];

    for (let i = 0; i < chunks.length; i++) {
      const { heading, content, subChunk } = chunks[i];
      const id = `${label}::${i}::${subChunk}`.replace(/[^a-zA-Z0-9_:.-]/g, '_');
      let vec;
      try {
        vec = await embed(content);
      } catch (err) {
        console.warn(`\n[warn] Embedding failed for chunk ${i} of ${label}: ${err.message}`);
        continue;
      }

      ids.push(id);
      embeddings.push(vec);
      documents.push(content);
      metadatas.push({
        source: label,
        title: basename(filePath, '.md'),
        heading: heading || basename(filePath, '.md'),
        chunk_index: i,
        ingested_at: new Date().toISOString(),
      });
    }

    if (ids.length > 0) {
      try {
        await addToCollection(collectionId, ids, embeddings, documents, metadatas);
        totalChunks += ids.length;
        console.log(` done`);
      } catch (err) {
        console.warn(`\n[warn] Failed to store ${label}: ${err.message}`);
      }
    } else {
      console.log(` skipped (all chunks failed)`);
    }
  }

  console.log('');
  console.log(`[ok]  Ingestion complete`);
  console.log(`      Files processed: ${allFiles.length - skipped}`);
  console.log(`      Chunks stored:   ${totalChunks}`);
  console.log(`      Collection:      ${collection}`);
  console.log('');
  console.log('      Claude can now query the knowledge base via the factory-knowledge MCP server.');
}

main().catch(err => {
  console.error('[fail]', err.message);
  process.exit(1);
});
