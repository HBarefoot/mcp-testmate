# Changelog

All notable changes to mcp-testmate. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versions follow semver.

## [0.3.0] — 2026-07-05

### Added
- **Response regression tests**: a `tests` array in `mcp-testmate.config.json` calls real tools and asserts on outputs. Combinable expects: `matchSnapshot` (goldens under `.mcp-testmate/golden/`), `contains`, `jsonPath` + `equals` (subset: `$.key`, `$["key"]`, `$[0]`), `maxLatencyMs`.
- `mcp-testmate test` with per-case diffs and `--update` to re-record goldens (missing goldens are recorded, not failed).
- `mcp-testmate check --all` — drift check + response tests in one CI run; action input `all: "true"`.
- **Determinism guard**: a golden mismatch triggers one retry call; if live outputs differ from each other, the case reports "output appears non-deterministic; use contains/jsonPath instead" rather than a flaky failure.
- Unknown `expect` keys are rejected with exit 2 (a typo'd assertion that silently never fails is worse than an error).
- Fixture: `get_status` tool (deterministic JSON, optional `delayMs`).

### Fixed
- `npm test` on Node 20 (glob expansion moved to the shell; `node --test` only globs itself since Node 21).
- Interactive (Ink) `check`/`test` rendered only the spinner, never the final report; regression-tested via forced-interactive pipes.

## [0.2.0] — 2026-07-05

### Added
- **GitHub Action** (composite, repo root `action.yml`): inputs `url`, `stdio`, `fail-on`, `working-directory`, `start` (background server launch + wait-for-ready). Prefers a repo-pinned install over `npx mcp-testmate@latest`.
- `mcp-testmate badge` — static shields.io "MCP-tested ✓" markdown.
- `check --url/--stdio` target override (CI runs servers on different endpoints than committed config).
- Dogfood workflow: this repo runs the action against its own fixture on PR, push, and weekly cron.

## [0.1.0] — 2026-07-04

### Added
- `init` / `check` / `snapshot`: snapshot an MCP server's tools, resources, prompts, and schemas into a committed baseline; diff the live server against it with breaking/warning/info classification and CI exit codes (0/1/2, `--fail-on`).
- Streamable HTTP (`--url`) and stdio (`--stdio`) targets.
- Capability-aware introspection — only queries what the server declares.
- Dual renderer: interactive Ink UI (TTY) and plain text (CI/pipes); `--json`; `NO_COLOR`/`--no-color`.
- One-line error diagnoses with likely cause and fix — never a stack trace.

## [0.0.1] — 2026-07-04

- Name-claim placeholder on npm.
