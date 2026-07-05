import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { UserError } from "./errors.mjs";

/** Human-readable label for a target, used in messages and errors. */
export function targetLabel(target) {
  return target.type === "http"
    ? target.url
    : [target.command, ...(target.args ?? [])].join(" ");
}

/**
 * Split a `--stdio "command args..."` string into command + args.
 * Honors single and double quotes so paths with spaces work.
 */
export function parseCommandString(input) {
  const tokens = [];
  let current = "";
  let quote = null;
  let started = false;
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) tokens.push(current);
      current = "";
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (quote) throw new UserError(`unterminated ${quote} quote in --stdio command`);
  if (started) tokens.push(current);
  if (tokens.length === 0) throw new UserError("--stdio needs a command, e.g. --stdio \"node server.mjs\"");
  return { command: tokens[0], args: tokens.slice(1) };
}

export function validateTarget(target) {
  if (!target || typeof target !== "object") {
    throw new UserError("config has no target — re-run `mcp-testmate init`");
  }
  if (target.type === "http") {
    try {
      new URL(target.url);
    } catch {
      throw new UserError(`config target.url is not a valid URL: ${target.url}`);
    }
  } else if (target.type === "stdio") {
    if (!target.command) throw new UserError("config target.command is missing");
  } else {
    throw new UserError(`unknown target type "${target.type}" — expected "http" or "stdio"`);
  }
  return target;
}

function diagnoseConnectError(target, err) {
  const label = targetLabel(target);
  const text = [err?.message, err?.cause?.message, err?.cause?.code, err?.code]
    .filter(Boolean)
    .join(" ");
  if (target.type === "http") {
    if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|fetch failed|network/i.test(text)) {
      return `server unreachable at ${label} — is it running?`;
    }
    const status = /\b(4\d\d|5\d\d)\b/.exec(text)?.[1];
    if (status) {
      return `server at ${label} responded HTTP ${status} — is the MCP endpoint path correct?`;
    }
    return `could not connect to ${label}: ${err?.message ?? err}`;
  }
  if (/ENOENT/.test(text)) {
    return `command not found: ${target.command} — check the --stdio command`;
  }
  return `stdio server "${label}" failed to start: ${err?.message ?? err}`;
}

/**
 * Connect an MCP client to the target. Returns { client, connectMs }.
 * Connection failures become one-line UserErrors, never stack dumps.
 */
export async function connect(target, clientVersion) {
  validateTarget(target);
  const client = new Client({ name: "mcp-testmate", version: clientVersion });
  const transport =
    target.type === "http"
      ? new StreamableHTTPClientTransport(new URL(target.url))
      : new StdioClientTransport({
          command: target.command,
          args: target.args ?? [],
          stderr: process.env.DEBUG ? "inherit" : "ignore",
        });
  const started = performance.now();
  try {
    await client.connect(transport);
  } catch (err) {
    await client.close().catch(() => {});
    throw new UserError(diagnoseConnectError(target, err));
  }
  return { client, connectMs: Math.round(performance.now() - started) };
}
