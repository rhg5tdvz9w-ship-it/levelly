import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy S.1: Removes orphan summaries from library-index (entries whose per-entry blobs are missing).
// This is irreversible if the per-entry blob is genuinely gone. Always run /api/diagnose-library first
// and review the orphan list before pruning. Confirms via { confirm: true } in body.
// POST /api/prune-orphans  body: { confirm: true, ids?: number[] }  // ids optional — if omitted, prunes ALL detected orphans
//   → { ok: true, pruned: N, kept: M }
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (body.confirm !== true) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "Must POST with body { confirm: true } to proceed" }) };
    }
    const requestedIds: any[] | null = Array.isArray(body.ids) ? body.ids : null;

    const store = getStore("levelly");
    const indexRaw = await store.get("library-index");
    if (!indexRaw) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, pruned: 0, kept: 0 }) };
    }
    let index: any[];
    try {
      index = JSON.parse(indexRaw);
    } catch {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Malformed library-index" }) };
    }
    if (!Array.isArray(index)) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: "library-index is not an array" }) };
    }

    // Determine which summaries to keep
    const kept: any[] = [];
    let pruned = 0;
    for (const summary of index) {
      if (!summary || typeof summary.id === "undefined") {
        kept.push(summary);
        continue;
      }
      // If a specific id list was provided, only consider those for pruning
      if (requestedIds && !requestedIds.some(rid => String(rid) === String(summary.id))) {
        kept.push(summary);
        continue;
      }
      // Check if per-entry blob exists
      const entryKey = `entry-${summary.id}`;
      try {
        const blob = await store.get(entryKey);
        if (blob) {
          kept.push(summary);
        } else {
          pruned++;
        }
      } catch {
        // On error, KEEP the summary (don't prune on transient cloud errors)
        kept.push(summary);
      }
    }

    if (pruned > 0) {
      await store.set("library-index", JSON.stringify(kept));
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, pruned, kept: kept.length }),
    };
  } catch (err: any) {
    console.error("prune-orphans error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message || String(err) }) };
  }
};
