import { Box, Text } from "ink";
import { theme, SEVERITY_ORDER, severityStyle } from "./theme.mjs";
import {
  verdict as verdictFor,
  testVerdict,
  conformanceVerdict,
  NONDETERMINISTIC_MSG,
} from "../render/plain.mjs";
import { h, Wordmark, Phase, Chips, Verdict, ErrorBlock } from "./components.mjs";

const S = theme.symbols;
const dequote = (v) => String(v).replace(/^"+|"+$/g, "");

/* ---------- init ---------- */

export function InitView({ phase, result }) {
  return h(
    Box,
    { flexDirection: "column" },
    h(Wordmark),
    phase && h(Phase, { label: phase.label }),
    result && h(InitSummary, result)
  );
}

function InitSummary({ intro, targetText, configFile, snapshotFile }) {
  const { server, capabilities, tools, resources, prompts, timings } = intro;
  return h(
    Box,
    { flexDirection: "column" },
    h(
      Box,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: theme.colors.primary,
        paddingX: 1,
        alignSelf: "flex-start",
      },
      h(
        Text,
        null,
        h(Text, { bold: true, color: theme.colors.primary }, server.name),
        h(Text, { dimColor: true }, ` v${server.version}`)
      ),
      h(Text, null, h(Text, { dimColor: true }, "capabilities  "), h(Chips, { items: capabilities })),
      h(
        Text,
        null,
        h(Text, { dimColor: true }, "surface       "),
        `${tools.length} tools ${S.bullet} ${resources.length} resources ${S.bullet} ${prompts.length} prompts`
      ),
      h(
        Text,
        null,
        h(Text, { dimColor: true }, "latency       "),
        `connect ${timings.connectMs}ms`,
        timings.listToolsMs != null ? ` ${S.bullet} tools/list ${timings.listToolsMs}ms` : ""
      ),
      h(
        Text,
        null,
        h(Text, { dimColor: true }, "snapshot      "),
        h(Text, { color: theme.colors.success }, snapshotFile)
      )
    ),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      h(Text, { bold: true }, "Next steps"),
      h(NextStep, { cmd: `git add ${configFile} .mcp-testmate/`, note: "commit the baseline" }),
      h(NextStep, { cmd: "mcp-testmate check", note: "verify against it — wire into CI" }),
      h(NextStep, { cmd: "Add the GitHub Action", note: "fail CI on drift — see README § CI" })
    )
  );
}

function NextStep({ cmd, note }) {
  return h(
    Text,
    null,
    h(Text, { color: theme.colors.accent }, `  ${S.pointer} `),
    h(Text, { color: theme.colors.primary }, cmd),
    h(Text, { dimColor: true }, `  ${note}`)
  );
}

/* ---------- check ---------- */

export function CheckView({ phase, report }) {
  return h(
    Box,
    { flexDirection: "column" },
    phase && h(Phase, { label: phase.label }),
    report && h(CheckReport, report)
  );
}

function CheckReport({ server, groups, failOn, toolCount, totalMs }) {
  const v = verdictFor({ groups, failOn, toolCount, totalMs });
  const sections = SEVERITY_ORDER.filter((sev) => groups[sev].length > 0);
  return h(
    Box,
    { flexDirection: "column" },
    h(
      Text,
      null,
      h(Text, { dimColor: true }, "check "),
      h(Text, { bold: true }, server.name),
      h(Text, { dimColor: true }, ` v${server.version}`)
    ),
    ...sections.map((sev) =>
      h(
        Box,
        { key: sev, flexDirection: "column", marginTop: 1 },
        h(Text, { bold: true, color: severityStyle[sev].color }, `${severityStyle[sev].title} (${groups[sev].length})`),
        ...groups[sev].map((f, i) => h(FindingRow, { key: `${sev}-${i}`, f, sev }))
      )
    ),
    h(Box, { marginTop: 1 }, h(Verdict, { verdict: v }))
  );
}

