/**
 * Compare a committed baseline snapshot against a live introspection snapshot
 * and classify every difference:
 *
 *   BREAKING — tool removed; capability removed; required param removed;
 *              param type changed; new required param added; optional→required;
 *              resource/prompt removed
 *   WARNING  — optional param removed
 *   INFO     — tool/resource/prompt added; optional param added;
 *              required→optional; description changed; server version changed
 */
export function diffSnapshots(base, live) {
  const findings = [];
  const add = (severity, code, message) => findings.push({ severity, code, message });

  if (base.server.name !== live.server.name) {
    add("info", "server-name-changed", `server name changed: ${base.server.name} → ${live.server.name}`);
  }
  if (base.server.version !== live.server.version) {
    add("info", "server-version-changed", `server version changed: ${base.server.version} → ${live.server.version}`);
  }

  for (const cap of base.capabilities) {
    if (!live.capabilities.includes(cap)) add("breaking", "capability-removed", `capability removed: ${cap}`);
  }
  for (const cap of live.capabilities) {
    if (!base.capabilities.includes(cap)) add("info", "capability-added", `capability added: ${cap}`);
  }

  diffNamed(base.tools, live.tools, "name", {
    removed: (t) => add("breaking", "tool-removed", `tool removed: ${t.name}`),
    added: (t) => add("info", "tool-added", `tool added: ${t.name}`),
    both: (bt, lt) => diffTool(bt, lt, add),
  });

  diffNamed(base.resources, live.resources, "uri", {
    removed: (r) => add("breaking", "resource-removed", `resource removed: ${r.uri}`),
    added: (r) => add("info", "resource-added", `resource added: ${r.uri}`),
    both: (br, lr) => {
      if (br.mimeType !== lr.mimeType) {
        add("info", "resource-changed", `resource mimeType changed: ${br.uri} (${br.mimeType || "none"} → ${lr.mimeType || "none"})`);
      }
      if (br.name !== lr.name) {
        add("info", "resource-changed", `resource name changed: ${br.uri} (${br.name || "none"} → ${lr.name || "none"})`);
      }
    },
  });

  diffNamed(base.prompts, live.prompts, "name", {
    removed: (p) => add("breaking", "prompt-removed", `prompt removed: ${p.name}`),
    added: (p) => add("info", "prompt-added", `prompt added: ${p.name}`),
    both: (bp, lp) => diffPrompt(bp, lp, add),
  });

  return findings;
}

function diffNamed(baseList, liveList, key, handlers) {
  const liveMap = new Map(liveList.map((item) => [item[key], item]));
  for (const baseItem of baseList) {
    const liveItem = liveMap.get(baseItem[key]);
    if (!liveItem) handlers.removed(baseItem);
    else handlers.both(baseItem, liveItem);
    liveMap.delete(baseItem[key]);
  }
  for (const liveItem of liveMap.values()) handlers.added(liveItem);
}

function paramsOf(tool) {
  const schema = tool.inputSchema ?? {};
  const required = new Set(schema.required ?? []);
  const params = new Map();
  for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
    params.set(name, { schema: propSchema ?? {}, required: required.has(name) });
  }
  return params;
}

const typeOf = (propSchema) =>
  propSchema.type !== undefined ? JSON.stringify(propSchema.type) : "unspecified";

function diffTool(bt, lt, add) {
  if ((bt.description ?? "") !== (lt.description ?? "")) {
    add("info", "tool-description-changed", `tool description changed: ${bt.name}`);
  }
  const baseParams = paramsOf(bt);
  const liveParams = paramsOf(lt);

  for (const [name, bp] of baseParams) {
    const ref = `${bt.name}.${name}`;
    const lp = liveParams.get(name);
    if (!lp) {
      if (bp.required) add("breaking", "required-param-removed", `required param removed: ${ref}`);
      else add("warning", "optional-param-removed", `optional param removed: ${ref}`);
      continue;
    }
    if (typeOf(bp.schema) !== typeOf(lp.schema)) {
      add("breaking", "param-type-changed", `param type changed: ${ref} (${typeOf(bp.schema)} → ${typeOf(lp.schema)})`);
    }
    if (!bp.required && lp.required) {
      add("breaking", "param-now-required", `param changed optional → required: ${ref}`);
    } else if (bp.required && !lp.required) {
      add("info", "param-now-optional", `param changed required → optional: ${ref}`);
    }
  }
  for (const [name, lp] of liveParams) {
    if (baseParams.has(name)) continue;
    const ref = `${bt.name}.${name}`;
    if (lp.required) add("breaking", "required-param-added", `new required param added: ${ref}`);
    else add("info", "optional-param-added", `optional param added: ${ref}`);
  }
}

function diffPrompt(bp, lp, add) {
  if ((bp.description ?? "") !== (lp.description ?? "")) {
    add("info", "prompt-description-changed", `prompt description changed: ${bp.name}`);
  }
  const baseArgs = new Map((bp.args ?? []).map((a) => [a.name, a]));
  const liveArgs = new Map((lp.args ?? []).map((a) => [a.name, a]));

  for (const [name, ba] of baseArgs) {
    const ref = `${bp.name}.${name}`;
    const la = liveArgs.get(name);
    if (!la) {
      if (ba.required) add("breaking", "required-param-removed", `required prompt arg removed: ${ref}`);
      else add("warning", "optional-param-removed", `optional prompt arg removed: ${ref}`);
      continue;
    }
    if (!ba.required && la.required) {
      add("breaking", "param-now-required", `prompt arg changed optional → required: ${ref}`);
    } else if (ba.required && !la.required) {
      add("info", "param-now-optional", `prompt arg changed required → optional: ${ref}`);
    }
  }
  for (const [name, la] of liveArgs) {
    if (baseArgs.has(name)) continue;
    const ref = `${bp.name}.${name}`;
    if (la.required) add("breaking", "required-param-added", `new required prompt arg added: ${ref}`);
    else add("info", "optional-param-added", `optional prompt arg added: ${ref}`);
  }
}

/** Bucket findings by severity: { breaking: [...], warning: [...], info: [...] } */
export function groupFindings(findings) {
  const groups = { breaking: [], warning: [], info: [] };
  for (const f of findings) groups[f.severity].push(f);
  return groups;
}

/** Exit code for a set of findings under a given --fail-on threshold. */
export function exitCodeFor(findings, failOn = "breaking") {
  const groups = groupFindings(findings);
  if (groups.breaking.length > 0) return 1;
  if (failOn === "warning" && groups.warning.length > 0) return 1;
  return 0;
}
