# Roadmap

## Stage 1 — OSS CLI

The core open-source tool: `mcp-testmate init` connects to your MCP server (stdio or Streamable HTTP), snapshots its tools, resources, and schemas into a committed baseline, and `mcp-testmate check` diffs the live server against it — failing on breaking schema drift. Response regression tests assert golden outputs from your actual tools, and latency baselines catch per-tool performance regressions. Capability-aware conformance wraps the official @modelcontextprotocol/conformance suite and skips scenarios for capabilities your server doesn't declare, so the results reflect your server rather than the fixture the suite expects.

- [x] `init` / `check` / `snapshot` — schema snapshotting + drift classification (v0.1)
- [x] stdio and Streamable HTTP targets (v0.1)
- [x] Capability-aware introspection (v0.1)
- [x] Branded terminal UI + plain CI renderer + `--json` (v0.1)
- [x] Response regression tests — goldens, contains/jsonPath, latency budgets, determinism guard (v0.3)
- [ ] Latency baselines (automatic per-tool; explicit `maxLatencyMs` budgets shipped in v0.3)
- [ ] Capability-aware conformance wrapper

## Stage 2 — GitHub Action + badge

A first-class GitHub Action that runs snapshot checks, drift detection, and regression tests on every push and PR, with clear annotated failures. Passing repos get an "MCP-tested ✓" badge for the README — a trust signal for anyone deciding whether to plug your server into their client.

- [x] Composite action (`action.yml`): `url`/`stdio`/`fail-on`/`working-directory`/`start` inputs, wait-for-ready, pinned-install preference (v0.2)
- [x] `mcp-testmate badge` — static shields.io "MCP-tested ✓" markdown (v0.2)
- [x] Dogfood workflow on this repo (v0.2)
- [ ] Hosted per-repo badge endpoint (live drift status, not static)
- [ ] PR annotations for individual findings

## Stage 3 — Hosted scheduled probing (paid)

A hosted service that probes your production MCP servers on a schedule: uptime, schema drift against your committed baseline, response and latency regressions — with alerts (Slack/email/webhook) and public or private status pages. This is the paid tier that funds the OSS work: CI tells you a change broke something; probing tells you production broke, even when nothing was deployed.

- [ ] Scheduled probes (uptime + drift + latency)
- [ ] Alerts: Slack / email / webhook
- [ ] Status pages + live badges
