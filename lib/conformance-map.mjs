/**
 * Scenario → requirement mapping for the official
 * @modelcontextprotocol/conformance suite. This is what makes the wrapper
 * capability-aware: the official suite runs every scenario against every
 * server; we bucket them against what the server actually declares.
 *
 *   requires: "core"          always applicable (protocol/transport/security)
 *   requires: "<capability>"  applicable only if declared (dot path for
 *                             sub-capabilities, e.g. "resources.subscribe")
 *   fixture: true             validates purpose-built demo servers (specific
 *                             content types, client-feature round-trips) —
 *                             skipped unless explicitly opted in, because a
 *                             production server failing them signals nothing
 *
 * Versioned against the pinned suite release. Scenarios the map doesn't know
 * (newer suite versions) default to APPLICABLE with a note — we'd rather
 * over-test than silently skip.
 */
export const SUITE_VERSION = "0.1.16";
export const MAP_VERSION = 1;

export const SCENARIO_MAP = {
  // core protocol / transport / security — every server must pass these
  "server-initialize": { requires: "core" },
  ping: { requires: "core" },
  "server-sse-polling": { requires: "core" },
  "server-sse-multiple-streams": { requires: "core" },
  "dns-rebinding-protection": { requires: "core" },

  // tools
  "tools-list": { requires: "tools" },
  "tools-call-simple-text": { requires: "tools" },
  "tools-call-error": { requires: "tools" },
  "json-schema-2020-12": { requires: "tools" },
  // fixture-flavored: need tools purpose-built to return these content types
  // or exercise client features (sampling/elicitation/logging/progress)
  "tools-call-image": { requires: "tools", fixture: true },
  "tools-call-audio": { requires: "tools", fixture: true },
  "tools-call-embedded-resource": { requires: "tools", fixture: true },
  "tools-call-mixed-content": { requires: "tools", fixture: true },
  "tools-call-with-logging": { requires: "tools", fixture: true },
  "tools-call-with-progress": { requires: "tools", fixture: true },
  "tools-call-sampling": { requires: "tools", fixture: true },
  "tools-call-elicitation": { requires: "tools", fixture: true },
  "elicitation-sep1034-defaults": { requires: "tools", fixture: true },
  "elicitation-sep1330-enums": { requires: "tools", fixture: true },

  // resources
  "resources-list": { requires: "resources" },
  "resources-read-text": { requires: "resources" },
  // fixture-flavored: need a binary resource / a resource template to exist
  "resources-read-binary": { requires: "resources", fixture: true },
  "resources-templates-read": { requires: "resources", fixture: true },
  // sub-capability: only applicable when resources.subscribe is declared
  "resources-subscribe": { requires: "resources.subscribe" },
  "resources-unsubscribe": { requires: "resources.subscribe" },

  // prompts
  "prompts-list": { requires: "prompts" },
  "prompts-get-simple": { requires: "prompts" },
  "prompts-get-with-args": { requires: "prompts" },
  "prompts-get-embedded-resource": { requires: "prompts", fixture: true },
  "prompts-get-with-image": { requires: "prompts", fixture: true },

  // other declared capabilities
  "logging-set-level": { requires: "logging" },
  "completion-complete": { requires: "completions" },
};

/** True if the (possibly dotted) requirement path is declared in raw capabilities. */
export function isDeclared(requires, capabilityDetail) {
  if (requires === "core") return true;
  let node = capabilityDetail ?? {};
  for (const key of requires.split(".")) {
    if (node === null || typeof node !== "object" || !(key in node)) return false;
    node = node[key];
  }
  return true;
}
