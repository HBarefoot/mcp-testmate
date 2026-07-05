# GitHub Marketplace listing

Requirements status for listing the action (verified 2026-07-05):

- [x] `action.yml` at repo root with `name`, `description`, `author`
- [x] `branding` block — `icon: check-circle`, `color: purple` (rendered on the Marketplace card)
- [x] Action name "mcp-testmate" — must be unique on Marketplace (it matches the repo; check availability during publishing, GitHub validates in the release UI)
- [x] Public repository with a README documenting inputs and a usage example
- [x] Tagged release exists (v0.4.0)
- [x] `SECURITY.md` present (repo root)
- [ ] Marketplace listing itself — manual, see steps below
- [ ] Two-factor auth enabled on the publishing account (verify in GitHub settings)

## Listing steps (manual, ~5 minutes)

1. Go to the repo → **Releases** → edit **v0.4.0** (or draft the next release).
2. Check **"Publish this Action to the GitHub Marketplace"**. GitHub validates `action.yml`; fix anything it flags.
3. Pick categories: **Continuous integration** (primary), **Testing** (secondary).
4. Accept the GitHub Marketplace Developer Agreement if prompted (first listing only).
5. Publish. The listing goes live at `github.com/marketplace/actions/mcp-testmate`.

## After listing

- Update the README Action snippet if the Marketplace assigns a different slug.
- Users should pin `@v0.4.0` (the README example already does). Consider maintaining a floating `v0` major tag once the interface stabilizes: `git tag -f v0 && git push -f origin v0`.
