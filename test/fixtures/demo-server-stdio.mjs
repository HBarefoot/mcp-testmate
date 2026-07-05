#!/usr/bin/env node
// stdio flavor of the demo MCP server, for stdio-target smoke tests.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildDemoServer } from "./demo-server-core.mjs";

await buildDemoServer().connect(new StdioServerTransport());
