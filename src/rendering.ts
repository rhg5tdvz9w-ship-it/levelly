import type { VisualIdentity } from "./types";
import { MOC_REFERENCES } from "./refImages";

// ─── Ref image helpers ────────────────────────────────────────────────────────
export function pickRelevantRefs(vi: VisualIdentity, unitAtScene?: string, lib?: any[], scene?: string, familyTag?: string): any[] {
  if (scene === "hook_b") return [];

  // Deploy Y5: when concept has mechanic_family tag, find a library entry tagged with same family.
  // Grab one of its auto_frames as visual anchor for what the mechanic looks like in MOC vocabulary.
  const familyRefs: any[] = [];
  if (familyTag && Array.isArray(lib) && lib.length > 0) {
    const candidates = lib.filter((e: any) => {
      const f = (e.mechanic_family || "").trim();
      if (!f || f === "other") return false;
      return f === familyTag || familyTag.startsWith(f) || f.startsWith(familyTag.split("+")[0]);
    });
    const withFrames = candidates.filter((e: any) => Array.isArray(e.auto_frames) && e.auto_frames.some((fr: any) => fr.image_data));
    const pick = withFrames[0] || candidates[0];
    if (pick && Array.isArray(pick.auto_frames)) {
      const framesWithData = pick.auto_frames.filter((fr: any) => fr.image_data);
      if (framesWithData.length > 0) {
        const midFrame = framesWithData[Math.floor(framesWithData.length / 2)] || framesWithData[0];
        familyRefs.push({ text: `### MECHANIC FAMILY REFERENCE (${familyTag}) — match the lane layout, obstacle type, and interaction shown in this library reference. This is an example of ${familyTag} from MOC's existing creative library:` });
        familyRefs.push({ inlineData: { mimeType: "image/jpeg", data: midFrame.image_data } });
      }
    }
  }
  const biome = vi.environment?.toLowerCase() || "";
  const populated = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_"));
  if (populated.length === 0) return [];

  const selected: typeof populated = [];

  // 1. Biome ref — match full-scene biome screenshot to environment
  const biomeKeyword =
    biome.includes("foggy") ? "foggy forest" :
    biome.includes("desert") ? "desert" :
    biome.includes("water") ? "water" :
    biome.includes("bunker") ? "bunker" :
    biome.includes("meadow") ? "meadow" :
    biome.includes("volcanic") ? "volcanic" :
    biome.includes("snow") ? "snow" : biome;

  // For biomes with multiple refs, prefer the one matching the scene type
  // Desert has both top-down and side-cam refs — pick based on what's available
  let biomeRef = populated.find(r => r.category === "biome" && r.label.toLowerCase().includes(biomeKeyword));
  if (biomeRef) selected.push(biomeRef);
  // For desert, also include the second biome ref (barrels/obstacles variant)
  if (biome.includes("desert")) {
    const desertRef2 = populated.find(r => r.category === "biome" && r.label.toLowerCase().includes("desert") && r !== biomeRef);
    if (desertRef2 && !selected.includes(desertRef2)) selected.push(desertRef2);
  }

  // 2. Cannon tier ref — match the specific tier being rendered
  if (unitAtScene) {
    const unitLower = unitAtScene.toLowerCase();
    const cannonRef = populated.find(r =>
      r.category === "cannon" && (
        (unitLower.includes("triple") && r.key.includes("triple")) ||
        (unitLower.includes("double") && r.key.includes("double")) ||
        (unitLower.includes("tank") && r.key.includes("tank")) ||
        (unitLower.includes("golden") && r.key.includes("golden")) ||
        (unitLower.includes("simple") && r.key === "simple_cannon")
      )
    );
    if (cannonRef && !selected.includes(cannonRef)) selected.push(cannonRef);
  }
  if (!selected.some(r => r.category === "cannon")) {
    const simpleRef = populated.find(r => r.key === "simple_cannon");
    if (simpleRef) selected.push(simpleRef);
  }

  // 3. Champion/boss ref — match enemy_champion from visual_identity
  if (vi.enemy_champion) {
    const champLower = vi.enemy_champion.toLowerCase().replace(/\s+/g, "_");
    const champRef = populated.find(r =>
      (r.category === "champion" || r.category === "boss" || r.category === "enemy" || r.category === "giant") &&
      (r.key.includes(champLower) || r.label.toLowerCase().includes(vi.enemy_champion!.toLowerCase()))
    );
    if (champRef && !selected.includes(champRef)) selected.push(champRef);
  }

  // 4. Upgrade container ref — include triple_cannon_container when there are upgrades
  if (unitAtScene && unitAtScene !== "Simple Cannon") {
    const upgradeContainerRef = populated.find(r => r.key === "triple_cannon_container");
    if (upgradeContainerRef && !selected.includes(upgradeContainerRef)) selected.push(upgradeContainerRef);
  }

  // 5. Gate refs — always include to show correct colours and style
  const gateRef = populated.find(r => r.key === "x_gates_purple");
  const plusGateRef = populated.find(r => r.key === "plus_gates_blue");
  if (gateRef && !selected.includes(gateRef)) selected.push(gateRef);
  if (plusGateRef && !selected.includes(plusGateRef)) selected.push(plusGateRef);

  const parts: any[] = [{ text: `### MOC VISUAL REFERENCES (${selected.length} refs: ${selected.map(r=>r.key).join(", ")}) — match this exact art style, road layout, gate style, and game aesthetic:` }];
  selected.forEach(ref => {
    parts.push({ text: `[${ref.category.toUpperCase()}]: ${ref.label}` });
    parts.push({ inlineData: { mimeType: (ref as any).mimeType || "image/png", data: ref.base64 } });
  });

  // Inject matching library frames — real high-performing MOC ad frames as composition anchors
  if (lib && lib.length > 0 && scene) {
    const biomeNorm = (vi.environment || "").toLowerCase().split(" ")[0]; // "foggy" from "Foggy Forest"
    // Deploy L: FIX scene-key mismatch. Earlier code used legacy "start"/"hook" keys but the current system uses
    // "scene"/"hook_a"/"hook_b"/"hook_c". This caused Scene renders to fall through to the wrong framing rule,
    // treating hook frames as strict composition anchors and producing boss-dominant images when Scene was requested.
    const sigMap: Record<string, string[]> = {
      scene:  ["hook"],                  // Top-down lane render: use only "hook" frames (pre-contact, fewer enemy mobs).
      hook_a: ["hook", "boss_appear"],   // Gameplay boss hook: boss frames work best.
      hook_b: [],                        // UGC — no MOC refs used.
      hook_c: ["peak", "almost_fail"],   // Stopwatch/viral tension: use peak/almost-fail frames.
    };
    const wantedSigs = sigMap[scene] || ["hook"];

    // Deploy O: filter out frames whose description suggests enemy-mob presence when rendering Scene.
    // Earlier deploys' NO ENEMY MOBS rule in the prompt is sometimes ignored when reference frames visibly contain
    // enemy mobs. Cheap fix: skip frames whose description text mentions enemy/red mob/purple mob/swarm keywords.
    // No re-analysis of library entries needed — uses existing FrameExtraction.description field.
    const ENEMY_MOB_KEYWORDS = ["enemy mob", "enemy mobs", "red mob", "red mobs", "purple mob", "purple mobs", "enemy swarm", "enemy crowd", "enemies on the road", "enemies in the lane"];
    const frameHasEnemyMobs = (desc: string): boolean => {
      if (!desc) return false;
      const d = desc.toLowerCase();
      return ENEMY_MOB_KEYWORDS.some(kw => d.includes(kw));
    };

    const matchingFrames: {data: string, label: string}[] = [];
    for (const entry of lib) {
      if (matchingFrames.length >= 2) break;
      // Match biome — check both directions: "foggy" in "foggy forest", "desert" in "desert"
      const entryBiome = (entry.biome || "").toLowerCase();
      const biomeMatch = entryBiome.includes(biomeNorm) || biomeNorm.includes(entryBiome.split(" ")[0]);
      if (!biomeMatch) continue;
      // Only use winner/scalable entries
      if (!["winner","scalable"].includes(entry.tier)) continue;
      // Find a matching frame by significance — check auto_frames for image_data
      let frames = (entry.auto_frames || []).filter((f: any) =>
        f.image_data && wantedSigs.some(sig => (f.significance || "").includes(sig))
      );
      // Deploy O: when rendering Scene, exclude frames whose description suggests enemy mob presence.
      // Stronger than the prompt-only NO ENEMY MOBS rule (which Gemini sometimes ignores).
      if (scene === "scene") {
        const beforeFilter = frames.length;
        frames = frames.filter((f: any) => !frameHasEnemyMobs(f.description || ""));
        if (beforeFilter !== frames.length) {
          console.log(`[Levelly O] Scene-render: filtered ${beforeFilter - frames.length} enemy-mob-tagged frames from ${entry.creative_id || entry.title}`);
        }
      }
      if (frames.length > 0) {
        const frame = frames[0];
        matchingFrames.push({
          data: frame.image_data,
          label: `${entry.creative_id || entry.title} — ${frame.description || frame.significance} (${entry.biome}, ${entry.tier})`
        });
      }
    }

    if (matchingFrames.length > 0) {
      // Deploy F.1: scene renders use LAYOUT GUIDANCE ONLY framing (no mob-scale instruction),
      // hook renders keep the stronger composition-anchor framing since mobs are expected there.
      // Deploy L: fix key name — was "start", now "scene".
      const sceneIsScene = scene === "scene";
      const framingText = sceneIsScene
        ? `### REAL MOC AD FRAMES — use for LAYOUT GUIDANCE ONLY: match camera angle, gate proportions, lane width, and road perspective from these frames. DO NOT copy enemy mobs, mob counts, or mob positions from these frames — the NO ENEMY MOBS rule overrides any mobs visible in these references. These frames are for SPATIAL layout, not content:`
        : `### REAL HIGH-PERFORMING MOC AD FRAMES — use these as composition anchors. Match the mob scale, gate proportions, camera angle, and lane width exactly:`;
      parts.push({ text: framingText });
      matchingFrames.forEach(f => {
        parts.push({ text: `[REAL FRAME]: ${f.label}` });
        parts.push({ inlineData: { mimeType: "image/jpeg", data: f.data } });
      });
    }
  }

  // Deploy Y5: prepend family-ref BEFORE biome/unit/MOC frame parts. Family ref is most specific anchor.
  return [...familyRefs, ...parts];
}

