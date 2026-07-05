# Roadmap

## Stage 1 — OSS CLI

The core open-source tool: `mcp-testmate init` connects to your MCP server (stdio or Streamable HTTP), snapshots its tools, resources, and schemas into a committed baseline, and `mcp-testmate check` diffs the live server against it — failing on breaking schema drift. Response regression tests assert golden outputs from your actual tools, and latency baselines catch per-tool performance regressions. Capability-aware conformance wraps the official @modelcontextprotocol/conformance suite and skips scenarios for capabilities your server doesn't declare, so the results reflect your server rather than the fixture the suite expects.

## Stage 2 — GitHub Action + badge

A first-class GitHub Action that runs snapshot checks, drift detection, and regression tests on every push and PR, with clear annotated failures. Passing repos get an "MCP-tested ✓" badge for the README — a trust signal for anyone deciding whether to plug your server into their client.

## Stage 3 — Hosted scheduled probing (paid)

A hosted service that probes your production MCP servers on a schedule: uptime, schema drift against your committed baseline, response and latency regressions — with alerts (Slack/email/webhook) and public or private status pages. This is the paid tier that funds the OSS work: CI tells you a change broke something; probing tells you production broke, even when nothing was deployed.
