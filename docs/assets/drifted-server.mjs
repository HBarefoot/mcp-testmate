#!/usr/bin/env node
// Demo-only: the fixture server after a "bad commit" — used to record the
// failing-check GIF. Mutates the shared TOOLS array before the HTTP server
// module loads, so the live surface drifts from a baseline snapshotted
// against the unmodified fixture.
//
//   add.a        number → string   (param type changed — BREAKING)
//   add.precision removed          (optional param removed — WARNING)
//   echo         deleted           (tool removed — BREAKING)
//
// Usage: node docs/assets/drifted-server.mjs [port]
import { TOOLS } from "../../test/fixtures/demo-server-core.mjs";

const add = TOOLS.find((t) => t.name === "add");
add.inputSchema.properties.a.type = "string";
delete add.inputSchema.properties.precision;
TOOLS.splice(TOOLS.findIndex((t) => t.name === "echo"), 1);

await import("../../test/fixtures/demo-server.mjs");
