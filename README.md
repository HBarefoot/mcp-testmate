# mcp-testmate

**Testing and reliability for MCP servers.** Snapshot your tool schemas, catch drift before your users do, regression-test your responses, and know the moment your production MCP server breaks.

> ⚠️ v0.0.1 is a name-claim placeholder. Active development in progress — watch this repo.

## Why

MCP servers break silently: spec revisions, dependency bumps, client differences. The official conformance suite answers *"does this implementation conform to the protocol?"* — mcp-testmate answers the question it never will: **"does MY server, with MY tools, still behave the way it did yesterday — and is it up right now?"**

## What's coming

- `mcp-testmate init` — snapshot your server's tools, resources, and schemas in one command
- **Schema drift detection** — diff live server against committed baseline; fail CI on breaking changes
- **Response regression tests** — golden-output assertions on your actual tools
- **Capability-aware conformance** — wraps the official suite, skips what your server doesn't claim
- **Latency baselines** — catch performance regressions per tool
- **GitHub Action + badge** — `MCP-tested ✓`
- **Scheduled production probing** — hosted monitoring, drift alerts, status pages *(paid tier)*

MIT · by [Henry Barefoot](https://barefootdigital.dev)
