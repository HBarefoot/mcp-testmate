#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { UserError } from "../lib/errors.mjs";
import { parseCommandString, targetLabel } from "../lib/target.mjs";
import { introspect } from "../lib/introspect.mjs";
import {
  CONFIG_FILE,
  SNAPSHOT_FILE,
  buildSnapshot,
  saveSnapshot,
  loadSnapshot,
  saveConfig,
  loadConfig,
} from "../lib/snapshot.mjs";
import { diffSnapshots, groupFindings, exitCodeFor } from "../lib/diff.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const HELP = `mcp-testmate — testing & reliability for MCP servers
Snapshot your tools. Catch schema drift. Know when it breaks.

Usage:
  mcp-testmate init --url <url>            snapshot a streamable-HTTP server
  mcp-testmate init --stdio "<command>"    snapshot a stdio server
  mcp-testmate check [options]             compare the live server to the snapshot
  mcp-testmate snapshot                    refresh the snapshot (re-baseline)

Options for check:
  --json                    machine-readable output
  --fail-on <level>         exit 1 on: breaking (default) | warning

Files:
  ${CONFIG_FILE}       target config (created by init)
  ${SNAPSHOT_FILE}   committed baseline (created by init)

Docs: https://github.com/HBarefoot/mcp-testmate
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new UserError(`unexpected argument: ${arg}`);
    const name = arg.slice(2);
    if (name === "json") {
      flags.json = true;
    } else if (name === "url" || name === "stdio" || name === "fail-on") {
      const value = rest[++i];
      if (value === undefined) throw new UserError(`--${name} needs a value`);
      flags[name] = value;
    } else {
      throw new UserError(`unknown flag: ${arg} (see \`mcp-testmate --help\`)`);
    }
  }
  return { command, flags };
}

function targetFromFlags(flags) {
  if (flags.url && flags.stdio) throw new UserError("use --url or --stdio, not both");
  if (flags.url) {
    try {
      new URL(flags.url);
    } catch {
      throw new UserError(`not a valid URL: ${flags.url}`);
    }
    return { type: "http", url: flags.url };
  }
  if (flags.stdio) {
    const { command, args } = parseCommandString(flags.stdio);
    return { type: "stdio", command, args };
  }
  throw new UserError('init needs a target: --url <url> or --stdio "<command>"');
}

function summarize(intro, target) {
  const counts = `tools: ${intro.tools.length} · resources: ${intro.resources.length} · prompts: ${intro.prompts.length}`;
  console.log(
    `✓ connected to ${intro.server.name} v${intro.server.version} (${targetLabel(target)}) in ${intro.timings.connectMs}ms`
  );
  console.log(`  capabilities: ${intro.capabilities.join(", ") || "none declared"}`);
  console.log(`  ${counts}`);
}

async function cmdInit(cwd, flags) {
  const target = targetFromFlags(flags);
  const intro = await introspect(target, pkg.version);
  summarize(intro, target);
  saveConfig(cwd, { target });
  console.log(`✓ wrote ${CONFIG_FILE}`);
  saveSnapshot(cwd, buildSnapshot(target, intro, new Date().toISOString()));
  console.log(`✓ wrote ${SNAPSHOT_FILE} — commit both files, then run \`mcp-testmate check\` in CI`);
}

async function cmdSnapshot(cwd) {
  const { target } = loadConfig(cwd);
  const intro = await introspect(target, pkg.version);
  summarize(intro, target);
  saveSnapshot(cwd, buildSnapshot(target, intro, new Date().toISOString()));
  console.log(`✓ refreshed ${SNAPSHOT_FILE} — this is the new baseline`);
}

const SYMBOLS = { breaking: "✗", warning: "⚠", info: "ℹ" };

async function cmdCheck(cwd, flags) {
  const failOn = flags["fail-on"] ?? "breaking";
  if (!["breaking", "warning"].includes(failOn)) {
    throw new UserError(`--fail-on must be "breaking" or "warning", got "${failOn}"`);
  }
  const { target } = loadConfig(cwd);
  const baseline = loadSnapshot(cwd);
  const intro = await introspect(target, pkg.version);
  const live = buildSnapshot(target, intro, baseline.createdAt);
  const findings = diffSnapshots(baseline, live);
  const groups = groupFindings(findings);
  const exitCode = exitCodeFor(findings, failOn);

  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          ok: exitCode === 0,
          exitCode,
          server: live.server,
          counts: {
            breaking: groups.breaking.length,
            warning: groups.warning.length,
            info: groups.info.length,
          },
          findings,
        },
        null,
        2
      )
    );
    return exitCode;
  }

  console.log(`mcp-testmate check · ${live.server.name} v${live.server.version}\n`);

  if (findings.length === 0) {
    console.log(
      `✓ no drift — ${live.tools.length} tools, ${live.resources.length} resources, ${live.prompts.length} prompts match the snapshot`
    );
    return 0;
  }

  for (const severity of ["breaking", "warning", "info"]) {
    const list = groups[severity];
    if (list.length === 0) continue;
    console.log(`${SYMBOLS[severity]} ${severity.toUpperCase()} (${list.length})`);
    for (const f of list) console.log(`  ${SYMBOLS[severity]} ${f.message}`);
    console.log("");
  }

  const summary = `${groups.breaking.length} breaking, ${groups.warning.length} warning, ${groups.info.length} info`;
  if (exitCode === 0) {
    console.log(`✓ no ${failOn === "warning" ? "breaking or warning" : "breaking"} drift (${summary})`);
  } else {
    console.log(`✗ drift detected: ${summary}`);
  }
  return exitCode;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return 0;
    case "--version":
    case "-v":
      console.log(pkg.version);
      return 0;
    case "init":
      await cmdInit(cwd, flags);
      return 0;
    case "snapshot":
      await cmdSnapshot(cwd);
      return 0;
    case "check":
      return await cmdCheck(cwd, flags);
    default:
      throw new UserError(`unknown command: ${command} (see \`mcp-testmate --help\`)`);
  }
}

try {
  process.exitCode = await main();
} catch (err) {
  if (err instanceof UserError) {
    console.error(`✗ ${err.message}`);
  } else {
    console.error(`✗ unexpected error: ${err?.message ?? err}`);
    if (process.env.DEBUG) console.error(err);
    else console.error("  (set DEBUG=1 for a stack trace)");
  }
  process.exitCode = 2;
}
