import { connect } from "./target.mjs";
import { UserError } from "./errors.mjs";

async function listAll(fetchPage, pick) {
  const items = [];
  let cursor;
  do {
    const page = await fetchPage(cursor);
    items.push(...(pick(page) ?? []));
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

/**
 * Capability-aware introspection: only calls tools/list, resources/list,
 * prompts/list for capabilities the server actually declares. A server is
 * never penalized (or even queried) for optional features it doesn't claim.
 */
export async function introspect(target, clientVersion, { onPhase } = {}) {
  onPhase?.({ id: "connect", label: "Connecting to server…" });
  const { client, connectMs } = await connect(target, clientVersion);
  try {
    onPhase?.({ id: "capabilities", label: "Reading capabilities…" });
    const caps = client.getServerCapabilities() ?? {};
    const serverInfo = client.getServerVersion() ?? {};
    const capabilities = Object.keys(caps).sort();

    let tools = [];
    let resources = [];
    let prompts = [];
    let listToolsMs = null;

    if (caps.tools) {
      const t0 = performance.now();
      tools = await listAll((cursor) => client.listTools({ cursor }), (r) => r.tools);
      listToolsMs = Math.round(performance.now() - t0);
      onPhase?.({
        id: "snapshot",
        label: `Snapshotting ${tools.length} tool${tools.length === 1 ? "" : "s"}…`,
      });
    }
    if (caps.resources) {
      resources = await listAll((cursor) => client.listResources({ cursor }), (r) => r.resources);
    }
    if (caps.prompts) {
      prompts = await listAll((cursor) => client.listPrompts({ cursor }), (r) => r.prompts);
    }

    return {
      server: {
        name: serverInfo.name ?? "unknown",
        version: serverInfo.version ?? "unknown",
      },
      capabilities,
      // raw declared-capabilities object (sub-flags like resources.subscribe
      // intact) — used by conformance classification, not stored in snapshots
      capabilityDetail: caps,
      tools,
      resources,
      prompts,
      timings: { connectMs, listToolsMs },
    };
  } catch (err) {
    if (err instanceof UserError) throw err;
    throw new UserError(`introspection failed: ${err?.message ?? err}`);
  } finally {
    await client.close().catch(() => {});
  }
}
