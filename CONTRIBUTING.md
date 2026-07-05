# Contributing

## Dev setup

```bash
git clone https://github.com/HBarefoot/mcp-testmate
cd mcp-testmate
npm ci                  # Node >= 20, zero runtime deps beyond the MCP SDK + Ink UI stack
node bin/cli.mjs --help
```

## Running tests

```bash
npm test                # full suite: integration (spawns fixture servers), renderer snapshots, Ink component tests
npm run preflight       # release checklist: tests, tree, tag, pack contents, README hygiene
```

Tests live in `test/*.test.mjs` (Node's built-in runner). The fixture MCP server is `test/fixtures/demo-server.mjs` (Streamable HTTP, **one server instance per session** — don't "simplify" that; a shared instance crashes on the second client) with a stdio flavor beside it.

## Architecture in one paragraph

`lib/commands.mjs` + `lib/test-runner.mjs` do the work and return plain data; renderers consume it. `lib/render/plain.mjs` is the CI surface and the source of truth for wording (verdicts are defined there and imported by the Ink views) — write plain first, then mirror in `lib/ui/views.mjs`. The CLI never imports React at top level; the Ink path loads lazily only on a TTY. Errors are `UserError { message, likely, fix }` — never let a stack trace reach the user.

## Recording the demo GIFs

```bash
brew install vhs
./docs/assets/record-demos.sh   # re-records docs/assets/*.gif from the committed .tape files
```

## Conventions

- Conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`).
- No new runtime dependencies without prior discussion in an issue.
- Every bug fix ships with the regression test that would have caught it.
