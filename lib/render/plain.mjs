/**
 * Plain-text renderer — the CI surface. No ANSI, no React, no color: what you
 * see in a GitHub Actions log is exactly what these functions return. The Ink
 * renderer wraps the same data; verdict wording is shared from here so the
 * interactive and CI outputs never drift apart.
 */
import { SEVERITY_ORDER, severityStyle, theme } from "../ui/theme.mjs";

const S = theme.symbols;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One quotable line summing up a check run. Shared by both renderers. */
export function verdict({ groups, failOn, toolCount, totalMs }) {
  const b = groups.breaking.length;
  const w = groups.warning.length;
  const i = groups.info.length;
  if (b > 0) {
    return {
      symbol: S.breaking,
      tone: "breaking",
      text: `${plural(b, "breaking change")} — this commit was going to break your users`,
    };
  }
  if (w > 0 && failOn === "warning") {
    return {
      symbol: S.breaking,
      tone: "breaking",
      text: `${plural(w, "warning")} — failing because --fail-on warning`,
    };
  }
  if (w > 0) {
    return {
      symbol: S.warning,
      tone: "warning",
      text: `${plural(w, "warning")}, no breaking changes — worth a look before shipping`,
    };
  }
  if (i > 0) {
    return {
      symbol: S.success,
      tone: "success",
      text: `No breaking drift — ${plural(i, "informational change")} (contract intact)`,
    };
  }
  return {
    symbol: S.success,
    tone: "success",
    text: `No drift — server matches snapshot (${plural(toolCount, "tool")}, ${totalMs}ms)`,
  };
}

export function renderInitSummary({ intro, targetText, configFile, snapshotFile }) {
  const caps = intro.capabilities.join(", ") || "none declared";
  return [
    `${S.success} Connected to ${intro.server.name} v${intro.server.version} (${targetText}) in ${intro.timings.connectMs}ms`,
    `  capabilities: ${caps}`,
    `  ${intro.tools.length} tools ${S.bullet} ${intro.resources.length} resources ${S.bullet} ${intro.prompts.length} prompts`,
    `${S.success} Wrote ${configFile}`,
    `${S.success} Wrote ${snapshotFile}`,
    ``,
    `Next steps:`,
    `  1. Commit the baseline:  git add ${configFile} .mcp-testmate/`,
    `  2. Check for drift:      mcp-testmate check`,
    `  3. Add the GitHub Action so drift fails the build — README § CI`,
  ].join("\n");
}

export function renderSnapshotSummary({ intro, targetText, snapshotFile }) {
  return [
    `${S.success} Connected to ${intro.server.name} v${intro.server.version} (${targetText}) in ${intro.timings.connectMs}ms`,
    `  ${intro.tools.length} tools ${S.bullet} ${intro.resources.length} resources ${S.bullet} ${intro.prompts.length} prompts`,
    `${S.success} Refreshed ${snapshotFile} — this is the new baseline`,
  ].join("\n");
}

export function renderCheckReport({ server, groups, failOn, toolCount, totalMs }) {
  const lines = [`mcp-testmate check ${S.bullet} ${server.name} v${server.version}`, ``];
  const v = verdict({ groups, failOn, toolCount, totalMs });

  for (const severity of SEVERITY_ORDER) {
    const list = groups[severity];
    if (list.length === 0) continue;
    lines.push(`${severityStyle[severity].title} (${list.length})`);
    for (const f of list) lines.push(`  ${severityStyle[severity].symbol} ${f.message}`);
    lines.push(``);
  }

  lines.push(`${v.symbol} ${v.text}`);
  return lines.join("\n");
}

export const NONDETERMINISTIC_MSG =
  "output appears non-deterministic; use contains/jsonPath instead of matchSnapshot";

