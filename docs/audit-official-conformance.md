# Hands-On Audit: @modelcontextprotocol/conformance v0.1.16
**Date:** July 4, 2026 · Tested against a minimal real-world MCP server (2 tools, Streamable HTTP, TS SDK)

## What it is
Official MCP org package (Anthropic maintainers on it). 24 releases, still 0.1.x, latest publish 2026-03-30 (~3 months stale at audit time). CLI: `conformance server --url <url>`, `client`, `tier-check`, `list`. ~32 server scenarios. Spec coverage: **2025-06-18 and 2025-11-25 only** — nothing newer despite newer spec drafts existing.

## Result against a realistic minimal server
**8 passed / 24 failed.** Passing: initialize, ping, tools-list (validates real tool structure, names YOUR tools), tools-call-simple-text, tools-call-error, SSE multiple streams, 1 of 2 dns-rebinding checks.

**Failing: every scenario for a capability the server simply doesn't implement.** No resources → all 6 resources-* scenarios FAIL (not skip). No prompts → all 5 prompts-* FAIL. No logging/completions → FAIL. Fixture-style tool scenarios (tools-call-image/audio/embedded-resource/mixed-content/progress/sampling/elicitation) FAIL because the server doesn't have tools returning those content types.

## Key findings
1. **No capability awareness.** It doesn't read the server's declared capabilities and skip what isn't claimed. A perfectly valid production server "fails" ~75% of the suite for not implementing optional features. Signal-to-noise is terrible for a production-server owner; the summary reads like your server is broken when it's fine.
2. **Fixture bias.** Much of the suite is designed to validate SDK/protocol implementations (with purpose-built test servers), not arbitrary production servers. It answers "does your protocol plumbing conform," never "do YOUR tools still work correctly."
3. **Zero knowledge of YOUR tools.** No schema snapshotting, no baseline diffing of your tool inventory, no user-defined assertions on your tools' responses, no golden outputs, no latency tracking. `--expected-failures` (YAML baseline) exists but only suppresses known-failing scenarios — not a snapshot mechanism.
4. **HTTP-only.** `--url` is the only target option visible; no stdio server testing surfaced in CLI help. A huge share of real MCP servers are stdio.
5. **Spec lag.** Newest covered spec is 2025-11-25. The suite itself is behind — which undercuts "the official suite eats spec churn for you" but also shows even Anthropic struggles to keep testing current.
6. **Good bones worth riding:** clean per-check spec references (links to the exact spec section on failure), JSON output mode, per-scenario result files, GitHub Action-able CLI, `tier-check` for repos. DX on failures is genuinely good.
7. **Meta-finding:** our own quick demo server shipped with a classic session-handling bug (shared server instance across sessions → crash on 2nd client). The suite's first-scenario pass + cascade of fetch-failures MASKED the crash — no "server went down mid-run" detection. Real-world servers ship this exact bug constantly; nothing in the official tool catches or explains it.

## What this validates for the wedge
The official suite and a production-reliability product are **complementary, not competitive**:
- Official = "does this implementation conform to the protocol spec" (generic, fixture-flavored, CI for SDK/server authors)
- Missing = "does MY server, with MY tools, still behave the way it did yesterday, and is it up right now" — capability-aware runs, tool-schema snapshots + drift diffs, response regression on YOUR tools, latency baselines, crash/mid-run-death detection, stdio + HTTP, scheduled probing of private prod servers with alerting.

**v1 shape confirmed:** wrap/complement the official conformance for the protocol layer; own the snapshot/regression/monitoring layer it will never build. "Pingdom + Jest for YOUR MCP server," capability-aware from run #1.
