import type { VisualIdentity } from "./types";
import { MOC_REFERENCES } from "./refImages";

// ─── Ref image helpers ────────────────────────────────────────────────────────
export function pickRelevantRefs(vi: VisualIdentity, unitAtScene?: string, lib?: any[], scene?: string): any[] {
  // Deploy A: hook_b is UGC (TikTok-native photo-realistic shot of a real person).
  // No MOC visual refs — they would contaminate the photorealistic render with cartoon style.
  if (scene === "hook_b") return [];
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
    // Map scene to relevant significance tags — updated for Scene + Hook A/B/C system
    const sigMap: Record<string, string[]> = {
      start: ["hook"],            // Deploy F.1: scene render uses only hook frames (pre-contact, fewer enemy mobs in frame)
      hook:  ["hook", "swarm"],   // Hook renders still use both — those don't need the NO ENEMY MOBS rule
    };
    const wantedSigs = sigMap[scene] || ["hook"];

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
      const frames = (entry.auto_frames || []).filter((f: any) =>
        f.image_data && wantedSigs.some(sig => (f.significance || "").includes(sig))
      );
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
      const sceneIsScene = scene === "start";
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

  return parts;
}

