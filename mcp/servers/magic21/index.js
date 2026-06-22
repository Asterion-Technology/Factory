import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Magic21 base URL — update if the API base changes
const MAGIC21_API = process.env.MAGIC21_API_BASE ?? "https://api.magic21.ai/v1";
const API_KEY = process.env.MAGIC21_API_KEY;

if (!API_KEY) {
  process.stderr.write("[factory-magic21] MAGIC21_API_KEY is not set\n");
  process.exit(1);
}

async function m21(method, path, body) {
  const res = await fetch(`${MAGIC21_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Magic21 API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "factory-magic21", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_capabilities",
      description: "List all available Magic21 API capabilities and endpoints",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "execute_api",
      description: "Execute a Magic21 API call with the specified endpoint, method, and payload",
      inputSchema: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "API endpoint path (e.g. /generate, /analyze, /transform)" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH"], description: "HTTP method (default: POST)" },
          payload: { type: "object", description: "Request payload (for POST/PUT/PATCH)" },
          params: { type: "object", description: "Query parameters (for GET)" }
        },
        required: ["endpoint"]
      }
    },
    {
      name: "generate_ui_component",
      description: "Generate a UI component specification or code using Magic21 AI tooling",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "Natural language description of the UI component to generate" },
          framework: { type: "string", enum: ["react", "vue", "html", "tailwind"], description: "Target framework (default: react)" },
          style: { type: "string", description: "Design style or constraints (e.g. 'dark theme', 'matches existing design system', 'accessible')" },
          reference_component: { type: "string", description: "Existing component to match or extend (optional)" }
        },
        required: ["description"]
      }
    },
    {
      name: "analyze_design",
      description: "Analyze a design or UI specification and extract component requirements",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Design description, Figma spec text, or UI requirements to analyze" },
          output_format: { type: "string", enum: ["components", "wireframe", "requirements", "accessibility"], description: "Analysis output type (default: components)" }
        },
        required: ["input"]
      }
    },
    {
      name: "transform_content",
      description: "Transform content using Magic21 AI (e.g. reformat, translate, summarize, convert format)",
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Input content to transform" },
          instruction: { type: "string", description: "Transformation instruction (e.g. 'convert to JSON', 'summarize in 3 sentences', 'translate to Spanish')" },
          output_format: { type: "string", description: "Expected output format (optional)" }
        },
        required: ["input", "instruction"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;

    switch (name) {
      case "list_capabilities":
        data = await m21("GET", "/capabilities");
        break;

      case "execute_api": {
        const method = args.method ?? "POST";
        const path = args.endpoint.startsWith("/") ? args.endpoint : `/${args.endpoint}`;
        if (method === "GET" && args.params) {
          const qs = new URLSearchParams(args.params).toString();
          data = await m21("GET", `${path}?${qs}`);
        } else {
          data = await m21(method, path, args.payload);
        }
        break;
      }

      case "generate_ui_component":
        data = await m21("POST", "/generate/component", {
          description: args.description,
          framework: args.framework ?? "react",
          style: args.style,
          reference: args.reference_component
        });
        break;

      case "analyze_design":
        data = await m21("POST", "/analyze/design", {
          input: args.input,
          output_format: args.output_format ?? "components"
        });
        break;

      case "transform_content":
        data = await m21("POST", "/transform", {
          input: args.input,
          instruction: args.instruction,
          output_format: args.output_format
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