function FindingRow({ f, sev }) {
  const style = severityStyle[sev];
  const label = f.message.split(":")[0];
  // server.name / server.version paths just repeat the label — skip them
  const showPath = f.path && !f.path.startsWith("server.");
  if (!showPath && f.from === undefined) {
    return h(Text, null, h(Text, { color: style.color }, `  ${style.symbol} `), f.message);
  }
  return h(
    Text,
    null,
    h(Text, { color: style.color }, `  ${style.symbol} `),
    h(Text, null, `${label}  `),
    showPath && h(Text, { bold: true, color: theme.colors.primary }, f.path),
    ...(f.from !== undefined
      ? [
          h(Text, { color: theme.colors.breaking }, `  ${dequote(f.from)}`),
          h(Text, { dimColor: true }, ` ${S.arrow} `),
          h(Text, { color: theme.colors.success }, dequote(f.to)),
        ]
      : [])
  );
}

/* ---------- test ---------- */

const CASE_STYLE = {
  pass: { symbol: theme.symbols.success, color: theme.colors.success },
  fail: { symbol: theme.symbols.breaking, color: theme.colors.breaking },
  nondeterministic: { symbol: theme.symbols.warning, color: theme.colors.warning },
};

export function TestView({ phase, report }) {
  return h(
    Box,
    { flexDirection: "column" },
    phase && h(Phase, { label: phase.label }),
    report && h(TestReport, report)
  );
}

function TestReport({ server, cases, counts, totalMs }) {
  return h(
    Box,
    { flexDirection: "column" },
    h(
      Text,
      null,
      h(Text, { dimColor: true }, "test "),
      h(Text, { bold: true }, server.name),
      h(Text, { dimColor: true }, ` v${server.version}`)
    ),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      ...cases.map((c, i) => h(CaseRow, { key: i, c }))
    ),
    h(Box, { marginTop: 1 }, h(Verdict, { verdict: testVerdict({ counts, server, totalMs }) }))
  );
}

function CaseRow({ c }) {
  const style = CASE_STYLE[c.status];
  const rows = [
    h(
      Text,
      { key: "head" },
      h(Text, { color: style.color }, `  ${style.symbol} `),
      h(Text, { bold: c.status === "fail" }, c.label),
      c.latencyMs != null && h(Text, { dimColor: true }, ` ${c.latencyMs}ms`),
      c.golden && h(Text, { color: theme.colors.info }, ` — golden ${c.golden}`),
      c.status === "nondeterministic" &&
        h(Text, { color: theme.colors.warning }, ` — ${NONDETERMINISTIC_MSG}`)
    ),
  ];
  for (const [j, f] of c.failures.entries()) {
    rows.push(h(Text, { key: `m${j}`, color: theme.colors.breaking }, `      ${f.message}`));
    if (f.expected !== undefined) {
      rows.push(
        h(
          Text,
          { key: `e${j}` },
          h(Text, { dimColor: true }, "        expected: "),
          h(Text, { color: theme.colors.success }, f.expected)
        )
      );
    }
    if (f.actual !== undefined) {
      rows.push(
        h(
          Text,
          { key: `a${j}` },
          h(Text, { dimColor: true }, "        actual:   "),
          h(Text, { color: theme.colors.breaking }, f.actual)
        )
      );
    }
  }
  return h(Box, { flexDirection: "column" }, ...rows);
}

/* ---------- conformance ---------- */

export function ConformanceView({ phase, report }) {
  return h(
    Box,
    { flexDirection: "column" },
    phase && h(Phase, { label: phase.label }),
    report && h(ConformanceReport, report)
  );
}

