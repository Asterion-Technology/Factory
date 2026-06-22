import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";

const SEMGREP_APP_API = "https://semgrep.dev/api/v1";
const APP_TOKEN = process.env.SEMGREP_APP_TOKEN;

// App token is optional — local scans work without it
if (!APP_TOKEN) {
  process.stderr.write("[factory-semgrep] SEMGREP_APP_TOKEN not set — local scans available, App API disabled\n");
}

async function semgrepAppGet(path) {
  if (!APP_TOKEN) throw new Error("SEMGREP_APP_TOKEN is required for Semgrep App API calls");
  const res = await fetch(`${SEMGREP_APP_API}${path}`, {
    headers: {
      Authorization: `Bearer ${APP_TOKEN}`,
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Semgrep App API ${res.status}: ${err}`);
  }
  return res.json();
}

function runSemgrep(args) {
  try {
    const result = execSync(`semgrep ${args} --json 2>/dev/null`, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024
    });
    return JSON.parse(result.toString());
  } catch (err) {
    // Semgrep exits 1 when findings exist — parse stdout anyway
    if (err.stdout) {
      try { return JSON.parse(err.stdout.toString()); } catch {}
    }
    throw new Error(`Semgrep error: ${err.message}`);
  }
}

const server = new Server(
  { name: "factory-semgrep", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "scan_directory",
      description: "Run a Semgrep SAST scan on a local directory using a ruleset",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the directory to scan" },
          config: { type: "string", description: "Semgrep config/ruleset (default: 'auto'). Can be 'p/owasp-top-ten', 'p/security-audit', 'p/secrets', a rule ID, or a local .yml file path" },
          severity: { type: "string", enum: ["INFO", "WARNING", "ERROR"], description: "Minimum severity to report" },
          include: { type: "string", description: "File glob pattern to include (e.g. '*.ts')" },
          exclude: { type: "string", description: "File glob pattern to exclude" }
        },
        required: ["path"]
      }
    },
    {
      name: "scan_file",
      description: "Run Semgrep on a single file",
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Absolute path to the file" },
          config: { type: "string", description: "Semgrep ruleset (default: 'auto')" }
        },
        required: ["file_path"]
      }
    },
    {
      name: "get_app_findings",
      description: "Retrieve findings from Semgrep App for a specific deployment (requires SEMGREP_APP_TOKEN)",
      inputSchema: {
        type: "object",
        properties: {
          deployment_slug: { type: "string", description: "Semgrep deployment slug" },
          severity: { type: "string", description: "Filter by severity (high, medium, low)" },
          status: { type: "string", enum: ["open", "ignored", "fixed"], description: "Filter by finding status" },
          page: { type: "number", description: "Page number" }
        },
        required: ["deployment_slug"]
      }
    },
    {
      name: "list_deployments",
      description: "List Semgrep App deployments (requires SEMGREP_APP_TOKEN)",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "check_rule",
      description: "Test a specific Semgrep rule against a code snippet or file",
      inputSchema: {
        type: "object",
        properties: {
          rule_id: { type: "string", description: "Semgrep rule ID (e.g. python.django.security.injection.tainted-sql-string)" },
          path: { type: "string", description: "Path to file or directory to check" }
        },
        required: ["rule_id", "path"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;

    switch (name) {
      case "scan_directory": {
        const config = args.config ?? "auto";
        const severity = args.severity ? `--severity ${args.severity}` : "";
        const include = args.include ? `--include "${args.include}"` : "";
        const exclude = args.exclude ? `--exclude "${args.exclude}"` : "";
        data = runSemgrep(`scan --config ${config} ${severity} ${include} ${exclude} ${args.path}`);
        break;
      }

      case "scan_file":
        data = runSemgrep(`scan --config ${args.config ?? "auto"} ${args.file_path}`);
        break;

      case "get_app_findings": {
        const params = new URLSearchParams({ page_size: "50" });
        if (args.severity) params.set("severity", args.severity);
        if (args.status) params.set("status", args.status);
        if (args.page) params.set("page", String(args.page));
        data = await semgrepAppGet(`/deployments/${args.deployment_slug}/findings?${params}`);
        break;
      }

      case "list_deployments":
        data = await semgrepAppGet("/deployments");
        break;

      case "check_rule":
        data = runSemgrep(`scan --config ${args.rule_id} ${args.path}`);
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
