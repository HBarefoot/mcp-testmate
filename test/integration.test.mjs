import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const HTTP_FIXTURE = fileURLToPath(new URL("./fixtures/demo-server.mjs", import.meta.url));
const STDIO_FIXTURE = fileURLToPath(new URL("./fixtures/demo-server-stdio.mjs", import.meta.url));

const SNAPSHOT_REL = join(".mcp-testmate", "snapshot.json");

let fixture; // child process of the HTTP demo server
let baseUrl;
let projectDir; // temp dir acting as the user's repo
let pristineSnapshot; // snapshot text right after init, for restore between tests

function runCli(args, cwd) {
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

async function readSnapshot() {
  return JSON.parse(await readFile(join(projectDir, SNAPSHOT_REL), "utf8"));
}

async function writeSnapshot(snapshot) {
  await writeFile(join(projectDir, SNAPSHOT_REL), JSON.stringify(snapshot, null, 2));
}

async function restoreSnapshot() {
  await writeFile(join(projectDir, SNAPSHOT_REL), pristineSnapshot);
}

before(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "mcp-testmate-test-"));
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
    fixture.on("exit", (code) => reject(new Error(`fixture server exited early (code ${code})`)));
  });
  baseUrl = `http://127.0.0.1:${port}/mcp`;
});

after(async () => {
  fixture?.kill();
  if (projectDir) await rm(projectDir, { recursive: true, force: true });
});

test("init against HTTP fixture writes config + capability-aware snapshot", async () => {
  const res = await runCli(["init", "--url", baseUrl], projectDir);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /demo-server v1\.2\.3/);
  assert.match(res.stdout, /tools: 3/);

  const config = JSON.parse(await readFile(join(projectDir, "mcp-testmate.config.json"), "utf8"));
  assert.deepEqual(config, { target: { type: "http", url: baseUrl } });

  const snapshot = await readSnapshot();
  assert.equal(snapshot.mcpTestmate, 1);
  assert.deepEqual(snapshot.capabilities, ["resources", "tools"]);
  assert.deepEqual(
    snapshot.tools.map((t) => t.name),
    ["add", "echo", "get_time"] // sorted by name
  );
  assert.equal(snapshot.resources.length, 1);
  // demo server declares no prompts capability → must be empty, never an error
  assert.deepEqual(snapshot.prompts, []);
  assert.equal(typeof snapshot.timings.connectMs, "number");

  pristineSnapshot = await readFile(join(projectDir, SNAPSHOT_REL), "utf8");
});

test("check against unchanged server is clean (exit 0)", async () => {
  const res = await runCli(["check"], projectDir);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /✓ no drift/);
});

test("tool removed from live server → BREAKING, exit 1", async (t) => {
  t.after(restoreSnapshot);
  // Baseline claims a tool the live server doesn't have → reads as "tool removed"
  const snapshot = await readSnapshot();
  snapshot.tools.push({
    name: "vanished_tool",
    description: "existed at baseline time",
    inputSchema: { type: "object", properties: {} },
  });
  await writeSnapshot(snapshot);

  const res = await runCli(["check"], projectDir);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /BREAKING/);
  assert.match(res.stdout, /tool removed: vanished_tool/);
});

test("param type changed → BREAKING, exit 1 (and --json reports it)", async (t) => {
  t.after(restoreSnapshot);
  const snapshot = await readSnapshot();
  const add = snapshot.tools.find((t2) => t2.name === "add");
  add.inputSchema.properties.a.type = "string"; // live server says "number"
  await writeSnapshot(snapshot);

  const res = await runCli(["check", "--json"], projectDir);
  assert.equal(res.code, 1);
  const report = JSON.parse(res.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.counts.breaking, 1);
  const finding = report.findings.find((f) => f.code === "param-type-changed");
  assert.equal(finding.severity, "breaking");
  assert.match(finding.message, /add\.a/);
});

test("new required param on live server → BREAKING, exit 1", async (t) => {
  t.after(restoreSnapshot);
  // Baseline lacks echo.message → live server's required "message" is new
  const snapshot = await readSnapshot();
  const echo = snapshot.tools.find((t2) => t2.name === "echo");
  delete echo.inputSchema.properties.message;
  echo.inputSchema.required = [];
  await writeSnapshot(snapshot);

  const res = await runCli(["check"], projectDir);
  assert.equal(res.code, 1);
  assert.match(res.stdout, /new required param added: echo\.message/);
});

test("optional param removed → WARNING: exit 0 by default, exit 1 with --fail-on warning", async (t) => {
  t.after(restoreSnapshot);
  // Baseline has an optional param the live server lacks
  const snapshot = await readSnapshot();
  const add = snapshot.tools.find((t2) => t2.name === "add");
  add.inputSchema.properties.legacy_flag = { type: "boolean" };
  await writeSnapshot(snapshot);

  const relaxed = await runCli(["check"], projectDir);
  assert.equal(relaxed.code, 0, relaxed.stderr);
  assert.match(relaxed.stdout, /WARNING/);
  assert.match(relaxed.stdout, /optional param removed: add\.legacy_flag/);

  const strict = await runCli(["check", "--fail-on", "warning"], projectDir);
  assert.equal(strict.code, 1);
});

test("tool added on live server → INFO only, exit 0", async (t) => {
  t.after(restoreSnapshot);
  // Baseline missing get_time → live server's get_time reads as "tool added"
  const snapshot = await readSnapshot();
  snapshot.tools = snapshot.tools.filter((t2) => t2.name !== "get_time");
  await writeSnapshot(snapshot);

  const res = await runCli(["check"], projectDir);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /INFO/);
  assert.match(res.stdout, /tool added: get_time/);
});

test("stdio target: init + check round-trip", async () => {
  const stdioDir = await mkdtemp(join(tmpdir(), "mcp-testmate-stdio-"));
  try {
    const stdioCmd = `${process.execPath} ${STDIO_FIXTURE}`;
    const init = await runCli(["init", "--stdio", stdioCmd], stdioDir);
    assert.equal(init.code, 0, init.stderr);
    assert.match(init.stdout, /demo-server v1\.2\.3/);

    const check = await runCli(["check"], stdioDir);
    assert.equal(check.code, 0, check.stderr);
    assert.match(check.stdout, /✓ no drift/);
  } finally {
    await rm(stdioDir, { recursive: true, force: true });
  }
});

test("unreachable server → exit 2 with a one-line diagnosis", async () => {
  const deadDir = await mkdtemp(join(tmpdir(), "mcp-testmate-dead-"));
  try {
    const deadUrl = "http://127.0.0.1:1/mcp";
    await writeFile(
      join(deadDir, "mcp-testmate.config.json"),
      JSON.stringify({ target: { type: "http", url: deadUrl } })
    );
    await mkdir(join(deadDir, ".mcp-testmate"), { recursive: true });
    await writeFile(join(deadDir, SNAPSHOT_REL), pristineSnapshot);

    const res = await runCli(["check"], deadDir);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /server unreachable at http:\/\/127\.0\.0\.1:1\/mcp — is it running\?/);
    assert.doesNotMatch(res.stderr, /at .*\.mjs:\d+/); // no stack dump
  } finally {
    await rm(deadDir, { recursive: true, force: true });
  }
});

test("missing config → exit 2 with guidance", async () => {
  const emptyDir = await mkdtemp(join(tmpdir(), "mcp-testmate-empty-"));
  try {
    const res = await runCli(["check"], emptyDir);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /run `mcp-testmate init` first/);
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
});
