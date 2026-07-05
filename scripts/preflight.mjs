#!/usr/bin/env node
// Launch-day preflight: one command, a ✓/✗ checklist, nonzero exit on any ✗.
// No dependencies — run with `npm run preflight`.
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, statSync, accessSync, constants } from "node:fs";

const results = [];
const notes = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || "" });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
  }
};
const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

check("working tree clean", () => {
  const dirty = sh("git status --porcelain");
  if (dirty) throw new Error(`uncommitted changes:\n${dirty}`);
});

check("all commits pushed", () => {
  const ahead = sh("git rev-list --count @{upstream}..HEAD");
  if (ahead !== "0") throw new Error(`${ahead} unpushed commit(s)`);
});

check(`tag v${pkg.version} exists`, () => {
  const tag = sh(`git tag -l v${pkg.version}`);
  if (!tag) throw new Error(`no tag v${pkg.version} — tag and push it first`);
  const tagRef = sh(`git rev-parse v${pkg.version}^{commit}`);
  const head = sh("git rev-parse HEAD");
  if (tagRef !== head) {
    notes.push(
      `tag v${pkg.version} is not at HEAD (${tagRef.slice(0, 7)} vs ${head.slice(0, 7)}) — fine for docs-only deltas; cut a patch release if code changed`
    );
  }
});

check("test suite green", () => {
  const run = spawnSync("npm", ["test"], { encoding: "utf8" });
  const out = (run.stdout ?? "") + (run.stderr ?? "");
  const pass = /ℹ pass (\d+)/.exec(out)?.[1];
  const fail = /ℹ fail (\d+)/.exec(out)?.[1];
  if (run.status !== 0 || fail !== "0") throw new Error(`npm test failed (pass=${pass}, fail=${fail})`);
  return `${pass} passing`;
});

check("README has no TODO markers", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const marker = /TODO|FIXME|XXX/.exec(readme);
  if (marker) throw new Error(`found "${marker[0]}" in README.md`);
});

check("demo GIFs exist and are < 2MB", () => {
  const sizes = ["init-demo.gif", "check-demo.gif"].map((f) => {
    const path = new URL(`../docs/assets/${f}`, import.meta.url);
    const bytes = statSync(path).size;
    if (bytes >= 2 * 1024 * 1024) throw new Error(`${f} is ${(bytes / 1e6).toFixed(1)}MB`);
    return `${f} ${(bytes / 1024).toFixed(0)}KB`;
  });
  return sizes.join(", ");
});

check("bin entry exists and is executable", () => {
  const binPath = new URL(`../${pkg.bin["mcp-testmate"]}`, import.meta.url);
  accessSync(binPath, constants.X_OK);
});

check("package fields (homepage, bugs, repository, engines)", () => {
  for (const field of ["homepage", "bugs", "repository", "engines"]) {
    if (!pkg[field]) throw new Error(`package.json is missing "${field}"`);
  }
  if (/coming soon/i.test(pkg.description)) throw new Error('description still says "coming soon"');
});

check("pack contents match allowlist", () => {
  const json = JSON.parse(sh("npm pack --dry-run --json 2>/dev/null"));
  const files = json[0].files.map((f) => f.path);
  const allowed = (p) =>
    p.startsWith("bin/") || p.startsWith("lib/") || ["README.md", "LICENSE", "package.json"].includes(p);
  const strays = files.filter((p) => !allowed(p));
  if (strays.length) throw new Error(`unexpected files in tarball: ${strays.join(", ")}`);
  return `${files.length} files, ${(json[0].size / 1024).toFixed(1)}KB tarball`;
});

console.log(`\nmcp-testmate preflight · v${pkg.version}\n`);
for (const r of results) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` — ${r.detail.split("\n")[0]}` : ""}`);
  if (!r.ok && r.detail.includes("\n")) {
    for (const line of r.detail.split("\n").slice(1)) console.log(`      ${line}`);
  }
}
for (const n of notes) console.log(`  ● note: ${n}`);

const failed = results.filter((r) => !r.ok).length;
console.log(
  failed === 0
    ? `\n✓ all ${results.length} checks passed — clear to publish (see docs/publish-runbook.md)\n`
    : `\n✗ ${failed} of ${results.length} checks failed — fix before publishing\n`
);
process.exit(failed === 0 ? 0 : 1);
