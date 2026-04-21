import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy G.1: Single-entry save. Writes entry-<id> blob + updates library-index.
// POST body: { entry: DNAEntry }
// Returns: { success: true, id: <id> }
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const body = JSON.parse(event.body ?? "{}");
    const entry = body.entry;
    if (!entry || typeof entry.id === "undefined") {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing entry or entry.id" }) };
    }

    const store = getStore("levelly");

    // Write the full entry to its own blob — frames included
    const entryKey = `entry-${entry.id}`;
    await store.set(entryKey, JSON.stringify(entry));

    // Update library-index with the summary fields for fast listing
    let index: any[] = [];
    try {
      const existingIndex = await store.get("library-index");
      if (existingIndex) index = JSON.parse(existingIndex);
    } catch { index = []; }

    // Summary fields used by the library grid — keep lightweight
    const summary = {
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
    };

    const existingIdx = index.findIndex((e: any) => e.id === entry.id);
    if (existingIdx >= 0) {
      index[existingIdx] = summary;
    } else {
      index.push(summary);
    }
    await store.set("library-index", JSON.stringify(index));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, id: entry.id }),
    };
  } catch (err: any) {
    console.error("save-entry error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
