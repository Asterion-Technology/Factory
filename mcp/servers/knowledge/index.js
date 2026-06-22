/**
 * factory-knowledge MCP Server
 *
 * Provides semantic search and ingestion for the factory knowledge base.
 * Backed by ChromaDB (vector store) + Ollama nomic-embed-text (embeddings).
 *
 * Tools:
 *   search_knowledge       — semantic search over stored documents
 *   ingest_document        — embed and store a single document
 *   list_collections       — list all ChromaDB collections
 *   get_collection_stats   — document count and metadata for a collection
 *
 * Environment:
 *   CHROMA_HOST     ChromaDB base URL (default: http://localhost:8000)
 *   CHROMA_TOKEN    ChromaDB auth token (default: factory-chroma-token)
 *   OLLAMA_HOST     Ollama base URL (default: http://localhost:11434)
 *   EMBED_MODEL     Embedding model (default: nomic-embed-text)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const CHROMA_HOST = process.env.CHROMA_HOST || 'http://localhost:8000';
const CHROMA_TOKEN = process.env.CHROMA_TOKEN || 'factory-chroma-token';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const DEFAULT_COLLECTION = 'factory-knowledge';

// ── ChromaDB REST client ───────────────────────────────────────────────────────
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
    throw new Error(`ChromaDB ${method} /api/v1${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function resolveCollectionId(name) {
  const col = await chromaRequest('GET', `/collections/${encodeURIComponent(name)}`);
  return col.id;
}

async function getOrCreateCollection(name) {
  const col = await chromaRequest('POST', '/collections', {
    name,
    get_or_create: true,
    metadata: { description: 'Factory knowledge base' },
  });
  return col.id;
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
  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error('Ollama returned no embedding vector');
  }
  return data.embedding;
}

// ── Result formatter ──────────────────────────────────────────────────────────
function formatResults(queryResult, n) {
  const { ids, documents, metadatas, distances } = queryResult;
  if (!ids || ids.length === 0 || ids[0].length === 0) {
    return 'No results found.';
  }

  const lines = [`Found ${ids[0].length} result(s):\n`];
  for (let i = 0; i < ids[0].length; i++) {
    const score = distances?.[0]?.[i] != null
      ? `  Similarity: ${(1 - distances[0][i]).toFixed(3)}`
      : '';
    const meta = metadatas?.[0]?.[i] || {};
    const doc = documents?.[0]?.[i] || '';
    lines.push(
      `[${i + 1}] ${meta.title || 'Untitled'}${meta.heading ? ` — ${meta.heading}` : ''}`,
      `  Source: ${meta.source || 'unknown'}`,
      score,
      `  Content:\n${doc.substring(0, 800)}${doc.length > 800 ? '...' : ''}`,
      '',
    );
  }
  return lines.filter(l => l !== '').join('\n');
}

// ── MCP Server ─────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: 'factory-knowledge',
  version: '1.0.0',
});

// search_knowledge ─────────────────────────────────────────────────────────────
server.tool(
  'search_knowledge',
  {
    query: z.string().min(3).describe('The search query — use natural language or keywords'),
    collection: z.string().optional().default(DEFAULT_COLLECTION).describe('ChromaDB collection to search (default: factory-knowledge)'),
    n_results: z.number().int().min(1).max(20).optional().default(5).describe('Number of results to return (default: 5)'),
  },
  async ({ query, collection = DEFAULT_COLLECTION, n_results = 5 }) => {
    let collectionId;
    try {
      collectionId = await resolveCollectionId(collection);
    } catch {
      return {
        content: [{
          type: 'text',
          text: `Collection "${collection}" not found. Run the ingestion pipeline first:\n  node knowledge/ingest.js`,
        }],
      };
    }

    const queryEmbedding = await embed(query);

    const result = await chromaRequest('POST', `/collections/${collectionId}/query`, {
      query_embeddings: [queryEmbedding],
      n_results,
      include: ['documents', 'metadatas', 'distances'],
    });

    return {
      content: [{
        type: 'text',
        text: formatResults(result, n_results),
      }],
    };
  },
);

// ingest_document ─────────────────────────────────────────────────────────────
server.tool(
  'ingest_document',
  {
    content: z.string().min(1).describe('The document text to store'),
    title: z.string().describe('Document title (used in search results)'),
    source: z.string().describe('Origin path or identifier (e.g. "docs/architecture/ADR-001.md")'),
    collection: z.string().optional().default(DEFAULT_COLLECTION).describe('Target collection (default: factory-knowledge)'),
    tags: z.array(z.string()).optional().describe('Optional tags for filtering'),
  },
  async ({ content, title, source, collection = DEFAULT_COLLECTION, tags = [] }) => {
    const collectionId = await getOrCreateCollection(collection);

    const embedding = await embed(content);

    const id = `${source}::${Date.now()}`.replace(/[^a-zA-Z0-9_:.-]/g, '_');
    await chromaRequest('POST', `/collections/${collectionId}/add`, {
      ids: [id],
      embeddings: [embedding],
      documents: [content],
      metadatas: [{
        title,
        source,
        tags: tags.join(','),
        ingested_at: new Date().toISOString(),
        model: EMBED_MODEL,
      }],
    });

    return {
      content: [{
        type: 'text',
        text: `Document ingested.\n  ID: ${id}\n  Collection: ${collection}\n  Title: ${title}\n  Source: ${source}`,
      }],
    };
  },
);

// list_collections ─────────────────────────────────────────────────────────────
server.tool(
  'list_collections',
  {},
  async () => {
    let collections;
    try {
      collections = await chromaRequest('GET', '/collections');
    } catch (err) {
      return {
        content: [{
          type: 'text',
          text: `ChromaDB unreachable: ${err.message}\nStart it with: docker compose -f knowledge/docker-compose.yml up -d`,
        }],
      };
    }

    if (!collections || collections.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No collections found. Run the ingestion pipeline to create the knowledge base:\n  node knowledge/ingest.js',
        }],
      };
    }

    const lines = ['ChromaDB collections:\n'];
    for (const col of collections) {
      lines.push(`  ${col.name}`);
      if (col.metadata?.description) {
        lines.push(`    ${col.metadata.description}`);
      }
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// get_collection_stats ─────────────────────────────────────────────────────────
server.tool(
  'get_collection_stats',
  {
    collection: z.string().optional().default(DEFAULT_COLLECTION).describe('Collection name (default: factory-knowledge)'),
  },
  async ({ collection = DEFAULT_COLLECTION }) => {
    let collectionId;
    try {
      collectionId = await resolveCollectionId(collection);
    } catch {
      return {
        content: [{
          type: 'text',
          text: `Collection "${collection}" not found. Run: node knowledge/ingest.js`,
        }],
      };
    }

    const countResult = await chromaRequest('GET', `/collections/${collectionId}/count`);
    const count = typeof countResult === 'number' ? countResult : countResult?.count ?? 0;

    return {
      content: [{
        type: 'text',
        text: [
          `Collection: ${collection}`,
          `Document chunks: ${count}`,
          `Embedding model: ${EMBED_MODEL}`,
          `ChromaDB: ${CHROMA_HOST}`,
        ].join('\n'),
      }],
    };
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
