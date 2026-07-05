// Conformance wrapper tests: unit-tests for the capability-aware classifier,
// plus CLI integration with the official suite MOCKED via the committed
// results fixture (captured from a real 0.1.16 run against demo-server) —
// CI never touches npx or the network.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyScenarios } from "../lib/conformance.mjs";
import { isDeclared, SCENARIO_MAP } from "../lib/conformance-map.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const HTTP_FIXTURE = fileURLToPath(new URL("./fixtures/demo-server.mjs", import.meta.url));
const RESULTS_FIXTURE = fileURLToPath(new URL("./fixtures/conformance-results.json", import.meta.url));

const results = JSON.parse(await readFile(RESULTS_FIXTURE, "utf8"));
const DEMO_CAPS = { tools: { listChanged: true }, resources: {} };

/* ---------- unit: classifier ---------- */

test("classifier buckets the real captured run for the demo server's declared caps", () => {
  const { counts, notes } = classifyScenarios(results, DEMO_CAPS);
  assert.deepEqual(counts, {
    applicable: 9,
    passed: 8,
    failed: 1, // dns-rebinding-protection — a real, applicable security failure
    skippedUndeclared: 9,
    skippedFixture: 12,
  });
  assert.equal(notes.length, 0);
});

test("classifier: the one applicable failure is dns-rebinding, not capability noise", () => {
  const { scenarios } = classifyScenarios(results, DEMO_CAPS);
  const failed = scenarios.filter((s) => s.bucket === "applicable" && !s.passed);
  assert.deepEqual(failed.map((s) => s.name), ["dns-rebinding-protection"]);
});

test("strict mode disables all skipping (raw official behavior)", () => {
  const { counts } = classifyScenarios(results, DEMO_CAPS, { strict: true });
  assert.equal(counts.applicable, 30);
  assert.equal(counts.skippedUndeclared, 0);
  assert.equal(counts.skippedFixture, 0);
  assert.equal(counts.failed, 22);
});

test("fixture scenarios can be opted in via include", () => {
  const { scenarios, counts } = classifyScenarios(results, DEMO_CAPS, {
    include: ["tools-call-image"],
  });
  const optedIn = scenarios.find((s) => s.name === "tools-call-image");
  assert.equal(optedIn.bucket, "applicable");
  assert.equal(optedIn.passed, false);
  assert.equal(counts.failed, 2);
  assert.equal(counts.skippedFixture, 11);
});

test("sub-capability: resources.subscribe gates subscribe scenarios", () => {
  const without = classifyScenarios(results, DEMO_CAPS);
  assert.equal(
    without.scenarios.find((s) => s.name === "resources-subscribe").bucket,
    "skipped-undeclared"
  );
  const withSub = classifyScenarios(results, { ...DEMO_CAPS, resources: { subscribe: true } });
  assert.equal(withSub.scenarios.find((s) => s.name === "resources-subscribe").bucket, "applicable");
  assert.ok(isDeclared("resources.subscribe", { resources: { subscribe: true } }));
  assert.ok(!isDeclared("resources.subscribe", { resources: {} }));
});

test("unknown scenarios default to applicable with a note (forward-compat)", () => {
  const future = {
    suiteVersion: "0.2.0",
    scenarios: [{ name: "brand-new-scenario", passed: false, checks: [] }],
  };
  const { scenarios, counts, notes } = classifyScenarios(future, {});
  assert.equal(scenarios[0].bucket, "applicable");
  assert.equal(scenarios[0].unknown, true);
  assert.equal(counts.failed, 1);
  assert.match(notes[0], /brand-new-scenario.*unknown to map/);
});

test("no declared capabilities → only core scenarios remain applicable", () => {
  const { scenarios } = classifyScenarios(results, {});
  const applicable = scenarios.filter((s) => s.bucket === "applicable").map((s) => s.name);
  for (const name of applicable) {
    assert.equal(SCENARIO_MAP[name].requires, "core", `${name} should require core`);
  }
  assert.ok(applicable.includes("ping"));
  assert.ok(!applicable.includes("tools-list"));
});

/* ---------- integration: CLI with mocked suite ---------- */

