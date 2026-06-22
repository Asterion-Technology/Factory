import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";

const SNYK_API = "https://api.snyk.io";
const SNYK_TOKEN = process.env.SNYK_TOKEN;

if (!SNYK_TOKEN) {
  process.stderr.write("[factory-snyk] SNYK_TOKEN is not set\n");
  process.exit(1);
}

async function snykGet(path, version = "2024-10-15") {
  const res = await fetch(`${SNYK_API}/rest${path}${path.includes("?") ? "&" : "?"}version=${version}`, {
    headers: {
      Authorization: `token ${SNYK_TOKEN}`,
      Accept: "application/vnd.api+json"
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Snyk API ${res.status}: ${err}`);
  }
  return res.json();
}

async function snykV1Get(path) {
  const res = await fetch(`${SNYK_API}/v1${path}`, {
    headers: {
      Authorization: `token ${SNYK_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Snyk v1 API ${res.status}: ${err}`);
  }
  return res.json();
}

function runSnykCli(args) {
  try {
    const result = execSync(`snyk ${args} --json 2>&1`, {
      env: { ...process.env, SNYK_TOKEN },
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024
    });
    return JSON.parse(result.toString());
  } catch (err) {
    // Snyk CLI exits non-zero when vulnerabilities are found — that's expected
    if (err.stdout) {
      try { return JSON.parse(err.stdout.toString()); } catch {}
    }
    throw new Error(`Snyk CLI error: ${err.message}`);
  }
}

const server = new Server(
  { name: "factory-snyk", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_projects",
      description: "List all Snyk projects in the organization",
      inputSchema: {
        type: "object",
        properties: {
          org_id: { type: "string", description: "Snyk organization ID (from Snyk settings)" },
          limit: { type: "number", description: "Max results (default 25)" }
        },
        required: ["org_id"]
      }
    },
    {
      name: "get_project_issues",
      description: "Get open security issues for a specific Snyk project",
      inputSchema: {
        type: "object",
        properties: {
          org_id: { type: "string", description: "Snyk organization ID" },
          project_id: { type: "string", description: "Snyk project ID" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"], description: "Minimum severity filter" }
        },
        required: ["org_id", "project_id"]
      }
    },
    {
      name: "scan_directory",
      description: "Run a Snyk dependency vulnerability scan on a local directory (scan-only, no fixes applied)",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the directory to scan" },
          severity_threshold: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Only report at this severity and above (default: high)" },
          all_projects: { type: "boolean", description: "Scan all projects in monorepo" }
        },
        required: ["path"]
      }
    },
    {
      name: "scan_container",
      description: "Scan a container image for vulnerabilities (scan-only)",
      inputSchema: {
        type: "object",
        properties: {
          image: { type: "string", description: "Container image name and tag (e.g. nginx:1.25)" },
          severity_threshold: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Minimum severity to report (default: high)" }
        },
        required: ["image"]
      }
    },
    {
      name: "get_organization",
      description: "Get details about the Snyk organization",
      inputSchema: {
        type: "object",
        properties: {
          org_id: { type: "string", description: "Snyk organization ID" }
        },
        required: ["org_id"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;

    switch (name) {
      case "list_projects":
        data = await snykGet(`/orgs/${args.org_id}/projects?limit=${args.limit ?? 25}`);
        break;

      case "get_project_issues":
        data = await snykGet(
          `/orgs/${args.org_id}/issues?project_id=${args.project_id}${args.severity ? `&effective_severity_level=${args.severity}` : ""}&limit=100`
        );
        break;

      case "scan_directory": {
        const threshold = args.severity_threshold ?? "high";
        const allProjects = args.all_projects ? "--all-projects" : "";
        data = runSnykCli(`test ${args.path} --severity-threshold=${threshold} ${allProjects}`);
        break;
      }

      case "scan_container":
        data = runSnykCli(`container test ${args.image} --severity-threshold=${args.severity_threshold ?? "high"}`);
        break;

      case "get_organization":
        data = await snykV1Get(`/org/${args.org_id}`);
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