function ConformanceReport({ server, suiteVersion, strict, scenarios, counts, notes }) {
  const applicable = scenarios.filter((s) => s.bucket === "applicable");
  const undeclared = scenarios.filter((s) => s.bucket === "skipped-undeclared");
  const fixture = scenarios.filter((s) => s.bucket === "skipped-fixture");
  const byReason = new Map();
  for (const s of undeclared) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s.name]);

  return h(
    Box,
    { flexDirection: "column" },
    h(
      Text,
      null,
      h(Text, { dimColor: true }, "conformance "),
      h(Text, { bold: true }, server.name),
      h(Text, { dimColor: true }, ` v${server.version} ${S.bullet} official suite ${suiteVersion}`)
    ),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      h(Text, { bold: true }, `APPLICABLE (${applicable.length})`),
      ...applicable.map((s) =>
        h(
          Text,
          { key: s.name },
          h(
            Text,
            { color: s.passed ? theme.colors.success : theme.colors.breaking },
            `  ${s.passed ? theme.symbols.success : theme.symbols.breaking} `
          ),
          s.name,
          s.unknown && h(Text, { dimColor: true }, "  (not in map — defaulted to applicable)")
        )
      )
    ),
    undeclared.length > 0 &&
      h(
        Box,
        { flexDirection: "column", marginTop: 1 },
        h(Text, { bold: true, dimColor: true }, `SKIPPED ${S.bullet} capability not declared (${undeclared.length})`),
        ...[...byReason.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([reason, names]) =>
          h(
            Text,
            { key: reason },
            h(Text, { color: theme.colors.primary }, `  ${reason}`),
            h(Text, { dimColor: true }, `: ${names.join(", ")}`)
          )
        )
      ),
    fixture.length > 0 &&
      h(
        Box,
        { flexDirection: "column", marginTop: 1 },
        h(Text, { bold: true, dimColor: true }, `SKIPPED ${S.bullet} fixture-only (${fixture.length})`),
        h(Text, { dimColor: true, wrap: "wrap" }, `  ${fixture.map((s) => s.name).join(", ")}`)
      ),
    notes.length > 0 &&
      h(
        Box,
        { flexDirection: "column", marginTop: 1 },
        ...notes.map((n, i) => h(Text, { key: i, dimColor: true }, `${theme.symbols.info} note: ${n}`))
      ),
    h(Box, { marginTop: 1 }, h(Verdict, { verdict: conformanceVerdict({ counts, strict }) }))
  );
}

/* ---------- error + help ---------- */

export function ErrorView({ error }) {
  return h(Box, { flexDirection: "column" }, h(ErrorBlock, { error }));
}

const COMMANDS = [
  ["init", "Snapshot a server and write the baseline", 'mcp-testmate init --url http://localhost:3000/mcp'],
  ["check", "Compare the live server against the snapshot", "mcp-testmate check --all"],
  ["test", "Run response-regression tests on real tools", "mcp-testmate test --update"],
  ["conformance", "Official conformance suite, capability-aware", "mcp-testmate conformance --strict"],
  ["snapshot", "Re-baseline from the live server", "mcp-testmate snapshot"],
  ["badge", 'Print the "MCP-tested ✓" badge markdown', "mcp-testmate badge >> README.md"],
];

export function HelpView({ version }) {
  return h(
    Box,
    { flexDirection: "column" },
    h(Wordmark),
    h(Text, { dimColor: true }, `v${version}`),
    h(Box, { flexDirection: "column", marginTop: 1 },
      h(Text, { bold: true }, "Commands"),
      ...COMMANDS.map(([name, desc, example]) =>
        h(
          Box,
          { key: name, flexDirection: "column", marginBottom: 1 },
          h(
            Text,
            null,
            h(Text, { bold: true, color: theme.colors.primary }, `  ${name.padEnd(10)}`),
            desc
          ),
          h(Text, { dimColor: true }, `            $ ${example}`)
        )
      )
    ),
    h(
      Text,
      null,
      h(Text, { bold: true }, "Options   "),
      h(Text, { dimColor: true }, `--json ${S.bullet} --fail-on breaking|warning ${S.bullet} --no-color`)
    ),
    h(
      Text,
      { dimColor: true },
      `Exit codes  0 clean ${S.bullet} 1 breaking drift ${S.bullet} 2 error`
    )
  );
}
