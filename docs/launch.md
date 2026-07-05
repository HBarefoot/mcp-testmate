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
- npm: https://www.npmjs.com/package/mcp-testmate *(placeholder until 0.3.0 is published)*