/** One quotable line summing up a test run. Shared by both renderers. */
export function testVerdict({ counts, server, totalMs }) {
  const total = counts.passed + counts.failed + counts.nondeterministic;
  if (counts.failed + counts.nondeterministic > 0) {
    const parts = [];
    if (counts.failed > 0) parts.push(`${counts.failed} failed`);
    if (counts.nondeterministic > 0) parts.push(`${counts.nondeterministic} non-deterministic`);
    return {
      symbol: S.breaking,
      tone: "breaking",
      text: `${parts.join(", ")} of ${plural(total, "test")}`,
    };
  }
  const recorded = counts.recorded > 0 ? `, ${plural(counts.recorded, "golden")} recorded` : "";
  return {
    symbol: S.success,
    tone: "success",
    text: `${plural(total, "test")} passed${recorded} (${server.name} v${server.version}, ${totalMs}ms)`,
  };
}

const CASE_SYMBOL = { pass: S.success, fail: S.breaking, nondeterministic: S.warning };

export function renderTestReport({ server, cases, counts, totalMs }) {
  const lines = [`mcp-testmate test ${S.bullet} ${server.name} v${server.version}`, ``];
  for (const c of cases) {
    const latency = c.latencyMs != null ? ` ${c.latencyMs}ms` : "";
    const goldenNote = c.golden ? ` — golden ${c.golden}` : "";
    if (c.status === "nondeterministic") {
      lines.push(`  ${S.warning} ${c.label}${latency} — ${NONDETERMINISTIC_MSG}`);
      continue;
    }
    lines.push(`  ${CASE_SYMBOL[c.status]} ${c.label}${latency}${goldenNote}`);
    for (const f of c.failures) {
      lines.push(`      ${f.message}`);
      if (f.expected !== undefined) lines.push(`        expected: ${f.expected}`);
      if (f.actual !== undefined) lines.push(`        actual:   ${f.actual}`);
    }
  }
  lines.push(``);
  const v = testVerdict({ counts, server, totalMs });
  lines.push(`${v.symbol} ${v.text}`);
  return lines.join("\n");
}

export function renderError(err) {
  const lines = [`${S.breaking} ${err.message}`];
  if (err.likely) lines.push(`  likely: ${err.likely}`);
  if (err.fix) lines.push(`  try:    ${err.fix}`);
  return lines.join("\n");
}

export const REPO_URL = "https://github.com/HBarefoot/mcp-testmate";

/**
 * shields.io static "MCP-tested ✓" badge, brand cyan. Static for now — a
 * hosted per-repo badge endpoint arrives with the probing tier.
 */
export function renderBadge() {
  return `[![MCP-tested ✓](https://img.shields.io/badge/MCP--tested-%E2%9C%93-22d3ee)](${REPO_URL})`;
}

export function renderHelp(version) {
  return `${theme.wordmark} v${version}
${theme.tagline}

Usage
  mcp-testmate <command> [options]

Commands
  init      Snapshot a server and write the baseline config
              mcp-testmate init --url http://localhost:3000/mcp
              mcp-testmate init --stdio "node server.mjs"
  check     Compare the live server against the committed snapshot
              mcp-testmate check --fail-on warning
              mcp-testmate check --all        (drift + response tests, CI mode)
  test      Run response-regression tests against real tool outputs
              mcp-testmate test --update      (re-record goldens)
  snapshot  Re-baseline: refresh the snapshot from the live server
              mcp-testmate snapshot
  badge     Print the "MCP-tested ✓" badge markdown for your README
              mcp-testmate badge >> README.md

Options
  --url <url>          streamable-HTTP server endpoint (init; overrides config on check)
  --stdio "<command>"  stdio server launch command (init; overrides config on check)
  --fail-on <level>    exit 1 on: breaking (default) | warning (check)
  --json               machine-readable output (check)
  --no-color           disable colors (also respects NO_COLOR)

Exit codes
  0 clean or informational drift ${S.bullet} 1 breaking drift ${S.bullet} 2 config/connection error

Docs: https://github.com/HBarefoot/mcp-testmate`;
}
