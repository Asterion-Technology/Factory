import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// id.me uses OAuth 2.0. This server operates in inspection/read mode only.
// No production modifications are permitted.
const IDME_API = "https://api.id.me/api/public/v3";
const IDME_KEY = process.env.IDME_API_KEY;

if (!IDME_KEY) {
  process.stderr.write("[factory-idme] IDME_API_KEY is not set\n");
  process.exit(1);
}

async function idmeGet(path, params = {}) {
  const url = new URL(`${IDME_API}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${IDME_KEY}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`id.me API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "factory-idme", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_verification_status",
      description: "Inspect the identity verification status for a user UUID. Read-only — no production modifications.",
      inputSchema: {
        type: "object",
        properties: {
          uuid: { type: "string", description: "The id.me user UUID to inspect" }
        },
        required: ["uuid"]
      }
    },
    {
      name: "list_groups",
      description: "List all available id.me affinity groups and verification policies",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number (default 1)" },
          per_page: { type: "number", description: "Results per page (default 25)" }
        }
      }
    },
    {
      name: "get_group",
      description: "Get details for a specific id.me affinity group (e.g. military, student, teacher)",
      inputSchema: {
        type: "object",
        properties: {
          group: { type: "string", description: "Group name (e.g. military, student, teacher, nurse)" }
        },
        required: ["group"]
      }
    },
    {
      name: "inspect_policy",
      description: "Inspect a verification policy configuration including required documents and eligibility criteria",
      inputSchema: {
        type: "object",
        properties: {
          policy_id: { type: "string", description: "The policy ID to inspect" }
        },
        required: ["policy_id"]
      }
    },
    {
      name: "get_application_config",
      description: "Get the current id.me application configuration (scopes, redirect URIs, allowed groups). Read-only.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;

    switch (name) {
      case "get_verification_status":
        data = await idmeGet(`/users/${args.uuid}`);
        break;

      case "list_groups":
        data = await idmeGet("/groups", {
          page: args.page ?? 1,
          per_page: args.per_page ?? 25
        });
        break;

      case "get_group":
        data = await idmeGet(`/groups/${encodeURIComponent(args.group)}`);
        break;

      case "inspect_policy":
        data = await idmeGet(`/policies/${args.policy_id}`);
        break;

      case "get_application_config":
        data = await idmeGet("/applications/current");
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
