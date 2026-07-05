/**
 * The expect engine for response-regression tests. A test case's `expect`
 * object may combine any of:
 *
 *   matchSnapshot: true            golden output under .mcp-testmate/golden/
 *   contains: "str"                substring of the tool's text output
 *   jsonPath: "$.a.b[0]", equals   value assertion on JSON/structured output
 *   maxLatencyMs: 1500             per-call latency budget
 */
import { UserError } from "./errors.mjs";
import { canonicalize } from "./snapshot.mjs";

/** Sorted-key stringify — the equality currency for outputs and args. */
export const canonicalJson = (value) => JSON.stringify(canonicalize(value));

const KNOWN_EXPECT_KEYS = ["matchSnapshot", "contains", "jsonPath", "equals", "maxLatencyMs"];

export function validateTests(tests) {
  if (!Array.isArray(tests)) {
    throw new UserError('config "tests" must be an array of test cases');
  }
  tests.forEach((t, i) => {
    const where = `tests[${i}]`;
    if (!t || typeof t !== "object") throw new UserError(`${where} must be an object`);
    if (typeof t.tool !== "string" || t.tool === "") {
      throw new UserError(`${where}: "tool" (string) is required`);
    }
    if (t.args !== undefined && (t.args === null || typeof t.args !== "object" || Array.isArray(t.args))) {
      throw new UserError(`${where}: "args" must be an object`);
    }
    const e = t.expect;
    if (!e || typeof e !== "object" || Array.isArray(e)) {
      throw new UserError(`${where}: "expect" (object) is required`, {
        fix: 'e.g. "expect": { "contains": "ok" } — see README for all variants',
      });
    }
    const unknown = Object.keys(e).filter((k) => !KNOWN_EXPECT_KEYS.includes(k));
    if (unknown.length > 0) {
      throw new UserError(`${where}: unknown expect key "${unknown[0]}"`, {
        likely: "a typo — unknown keys would silently never fail, so they're rejected",
        fix: `known keys: ${KNOWN_EXPECT_KEYS.join(", ")}`,
      });
    }
    if (Object.keys(e).length === 0) {
      throw new UserError(`${where}: "expect" must have at least one assertion`);
    }
    if (e.matchSnapshot !== undefined && e.matchSnapshot !== true) {
      throw new UserError(`${where}: "matchSnapshot" must be true (omit it otherwise)`);
    }
    if (e.contains !== undefined && typeof e.contains !== "string") {
      throw new UserError(`${where}: "contains" must be a string`);
    }
    if (e.jsonPath !== undefined) {
      if (typeof e.jsonPath !== "string" || !e.jsonPath.startsWith("$")) {
        throw new UserError(`${where}: "jsonPath" must be a string starting with $`);
      }
      if (!("equals" in e)) {
        throw new UserError(`${where}: "jsonPath" needs an "equals" value to compare against`);
      }
    }
    if ("equals" in e && e.jsonPath === undefined) {
      throw new UserError(`${where}: "equals" only works together with "jsonPath"`);
    }
    if (e.maxLatencyMs !== undefined && (typeof e.maxLatencyMs !== "number" || e.maxLatencyMs <= 0)) {
      throw new UserError(`${where}: "maxLatencyMs" must be a positive number`);
    }
  });
}

/**
 * Minimal JSONPath subset: $.key, $["key"], $['key'], $[0]. Deliberately no
 * wildcards/filters — assertions should be exact and predictable.
 */
export function jsonPathGet(root, path) {
  const STEP = /^(?:\.([A-Za-z_$][\w$]*)|\[(\d+)\]|\["([^"]*)"\]|\['([^']*)'\])/;
  let value = root;
  let rest = path.slice(1);
  while (rest.length > 0) {
    const m = STEP.exec(rest);
    if (!m) {
      throw new UserError(`unsupported jsonPath syntax at "${rest}"`, {
        fix: 'supported: $.key, $["key"], $[0] — no wildcards or filters',
      });
    }
    const key = m[2] !== undefined ? Number(m[2]) : m[1] ?? m[3] ?? m[4];
    if (value === null || typeof value !== "object" || !(key in Object(value))) {
      return { found: false };
    }
    value = value[key];
    rest = rest.slice(m[0].length);
  }
  return { found: true, value };
}

/** All text content of a tool result, newline-joined. */
export function resultText(result) {
  return (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/** The value jsonPath runs against: structuredContent, else parsed text. */
export function resultValue(result) {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = resultText(result);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The comparable shape stored in goldens: content + structuredContent. */
export function normalizeOutput(result) {
  const output = { content: canonicalize(result.content ?? []) };
  if (result.structuredContent !== undefined) {
    output.structuredContent = canonicalize(result.structuredContent);
  }
  return output;
}

const truncate = (s, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Evaluate every non-snapshot assertion. Returns failure objects with a
 * message and display-ready expected/actual strings.
 */
export function evaluateExpectations(test, result, latencyMs) {
  const e = test.expect;
  const failures = [];

  if (e.contains !== undefined) {
    const haystack =
      resultText(result) +
      (result.structuredContent !== undefined ? `\n${JSON.stringify(result.structuredContent)}` : "");
    if (!haystack.includes(e.contains)) {
      failures.push({
        kind: "contains",
        message: `expected output to contain "${e.contains}"`,
        actual: truncate(haystack.trim() || "(empty output)"),
      });
    }
  }

  if (e.jsonPath !== undefined) {
    const value = resultValue(result);
    const got = jsonPathGet(value, e.jsonPath);
    if (!got.found) {
      failures.push({
        kind: "jsonPath",
        message: `jsonPath ${e.jsonPath} not found in output`,
        actual: truncate(JSON.stringify(value)),
      });
    } else if (canonicalJson(got.value) !== canonicalJson(e.equals)) {
      failures.push({
        kind: "jsonPath",
        message: `jsonPath ${e.jsonPath} mismatch`,
        expected: JSON.stringify(e.equals),
        actual: JSON.stringify(got.value),
      });
    }
  }

  if (e.maxLatencyMs !== undefined && latencyMs > e.maxLatencyMs) {
    failures.push({
      kind: "latency",
      message: `latency ${latencyMs}ms exceeded maxLatencyMs ${e.maxLatencyMs}`,
    });
  }

  return failures;
}
