/**
 * Response-regression test runner: calls REAL tools on the user's server and
 * asserts on their outputs — the layer no conformance suite provides.
 *
 * Trust rules baked in:
 *  - Missing goldens are recorded, not failed (Jest convention).
 *  - A golden mismatch triggers ONE retry call. If the two live outputs also
 *    differ from each other, the output is non-deterministic and we say so —
 *    "use contains/jsonPath instead" — rather than reporting a fake
 *    regression. Flaky failures destroy trust faster than missed ones.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./target.mjs";
import { loadConfig } from "./snapshot.mjs";
import { UserError } from "./errors.mjs";
import {
  validateTests,
  canonicalJson,
  normalizeOutput,
  evaluateExpectations,
} from "./expect.mjs";

export const GOLDEN_DIR = join(".mcp-testmate", "golden");

const sanitize = (name) => name.replace(/[^A-Za-z0-9_-]/g, "_");

export function goldenFileFor(test) {
  const hash = createHash("sha256").update(canonicalJson(test.args ?? {})).digest("hex").slice(0, 8);
  return join(GOLDEN_DIR, `${sanitize(test.tool)}-${hash}.json`);
}

export function caseLabel(test) {
  const args = JSON.stringify(test.args ?? {});
  const compact = args === "{}" ? "" : args;
  const label = `${test.tool}(${compact})`;
  return label.length > 60 ? `${label.slice(0, 59)}…` : label;
}

const pretty = (value, n = 240) => {
  const s = JSON.stringify(value);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

async function callTool(client, test) {
  const t0 = performance.now();
  const result = await client.callTool({ name: test.tool, arguments: test.args ?? {} });
  return { result, latencyMs: Math.round(performance.now() - t0) };
}

async function runCase(client, cwd, test, update) {
  const base = { tool: test.tool, args: test.args ?? {}, label: caseLabel(test) };

  let result, latencyMs;
  try {
    ({ result, latencyMs } = await callTool(client, test));
  } catch (err) {
    return {
      ...base,
      status: "fail",
      latencyMs: null,
      golden: null,
      failures: [{ kind: "call", message: `tool call failed: ${err?.message ?? err}` }],
    };
  }

  if (result.isError) {
    return {
      ...base,
      status: "fail",
      latencyMs,
      golden: null,
      failures: [
        {
          kind: "tool-error",
          message: "tool returned an error result",
          actual: pretty(normalizeOutput(result)),
        },
      ],
    };
  }

  const failures = evaluateExpectations(test, result, latencyMs);
  let golden = null; // "recorded" | "updated" | null

  if (test.expect.matchSnapshot) {
    const relPath = goldenFileFor(test);
    const absPath = join(cwd, relPath);
    const output = normalizeOutput(result);
    const existed = existsSync(absPath);

    if (!existed || update) {
      const changed = existed
        ? canonicalJson(readGolden(absPath, relPath).output) !== canonicalJson(output)
        : true;
      if (changed) {
        mkdirSync(join(cwd, GOLDEN_DIR), { recursive: true });
        writeFileSync(
          absPath,
          JSON.stringify(
            {
              mcpTestmateGolden: 1,
              tool: test.tool,
              args: test.args ?? {},
              recordedAt: new Date().toISOString(),
              output,
            },
            null,
            2
          ) + "\n"
        );
        golden = existed ? "updated" : "recorded";
      }
    } else {
      const stored = readGolden(absPath, relPath);
      if (canonicalJson(stored.output) !== canonicalJson(output)) {
        // Determinism guard: call again before claiming a regression.
        try {
          const second = await callTool(client, test);
          const output2 = normalizeOutput(second.result);
          if (canonicalJson(output2) !== canonicalJson(output)) {
            return { ...base, status: "nondeterministic", latencyMs, golden: null, failures: [] };
          }
        } catch {
          // retry call failed — fall through and report the original mismatch
        }
        failures.push({
          kind: "snapshot",
          message: `output changed from golden (${relPath})`,
          expected: pretty(stored.output),
          actual: pretty(output),
        });
      }
    }
  }

  return {
    ...base,
    status: failures.length > 0 ? "fail" : "pass",
    latencyMs,
    golden,
    failures,
  };
}

function readGolden(absPath, relPath) {
  try {
    return JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    throw new UserError(`golden file ${relPath} is unreadable or invalid JSON`, {
      fix: "delete it and re-run `mcp-testmate test` to re-record",
    });
  }
}

export async function testFlow(cwd, version, { update = false, onPhase, targetOverride = null } = {}) {
  const config = loadConfig(cwd);
  const tests = config.tests;
  if (!tests || tests.length === 0) {
    throw new UserError("no tests defined in mcp-testmate.config.json", {
      fix: 'add a "tests" array — see the Response regression tests section of the README',
    });
  }
  validateTests(tests);

  const target = targetOverride ?? config.target;
  onPhase?.({ id: "connect", label: "Connecting to server…" });
  const { client, connectMs } = await connect(target, version);
  const cases = [];
  try {
    const serverInfo = client.getServerVersion() ?? {};
    for (let i = 0; i < tests.length; i++) {
      onPhase?.({
        id: "case",
        label: `Running ${caseLabel(tests[i])} (${i + 1}/${tests.length})…`,
      });
      cases.push(await runCase(client, cwd, tests[i], update));
    }
    const counts = {
      passed: cases.filter((c) => c.status === "pass").length,
      failed: cases.filter((c) => c.status === "fail").length,
      nondeterministic: cases.filter((c) => c.status === "nondeterministic").length,
      recorded: cases.filter((c) => c.golden !== null).length,
    };
    return {
      server: {
        name: serverInfo.name ?? "unknown",
        version: serverInfo.version ?? "unknown",
      },
      cases,
      counts,
      totalMs: connectMs + cases.reduce((sum, c) => sum + (c.latencyMs ?? 0), 0),
      exitCode: counts.failed + counts.nondeterministic > 0 ? 1 : 0,
    };
  } finally {
    await client.close().catch(() => {});
  }
}
