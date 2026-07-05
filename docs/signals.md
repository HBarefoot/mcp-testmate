# Launch signals tracking

What to watch after launch, where, and what each signal triggers. Review daily for the first week, then weekly.

| signal | where | log what | threshold → action |
| --- | --- | --- | --- |
| "I run MCP in production" issues | [production-user template](https://github.com/HBarefoot/mcp-testmate/issues/new?template=production-user.yml) | transport, hosting, what broke, probing interest y/n | **any** "yes" to hosted probing → reply within 24h, ask for a 20-min call |
| npm installs | `npm view mcp-testmate` + npmjs.com download graph | weekly downloads | >200/wk sustained → prioritize Action PR annotations |
| GitHub stars/watchers | repo insights | count + notable orgs | notable org → check their public MCP servers, offer to help wire the Action |
| Action adopters | GitHub code search: `uses: HBarefoot/mcp-testmate` (path:.github/workflows) | repo, target type (http/stdio) | first 5 adopters → open an issue in their repo offering direct support |
| Badge adopters | GitHub code search: `img.shields.io/badge/MCP--tested` | repo | counts as social proof — screenshot for later marketing |
| Bug reports | issues (bug template) | repro quality, transport | any flaky-test report → drop everything (trust is the product) |
| HN / socials | launch threads | objections, feature asks, "I'd pay for X" quotes | recurring objection → FAQ entry in README; "I'd pay" → signals column for probing tier |
| Conformance-suite comparisons | HN thread, issues | claims we made that get challenged | any factual challenge → verify against docs/audit-official-conformance.md, correct publicly if wrong |

**The one metric that matters for Stage 3:** count of production-user issues answering "yes" to hosted probing interest. Everything else is vanity until ~10 of those exist.
