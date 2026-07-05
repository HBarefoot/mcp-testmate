import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { UserError } from "./errors.mjs";

export const CONFIG_FILE = "mcp-testmate.config.json";
export const SNAPSHOT_FILE = join(".mcp-testmate", "snapshot.json");

/** Recursively sort object keys so serialized JSON is byte-stable across runs. */
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * Shape an introspection result into the committed snapshot format:
 * fixed top-level key order, arrays sorted by name/uri, nested schemas
 * canonicalized — so `git diff` on the snapshot is always clean.
 */
export function buildSnapshot(target, intro, createdAt) {
  return {
    mcpTestmate: 1,
    createdAt,
    target,
    server: { name: intro.server.name, version: intro.server.version },
    capabilities: [...intro.capabilities].sort(),
    tools: intro.tools
      .map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: canonicalize(t.inputSchema ?? {}),
      }))
      .sort(byName),
    resources: intro.resources
      .map((r) => ({ uri: r.uri, name: r.name ?? "", mimeType: r.mimeType ?? "" }))
      .sort((a, b) => a.uri.localeCompare(b.uri)),
    prompts: intro.prompts
      .map((p) => ({
        name: p.name,
        description: p.description ?? "",
        args: (p.arguments ?? [])
          .map((a) => ({ name: a.name, required: !!a.required }))
          .sort(byName),
      }))
      .sort(byName),
    timings: intro.timings,
  };
}

export function saveSnapshot(cwd, snapshot) {
  const path = join(cwd, SNAPSHOT_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
  return path;
}

export function loadSnapshot(cwd) {
  return readJson(
    join(cwd, SNAPSHOT_FILE),
    `no snapshot found at ${SNAPSHOT_FILE} — run \`mcp-testmate init\` first`
  );
}

export function saveConfig(cwd, config) {
  const path = join(cwd, CONFIG_FILE);
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
  return path;
}

export function loadConfig(cwd) {
  return readJson(
    join(cwd, CONFIG_FILE),
    `no ${CONFIG_FILE} found — run \`mcp-testmate init\` first`
  );
}

function readJson(path, missingMessage) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") throw new UserError(missingMessage);
    throw new UserError(`could not read ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new UserError(`${path} is not valid JSON — delete it and re-run \`mcp-testmate init\``);
  }
}
