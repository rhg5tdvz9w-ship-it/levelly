import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy S.1: Diagnostic endpoint — finds entries in library-index whose per-entry blobs are missing.
// These are orphans, typically caused by pre-Q parallel-bulk race conditions that silently DELETEd
// blobs while leaving summaries in the index.
// Returns the list of orphans for user review BEFORE pruning.
// GET /api/diagnose-library
//   → { ok: true, total: N, orphans: [{ id, title, ad_type, added_at }, ...] }
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const store = getStore("levelly");
    const indexRaw = await store.get("library-index");
    if (!indexRaw) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, total: 0, orphans: [] }) };
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

    const orphans: Array<{ id: any; title: string; ad_type: string; added_at: string; creative_id?: string }> = [];
    for (const summary of index) {
      if (!summary || typeof summary.id === "undefined") continue;
      const entryKey = `entry-${summary.id}`;
      try {
        const blob = await store.get(entryKey);
        if (!blob) {
          orphans.push({
            id: summary.id,
            title: summary.title || "(no title)",
            ad_type: summary.ad_type || "unknown",
            added_at: summary.added_at || "",
            creative_id: summary.creative_id,
          });
        }
      } catch (err) {
        // If blob fetch errored, treat as orphan too
        orphans.push({
          id: summary.id,
          title: summary.title || "(no title)",
          ad_type: summary.ad_type || "unknown",
          added_at: summary.added_at || "",
          creative_id: summary.creative_id,
        });
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, total: index.length, orphans }),
    };
  } catch (err: any) {
    console.error("diagnose-library error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message || String(err) }) };
  }
};
