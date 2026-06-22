import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const HOST  = (process.env.SONAR_HOST_URL ?? "").replace(/\/$/, "");
const TOKEN = process.env.SONAR_TOKEN;

if (!HOST || !TOKEN) {
  process.stderr.write("[factory-sonarqube] SONAR_HOST_URL and SONAR_TOKEN are required\n");
  process.exit(1);
}

// SonarQube uses HTTP Basic auth: token as username, empty password
const AUTH = Buffer.from(`${TOKEN}:`).toString("base64");

async function sonarGet(path, params = {}) {
  const url = new URL(`${HOST}/api${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${AUTH}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SonarQube API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "factory-sonarqube", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_projects",
      description: "List all SonarQube projects with their quality gate status",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query to filter projects" },
          page: { type: "number", description: "Page number (default 1)" },
          page_size: { type: "number", description: "Results per page (default 20)" }
        }
      }
    },
    {
      name: "get_quality_gate_status",
      description: "Get the quality gate pass/fail status for a project",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string", description: "SonarQube project key" },
          branch: { type: "string", description: "Branch name (optional)" },
          pull_request: { type: "string", description: "Pull request ID (optional)" }
        },
        required: ["project_key"]
      }
    },
    {
      name: "get_issues",
      description: "Get code quality issues for a project with filtering",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string", description: "SonarQube project key" },
          severities: { type: "string", description: "Comma-separated severities: BLOCKER,CRITICAL,MAJOR,MINOR,INFO" },
          types: { type: "string", description: "Comma-separated types: BUG,VULNERABILITY,CODE_SMELL,SECURITY_HOTSPOT" },
          statuses: { type: "string", description: "Comma-separated statuses: OPEN,CONFIRMED,RESOLVED,REOPENED" },
          page: { type: "number", description: "Page number (default 1)" },
          page_size: { type: "number", description: "Results per page (default 25, max 500)" }
        },
        required: ["project_key"]
      }
    },
    {
      name: "get_metrics",
      description: "Get specific metrics for a project (bugs, code smells, coverage, duplications, tech debt)",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string", description: "SonarQube project key" },
          metrics: { type: "string", description: "Comma-separated metric keys. Leave empty for defaults: bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,sqale_debt_ratio,reliability_rating,security_rating,sqale_rating" }
        },
        required: ["project_key"]
      }
    },
    {
      name: "get_security_hotspots",
      description: "Get security hotspots that require manual review",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string", description: "SonarQube project key" },
          status: { type: "string", enum: ["TO_REVIEW", "REVIEWED"], description: "Filter by hotspot status" },
          page: { type: "number", description: "Page number" }
        },
        required: ["project_key"]
      }
    },
    {
      name: "get_project_analyses",
      description: "Get recent analysis history for a project",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string", description: "SonarQube project key" },
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Results per page (default 10)" }
        },
        required: ["project_key"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const DEFAULT_METRICS = "bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,sqale_debt_ratio,reliability_rating,security_rating,sqale_rating";

  try {
    let data;

    switch (name) {
      case "list_projects":
        data = await sonarGet("/projects/search", {
          q: args.query,
          p: args.page ?? 1,
          ps: args.page_size ?? 20
        });
        break;

      case "get_quality_gate_status":
        data = await sonarGet("/qualitygates/project_status", {
          projectKey: args.project_key,
          branch: args.branch,
          pullRequest: args.pull_request
        });
        break;

      case "get_issues":
        data = await sonarGet("/issues/search", {
          componentKeys: args.project_key,
          severities: args.severities,
          types: args.types,
          statuses: args.statuses,
          p: args.page ?? 1,
          ps: args.page_size ?? 25
        });
        break;

      case "get_metrics":
        data = await sonarGet("/measures/component", {
          component: args.project_key,
          metricKeys: args.metrics ?? DEFAULT_METRICS
        });
        break;

      case "get_security_hotspots":
        data = await sonarGet("/hotspots/search", {
          projectKey: args.project_key,
          status: args.status,
          p: args.page ?? 1,
          ps: 25
        });
        break;

      case "get_project_analyses":
        data = await sonarGet("/project_analyses/search", {
          project: args.project_key,
          p: args.page ?? 1,
          ps: args.page_size ?? 10
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
