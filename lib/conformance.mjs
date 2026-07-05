/**
 * Capability-aware wrapper around the official @modelcontextprotocol/
 * conformance suite. The official suite runs every scenario against every
 * server, so production servers "fail" ~75% of it for not implementing
 * optional features (see docs/audit-official-conformance.md). We run it
 * as-is, then classify each scenario against what the server DECLARES:
 *
 *   applicable          capability declared → official PASS/FAIL stands
 *   skipped-undeclared  capability not declared → noise, skipped with reason
 *   skipped-fixture     validates purpose-built demo servers → skipped unless
 *                       opted in via config `conformance.include`
 *
 * --strict disables all skipping (raw official behavior).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UserError } from "./errors.mjs";
import { loadConfig } from "./snapshot.mjs";
import { introspect } from "./introspect.mjs";
import { SUITE_VERSION, MAP_VERSION, SCENARIO_MAP, isDeclared } from "./conformance-map.mjs";

const SUITE_TIMEOUT_MS = 240_000;

/** Run the pinned official suite against `url`, normalize per-scenario results. */
async function runOfficialSuite(url, onPhase) {
  // Internal test hook: point at a pre-captured normalized results file so CI
  // never depends on npx/network. Not a public interface.
  if (process.env.MCP_TESTMATE_CONFORMANCE_RESULTS) {
    return JSON.parse(readFileSync(process.env.MCP_TESTMATE_CONFORMANCE_RESULTS, "utf8"));
  }

  onPhase?.({ id: "suite", label: `Running official conformance suite ${SUITE_VERSION}…` });
  const outDir = mkdtempSync(join(tmpdir(), "mcp-testmate-conformance-"));
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        "npx",
        ["--yes", `@modelcontextprotocol/conformance@${SUITE_VERSION}`, "server", "--url", url, "-o", outDir],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new UserError(`official conformance suite timed out after ${SUITE_TIMEOUT_MS / 1000}s`));
      }, SUITE_TIMEOUT_MS);
      child.on("error", (err) =>
        reject(new UserError(`could not run the official suite via npx: ${err.message}`))
      );
      child.on("close", () => {
        // the suite exits 0 even with failures — per-scenario results are the signal
        clearTimeout(timer);
        resolve(output);
      });
    });

    const scenarios = readdirSync(outDir)
      .filter((d) => d.startsWith("server-"))
      .map((d) => {
        const name = d.replace(/^server-/, "").replace(/-\d{4}-\d{2}-\d{2}T[\d-]+Z$/, "");
        const checks = JSON.parse(readFileSync(join(outDir, d, "checks.json"), "utf8"));
        return {
          name,
          passed: checks.every((c) => c.status === "SUCCESS"),
          checks: checks.map((c) => ({ id: c.id, status: c.status })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    if (scenarios.length === 0) {
      throw new UserError("the official suite produced no scenario results", {
        likely: "the server went down mid-run, or npx could not fetch the suite",
        fix: `try it directly: npx @modelcontextprotocol/conformance@${SUITE_VERSION} server --url ${url}`,
      });
    }
    return { suiteVersion: SUITE_VERSION, scenarios };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

/**
 * Bucket official results against declared capabilities. Pure — unit-tested
 * directly. `include` lists fixture scenarios explicitly opted in.
 */
export function classifyScenarios(results, capabilityDetail, { strict = false, include = [] } = {}) {
  const notes = [];
  const scenarios = results.scenarios.map(({ name, passed }) => {
    const mapping = SCENARIO_MAP[name];
    if (!mapping) {
      notes.push(`scenario "${name}" is unknown to map v${MAP_VERSION} — treated as applicable`);
      return { name, bucket: "applicable", passed, unknown: true };
    }
    if (strict) return { name, bucket: "applicable", passed };
    if (!isDeclared(mapping.requires, capabilityDetail)) {
      return { name, bucket: "skipped-undeclared", reason: mapping.requires };
    }
    if (mapping.fixture && !include.includes(name)) {
      return { name, bucket: "skipped-fixture", reason: "validates purpose-built demo servers" };
    }
    return { name, bucket: "applicable", passed };
  });

  const applicable = scenarios.filter((s) => s.bucket === "applicable");
  const counts = {
    applicable: applicable.length,
    passed: applicable.filter((s) => s.passed).length,
    failed: applicable.filter((s) => !s.passed).length,
    skippedUndeclared: scenarios.filter((s) => s.bucket === "skipped-undeclared").length,
    skippedFixture: scenarios.filter((s) => s.bucket === "skipped-fixture").length,
  };
  return { scenarios, counts, notes };
}

export async function conformanceFlow(cwd, version, { targetOverride = null, strict = false, onPhase } = {}) {
  let config = {};
  try {
    config = loadConfig(cwd);
  } catch (err) {
    if (!targetOverride) throw err;
  }
  const target = targetOverride ?? config.target;

  if (target?.type !== "http") {
    throw new UserError(
      "the official conformance suite tests HTTP servers only; run against your streamable HTTP endpoint",
      { fix: "mcp-testmate conformance --url http://localhost:<port>/mcp" }
    );
  }

  const intro = await introspect(target, version, { onPhase });
  const results = await runOfficialSuite(target.url, onPhase);
  onPhase?.({ id: "classify", label: "Classifying scenarios against declared capabilities…" });
  const include = config.conformance?.include ?? [];
  const { scenarios, counts, notes } = classifyScenarios(results, intro.capabilityDetail, {
    strict,
    include,
  });

  if (results.suiteVersion !== SUITE_VERSION) {
    notes.push(`results from suite ${results.suiteVersion}, map pinned to ${SUITE_VERSION}`);
  }

  return {
    server: intro.server,
    suiteVersion: results.suiteVersion,
    mapVersion: MAP_VERSION,
    strict,
    scenarios,
    counts,
    notes,
    exitCode: counts.failed > 0 ? 1 : 0,
  };
}
