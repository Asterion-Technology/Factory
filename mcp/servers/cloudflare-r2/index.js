import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand
} from "@aws-sdk/client-s3";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const DEFAULT_BUCKET = process.env.R2_BUCKET;

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) {
  process.stderr.write("[factory-r2] R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required\n");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY }
});

const MAX_CONTENT_BYTES = 50 * 1024; // 50KB content limit for get_object_content

const server = new Server(
  { name: "factory-r2", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_buckets",
      description: "List all Cloudflare R2 buckets in the account",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "list_objects",
      description: "List objects in an R2 bucket with optional prefix filtering",
      inputSchema: {
        type: "object",
        properties: {
          bucket: { type: "string", description: `Bucket name (default: ${DEFAULT_BUCKET ?? "set R2_BUCKET env var"})` },
          prefix: { type: "string", description: "Key prefix to filter objects (like a directory path)" },
          max_keys: { type: "number", description: "Max results (default 100, max 1000)" },
          continuation_token: { type: "string", description: "Continuation token for pagination" }
        }
      }
    },
    {
      name: "get_object_metadata",
      description: "Get metadata for a specific R2 object (size, content type, etag, last modified) without downloading content",
      inputSchema: {
        type: "object",
        properties: {
          bucket: { type: "string", description: "Bucket name" },
          key: { type: "string", description: "Object key (path)" }
        },
        required: ["key"]
      }
    },
    {
      name: "get_object_content",
      description: "Download and return the content of a small R2 object (50KB limit — use for config files, JSON, text only)",
      inputSchema: {
        type: "object",
        properties: {
          bucket: { type: "string", description: "Bucket name" },
          key: { type: "string", description: "Object key (path)" }
        },
        required: ["key"]
      }
    },
    {
      name: "get_bucket_stats",
      description: "Get approximate stats for a bucket (object count, estimated size by sampling)",
      inputSchema: {
        type: "object",
        properties: {
          bucket: { type: "string", description: "Bucket name" },
          prefix: { type: "string", description: "Optional prefix to scope stats" }
        }
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let data;
    const bucket = args.bucket ?? DEFAULT_BUCKET;

    switch (name) {
      case "list_buckets": {
        const res = await s3.send(new ListBucketsCommand({}));
        data = { buckets: (res.Buckets ?? []).map(b => ({ name: b.Name, created: b.CreationDate })) };
        break;
      }

      case "list_objects": {
        if (!bucket) throw new Error("Bucket name required — set R2_BUCKET env var or provide bucket parameter");
        const res = await s3.send(new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: args.prefix,
          MaxKeys: Math.min(args.max_keys ?? 100, 1000),
          ContinuationToken: args.continuation_token
        }));
        data = {
          bucket,
          prefix: args.prefix ?? "",
          objects: (res.Contents ?? []).map(o => ({
            key: o.Key,
            size_bytes: o.Size,
            last_modified: o.LastModified,
            etag: o.ETag
          })),
          is_truncated: res.IsTruncated,
          next_continuation_token: res.NextContinuationToken,
          key_count: res.KeyCount
        };
        break;
      }

      case "get_object_metadata": {
        if (!bucket) throw new Error("Bucket name required");
        const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: args.key }));
        data = {
          key: args.key,
          bucket,
          size_bytes: res.ContentLength,
          content_type: res.ContentType,
          etag: res.ETag,
          last_modified: res.LastModified,
          metadata: res.Metadata ?? {}
        };
        break;
      }

      case "get_object_content": {
        if (!bucket) throw new Error("Bucket name required");
        const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: args.key }));
        if (head.ContentLength > MAX_CONTENT_BYTES) {
          throw new Error(`Object is ${head.ContentLength} bytes — exceeds 50KB safety limit for content retrieval. Use get_object_metadata instead.`);
        }
        const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: args.key }));
        const chunks = [];
        for await (const chunk of res.Body) chunks.push(chunk);
        const content = Buffer.concat(chunks).toString("utf-8");
        data = {
          key: args.key,
          bucket,
          content_type: res.ContentType,
          size_bytes: head.ContentLength,
          content
        };
        break;
      }

      case "get_bucket_stats": {
        if (!bucket) throw new Error("Bucket name required");
        let totalObjects = 0;
        let totalBytes = 0;
        let token;
        do {
          const res = await s3.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: args.prefix,
            MaxKeys: 1000,
            ContinuationToken: token
          }));
          totalObjects += res.KeyCount ?? 0;
          for (const o of res.Contents ?? []) totalBytes += o.Size ?? 0;
          token = res.NextContinuationToken;
          if (totalObjects > 10000) { data = { note: "Bucket has >10,000 objects — stats truncated at 10,000", total_objects_sampled: totalObjects, total_bytes_sampled: totalBytes }; break; }
        } while (token);
        if (!data) data = { bucket, prefix: args.prefix ?? "", total_objects: totalObjects, total_bytes: totalBytes, total_mb: (totalBytes / 1024 / 1024).toFixed(2) };
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
