import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const CLERK_API = "https://api.clerk.com/v1";
const SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!SECRET_KEY) {
  process.stderr.write("[factory-clerk] CLERK_SECRET_KEY is not set\n");
  process.exit(1);
}

async function clerkGet(path, params = {}) {
  const url = new URL(`${CLERK_API}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${SECRET_KEY}`, "Content-Type": "application/json" }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Clerk API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "factory-clerk", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_users",
      description: "List users in the Clerk application with optional filtering",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 20, max 500)" },
          offset: { type: "number", description: "Pagination offset" },
          email_address: { type: "string", description: "Filter by email address" },
          username: { type: "string", description: "Filter by username" },
          query: { type: "string", description: "Search query across name/email/username" }
        }
      }
    },
    {
      name: "lookup_user",
      description: "Get a single user by their Clerk user ID",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Clerk user ID (user_...)" }
        },
        required: ["user_id"]
      }
    },
    {
      name: "get_session",
      description: "Inspect a specific session by session ID",
      inputSchema: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Clerk session ID (sess_...)" }
        },
        required: ["session_id"]
      }
    },
    {
      name: "list_sessions",
      description: "List sessions with optional filtering by user or status",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Filter sessions by user ID" },
          status: { type: "string", enum: ["active", "revoked", "ended", "expired", "removed", "abandoned"], description: "Filter by session status" },
          limit: { type: "number", description: "Max results (default 20)" }
        }
      }
    },
    {
      name: "get_organization",
      description: "Get an organization by its ID",
      inputSchema: {
        type: "object",
        properties: {
          organization_id: { type: "string", description: "Clerk organization ID (org_...)" }
        },
        required: ["organization_id"]
      }
    },
    {
      name: "list_organizations",
      description: "List all organizations in the application",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 20)" },
          query: { type: "string", description: "Search query" }
        }
      }
    },
    {
      name: "get_organization_memberships",
      description: "List members of an organization",
      inputSchema: {
        type: "object",
        properties: {
          organization_id: { type: "string", description: "Clerk organization ID" },
          limit: { type: "number", description: "Max results (default 20)" }
        },
        required: ["organization_id"]
      }
    },
    {
      name: "get_instance_settings",
      description: "Get the Clerk instance configuration and auth settings (read-only)",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;

    switch (name) {
      case "list_users":
        data = await clerkGet("/users", {
          limit: args.limit ?? 20,
          offset: args.offset,
          email_address: args.email_address,
          username: args.username,
          query: args.query
        });
        break;

      case "lookup_user":
        data = await clerkGet(`/users/${args.user_id}`);
        break;

      case "get_session":
        data = await clerkGet(`/sessions/${args.session_id}`);
        break;

      case "list_sessions":
        data = await clerkGet("/sessions", {
          user_id: args.user_id,
          status: args.status,
          limit: args.limit ?? 20
        });
        break;

      case "get_organization":
        data = await clerkGet(`/organizations/${args.organization_id}`);
        break;

      case "list_organizations":
        data = await clerkGet("/organizations", {
          limit: args.limit ?? 20,
          query: args.query
        });
        break;

      case "get_organization_memberships":
        data = await clerkGet(`/organizations/${args.organization_id}/memberships`, {
          limit: args.limit ?? 20
        });
        break;

      case "get_instance_settings":
        data = await clerkGet("/instance");
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