let fixture;
let baseUrl;
let projectDir;
const MOCK_ENV = { MCP_TESTMATE_CONFORMANCE_RESULTS: RESULTS_FIXTURE };

function runCli(args, cwd = projectDir, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

before(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "mcp-testmate-conf-"));
  fixture = spawn(process.execPath, [HTTP_FIXTURE, "0"], { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("fixture server did not start in 10s")), 10_000);
    let out = "";
    fixture.stdout.on("data", (d) => {
      out += d;
      const m = /listening on (\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    fixture.on("exit", (code) => reject(new Error(`fixture exited early (code ${code})`)));
  });
  baseUrl = `http://127.0.0.1:${port}/mcp`;
  const init = await runCli(["init", "--url", baseUrl]);
  assert.equal(init.code, 0, init.stderr);
});

after(async () => {
  fixture?.kill();
  if (projectDir) await rm(projectDir, { recursive: true, force: true });
});

test("conformance: clean capability-aware report, exit 1 on the real applicable failure", async () => {
  const res = await runCli(["conformance"], projectDir, MOCK_ENV);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /official suite 0\.1\.16/);
  assert.match(res.stdout, /APPLICABLE \(9\)/);
  assert.match(res.stdout, /✗ dns-rebinding-protection/);
  assert.match(res.stdout, /SKIPPED · capability not declared \(9\)/);
  assert.match(res.stdout, /prompts: prompts-get-embedded-resource/);
  assert.match(res.stdout, /SKIPPED · fixture-only \(12\)/);
  assert.match(res.stdout, /1 of 9 applicable scenarios failed/);
});

test("conformance --strict: raw official behavior, no skipping", async () => {
  const res = await runCli(["conformance", "--strict"], projectDir, MOCK_ENV);
  assert.equal(res.code, 1);
  assert.doesNotMatch(res.stdout, /SKIPPED/);
  assert.match(res.stdout, /APPLICABLE \(30\)/);
  assert.match(res.stdout, /official suite \(strict\): 22 of 30 applicable scenarios failed/);
});

test("conformance --json: machine-readable buckets and pinned suite version", async () => {
  const res = await runCli(["conformance", "--json"], projectDir, MOCK_ENV);
  assert.equal(res.code, 1);
  const report = JSON.parse(res.stdout);
  assert.equal(report.suiteVersion, "0.1.16");
  assert.equal(report.counts.applicable, 9);
  assert.equal(report.counts.failed, 1);
  assert.equal(report.counts.skippedFixture, 12);
  assert.equal(report.scenarios.length, 30);
});

test("conformance rejects stdio targets with a clear message (exit 2)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mcp-testmate-conf-stdio-"));
  try {
    await writeFile(
      join(dir, "mcp-testmate.config.json"),
      JSON.stringify({ target: { type: "stdio", command: "node", args: ["server.mjs"] } })
    );
    const res = await runCli(["conformance"], dir, MOCK_ENV);
    assert.equal(res.code, 2);
    assert.match(
      res.stderr,
      /the official conformance suite tests HTTP servers only; run against your streamable HTTP endpoint/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("check --all --conformance: conformance as third section, worst exit wins", async () => {
  const res = await runCli(["check", "--all", "--conformance"], projectDir, MOCK_ENV);
  assert.equal(res.code, 1); // drift clean + no tests, but conformance has the dns failure
  assert.match(res.stdout, /No drift — server matches snapshot/);
  assert.match(res.stdout, /mcp-testmate conformance ·/);
  assert.match(res.stdout, /1 of 9 applicable scenarios failed/);
});

test("--conformance requires check --all; --strict requires conformance", async () => {
  const bare = await runCli(["check", "--conformance"], projectDir, MOCK_ENV);
  assert.equal(bare.code, 2);
  assert.match(bare.stderr, /--conformance only applies to `mcp-testmate check --all`/);
  const strict = await runCli(["check", "--strict"], projectDir, MOCK_ENV);
  assert.equal(strict.code, 2);
  assert.match(strict.stderr, /--strict only applies to `mcp-testmate conformance`/);
});
