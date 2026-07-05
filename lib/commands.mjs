/**
 * Renderer-agnostic command flows. Each flow does the work, emits phase
 * events for progress UIs, and returns plain data. The plain, Ink, and JSON
 * renderers all consume these — logic lives here exactly once.
 */
import { introspect } from "./introspect.mjs";
import { targetLabel } from "./target.mjs";
import {
  CONFIG_FILE,
  SNAPSHOT_FILE,
  buildSnapshot,
  saveSnapshot,
  loadSnapshot,
  saveConfig,
  loadConfig,
} from "./snapshot.mjs";
import { diffSnapshots, groupFindings, exitCodeFor } from "./diff.mjs";

export async function initFlow(cwd, target, version, onPhase) {
  const intro = await introspect(target, version, { onPhase });
  onPhase?.({ id: "write", label: "Writing baseline…" });
  saveConfig(cwd, { target });
  saveSnapshot(cwd, buildSnapshot(target, intro, new Date().toISOString()));
  return {
    intro,
    target,
    targetText: targetLabel(target),
    configFile: CONFIG_FILE,
    snapshotFile: SNAPSHOT_FILE,
  };
}

export async function snapshotFlow(cwd, version, onPhase) {
  const { target } = loadConfig(cwd);
  const intro = await introspect(target, version, { onPhase });
  onPhase?.({ id: "write", label: "Writing baseline…" });
  saveSnapshot(cwd, buildSnapshot(target, intro, new Date().toISOString()));
  return { intro, target, targetText: targetLabel(target), snapshotFile: SNAPSHOT_FILE };
}

export async function checkFlow(cwd, version, failOn, onPhase) {
  const { target } = loadConfig(cwd);
  const baseline = loadSnapshot(cwd);
  const intro = await introspect(target, version, { onPhase });
  onPhase?.({ id: "diff", label: "Comparing against snapshot…" });
  const live = buildSnapshot(target, intro, baseline.createdAt);
  const findings = diffSnapshots(baseline, live);
  const groups = groupFindings(findings);
  return {
    server: live.server,
    findings,
    groups,
    failOn,
    exitCode: exitCodeFor(findings, failOn),
    toolCount: live.tools.length,
    totalMs: (intro.timings.connectMs ?? 0) + (intro.timings.listToolsMs ?? 0),
  };
}
