# Publish runbook — launch morning

Exact order. Stop at the first failure.

## 1. Preflight

```bash
git pull && npm ci
npm run preflight
```

All checks must be ✓. If preflight warns that tag `v0.4.0` is not at HEAD (docs commits landed after tagging), that's acceptable for a docs-only delta — npm publishes HEAD, the tag marks the feature set. If code changed since the tag, stop and cut v0.4.1 instead (`npm version patch`, push, tag, release, re-run preflight).

## 2. Publish

```bash
npm whoami        # expect your npm account; npm login if not
npm publish
```

## 3. Verify the live package

```bash
npm view mcp-testmate version          # expect 0.4.x
npx --yes mcp-testmate@latest --version  # expect 0.4.x (was the 0.0.1 placeholder banner)
mkdir -p /tmp/pubcheck && cd /tmp/pubcheck && npx --yes mcp-testmate@latest --help  # help renders, no crash
```

The GitHub Action's `npx` fallback path is now live for repos without a pinned install.

## 4. Confirm docs match the live package

The pre-publish README callout was already removed in the v0.4.0 release pass — nothing to delete. Skim the README top and the npm link note in `docs/launch.md` once against the live npm page; commit only if something reads wrong.

## 5. Marketplace listing

Follow [docs/marketplace.md](marketplace.md) — edit the v0.4.0 release, check "Publish this Action to the GitHub Marketplace", categories CI + Testing.

## 6. Post

Work through the posting order in [docs/launch.md](launch.md) (Show HN first; the pitch, anecdote, and links are final there). Log responses per [docs/signals.md](signals.md).
