// Integration tests for response-regression testing (`mcp-testmate test`,
// `check --all`) — every expect variant, the Jest-style golden lifecycle,
// and the determinism guard.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const HTTP_FIXTURE = fileURLToPath(new URL("./fixtures/demo-server.mjs", import.meta.url));
const GOLDEN_DIR = join(".mcp-testmate", "golden");

let fixture;
let baseUrl;
let projectDir;

function runCli(args, cwd = projectDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function setTests(tests) {
  const configPath = join(projectDir, "mcp-testmate.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  config.tests = tests;
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

async function goldenFiles() {
  try {
    return await readdir(join(projectDir, GOLDEN_DIR));
  } catch {
    return [];
  }
}

before(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "mcp-testmate-regr-"));
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

test("matchSnapshot: first run records the golden (exit 0), second run passes against it", async () => {
  await setTests([
    { tool: "echo", args: { message: "golden-hello" }, expect: { matchSnapshot: true } },
  ]);

  const first = await runCli(["test"]);
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /golden recorded/);
  const files = await goldenFiles();
  assert.equal(files.length, 1);
  assert.match(files[0], /^echo-[0-9a-f]{8}\.json$/);

  const second = await runCli(["test"]);
  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /✓ 1 test passed/);
  assert.doesNotMatch(second.stdout, /golden recorded/);
});

test("matchSnapshot: deterministic output change → real failure with expected/actual diff", async () => {
  // Tamper the golden — the live (deterministic) output now differs from it
  const [file] = await goldenFiles();
  const goldenPath = join(projectDir, GOLDEN_DIR, file);
  const golden = JSON.parse(await readFile(goldenPath, "utf8"));
  const original = JSON.stringify(golden, null, 2);
  golden.output.content[0].text = "golden-TAMPERED";
  await writeFile(goldenPath, JSON.stringify(golden, null, 2));

  const res = await runCli(["test"]);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /output changed from golden/);
  assert.match(res.stdout, /expected: .*golden-TAMPERED/);
  assert.match(res.stdout, /actual: {3}.*golden-hello/);
  // deterministic output must NOT be reported as non-deterministic
  assert.doesNotMatch(res.stdout, /non-deterministic/);

  await writeFile(goldenPath, original); // restore
});

test("--update re-records a stale golden (exit 0) and the next run is clean", async () => {
  const [file] = await goldenFiles();
  const goldenPath = join(projectDir, GOLDEN_DIR, file);
  const golden = JSON.parse(await readFile(goldenPath, "utf8"));
  golden.output.content[0].text = "golden-STALE";
  await writeFile(goldenPath, JSON.stringify(golden, null, 2));

  const update = await runCli(["test", "--update"]);
  assert.equal(update.code, 0, update.stderr);
  assert.match(update.stdout, /golden updated/);

  const rewritten = JSON.parse(await readFile(goldenPath, "utf8"));
  assert.equal(rewritten.output.content[0].text, "golden-hello");

  const clean = await runCli(["test"]);
  assert.equal(clean.code, 0, clean.stderr);
});

test("determinism guard: non-deterministic output reports guidance, not a plain failure", async () => {
  await setTests([{ tool: "get_time", args: {}, expect: { matchSnapshot: true } }]);

  const record = await runCli(["test"]);
  assert.equal(record.code, 0, record.stderr); // first run records

  const res = await runCli(["test"]); // live output differs from golden AND from a retry call
  assert.equal(res.code, 1);
  assert.match(res.stdout, /output appears non-deterministic; use contains\/jsonPath instead/);
  assert.doesNotMatch(res.stdout, /output changed from golden/);
});

test("contains: pass and fail with actual output shown", async () => {
  await setTests([
    { tool: "add", args: { a: 2, b: 3 }, expect: { contains: "5" } },
    { tool: "add", args: { a: 2, b: 2 }, expect: { contains: "5" } },
  ]);

  const res = await runCli(["test"]);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /✓ add\(\{"a":2,"b":3\}\)/);
  assert.match(res.stdout, /✗ add\(\{"a":2,"b":2\}\)/);
  assert.match(res.stdout, /expected output to contain "5"/);
  assert.match(res.stdout, /actual: {3}4/);
  assert.match(res.stdout, /✗ 1 failed of 2 tests/);
});

