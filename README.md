# mcp-testmate

[![MCP-tested ✓](https://img.shields.io/badge/MCP--tested-%E2%9C%93-22d3ee)](https://github.com/HBarefoot/mcp-testmate) [![CI](https://github.com/HBarefoot/mcp-testmate/actions/workflows/ci.yml/badge.svg)](https://github.com/HBarefoot/mcp-testmate/actions/workflows/ci.yml)

**Testing and reliability for MCP servers.** Snapshot your tool schemas, catch drift before your users do, regression-test your responses, and know the moment your production MCP server breaks.

<!-- TODO: replace with real capture — docs/assets/init-demo.gif (interactive `init` with gradient wordmark, spinner phases, summary card) -->
![mcp-testmate init — interactive terminal UI](docs/assets/init-demo.gif)

## Quick Start

```bash
npm install -D mcp-testmate

# Snapshot your server's surface (tools, resources, prompts, capabilities)
npx mcp-testmate init --url http://localhost:3000/mcp
# …or for a stdio server:
npx mcp-testmate init --stdio "node server.mjs"

# Commit the baseline
git add mcp-testmate.config.json .mcp-testmate/snapshot.json

# Then, in CI or any time you change your server:
npx mcp-testmate check
```

`check` re-introspects the live server, diffs it against the committed snapshot, and classifies every change. This is exactly what your CI log shows:

```
mcp-testmate check · demo-server v1.3.0

BREAKING (2)
  ✗ param type changed: add.a ("number" → "string")
  ✗ new required param added: echo.format

WARNING (1)
  ⚠ optional param removed: add.precision

INFO (1)
  ● server version changed: 1.2.3 → 1.3.0

✗ 2 breaking changes — this commit was going to break your users
```

In an interactive terminal you get the full experience — spinner phases, capability chips, mini-diffs (`add.a  number → string`), and a summary card — while CI, pipes, and redirects automatically get the clean plain-text renderer above: same information, zero ANSI noise. `NO_COLOR` and `--no-color` are respected everywhere.

Exit codes are CI-friendly: `0` clean (or INFO-only), `1` breaking drift (`--fail-on warning` to be stricter), `2` config/connection error. Use `--json` for machine-readable output. Re-baseline intentionally with `mcp-testmate snapshot`.

## Response regression tests

Schema drift catches contract changes; response tests catch *behavior* changes — they call your **real tools** with **your arguments** and assert on the outputs. No conformance suite can do this, because no conformance suite knows what your tools are supposed to return.

Add a `tests` array to `mcp-testmate.config.json`:

```json
{
  "target": { "type": "http", "url": "http://localhost:3000/mcp" },
  "tests": [
    { "tool": "echo", "args": { "message": "hi" }, "expect": { "matchSnapshot": true } },
    { "tool": "add", "args": { "a": 2, "b": 3 }, "expect": { "contains": "5", "maxLatencyMs": 1500 } },
    { "tool": "get_status", "args": {}, "expect": { "jsonPath": "$.status", "equals": "approved" } }
  ]
}
```

Then:

```console
$ mcp-testmate test
mcp-testmate test · demo-server v1.2.3

  ✓ echo({"message":"hi"}) 12ms — golden recorded
  ✓ add({"a":2,"b":3}) 9ms
  ✗ get_status() 8ms
      jsonPath $.status mismatch
        expected: "approved"
        actual:   "pending"

✗ 1 failed of 3 tests
```

**Expect variants** (freely combinable in one case):

| key | asserts |
| --- | --- |
| `matchSnapshot: true` | output matches the golden recorded under `.mcp-testmate/golden/` (first run records it — commit the folder) |
| `contains: "str"` | tool's text output contains the string |
| `jsonPath: "$.a.b[0]", equals: value` | exact value at that path in the JSON/structured output (subset: `$.key`, `$["key"]`, `$[0]` — no wildcards) |
| `maxLatencyMs: 1500` | the call finished within the budget |

Goldens follow the Jest convention: missing → recorded (not failed); intentionally changed output → `mcp-testmate test --update` to re-record.

**Determinism guard.** Snapshot-testing a tool that returns timestamps, IDs, or random data would fail on every run — and flaky failures kill trust in a testing tool faster than missed regressions do. So when a golden mismatch occurs, mcp-testmate calls the tool a second time: if the two live outputs *also* differ from each other, you get `⚠ output appears non-deterministic; use contains/jsonPath instead of matchSnapshot` — pointing you to the assertions built for exactly that (e.g. `contains` on a stable substring, or `jsonPath` on a stable field).

**CI mode:** `mcp-testmate check --all` runs the drift check *and* the response tests in one command; the exit code is the worst of both.

**Capability-aware by design:** mcp-testmate reads your server's declared capabilities after `initialize` and only introspects what the server actually claims. A server that doesn't implement prompts or resources is never queried for them — and never penalized.

## GitHub Action

Run `check` on every PR **and on a schedule** — the cron matters, because schema drift happens *without* code changes: a dependency bump, a spec revision, or a remote server update can change your tool surface while your repo sits still.

```yaml
name: MCP drift check
on:
  pull_request:
  schedule:
    - cron: "0 6 * * 1" # weekly — drift happens without code changes

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: HBarefoot/mcp-testmate@main
        with:
          start: node server.mjs # launches your server, waits until `url` responds
          url: http://127.0.0.1:3000/mcp
```

Inputs: `url` or `stdio` (override the committed config's target — handy when CI runs the server on localhost), `fail-on` (`breaking`, default, or `warning`), `working-directory`, and `start` (background-launch command for HTTP targets; stdio targets don't need it — the CLI spawns those itself). If your repo has `mcp-testmate` installed as a devDependency the action uses that pinned version, otherwise it runs the latest release via `npx`.

### Badge

```console
$ npx mcp-testmate badge
[![MCP-tested ✓](https://img.shields.io/badge/MCP--tested-%E2%9C%93-22d3ee)](https://github.com/HBarefoot/mcp-testmate)
```

Paste it into your README to show your MCP server is drift-tested. Static for now — hosted per-repo badges land with scheduled probing.

## Why

MCP servers break silently: spec revisions, dependency bumps, client differences. The official conformance suite answers *"does this implementation conform to the protocol?"* — mcp-testmate answers the question it never will: **"does MY server, with MY tools, still behave the way it did yesterday — and is it up right now?"**

## What's here today

- `mcp-testmate init` — snapshot your server's tools, resources, prompts, and schemas in one command
- **Schema drift detection** — diff live server against committed baseline; fail CI on breaking changes
- **Response regression tests** — golden outputs, `contains`/`jsonPath` asserts, per-call latency budgets, with a determinism guard
- **Both transports** — Streamable HTTP (`--url`) and stdio (`--stdio`) from day one
- **Capability-aware introspection** — only queries what your server declares
- **Dual renderer** — polished interactive terminal UI (built on [Ink](https://github.com/vadimdemedes/ink)), automatic clean plain-text output in CI and pipes
- **GitHub Action + badge** — drop-in CI with PR + scheduled drift checks, `MCP-tested ✓`

## What's coming

- **Capability-aware conformance** — wraps the official suite, skips what your server doesn't claim
- **Latency baselines** — automatic per-tool baselines (today: explicit `maxLatencyMs` budgets)
- **Scheduled production probing** — hosted monitoring, drift alerts, status pages *(paid tier)*

See [docs/ROADMAP.md](docs/ROADMAP.md).

MIT · by [Henry Barefoot](https://barefootdigital.dev)
