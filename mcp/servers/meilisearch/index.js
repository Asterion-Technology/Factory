import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const HOST = process.env.MEILI_HOST;
const KEY  = process.env.MEILI_MASTER_KEY;

if (!HOST || !KEY) {
  process.stderr.write("[factory-meilisearch] MEILI_HOST and MEILI_MASTER_KEY are required\n");
  process.exit(1);
}

const BASE = HOST.replace(/\/$/, "");

async function meili(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meilisearch ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "factory-meilisearch", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_indexes",
      description: "List all Meilisearch indexes with their configurations",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 20)" },
          offset: { type: "number", description: "Pagination offset" }
        }
      }
    },
    {
      name: "get_index_stats",
      description: "Get statistics for a specific index (document count, field distribution, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          index_uid: { type: "string", description: "The index UID" }
        },
        required: ["index_uid"]
      }
    },
    {
      name: "get_index_settings",
      description: "Get the settings for a specific index (searchable attributes, ranking rules, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          index_uid: { type: "string", description: "The index UID" }
        },
        required: ["index_uid"]
      }
    },
    {
      name: "search",
      description: "Search an index and return results",
      inputSchema: {
        type: "object",
        properties: {
          index_uid: { type: "string", description: "The index UID to search" },
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
          filter: { type: "string", description: "Filter expression" },
          sort: { type: "array", items: { type: "string" }, description: "Sort rules (e.g. ['price:asc'])" }
        },
        required: ["index_uid", "query"]
      }
    },
    {
      name: "get_documents",
      description: "Get documents from an index with optional filtering",
      inputSchema: {
        type: "object",
        properties: {
          index_uid: { type: "string", description: "The index UID" },
          limit: { type: "number", description: "Max results (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
          filter: { type: "string", description: "Filter expression" },
          fields: { type: "array", items: { type: "string" }, description: "Fields to include in results" }
        },
        required: ["index_uid"]
      }
    },
    {
      name: "get_health",
      description: "Check Meilisearch instance health and version",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "list_tasks",
      description: "List recent tasks (indexing operations, etc.) with their status",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 20)" },
          index_uids: { type: "array", items: { type: "string" }, description: "Filter by index UIDs" },
          statuses: { type: "array", items: { type: "string" }, description: "Filter by status (enqueued, processing, succeeded, failed)" }
        }
      }
    },
    {
      name: "test_search",
      description: "Run a test search with explanation of how the ranking works",
      inputSchema: {
        type: "object",
        properties: {
          index_uid: { type: "string", description: "The index UID to search" },
          query: { type: "string", description: "Test search query" },
          show_ranking_score: { type: "boolean", description: "Include ranking scores in results" }
        },
        required: ["index_uid", "query"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;

    switch (name) {
      case "list_indexes":
        data = await meili("GET", `/indexes?limit=${args.limit ?? 20}&offset=${args.offset ?? 0}`);
        break;

      case "get_index_stats":
        data = await meili("GET", `/indexes/${args.index_uid}/stats`);
        break;

      case "get_index_settings":
        data = await meili("GET", `/indexes/${args.index_uid}/settings`);
        break;

      case "search":
        data = await meili("POST", `/indexes/${args.index_uid}/search`, {
          q: args.query,
          limit: args.limit ?? 20,
          offset: args.offset ?? 0,
          filter: args.filter,
          sort: args.sort
        });
        break;

      case "get_documents":
        data = await meili("GET", `/indexes/${args.index_uid}/documents?limit=${args.limit ?? 20}&offset=${args.offset ?? 0}${args.filter ? `&filter=${encodeURIComponent(args.filter)}` : ""}${args.fields ? `&fields=${args.fields.join(",")}` : ""}`);
        break;

      case "get_health": {
        const [health, version, stats] = await Promise.all([
          meili("GET", "/health"),
          meili("GET", "/version"),
          meili("GET", "/stats")
        ]);
        data = { health, version, stats };
        break;
      }

      case "list_tasks":
        data = await meili("GET", `/tasks?limit=${args.limit ?? 20}${args.index_uids ? `&indexUids=${args.index_uids.join(",")}` : ""}${args.statuses ? `&statuses=${args.statuses.join(",")}` : ""}`);
        break;

      case "test_search":
        data = await meili("POST", `/indexes/${args.index_uid}/search`, {
          q: args.query,
          showRankingScore: args.show_ranking_score ?? true,
          limit: 5
        });
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
