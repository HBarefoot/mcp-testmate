#!/usr/bin/env node
// NOTE: no ink/react imports at the top level — the CI (plain) and --json
// paths never load the UI stack. The interactive renderer is imported lazily
// only when stdout is a real TTY.
import { readFileSync } from "node:fs";
import { UserError } from "../lib/errors.mjs";
import { parseCommandString } from "../lib/target.mjs";
import { initFlow, snapshotFlow, checkFlow } from "../lib/commands.mjs";
import {
  renderInitSummary,
  renderSnapshotSummary,
  renderCheckReport,
  renderError,
  renderHelp,
  renderBadge,
} from "../lib/render/plain.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new UserError(`Unexpected argument: ${arg}`);
    const name = arg.slice(2);
    if (name === "json" || name === "no-color") {
      flags[name] = true;
    } else if (name === "url" || name === "stdio" || name === "fail-on") {
      const value = rest[++i];
      if (value === undefined) throw new UserError(`--${name} needs a value`);
      flags[name] = value;
    } else {
      throw new UserError(`Unknown flag: ${arg}`, { fix: "see `mcp-testmate --help`" });
    }
  }
  return { command, flags };
}

function targetFromFlags(flags) {
  if (flags.url && flags.stdio) throw new UserError("Use --url or --stdio, not both");
  if (flags.url) {
    try {
      new URL(flags.url);
    } catch {
      throw new UserError(`Not a valid URL: ${flags.url}`);
    }
    return { type: "http", url: flags.url };
  }
  if (flags.stdio) {
    const { command, args } = parseCommandString(flags.stdio);
    return { type: "stdio", command, args };
  }
  throw new UserError("init needs a target", {
    fix: 'mcp-testmate init --url <url>  or  --stdio "node server.mjs"',
  });
}

/**
 * json — --json flag (check only), machine output, bypasses both renderers
 * interactive — stdout is a TTY and we're not in CI: Ink UI
 * plain — everything else (CI, pipes, redirects): plain text, no ANSI, no React
 */
function uiMode(flags) {
  if (flags.json) return "json";
  const forced = process.env.MCP_TESTMATE_UI;
  if (forced === "plain" || forced === "interactive") return forced;
  return process.stdout.isTTY && !process.env.CI ? "interactive" : "plain";
}

function validFailOn(flags) {
  const failOn = flags["fail-on"] ?? "breaking";
  if (!["breaking", "warning"].includes(failOn)) {
    throw new UserError(`--fail-on must be "breaking" or "warning", got "${failOn}"`);
  }
  return failOn;
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (flags["no-color"]) process.env.NO_COLOR = "1";
  const cwd = process.cwd();
  const mode = uiMode(flags);
  const interactive = mode === "interactive";

  switch (command) {
    case undefined:
    case "help":
    case "--help":
    case "-h": {
      if (interactive) {
        const ui = await import("../lib/ui/run.mjs");
        await ui.renderHelpOnce(pkg.version);
      } else {
        console.log(renderHelp(pkg.version));
      }
      return 0;
    }

    case "--version":
    case "-v":
      console.log(pkg.version);
      return 0;

    case "init": {
      const target = targetFromFlags(flags);
      if (interactive) {
        const ui = await import("../lib/ui/run.mjs");
        return ui.runInit(cwd, target, pkg.version);
      }
      const data = await initFlow(cwd, target, pkg.version);
      console.log(renderInitSummary(data));
      return 0;
    }

    case "snapshot": {
      if (interactive) {
        const ui = await import("../lib/ui/run.mjs");
        return ui.runSnapshot(cwd, pkg.version);
      }
      const data = await snapshotFlow(cwd, pkg.version);
      console.log(renderSnapshotSummary(data));
      return 0;
    }

    case "badge":
      console.log(renderBadge());
      if (process.stderr.isTTY) {
        console.error("\nPaste into your README. Static for now — hosted per-repo badges land with scheduled probing.");
      }
      return 0;

    case "check": {
      const failOn = validFailOn(flags);
      const override = flags.url || flags.stdio ? targetFromFlags(flags) : null;
      if (mode === "json") {
        const report = await checkFlow(cwd, pkg.version, failOn, undefined, override);
        console.log(
          JSON.stringify(
            {
              ok: report.exitCode === 0,
              exitCode: report.exitCode,
              server: report.server,
              counts: {
                breaking: report.groups.breaking.length,
                warning: report.groups.warning.length,
                info: report.groups.info.length,
              },
              findings: report.findings,
            },
            null,
            2
          )
        );
        return report.exitCode;
      }
      if (interactive) {
        const ui = await import("../lib/ui/run.mjs");
        return ui.runCheck(cwd, pkg.version, failOn, override);
      }
      const report = await checkFlow(cwd, pkg.version, failOn, undefined, override);
      console.log(renderCheckReport(report));
      return report.exitCode;
    }

    default:
      throw new UserError(`Unknown command: ${command}`, { fix: "see `mcp-testmate --help`" });
  }
}

try {
  process.exitCode = await main();
} catch (err) {
  const userError =
    err instanceof UserError
      ? err
      : new UserError(`Unexpected error: ${err?.message ?? err}`, {
          fix: "re-run with DEBUG=1 for a stack trace",
        });
  if (!(err instanceof UserError) && process.env.DEBUG) console.error(err);

  const interactive =
    process.env.MCP_TESTMATE_UI === "interactive" ||
    (process.env.MCP_TESTMATE_UI !== "plain" && process.stderr.isTTY && !process.env.CI);
  if (interactive) {
    try {
      const ui = await import("../lib/ui/run.mjs");
      await ui.renderErrorOnce(userError);
    } catch {
      console.error(renderError(userError));
    }
  } else {
    console.error(renderError(userError));
  }
  process.exitCode = 2;
}
