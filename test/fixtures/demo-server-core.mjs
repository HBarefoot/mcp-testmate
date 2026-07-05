import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export const TOOLS = [
  {
    name: "echo",
    description: "Echo a message back",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string", description: "Text to echo" } },
      required: ["message"],
    },
  },
  {
    name: "add",
    description: "Add two numbers",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
        precision: { type: "integer", description: "Decimal places (optional)" },
      },
      required: ["a", "b"],
    },
  },
  {
    name: "get_time",
    description: "Current server time as ISO string",
    inputSchema: { type: "object", properties: {} },
  },
];

export const RESOURCES = [
  { uri: "demo://readme", name: "readme", mimeType: "text/plain" },
];

/**
 * Build a fresh demo McpServer instance. Callers MUST create a new instance
 * per session — sharing one instance across sessions crashes on the second
 * client. Declares only tools + resources (no prompts), so tests can verify
 * mcp-testmate never queries undeclared capabilities.
 */
export function buildDemoServer() {
  const server = new Server(
    { name: "demo-server", version: "1.2.3" },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    switch (name) {
      case "echo":
        return { content: [{ type: "text", text: String(args.message) }] };
      case "add":
        return { content: [{ type: "text", text: String(args.a + args.b) }] };
      case "get_time":
        return { content: [{ type: "text", text: new Date().toISOString() }] };
      default:
        return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => ({
    contents: [{ uri: req.params.uri, mimeType: "text/plain", text: "demo fixture resource" }],
  }));

  return server;
}
