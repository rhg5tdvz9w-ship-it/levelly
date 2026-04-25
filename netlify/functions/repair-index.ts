import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy G.3.1: Walk every per-entry blob, recompute summary fields (esp. has_frames),
// rewrite library-index with corrected data.
// Fixes cases where pre-G.3 save-entry writes produced summaries without has_frames flag.
// Safe: never deletes blobs. Only updates summary values in library-index.
// POST /api/repair-index
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const store = getStore("levelly");

    // Read current index to get list of entry IDs
    const existingIndexRaw = await store.get("library-index");
    if (!existingIndexRaw) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repaired: 0, reason: "no_index" }),
      };
    }
    let existingIndex: any[];
    try {
      existingIndex = JSON.parse(existingIndexRaw);
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: "Malformed library-index" }) };
    }
    if (!Array.isArray(existingIndex) || existingIndex.length === 0) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repaired: 0, reason: "empty_index" }),
      };
    }

    // For each entry in index, fetch its per-entry blob and recompute summary
    const correctedIndex: any[] = [];
    let repaired = 0;
    let missing = 0;

    for (const summary of existingIndex) {
      if (!summary || typeof summary.id === "undefined") continue;
      const entryKey = `entry-${summary.id}`;
      try {
        const entryRaw = await store.get(entryKey);
        if (!entryRaw) {
          // Per-entry blob missing — keep old summary, flag as missing
          correctedIndex.push(summary);
          missing++;
          continue;
        }
        const entry: any = JSON.parse(entryRaw);
        // Recompute has_frames from actual per-entry blob data
        const hasFramesInCloud = Array.isArray(entry.auto_frames) && entry.auto_frames.some((f: any) => f && f.image_data);
        const newSummary = {
          id: entry.id,
          title: entry.title || "",
          tier: entry.tier || "inspiration",
          biome: entry.biome || "",
          ad_type: entry.ad_type || "moc",
          creative_id: entry.creative_id,
          creative_status: entry.creative_status,
          spend_tier: entry.spend_tier,
          added_at: entry.added_at || new Date().toISOString(),
          cloud_thumbnail: entry.cloud_thumbnail,
          hook_description: entry.hook_description,
          is_compound: entry.is_compound,
          champions_visible: entry.champions_visible || [],
          core_fantasy: entry.core_fantasy,
          has_frames: hasFramesInCloud,
          // Deploy P: include spend_networks + spend_window_days in summary so aggregate counters work.
          spend_networks: entry.spend_networks || [],
          spend_window_days: entry.spend_window_days,
        };
        // Only count as repair if something actually changed
        const changed = JSON.stringify(summary) !== JSON.stringify(newSummary);
        if (changed) repaired++;
        correctedIndex.push(newSummary);
      } catch (err) {
        // Fetch/parse error — keep old summary
        correctedIndex.push(summary);
      }
    }

    // Write corrected index
    await store.set("library-index", JSON.stringify(correctedIndex));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: existingIndex.length,
        repaired,
        missing_blobs: missing,
      }),
    };
  } catch (err: any) {
    console.error("repair-index error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