test("jsonPath: equals on object keys and array indices, mismatch shows both values", async () => {
  await setTests([
    { tool: "get_status", args: {}, expect: { jsonPath: "$.status", equals: "approved" } },
    { tool: "get_status", args: {}, expect: { jsonPath: "$.checks[1]", equals: "db" } },
    { tool: "get_status", args: {}, expect: { jsonPath: "$.region", equals: "eu-west" } },
    { tool: "get_status", args: {}, expect: { jsonPath: "$.missing", equals: 1 } },
  ]);

  const res = await runCli(["test", "--json"]);
  assert.equal(res.code, 1);
  const report = JSON.parse(res.stdout);
  assert.deepEqual(
    report.cases.map((c) => c.status),
    ["pass", "pass", "fail", "fail"]
  );
  const mismatch = report.cases[2].failures[0];
  assert.match(mismatch.message, /\$\.region mismatch/);
  assert.equal(mismatch.expected, '"eu-west"');
  assert.equal(mismatch.actual, '"us-east"');
  assert.match(report.cases[3].failures[0].message, /\$\.missing not found/);
});

test("maxLatencyMs: budget exceeded fails with measured latency", async () => {
  await setTests([
    { tool: "get_status", args: { delayMs: 80 }, expect: { jsonPath: "$.status", equals: "approved", maxLatencyMs: 20 } },
    { tool: "get_status", args: {}, expect: { maxLatencyMs: 5000 } },
  ]);

  const res = await runCli(["test", "--json"]);
  assert.equal(res.code, 1);
  const report = JSON.parse(res.stdout);
  assert.equal(report.cases[0].status, "fail");
  assert.ok(report.cases[0].latencyMs >= 80, `latency ${report.cases[0].latencyMs} should include the delay`);
  assert.match(report.cases[0].failures[0].message, /latency \d+ms exceeded maxLatencyMs 20/);
  assert.equal(report.cases[1].status, "pass");
});

test("combined expects: one case can assert snapshot + contains + latency together", async () => {
  await setTests([
    {
      tool: "echo",
      args: { message: "combo" },
      expect: { matchSnapshot: true, contains: "combo", maxLatencyMs: 5000 },
    },
  ]);
  const first = await runCli(["test"]);
  assert.equal(first.code, 0, first.stderr);
  const second = await runCli(["test"]);
  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /✓ 1 test passed/);
});

test("check --all runs drift + tests; exit is the worst of both", async () => {
  await setTests([{ tool: "add", args: { a: 1, b: 1 }, expect: { contains: "2" } }]);

  const clean = await runCli(["check", "--all"]);
  assert.equal(clean.code, 0, clean.stderr);
  assert.match(clean.stdout, /✓ No drift/);
  assert.match(clean.stdout, /✓ 1 test passed/);

  // break the tests but not the schema → --all must fail
  await setTests([{ tool: "add", args: { a: 1, b: 1 }, expect: { contains: "3" } }]);
  const failing = await runCli(["check", "--all"]);
  assert.equal(failing.code, 1);
  assert.match(failing.stdout, /✓ No drift/);
  assert.match(failing.stdout, /✗ 1 failed of 1 test/);

  // --json --all: combined machine output
  const json = await runCli(["check", "--all", "--json"]);
  assert.equal(json.code, 1);
  const combined = JSON.parse(json.stdout);
  assert.equal(combined.ok, false);
  assert.equal(combined.drift.counts.breaking, 0);
  assert.equal(combined.tests.counts.failed, 1);
});

test("config validation: unknown expect key is rejected with guidance (exit 2)", async () => {
  await setTests([{ tool: "echo", args: { message: "x" }, expect: { containz: "x" } }]);
  const res = await runCli(["test"]);
  assert.equal(res.code, 2);
  assert.match(res.stderr, /unknown expect key "containz"/);
  assert.match(res.stderr, /known keys: matchSnapshot, contains, jsonPath, equals, maxLatencyMs/);
});

test("test with no tests configured → exit 2 with guidance", async () => {
  await setTests([]);
  const res = await runCli(["test"]);
  assert.equal(res.code, 2);
  assert.match(res.stderr, /no tests defined/);
  assert.match(res.stderr, /add a "tests" array/);
});
