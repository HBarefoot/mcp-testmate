import { Box, Text } from "ink";
import { theme, SEVERITY_ORDER, severityStyle } from "./theme.mjs";
import { verdict as verdictFor } from "../render/plain.mjs";
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
      h(NextStep, { cmd: "GitHub Action", note: "coming soon — watch the repo" })
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

/* ---------- error + help ---------- */

export function ErrorView({ error }) {
  return h(Box, { flexDirection: "column" }, h(ErrorBlock, { error }));
}

const COMMANDS = [
  ["init", "Snapshot a server and write the baseline", 'mcp-testmate init --url http://localhost:3000/mcp'],
  ["check", "Compare the live server against the snapshot", "mcp-testmate check --fail-on warning"],
  ["snapshot", "Re-baseline from the live server", "mcp-testmate snapshot"],
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
