import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const RESEND_API = "https://api.resend.com";
const API_KEY = process.env.RESEND_API_KEY;

// Sandbox enforcement — test sends must use these addresses only
const SANDBOX_TO = ["delivered@resend.dev", "bounced@resend.dev", "complained@resend.dev"];

if (!API_KEY) {
  process.stderr.write("[factory-resend] RESEND_API_KEY is not set\n");
  process.exit(1);
}

async function resendGet(path) {
  const res = await fetch(`${RESEND_API}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API ${res.status}: ${err}`);
  }
  return res.json();
}

async function resendPost(path, body) {
  const res = await fetch(`${RESEND_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "factory-resend", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_emails",
      description: "List recent emails sent via Resend",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results (default 10, max 100)" }
        }
      }
    },
    {
      name: "get_email",
      description: "Get the details and delivery status of a specific email",
      inputSchema: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The Resend email ID" }
        },
        required: ["email_id"]
      }
    },
    {
      name: "send_test_email",
      description: "Send a test email using Resend sandbox addresses ONLY. The 'to' field is restricted to resend.dev test addresses. No production addresses are accepted.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender address (must be a verified domain in your Resend account)" },
          subject: { type: "string", description: "Email subject" },
          html: { type: "string", description: "HTML email body" },
          text: { type: "string", description: "Plain text email body (optional, recommended alongside html)" },
          sandbox_target: {
            type: "string",
            enum: ["delivered", "bounced", "complained"],
            description: "Sandbox test scenario: 'delivered' simulates success, 'bounced' simulates bounce, 'complained' simulates spam complaint"
          }
        },
        required: ["from", "subject", "html", "sandbox_target"]
      }
    },
    {
      name: "list_domains",
      description: "List all verified sending domains in the Resend account",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "get_domain",
      description: "Get details and DNS verification status for a specific domain",
      inputSchema: {
        type: "object",
        properties: {
          domain_id: { type: "string", description: "The domain ID" }
        },
        required: ["domain_id"]
      }
    },
    {
      name: "list_api_keys",
      description: "List API keys in the Resend account (names and permissions only — keys are not exposed)",
      inputSchema: { type: "object", properties: {} }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;

    switch (name) {
      case "list_emails":
        data = await resendGet(`/emails?limit=${args.limit ?? 10}`);
        break;

      case "get_email":
        data = await resendGet(`/emails/${args.email_id}`);
        break;

      case "send_test_email": {
        const targetMap = {
          delivered: "delivered@resend.dev",
          bounced: "bounced@resend.dev",
          complained: "complained@resend.dev"
        };
        const to = targetMap[args.sandbox_target];
        if (!to) throw new Error(`Invalid sandbox_target: ${args.sandbox_target}. Must be one of: delivered, bounced, complained`);

        data = await resendPost("/emails", {
          from: args.from,
          to: [to],
          subject: `[TEST] ${args.subject}`,
          html: args.html,
          text: args.text,
          tags: [{ name: "environment", value: "sandbox" }, { name: "factory", value: "test" }]
        });
        data._sandbox_note = `Sent to sandbox address: ${to} (scenario: ${args.sandbox_target})`;
        break;
      }

      case "list_domains":
        data = await resendGet("/domains");
        break;

      case "get_domain":
        data = await resendGet(`/domains/${args.domain_id}`);
        break;

      case "list_api_keys":
        data = await resendGet("/api-keys");
        // Scrub any key values — names and permissions only
        if (data.data) {
          data.data = data.data.map(k => ({ id: k.id, name: k.name, permission: k.permission, created_at: k.created_at }));
        }
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
