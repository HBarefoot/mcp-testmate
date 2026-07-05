/**
 * Interactive (TTY) drivers. The async work runs OUTSIDE React — each phase
 * event just rerenders the view with new props, so the spinner never freezes
 * and components stay pure (and trivially testable).
 *
 * This module is only imported when stdout is a TTY: the CI/plain path never
 * loads React or Ink.
 */
import { render } from "ink";
import { h } from "./components.mjs";
import { InitView, CheckView, TestView, ErrorView, HelpView } from "./views.mjs";
import { initFlow, snapshotFlow, checkFlow } from "../commands.mjs";
import { testFlow } from "../test-runner.mjs";

async function withProgress(View, task, toProps = (r) => ({ result: r })) {
  const app = render(h(View, { phase: { label: "Starting…" } }));
  try {
    const result = await task((phase) => app.rerender(h(View, { phase })));
    app.rerender(h(View, { phase: null, ...toProps(result) }));
    app.unmount();
    await app.waitUntilExit();
    return result;
  } catch (err) {
    app.unmount();
    await app.waitUntilExit();
    throw err;
  }
}

export async function runInit(cwd, target, version) {
  await withProgress(InitView, (onPhase) => initFlow(cwd, target, version, onPhase));
  return 0;
}

export async function runSnapshot(cwd, version) {
  await withProgress(
    // snapshot reuses the init layout minus config chatter — same summary card
    InitView,
    (onPhase) => snapshotFlow(cwd, version, onPhase).then((r) => ({ ...r, configFile: "mcp-testmate.config.json" }))
  );
  return 0;
}

export async function runCheck(cwd, version, failOn, targetOverride = null) {
  const report = await withProgress(
    CheckView,
    (onPhase) => checkFlow(cwd, version, failOn, onPhase, targetOverride),
    (r) => ({ report: r })
  );
  return report.exitCode;
}

export async function runTest(cwd, version, { update = false, targetOverride = null } = {}) {
  const report = await withProgress(
    TestView,
    (onPhase) => testFlow(cwd, version, { update, onPhase, targetOverride }),
    (r) => ({ report: r })
  );
  return report.exitCode;
}

/** check --all: drift check, then response tests. Exit is the worst of both. */
export async function runCheckAll(cwd, version, failOn, targetOverride, hasTests) {
  const driftExit = await runCheck(cwd, version, failOn, targetOverride);
  if (!hasTests) return driftExit;
  const testExit = await runTest(cwd, version, { targetOverride });
  return Math.max(driftExit, testExit);
}

export async function renderErrorOnce(error) {
  const app = render(h(ErrorView, { error }), { stdout: process.stderr });
  app.unmount();
  await app.waitUntilExit();
}

export async function renderHelpOnce(version) {
  const app = render(h(HelpView, { version }));
  app.unmount();
  await app.waitUntilExit();
}
