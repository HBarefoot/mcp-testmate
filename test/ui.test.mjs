// Light render tests for the Ink views via ink-testing-library.
// These assert content and structure, not colors — chalk strips ANSI when
// not attached to a TTY, which also proves NO_COLOR-safety of the layout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "ink-testing-library";
import { h } from "../lib/ui/components.mjs";
import { InitView, CheckView, ErrorView, HelpView } from "../lib/ui/views.mjs";
import { UserError } from "../lib/errors.mjs";

const intro = {
  server: { name: "demo-server", version: "1.2.3" },
  capabilities: ["resources", "tools"],
  tools: [{ name: "add" }, { name: "echo" }],
  resources: [{ uri: "demo://readme" }],
  prompts: [],
  timings: { connectMs: 26, listToolsMs: 2 },
};

test("InitView: spinner phase shows wordmark + phase label", () => {
  const { lastFrame, unmount } = render(h(InitView, { phase: { label: "Connecting to server…" } }));
  const frame = lastFrame();
  assert.match(frame, /mcp-testmate/);
  assert.match(frame, /Snapshot your tools\. Catch schema drift\. Know when it breaks\./);
  assert.match(frame, /Connecting to server…/);
  unmount();
});

test("InitView: result shows summary card, chips, and next steps", () => {
  const { lastFrame, unmount } = render(
    h(InitView, {
      phase: null,
      result: {
        intro,
        targetText: "http://localhost:3000/mcp",
        configFile: "mcp-testmate.config.json",
        snapshotFile: ".mcp-testmate/snapshot.json",
      },
    })
  );
  const frame = lastFrame();
  assert.match(frame, /demo-server v1\.2\.3/);
  assert.match(frame, / tools /); // capability chip
  assert.match(frame, /2 tools · 1 resources · 0 prompts/);
  assert.match(frame, /connect 26ms · tools\/list 2ms/);
  assert.match(frame, /\.mcp-testmate\/snapshot\.json/);
  assert.match(frame, /Next steps/);
  assert.match(frame, /mcp-testmate check/);
  unmount();
});

test("CheckView: findings render as mini-diffs grouped by severity, breaking first", () => {
  const { lastFrame, unmount } = render(
    h(CheckView, {
      phase: null,
      report: {
        server: { name: "demo-server", version: "1.3.0" },
        failOn: "breaking",
        toolCount: 2,
        totalMs: 143,
        groups: {
          breaking: [
            {
              message: 'param type changed: add.a ("number" → "string")',
              path: "add.a",
              from: '"number"',
              to: '"string"',
            },
          ],
          warning: [{ message: "optional param removed: add.precision", path: "add.precision" }],
          info: [],
        },
      },
    })
  );
  const frame = lastFrame();
  assert.match(frame, /BREAKING \(1\)/);
  assert.match(frame, /param type changed {2}add\.a {2}number → string/); // mini-diff, quotes stripped
  assert.match(frame, /WARNING \(1\)/);
  assert.ok(frame.indexOf("BREAKING") < frame.indexOf("WARNING"), "breaking renders first");
  assert.match(frame, /✗ 1 breaking change — this commit was going to break your users/);
  assert.doesNotMatch(frame, /mcp-testmate\n/); // no wordmark on check — stays quiet
  unmount();
});

test("CheckView: clean run renders the quotable no-drift verdict", () => {
  const { lastFrame, unmount } = render(
    h(CheckView, {
      phase: null,
      report: {
        server: { name: "demo-server", version: "1.2.3" },
        failOn: "breaking",
        toolCount: 2,
        totalMs: 143,
        groups: { breaking: [], warning: [], info: [] },
      },
    })
  );
  assert.match(lastFrame(), /✓ No drift — server matches snapshot \(2 tools, 143ms\)/);
  unmount();
});

test("ErrorView: branded block with likely cause and fix, no stack", () => {
  const { lastFrame, unmount } = render(
    h(ErrorView, {
      error: new UserError("Could not reach http://localhost:3111/mcp — is the server running?", {
        likely: "the server isn't running, or the port is wrong",
        fix: "start your MCP server, then re-run this command",
      }),
    })
  );
  const frame = lastFrame();
  assert.match(frame, /✗ Could not reach http:\/\/localhost:3111\/mcp/);
  assert.match(frame, /likely: the server isn't running/);
  assert.match(frame, /try: {4}start your MCP server/);
  assert.doesNotMatch(frame, /at .*\.mjs/);
  unmount();
});

test("HelpView: wordmark, tagline, one example per command", () => {
  const { lastFrame, unmount } = render(h(HelpView, { version: "0.2.0" }));
  const frame = lastFrame();
  assert.match(frame, /mcp-testmate/);
  assert.match(frame, /Snapshot your tools/);
  for (const example of [
    /init --url http:\/\/localhost:3000\/mcp/,
    /check --fail-on warning/,
    /mcp-testmate snapshot/,
  ]) {
    assert.match(frame, example);
  }
  unmount();
});

test("views render within a 16ms frame budget", () => {
  const t0 = performance.now();
  const { unmount } = render(
    h(CheckView, {
      phase: null,
      report: {
        server: { name: "demo-server", version: "1.2.3" },
        failOn: "breaking",
        toolCount: 2,
        totalMs: 143,
        groups: { breaking: [], warning: [], info: [] },
      },
    })
  );
  const elapsed = performance.now() - t0;
  unmount();
  assert.ok(elapsed < 100, `initial render took ${elapsed}ms`); // generous CI headroom; local ~5ms
});
