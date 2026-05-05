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

    // Deploy AA: protect cloud frames from being overwritten by a stripped re-analyze payload.
    // If incoming entry has empty or stripped auto_frames (no image_data) but existing cloud blob
    // has frames WITH image_data, preserve the cloud frames in the saved blob. Server-side defense.
    let entryToSave = entry;
    const incomingFramesHaveData = Array.isArray(entry.auto_frames)
      && entry.auto_frames.some((f: any) => f && f.image_data);
    if (!incomingFramesHaveData) {
      try {
        const existingBlob = await store.get(`entry-${entry.id}`);
        if (existingBlob) {
          const existingEntry = JSON.parse(existingBlob);
          const existingFramesHaveData = Array.isArray(existingEntry.auto_frames)
            && existingEntry.auto_frames.some((f: any) => f && f.image_data);
          if (existingFramesHaveData) {
            // Cloud has good frames, incoming doesn't. Preserve cloud's frames.
            entryToSave = { ...entry, auto_frames: existingEntry.auto_frames };
            console.log(`[Levelly AA] Preserved ${existingEntry.auto_frames.length} cloud frames for entry ${entry.id} (incoming was stripped)`);
          }
        }
      } catch (err) {
        console.warn(`[Levelly AA] Frame-preservation check failed for ${entry.id}:`, err);
        // Fall through — save what client sent (do not block on protection failure)
      }
    }

    // Write the full entry to its own blob — frames included
    const entryKey = `entry-${entry.id}`;
    await store.set(entryKey, JSON.stringify(entryToSave));

    // Update library-index with the summary fields for fast listing
    let index: any[] = [];
    try {
      const existingIndex = await store.get("library-index");
      if (existingIndex) index = JSON.parse(existingIndex);
    } catch { index = []; }

    // Summary fields used by the library grid — keep lightweight
    // Deploy G.3: has_frames flag lets backfill logic know which entries need frames pushed up.
    // Use entryToSave so has_frames reflects what was actually persisted (post-protection).
    const hasFramesInCloud = Array.isArray(entryToSave.auto_frames)
      && entryToSave.auto_frames.some((f: any) => f && f.image_data);
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
      has_frames: hasFramesInCloud, // Deploy G.3
      // Deploy P: include spend_networks + spend_window_days in index so aggregate counters
      // (NETWORKS, TOP VELOCITY) reflect reality without requiring every entry to be lazy-loaded.
      spend_networks: entry.spend_networks || [],
      spend_window_days: entry.spend_window_days,
      // Deploy AA: producer-set tags + UGC detection survive cross-device by riding in the index summary.
      mechanic_family: entry.mechanic_family,
      hook_format: entry.hook_format,
      // Deploy BC1.1: extend summary to mirror repair-index. champions_unverified (BB) and game_title (N)
      // were only in the per-entry blob — index rewrites lost them. Now both flow through summary.
      champions_unverified: entry.champions_unverified || [],
      game_title: entry.game_title,
      // BC2.4: MOC strategic layer + competitor concrete-lift. MUST also be added to repair-index.ts
      // (recurring field-loss pattern from BC1.1 era — backend bug if forgotten).
      core_fantasy_moc: entry.core_fantasy_moc,
      winning_pattern: entry.winning_pattern,
      replicable_elements: entry.replicable_elements || [],
      moc_lift_concrete: entry.moc_lift_concrete,
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
