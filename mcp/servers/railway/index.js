import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const RAILWAY_GQL = "https://backboard.railway.app/graphql/v2";
const TOKEN = process.env.RAILWAY_TOKEN;

// Production environment names that must never be deployed to
const PRODUCTION_ENV_NAMES = new Set(["production", "prod", "main", "live"]);

if (!TOKEN) {
  process.stderr.write("[factory-railway] RAILWAY_TOKEN is not set\n");
  process.exit(1);
}

async function gql(query, variables = {}) {
  const res = await fetch(RAILWAY_GQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Railway API ${res.status}: ${err}`);
  }
  const data = await res.json();
  if (data.errors) throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  return data.data;
}

const server = new Server(
  { name: "factory-railway", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_projects",
      description: "List all Railway projects accessible with the current token",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "get_project",
      description: "Get details for a specific Railway project including services and environments",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Railway project ID" }
        },
        required: ["project_id"]
      }
    },
    {
      name: "list_services",
      description: "List all services in a Railway project",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Railway project ID" }
        },
        required: ["project_id"]
      }
    },
    {
      name: "list_deployments",
      description: "List recent deployments for a service",
      inputSchema: {
        type: "object",
        properties: {
          service_id: { type: "string", description: "Railway service ID" },
          environment_id: { type: "string", description: "Environment ID to filter by" },
          limit: { type: "number", description: "Max results (default 10)" }
        },
        required: ["service_id"]
      }
    },
    {
      name: "get_deployment_logs",
      description: "Get logs for a specific deployment",
      inputSchema: {
        type: "object",
        properties: {
          deployment_id: { type: "string", description: "Railway deployment ID" },
          filter: { type: "string", description: "Filter log lines containing this string" }
        },
        required: ["deployment_id"]
      }
    },
    {
      name: "list_environments",
      description: "List all environments in a project",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Railway project ID" }
        },
        required: ["project_id"]
      }
    },
    {
      name: "trigger_redeploy",
      description: "Trigger a redeployment for a service in a NON-PRODUCTION environment only. Production deploys require human approval via Railway dashboard.",
      inputSchema: {
        type: "object",
        properties: {
          service_id: { type: "string", description: "Railway service ID" },
          environment_id: { type: "string", description: "Environment ID to deploy to" },
          environment_name: { type: "string", description: "Environment name — used to verify this is NOT production" }
        },
        required: ["service_id", "environment_id", "environment_name"]
      }
    },
    {
      name: "get_service_variables",
      description: "List environment variable names (not values) for a service in a specific environment. Values are redacted for security.",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Railway project ID" },
          service_id: { type: "string", description: "Railway service ID" },
          environment_id: { type: "string", description: "Environment ID" }
        },
        required: ["project_id", "service_id", "environment_id"]
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;

    switch (name) {
      case "list_projects": {
        const res = await gql(`query { me { projects { edges { node { id name description createdAt } } } } }`);
        data = res.me.projects.edges.map(e => e.node);
        break;
      }

      case "get_project": {
        const res = await gql(`query($id: String!) {
          project(id: $id) {
            id name description createdAt
            services { edges { node { id name createdAt } } }
            environments { edges { node { id name } } }
          }
        }`, { id: args.project_id });
        data = res.project;
        break;
      }

      case "list_services": {
        const res = await gql(`query($id: String!) {
          project(id: $id) {
            services { edges { node { id name createdAt updatedAt } } }
          }
        }`, { id: args.project_id });
        data = res.project.services.edges.map(e => e.node);
        break;
      }

      case "list_deployments": {
        const res = await gql(`query($serviceId: String!, $environmentId: String) {
          deployments(input: { serviceId: $serviceId, environmentId: $environmentId }, first: ${args.limit ?? 10}) {
            edges { node { id status createdAt url environmentId } }
          }
        }`, { serviceId: args.service_id, environmentId: args.environment_id });
        data = res.deployments.edges.map(e => e.node);
        break;
      }

      case "get_deployment_logs": {
        const res = await gql(`query($deploymentId: String!) {
          deploymentLogs(deploymentId: $deploymentId) {
            timestamp message severity
          }
        }`, { deploymentId: args.deployment_id });
        let logs = res.deploymentLogs ?? [];
        if (args.filter) logs = logs.filter(l => l.message?.includes(args.filter));
        data = { deployment_id: args.deployment_id, logs };
        break;
      }

      case "list_environments": {
        const res = await gql(`query($id: String!) {
          project(id: $id) {
            environments { edges { node { id name createdAt } } }
          }
        }`, { id: args.project_id });
        data = res.project.environments.edges.map(e => e.node);
        break;
      }

      case "trigger_redeploy": {
        const envName = (args.environment_name ?? "").toLowerCase().trim();
        if (PRODUCTION_ENV_NAMES.has(envName)) {
          throw new Error(`BLOCKED: Cannot deploy to production environment "${args.environment_name}". Production deployments require human approval via the Railway dashboard.`);
        }
        const res = await gql(`mutation($serviceId: String!, $environmentId: String!) {
          serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
        }`, { serviceId: args.service_id, environmentId: args.environment_id });
        data = { triggered: true, service_id: args.service_id, environment_id: args.environment_id, environment_name: args.environment_name, result: res.serviceInstanceRedeploy };
        break;
      }

      case "get_service_variables": {
        const res = await gql(`query($projectId: String!, $serviceId: String!, $environmentId: String!) {
          variables(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId)
        }`, { projectId: args.project_id, serviceId: args.service_id, environmentId: args.environment_id });
        // Return only variable names — never expose values
        const variables = res.variables ?? {};
        data = {
          variable_names: Object.keys(variables),
          count: Object.keys(variables).length,
          _note: "Variable values are redacted for security — view values in Railway dashboard only"
        };
        break;
      }

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
