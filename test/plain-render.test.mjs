// Snapshot tests for the plain (CI) renderer. Input data is fixed, so output
// must be byte-stable — any change here is a deliberate UX decision.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderInitSummary,
  renderCheckReport,
  renderError,
  verdict,
} from "../lib/render/plain.mjs";
import { UserError } from "../lib/errors.mjs";

const intro = {
  server: { name: "demo-server", version: "1.2.3" },
  capabilities: ["resources", "tools"],
  tools: [{ name: "add" }, { name: "echo" }, { name: "get_time" }],
  resources: [{ uri: "demo://readme" }],
  prompts: [],
  timings: { connectMs: 26, listToolsMs: 2 },
};

test("plain init summary is stable", () => {
  const out = renderInitSummary({
    intro,
    targetText: "http://localhost:3000/mcp",
    configFile: "mcp-testmate.config.json",
    snapshotFile: ".mcp-testmate/snapshot.json",
  });
  assert.equal(
    out,
    [
      "✓ Connected to demo-server v1.2.3 (http://localhost:3000/mcp) in 26ms",
      "  capabilities: resources, tools",
      "  3 tools · 1 resources · 0 prompts",
      "✓ Wrote mcp-testmate.config.json",
      "✓ Wrote .mcp-testmate/snapshot.json",
      "",
      "Next steps:",
      "  1. Commit the baseline:  git add mcp-testmate.config.json .mcp-testmate/",
      "  2. Check for drift:      mcp-testmate check",
      "  3. Wire it into CI so schema drift fails the build",
    ].join("\n")
  );
  assert.doesNotMatch(out, /\x1b\[/); // no ANSI, ever
});

test("plain check report groups severities and ends with the verdict", () => {
  const out = renderCheckReport({
    server: { name: "demo-server", version: "1.3.0" },
    failOn: "breaking",
    toolCount: 3,
    totalMs: 143,
    groups: {
      breaking: [
        { message: 'param type changed: add.a ("number" → "string")' },
        { message: "tool removed: get_time" },
      ],
      warning: [{ message: "optional param removed: add.precision" }],
      info: [{ message: "server version changed: 1.2.3 → 1.3.0" }],
    },
  });
  assert.equal(
    out,
    [
      "mcp-testmate check · demo-server v1.3.0",
      "",
      "BREAKING (2)",
      '  ✗ param type changed: add.a ("number" → "string")',
      "  ✗ tool removed: get_time",
      "",
      "WARNING (1)",
      "  ⚠ optional param removed: add.precision",
      "",
      "INFO (1)",
      "  ● server version changed: 1.2.3 → 1.3.0",
      "",
      "✗ 2 breaking changes — this commit was going to break your users",
    ].join("\n")
  );
  assert.doesNotMatch(out, /\x1b\[/);
});

test("clean check report is a single quotable line", () => {
  const out = renderCheckReport({
    server: { name: "demo-server", version: "1.2.3" },
    failOn: "breaking",
    toolCount: 2,
    totalMs: 143,
    groups: { breaking: [], warning: [], info: [] },
  });
  assert.equal(
    out,
    [
      "mcp-testmate check · demo-server v1.2.3",
      "",
      "✓ No drift — server matches snapshot (2 tools, 143ms)",
    ].join("\n")
  );
});

test("verdict wording covers every severity mix", () => {
  const g = (b, w, i) => ({
    breaking: Array(b).fill({}),
    warning: Array(w).fill({}),
    info: Array(i).fill({}),
  });
  assert.equal(
    verdict({ groups: g(1, 0, 0), failOn: "breaking", toolCount: 2, totalMs: 1 }).text,
    "1 breaking change — this commit was going to break your users"
  );
  assert.equal(
    verdict({ groups: g(0, 2, 0), failOn: "warning", toolCount: 2, totalMs: 1 }).text,
    "2 warnings — failing because --fail-on warning"
  );
  assert.equal(
    verdict({ groups: g(0, 1, 0), failOn: "breaking", toolCount: 2, totalMs: 1 }).text,
    "1 warning, no breaking changes — worth a look before shipping"
  );
  assert.equal(
    verdict({ groups: g(0, 0, 3), failOn: "breaking", toolCount: 2, totalMs: 1 }).text,
    "No breaking drift — 3 informational changes (contract intact)"
  );
});

test("plain error block: what failed, likely cause, exact fix — no stack", () => {
  const out = renderError(
    new UserError("Could not reach http://localhost:3111/mcp — is the server running?", {
      likely: "the server isn't running, or the port is wrong",
      fix: "start your MCP server, then re-run this command",
    })
  );
  assert.equal(
    out,
    [
      "✗ Could not reach http://localhost:3111/mcp — is the server running?",
      "  likely: the server isn't running, or the port is wrong",
      "  try:    start your MCP server, then re-run this command",
    ].join("\n")
  );
  assert.doesNotMatch(out, /at .*\.mjs/);
});
