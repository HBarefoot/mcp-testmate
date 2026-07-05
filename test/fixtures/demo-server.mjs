#!/usr/bin/env node
// Streamable-HTTP demo MCP server used by the integration tests.
// Usage: node demo-server.mjs [port]   (port 0 = pick a free port)
// Prints "listening on <port>" once ready.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildDemoServer } from "./demo-server-core.mjs";

const requestedPort = Number(process.argv[2] ?? 0);
const transports = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const httpServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(404).end("not found");
      return;
    }
    const body = req.method === "POST" ? await readBody(req) : undefined;
    const sessionId = req.headers["mcp-session-id"];
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      if (req.method !== "POST" || !isInitializeRequest(body)) {
        res.writeHead(400, { "content-type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "no valid session" },
            id: null,
          })
        );
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => transports.set(sid, transport),
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };
      // Per-session pattern: a NEW server instance for each session. A single
      // shared instance crashes when a second client initializes.
      await buildDemoServer().connect(transport);
    }

    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("demo-server error:", err);
    if (!res.headersSent) res.writeHead(500).end();
  }
});

httpServer.listen(requestedPort, "127.0.0.1", () => {
  console.log(`listening on ${httpServer.address().port}`);
});
