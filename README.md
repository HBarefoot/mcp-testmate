# mcp-testmate

**Testing and reliability for MCP servers.** Snapshot your tool schemas, catch drift before your users do, regression-test your responses, and know the moment your production MCP server breaks.

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

`check` re-introspects the live server, diffs it against the committed snapshot, and classifies every change:

```
mcp-testmate check · demo-server v1.3.0

✗ BREAKING (2)
  ✗ param type changed: add.a ("number" → "string")
  ✗ new required param added: echo.format

⚠ WARNING (1)
  ⚠ optional param removed: add.precision

ℹ INFO (1)
  ℹ server version changed: 1.2.3 → 1.3.0

✗ drift detected: 2 breaking, 1 warning, 1 info
```

Exit codes are CI-friendly: `0` clean (or INFO-only), `1` breaking drift (`--fail-on warning` to be stricter), `2` config/connection error. Use `--json` for machine-readable output. Re-baseline intentionally with `mcp-testmate snapshot`.

**Capability-aware by design:** mcp-testmate reads your server's declared capabilities after `initialize` and only introspects what the server actually claims. A server that doesn't implement prompts or resources is never queried for them — and never penalized.

## Why

MCP servers break silently: spec revisions, dependency bumps, client differences. The official conformance suite answers *"does this implementation conform to the protocol?"* — mcp-testmate answers the question it never will: **"does MY server, with MY tools, still behave the way it did yesterday — and is it up right now?"**

## What's here today (v0.1)

- `mcp-testmate init` — snapshot your server's tools, resources, prompts, and schemas in one command
- **Schema drift detection** — diff live server against committed baseline; fail CI on breaking changes
- **Both transports** — Streamable HTTP (`--url`) and stdio (`--stdio`) from day one
- **Capability-aware introspection** — only queries what your server declares

## What's coming

- **Response regression tests** — golden-output assertions on your actual tools
- **Capability-aware conformance** — wraps the official suite, skips what your server doesn't claim
- **Latency baselines** — catch performance regressions per tool
- **GitHub Action + badge** — `MCP-tested ✓`
- **Scheduled production probing** — hosted monitoring, drift alerts, status pages *(paid tier)*

See [docs/ROADMAP.md](docs/ROADMAP.md).

MIT · by [Henry Barefoot](https://barefootdigital.dev)
