import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy G.2: Server-side one-shot migration from old `library` blob to per-entry blobs.
// Called by client once on load. Idempotent — safe to call repeatedly.
// Does NOT touch local IDB frames — those sync up via client on save.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const store = getStore("levelly");

    // Check if already migrated — if library-index exists, assume we're past migration
    const existingIndex = await store.get("library-index");
    if (existingIndex) {
      try {
        const idx = JSON.parse(existingIndex);
        if (Array.isArray(idx) && idx.length > 0) {
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ migrated: false, reason: "already_migrated", entries: idx.length }),
          };
        }
      } catch { /* fall through — malformed index, re-migrate */ }
    }

    // Read old library blob
    const libraryRaw = await store.get("library");
    if (!libraryRaw) {
      // No old blob — nothing to migrate. Create empty index so we don't try again.
      await store.set("library-index", "[]");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ migrated: true, entries: 0, note: "no_old_blob" }),
      };
    }

    let entries: any[];
    try {
      entries = JSON.parse(libraryRaw);
    } catch (e: any) {
      return { statusCode: 500, body: JSON.stringify({ error: "Could not parse old library blob", detail: e.message }) };
    }
    if (!Array.isArray(entries)) {
      return { statusCode: 500, body: JSON.stringify({ error: "Old library blob is not an array" }) };
    }

    // Write each entry as its own blob
    let written = 0;
    let failed = 0;
    const failures: any[] = [];
    const indexSummaries: any[] = [];

    for (const entry of entries) {
      if (!entry || typeof entry.id === "undefined") { failed++; continue; }
      const entryKey = `entry-${entry.id}`;
      try {
        // Check if already exists — skip if so (idempotent, preserves any post-migration writes)
        const existing = await store.get(entryKey);
        if (!existing) {
          await store.set(entryKey, JSON.stringify(entry));
        }
        written++;
        // Build summary for index
        indexSummaries.push({
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
          // Deploy P: include spend_networks + spend_window_days in index summary.
          spend_networks: entry.spend_networks || [],
          spend_window_days: entry.spend_window_days,
          // BC2.4: bring migrate-library in sync with save-entry + repair-index.
          // BC1.1 fields (mechanic_family, hook_format, champions_unverified, game_title) were missing here too.
          mechanic_family: entry.mechanic_family,
          hook_format: entry.hook_format,
          champions_unverified: entry.champions_unverified || [],
          game_title: entry.game_title,
          core_fantasy_moc: entry.core_fantasy_moc,
          winning_pattern: entry.winning_pattern,
          replicable_elements: entry.replicable_elements || [],
          moc_lift_concrete: entry.moc_lift_concrete,
        });
      } catch (err: any) {
        failed++;
        failures.push({ id: entry.id, error: err.message });
      }
    }

    // Write library-index
    await store.set("library-index", JSON.stringify(indexSummaries));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        migrated: true,
        entries: written,
        failed,
        failures: failures.slice(0, 5), // first 5 for debugging
      }),
    };
  } catch (err: any) {
    console.error("migrate-library error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
