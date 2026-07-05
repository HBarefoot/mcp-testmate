# Launch draft — Show HN

*Draft only. Not posted anywhere.*

## Title

Show HN: mcp-testmate – catch breaking changes in your MCP server before your users' agents do

## Pitch (3 sentences)

MCP servers break silently: a dependency bump or a refactor changes a tool's schema, every agent that depends on that tool starts failing, and nothing in your CI notices because your unit tests don't exercise the MCP surface. mcp-testmate snapshots your server's tools, resources, and prompts into a git-committed baseline, fails CI when the live server drifts (classified breaking/warning/info), and runs response-regression tests that call your real tools and assert on their outputs. The official @modelcontextprotocol/conformance suite answers "does this implementation conform to the protocol?" — mcp-testmate answers "does MY server, with MY tools, still behave like yesterday?"

## The dogfooding anecdote

While auditing the official conformance suite, I built a minimal Streamable HTTP demo server to test against — and shipped the classic bug: one shared server instance across sessions, which crashes the moment a second client connects. The conformance suite ran against it and masked the crash completely: the first scenario passed, then everything after failed with generic fetch errors — indistinguishable from the ~75% of scenarios that already "fail" on any server that skips optional capabilities like prompts or logging. A perfectly valid production server fails most of the official suite for not implementing optional features, so the one real crash drowned in expected noise.

That experience set two design rules for mcp-testmate. First, capability-awareness is non-negotiable: it reads the server's declared capabilities after `initialize` and only introspects what's declared — a server is never queried for, or penalized for, features it doesn't claim. Second, flaky or noisy failures are treated as bugs in the tool, not the server: when a golden-output test fails, mcp-testmate re-calls the tool once, and if the two live outputs also differ from each other it reports "output appears non-deterministic; use contains/jsonPath instead" rather than a fake regression. (The demo server in this repo creates a new instance per session — the fix for the bug I shipped.)

## Before / after

| | official conformance | mcp-testmate |
| --- | --- | --- |
| Question | Does this implementation conform to the MCP spec? | Does *my* server, with *my* tools, still behave like yesterday? |
| Knows your tools | No — fixture-flavored scenarios | Yes — snapshots your actual schemas, calls your actual tools |
| Undeclared capabilities | Scenarios fail | Skipped by design |
| Transports | HTTP | HTTP and stdio |
| Regression detection | None (protocol-level only) | Schema drift diffs, golden outputs, jsonPath asserts, latency budgets |
| Runs where | CLI | CLI + GitHub Action (PR + scheduled — drift happens without code changes) |

They're complementary: conformance for the protocol layer, mcp-testmate for your layer on top of it.

## Links

- Repo: https://github.com/HBarefoot/mcp-testmate
- Roadmap: https://github.com/HBarefoot/mcp-testmate/blob/main/docs/ROADMAP.md
- Conformance-suite audit notes (the anecdote in full): https://github.com/HBarefoot/mcp-testmate/blob/main/docs/audit-official-conformance.md
- npm: https://www.npmjs.com/package/mcp-testmate *(goes live with the 0.4.0 publish — verify before posting)*

## Predicted questions (paste-ready replies)

**"How is this different from the official conformance suite?"**
It's a complement, not a competitor — `mcp-testmate conformance` literally runs the official suite and keeps its verdicts. What we add is capability awareness: the official suite has none, so our valid demo server scores 10 passed / 22 failed raw — every scenario for capabilities it never declared, plus fixture-style scenarios only purpose-built demo servers can pass. Run through mcp-testmate, the same results become "1 of 9 applicable failed" — and that one failure was real (our fixture lacked DNS-rebinding protection; the wrapper surfaced it out of the noise). Full hands-on audit: docs/audit-official-conformance.md. The rest of the tool (snapshots, drift diffs, golden-output tests) covers ground no conformance suite can — your specific tools.

**"Why not OpenAPI / Pact / Schemathesis?"**
MCP isn't REST — there's no OpenAPI document to test against. Tool schemas live inside a JSON-RPC envelope, negotiated per-session after an `initialize` handshake that declares capabilities, over two transports (stdio and streamable HTTP with SSE and session management). Those tools operate at the wrong layer; mcp-testmate speaks the protocol natively via the official MCP SDK and snapshots what a client actually sees.

**"Does it work with stdio servers?"**
Yes — `init`, `check`, `test`, and the drift engine fully support stdio (`--stdio "node server.mjs"`); the CLI spawns your server itself. The one exception is `conformance`, which is HTTP-only because the official suite it wraps only accepts `--url`. If your stdio server also exposes streamable HTTP, point conformance at that.

**"What's the business model?"**
The CLI and GitHub Action are MIT and stay free — that's the whole CI story. The paid tier on the roadmap is hosted scheduled probing of production servers: uptime, drift against your committed baseline, and latency alerts with status pages — CI tells you a change broke something; probing tells you production broke when nothing was deployed. If you run MCP in production, the "I run MCP in production" issue template is where that tier is being shaped.

**"How do you handle non-deterministic tool outputs?"**
When a golden-snapshot test fails, mcp-testmate calls the tool a second time before reporting anything. If the two live outputs also differ from each other, you get "output appears non-deterministic; use contains/jsonPath instead of matchSnapshot" — pointing at the assertion types built for that — instead of a fake regression. Flaky failures kill trust in a testing tool faster than missed bugs, so we treat them as our bug, not yours.

**"Yet another wrapper?"**
The wrapper is one command of six. The core — capability-aware introspection, byte-stable snapshots, the breaking/warning/info drift classifier, golden-output regression tests with the determinism guard — is original code with a single runtime dependency (the official MCP SDK) plus Ink for the interactive terminal UI. Nothing shells out except `conformance`, which pins and runs the official suite because reimplementing protocol conformance would be the actual wrapper crime.
