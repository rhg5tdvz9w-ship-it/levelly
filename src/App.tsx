import { useState, useRef, useCallback, useEffect } from "react";
import { buildReferenceContext, buildReferenceParts, MOC_REFERENCES } from "./refImages";

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmotionalBeat { timestamp_seconds: number; event: string; emotion: string; }

interface DNASegment {
  segment_index: number; biome: string; biome_visual_notes: string;
  start_seconds: number; end_seconds: number; hook_type: string;
  hook_timing_seconds: number; hook_description: string; gate_sequence: string[];
  swarm_peak_moment_seconds: number | null; loss_event_type: string;
  loss_event_timing_seconds: number | null; unit_evolution_chain: string[];
  champions_visible: string[]; key_mechanic: string; emotional_beats: EmotionalBeat[];
  why_it_works: string; why_it_fails: string | null;
}

interface DNAEntry {
  id: number;
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor" | "compound";
  upload_context: string; file_name: string; added_at: string;
  reanalyzed?: boolean; iteration_of?: string; strategic_notes?: string;
  creative_id?: string; spend_tier?: string; spend_window_days?: number | null;
  spend_networks?: string[]; spend_notes?: string; spend_data_source?: string;
  title: string; hook_type: string; hook_timing_seconds: number | null;
  hook_description: string; gate_sequence: string[];
  swarm_peak_moment_seconds: number | null; loss_event_type: string;
  loss_event_timing_seconds: number | null; unit_evolution_chain: string[];
  emotional_arc: string; emotional_beats: EmotionalBeat[]; biome: string;
  biome_visual_notes: string; champions_visible: string[]; pacing: string;
  key_mechanic: string; why_it_works: string; why_it_fails: string | null;
  creative_gaps: string | null;
  creative_gaps_structured?: { hook_strength: string; mechanic_clarity: string; emotional_payoff: string; };
  frame_extraction_gaps: string | null; replication_instructions: string;
  auto_frames?: FrameExtraction[]; manual_frames?: string[];
  is_compound?: boolean; segments?: DNASegment[]; transition_type?: string;
}

interface FrameExtraction { timestamp_seconds: number; description: string; significance: string; }

interface UploadConfig {
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor" | "compound";
  context: string; manual_frames: File[];
  iteration_of?: string;
}

interface VisualIdentity { environment: string; lighting: string; player_champion: string; enemy_champion: string; player_mob_color: string; enemy_mob_color: string; gate_values: string[]; cannon_type: string; mood_notes: string; }
interface ScriptStep { time: string; action: string; visual_cue: string; audio_cue: string; }
interface PerformanceHook { type: string; text: string; }
interface QualityScore { pattern_fidelity: number; moc_dna: number; emotional_arc: number; visual_clarity: number; segment_fit: number; overall: number; notes: string; }
interface NetworkAdaptations { AppLovin?: string; Facebook?: string; Google?: string; TikTok?: string; }
interface Concept {
  title: string; is_data_backed: boolean; objective: string; target_segment: string;
  player_motivation: string; visual_identity: VisualIdentity; layout: string;
  production_script: ScriptStep[]; performance_hooks: PerformanceHook[];
  engagement_hooks: string; quality_score: QualityScore;
  network_adaptations?: NetworkAdaptations;
  visual_start?: string; visual_middle?: string; visual_end?: string;
}
interface BriefAnalysis { patterns_used: string; segment_insight: string; strategy: string; dna_sources?: string[]; }

const TIERS = ["winner", "scalable", "failed", "inspiration"] as const;
const SPEND_TIERS = [
  { value: "sub100K", label: "<$100K", bg: "#1a2a1a", text: "#3fb950", border: "#238636" },
  { value: "100K",    label: ">$100K", bg: "#1a2a1a", text: "#3fb950", border: "#238636" },
  { value: "300K",    label: ">$300K", bg: "#1a2a4a", text: "#58a6ff", border: "#1f6feb" },
  { value: "500K",    label: ">$500K", bg: "#2a1a0a", text: "#f0c53a", border: "#9e6a03" },
  { value: "1M",      label: ">$1M",   bg: "#2a1a10", text: "#ffa657", border: "#d1242f" },
];
const WINDOW_OPTIONS = [
  { value: 7, label: "7d" }, { value: 14, label: "14d" }, { value: 30, label: "30d" },
  { value: 60, label: "60d" }, { value: 90, label: "90d" }, { value: 180, label: "6mo" }, { value: 365, label: "1yr+" },
];
const NETWORK_OPTIONS = ["AppLovin", "Facebook", "TikTok", "Google", "Voodoo Ads", "Unity"];
const SEGMENTS_LIST = ["Whale", "Dolphin", "Minnow", "Non-Payer"];
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const GEMINI_TEXT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`;

// ─── Gemini calls ─────────────────────────────────────────────────────────────
async function callGeminiDirect(systemPrompt: string, contentParts: any[]): Promise<any> {
  const r = await fetch(GEMINI_TEXT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: contentParts }], generationConfig: { response_mime_type: "application/json" } }) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${text}`);
  const data = JSON.parse(text);
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return parseJSON(raw);
}

function parseJSON(text: string): any {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON: " + cleaned.slice(0, 200));
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callImageDirect(prompt: string, refParts: any[]): Promise<string> {
  const r = await fetch(GEMINI_IMAGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [...refParts, { text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Image gen ${r.status}: ${text}`);
  const data = JSON.parse(text);
  const imgPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!imgPart) throw new Error("No image returned");
  return `data:image/png;base64,${imgPart.inlineData.data}`;
}

async function uploadToGeminiFileAPI(file: File, onStatus: (m: string) => void): Promise<{ fileUri: string; mimeType: string }> {
  onStatus(`Uploading "${file.name}" (${Math.round(file.size / 1024 / 1024)}MB)…`);
  const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`, { method: "POST", headers: { "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": file.size.toString(), "X-Goog-Upload-Header-Content-Type": file.type, "Content-Type": "application/json" }, body: JSON.stringify({ file: { display_name: file.name } }) });
  if (!initRes.ok) throw new Error(`File API init: ${initRes.status}`);
  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL");
  const uploadRes = await fetch(uploadUrl, { method: "POST", headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Type": file.type }, body: file });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  const data = await uploadRes.json();
  const fileUri = data.file?.uri; const name = data.file?.name;
  if (!fileUri) throw new Error("No file URI");
  onStatus(`Processing "${file.name}"…`);
  for (let i = 0; i < 20; i++) {
    const s = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${GEMINI_KEY}`)).json();
    if (s.state === "ACTIVE") break;
    if (s.state === "FAILED") throw new Error("File processing failed");
    await new Promise(r => setTimeout(r, 2000));
  }
  return { fileUri, mimeType: file.type };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
}

function pickRelevantRefs(vi: VisualIdentity): any[] {
  const biome = vi.environment?.toLowerCase() || ""; const player = vi.player_champion?.toLowerCase() || ""; const enemy = vi.enemy_champion?.toLowerCase() || "";
  const populated = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_"));
  if (populated.length === 0) return [];
  const scored = populated.map(ref => { const label = ref.label.toLowerCase(); let score = 0; if (label.includes(biome)) score += 3; if (player && label.includes(player)) score += 2; if (enemy && label.includes(enemy)) score += 2; if (ref.category === "gate") score += 1; return { ref, score }; });
  scored.sort((a, b) => b.score - a.score);
  const selected: typeof populated = [];
  const biomeRef = scored.find(s => s.ref.category === "biome" && s.score > 0)?.ref;
  const champRef = scored.find(s => s.ref.category === "champion" && s.score > 0)?.ref;
  const gateRef = scored.find(s => s.ref.category === "gate")?.ref;
  if (biomeRef) selected.push(biomeRef);
  if (champRef && champRef !== biomeRef) selected.push(champRef);
  if (gateRef && !selected.includes(gateRef)) selected.push(gateRef);
  for (const { ref } of scored) { if (selected.length >= 3) break; if (!selected.includes(ref)) selected.push(ref); }
  const parts: any[] = [{ text: "### MOC VISUAL REFERENCES — match this exact art style:" }];
  selected.forEach(ref => { parts.push({ text: `[${ref.category.toUpperCase()}]: ${ref.label.split(".")[0]}` }); parts.push({ inlineData: { mimeType: "image/jpeg", data: ref.base64 } }); });
  return parts;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
const BIOME_GUIDE = `BIOMES (match what you see, not what you expect):
- Foggy Forest: grey/white ATMOSPHERIC FOG, dark green pine trees through mist, grey road. THE FOG IS NOT SNOW — no white ground.
- Desert: tan/beige sand dunes, bright warm sunlight, blue sky, sparse dry vegetation
- Water: plain grey bridge or path over clear BLUE WATER — no trees, no sand, no fog
- Bunker: grey concrete walls and floor, dark tunnel archway, industrial feel
- Cyber-City: grey metal paths, orange glowing tech structures
- Volcanic: red/orange lava flows, dark black rocks
- Snow: actual WHITE SNOW on the ground, icy frozen structures, blue-white lighting
- Toxic: purple paths, green slime, glowing crystals
- Meadow: green hills, scattered trees, grey brick bridge, blue sky
- Unknown: if it doesn't clearly match any above`;

const CHAMPION_GUIDE = `CHAMPIONS (visual match only — never infer):
- Captain Kaboom: SMALL skeleton pirate, mushroom-shaped hat, skull face, dual pistols
- Gold Golem/Hulk: LARGE golden muscular bodybuilder humanoid
- Caveman: blue-skinned muscular man, blonde hair, wooden club
- Mobzilla: large purple/yellow robotic T-Rex, blue crystalline spikes
- Nexus: blue/white/orange humanoid mech, orange energy sword
- Red Hulk: large red muscular humanoid
- Kraken: large red octopus/squid creature
- Femme Zombie: large crawling female zombie figure (boss)
- Yellow Normie: small yellow round humanoid — BOSS ENEMY (not a champion, but report if visible)
- Unknown: if character doesn't clearly match any above`;

const GATE_GUIDE = `GATES (only report gates you actually see on screen — NEVER invent):
- Multiplication gate: rectangle with X value (x2, x3, x4, x100 etc.) — various colors
- Addition gate: rectangle with + value (+1, +3, +99 etc.)
- Death gate: RED rectangle with SKULL icon — instantly kills ALL mobs
- Dynamic/upgrade gates: gates that combine or upgrade when structures are broken
- Report ONLY gates you see. If you see 1 X gate and 8 +1 gates, report exactly that.`;

const HOOK_GUIDE = `HOOK TIMING RULES (critical):
- Hook = the EXACT SECOND a viewer's thumb would stop scrolling
- This is ALMOST NEVER second 0 — unless something dramatic happens in the very first frame
- Look for: unexpected boss appearance, surprising transformation, cannon being kicked back, dramatic reveal
- hook_timing_seconds must be a REAL SECOND (e.g. 2, 4, 8) — NEVER a fraction like 0.03 or 0.28
- If the first surprising moment is at second 3, write 3. If at second 8, write 8.`;

const TIMESTAMP_RULES = `TIMESTAMP RULES (apply to ALL time fields):
- All timestamps must be REAL SECONDS from the start of the video
- Examples: 0, 2, 5, 8, 14, 22, 35 — these are correct
- NEVER report: 0.03, 0.28, 0.47 — these are WRONG (they look like fractions/percentages)
- If a video is 30 seconds long and something happens halfway through, write 15 — not 0.5
- Minimum meaningful timestamp is 1 second`;

const frameExtractionSystem = () => `You are a precise video timestamp analyst. Watch the video and identify 8 key moments.\n\n${TIMESTAMP_RULES}\n\nReturn ONLY valid JSON:\n{\n  "duration_seconds": number,\n  "frames": [\n    { "timestamp_seconds": number, "description": string, "significance": "hook|gate|upgrade|swarm|boss|loss|win|fail|transition" }\n  ]\n}`;

const hookDetectionSystem = () => `You are an expert mobile ad analyst specializing in scroll-stopping hooks.\n\n${HOOK_GUIDE}\n${TIMESTAMP_RULES}\n\nReturn ONLY valid JSON:\n{\n  "hook_timing_seconds": number,\n  "hook_type": "Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial",\n  "hook_description": "precise description of WHY this moment stops scrolling"\n}`;

const analyzeSystem = (lib: DNAEntry[], config: UploadConfig, frames: FrameExtraction[], duration: number, hasManualFrames: boolean, hasRefs: boolean) => `You are a World-Class Creative Intelligence Analyst for Mob Control ads. NEVER guess — only report what you directly observe.\n\nAD TYPE: ${config.ad_type === "compound" ? "COMPOUND/MIX CREATIVE" : config.ad_type === "moc" ? "MOB CONTROL ORIGINAL" : "COMPETITOR / MARKET REFERENCE"}\nPERFORMANCE TIER: ${config.tier.toUpperCase()}\n${config.iteration_of ? `ITERATION OF: ${config.iteration_of}` : ""}\nANALYST CONTEXT: ${config.context || "No additional context provided."}\nVIDEO DURATION: ${duration} seconds\n\nEXISTING LIBRARY (${lib.length} entries):\n${lib.length > 0 ? JSON.stringify(lib.map(d => ({ title: d.title, tier: d.tier, hook_type: d.hook_type, hook_timing_seconds: d.hook_timing_seconds }))) : "Empty."}\n\n${hasRefs ? buildReferenceContext() : ""}\n\nAUTO-EXTRACTED FRAMES:\n${frames.length > 0 ? frames.map(f => `[${f.timestamp_seconds}s] ${f.description} (${f.significance})`).join("\n") : "Not available."}\n\n${hasManualFrames ? "MANUAL STORYBOARD FRAMES: provided above." : ""}\n\n${TIMESTAMP_RULES}\n${HOOK_GUIDE}\n${GATE_GUIDE}\n${BIOME_GUIDE}\n${CHAMPION_GUIDE}\n\nUNIT EVOLUTION CHAIN: Track the player's unit type at every upgrade. Report as ordered array: ["simple cannon (0s)", "double cannon (8s)"]\nEMOTIONAL BEATS: Map to real timestamps: [{ "timestamp_seconds": 3, "event": "skeleton kicks cannon back", "emotion": "surprise" }]\n\n${config.ad_type === "compound" ? "COMPOUND AD: Set is_compound: true and analyze each segment separately in the segments array." : ""}\n\nReturn ONLY valid JSON:\n{\n  "title": string, "is_compound": boolean, "transition_type": string | null, "segments": [] | null,\n  "hook_type": "Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial",\n  "hook_timing_seconds": number, "hook_description": string, "gate_sequence": [string],\n  "swarm_peak_moment_seconds": number | null, "loss_event_type": "Wrong Gate|Boss Overwhelm|Timer|Death Gate|Enemy Overwhelm|None",\n  "loss_event_timing_seconds": number | null, "unit_evolution_chain": [string],\n  "emotional_arc": string, "emotional_beats": [{ "timestamp_seconds": number, "event": string, "emotion": string }],\n  "biome": "Desert|Cyber-City|Forest|Volcanic|Snow|Toxic|Water|Bunker|Meadow|Unknown",\n  "biome_visual_notes": string, "champions_visible": [string], "pacing": "Fast|Medium|Slow",\n  "key_mechanic": string, "why_it_works": string, "why_it_fails": string | null,\n  "creative_gaps": string, "creative_gaps_structured": { "hook_strength": string, "mechanic_clarity": string, "emotional_payoff": string },\n  "frame_extraction_gaps": string, "strategic_notes": string, "replication_instructions": string\n}`;

const reanalysisSystem = (entry: DNAEntry) => `You are re-analyzing a Mob Control ad based on existing DNA data. Fix systematic errors and enrich the analysis.\n\nEXISTING DNA:\n${JSON.stringify(entry, null, 2)}\n\nKNOWN ERRORS TO FIX:\n1. hook_timing_seconds is likely 0 or a fraction — fix to real seconds\n2. swarm_peak/loss_event timestamps may be fractions — convert to real seconds\n3. gate_sequence may be hallucinated — cross-check against context\n4. unit_evolution_chain likely missing — extract from context and frame names\n5. emotional_beats missing — add timestamp-mapped beats\n6. creative_gaps_structured missing — add structured analysis\n7. If compound, set is_compound: true and add segments\n\n${TIMESTAMP_RULES}\n${HOOK_GUIDE}\n${GATE_GUIDE}\n${BIOME_GUIDE}\n${CHAMPION_GUIDE}\n\nReturn the CORRECTED full DNA as valid JSON with all original fields plus:\n{ "title": string, "hook_type": string, "hook_timing_seconds": number, "hook_description": string, "gate_sequence": [string], "swarm_peak_moment_seconds": number | null, "loss_event_type": string, "loss_event_timing_seconds": number | null, "unit_evolution_chain": [string], "emotional_arc": string, "emotional_beats": [{ "timestamp_seconds": number, "event": string, "emotion": string }], "biome": string, "biome_visual_notes": string, "champions_visible": [string], "pacing": string, "key_mechanic": string, "why_it_works": string, "why_it_fails": string | null, "creative_gaps": string, "creative_gaps_structured": { "hook_strength": string, "mechanic_clarity": string, "emotional_payoff": string }, "strategic_notes": string, "replication_instructions": string, "is_compound": boolean, "transition_type": string | null, "segments": [] | null }`;

// ─── Brief system — now accepts iterateFrom ref ───────────────────────────────
const briefSystem = (lib: DNAEntry[], ctx: string, seg: string, iterateFrom?: string) => {
  const winners = lib.filter(d => d.tier === "winner");
  const refBlock = iterateFrom ? `\nVISUAL REF — ITERATE FROM: "${iterateFrom}"\nThis creative is the user's starting point. Study its patterns from the DNA library if it exists there. Levelly DNA rules below are still the PRIMARY output driver — the ref tells you WHERE TO START, not where to end up. Extract what's working in this creative and layer proven DNA patterns on top.\n` : "";
  return `You are a World-Class Lead Creative Producer for Mob Control. Ground EVERY concept in specific patterns from the DNA library.\n\nWINNER DNA LIBRARY (${winners.length} entries):\n${JSON.stringify(winners.map(d => ({ title: d.title, hook_type: d.hook_type, hook_timing_seconds: d.hook_timing_seconds, gate_sequence: d.gate_sequence.slice(0, 5), unit_evolution_chain: d.unit_evolution_chain, key_mechanic: d.key_mechanic, biome: d.biome, loss_event_type: d.loss_event_type, spend_tier: d.spend_tier, spend_networks: d.spend_networks, replication_instructions: d.replication_instructions?.slice(0, 200) })), null, 2)}\n\nBRIEF: ${ctx} | SEGMENT: ${seg}\n${refBlock}\nSEGMENT DATA: Whale(>$50/mo,45-59yo,Motivation=Winning/Rankings), Dolphin($10-50/mo,Motivation=Winning+Fun), Minnow(<$10/mo,Motivation=Fun+Winning), Non-Payer(Motivation=Fun+Challenges).\nMOC BIOMES: Desert, Foggy Forest, Water, Bunker, Cyber-City, Volcanic, Snow, Toxic, Meadow\n9-STEP CURVE: Pressure→Investment→Validate→Investment2→Payoff→False Safety→Pressure++→Almost Win→Fail\nNETWORK RULES:\n- AppLovin: skeleton/challenge hooks, custom side camera, blue palette, CT43 formula strongest\n- Facebook: blue/red swap, desert biome, default MOC camera, CZ65 pattern\n- Google: strengthen almost-win (boss at 1HP), CB57 pattern, foggy forest worth testing\n\nINSTRUCTIONS:\n- Cite which DNA library entry each concept is based on\n- Replicate exact gate sequences and unit evolution chains from winners\n- Hook timing must NOT be 0\n- For network_adaptations: give a specific 1-sentence instruction per network\n\nReturn ONLY valid JSON:\n{"analysis":{"patterns_used":string,"dna_sources":[string],"segment_insight":string,"strategy":string},"concepts":[{"title":string,"dna_source":string,"is_data_backed":boolean,"objective":string,"target_segment":string,"player_motivation":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"layout":string,"hook_timing_seconds":number,"unit_evolution_chain":[string],"network_adaptations":{"AppLovin":string,"Facebook":string,"Google":string},"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"performance_hooks":[{"type":string,"text":string}],"engagement_hooks":string,"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}]}`;
};

const imagePrompt = (concept: Concept, scene: "start" | "middle" | "end", visualSeed?: string) => {
  const vi = concept.visual_identity;
  const scenes = { start: "Opening: player cannon at bottom, small mob just fired, first gate ahead, enemy base at top with full health bar.", middle: "Mid-battle: massive mob swarm filling screen after multiplier gates.", end: "Dramatic fail: player mob nearly gone, enemy/boss still standing." }[scene];
  return `Mob Control gameplay screenshot — match reference images above EXACTLY in art style and 3D quality.\n${scenes}\nENV: ${vi.environment} | LIGHTING: ${vi.lighting} | PLAYER: ${vi.player_champion} | ENEMY: ${vi.enemy_champion}\nPLAYER MOB: ${vi.player_mob_color} round blob creatures | ENEMY MOB: ${vi.enemy_mob_color} round blob creatures\nGATES: ${vi.gate_values?.join(", ")} | CANNON: ${vi.cannon_type} | MOOD: ${vi.mood_notes}\n${visualSeed ? `CONSISTENCY: ${visualSeed}` : ""}\n${BIOME_GUIDE}\nRULES: Cinematic top-down angle, cannon at bottom center, gates large and readable, NO text/UI/watermarks.`;
};

// ─── Dark design tokens ───────────────────────────────────────────────────────
const D = {
  bg:        "#0d1117",
  surface:   "#161b22",
  surface2:  "#1c2128",
  border:    "#21262d",
  border2:   "#30363d",
  text:      "#e6edf3",
  textMuted: "#8b949e",
  textDim:   "#484f58",
  blue:      "#58a6ff",
  blueDark:  "#1f6feb",
  blueBg:    "#1a2a4a",
  green:     "#3fb950",
  greenBg:   "#1a2a1a",
  greenBdr:  "#238636",
  gold:      "#f0c53a",
  goldBg:    "#2a1a0a",
  goldBdr:   "#9e6a03",
  purple:    "#d2a8ff",
  purpleBg:  "#1e1a2e",
  purpleBdr: "#8957e5",
  red:       "#f85149",
  redBg:     "#2a1010",
};

const TIER_DARK: Record<string, { bg: string; text: string; border: string }> = {
  winner:      { bg: D.greenBg,  text: D.green,  border: D.greenBdr },
  scalable:    { bg: D.blueBg,   text: D.blue,   border: D.blueDark },
  failed:      { bg: D.redBg,    text: D.red,     border: "#6e2020" },
  inspiration: { bg: D.goldBg,   text: D.gold,    border: D.goldBdr },
};

const scoreColor = (n: number) => n >= 80 ? D.green : n >= 60 ? D.blue : D.red;

function spendLabel(tier: string) { return SPEND_TIERS.find(t => t.value === tier)?.label ?? tier; }
function velocityPerDay(tier: string, days: number | null | undefined): string | null {
  if (!tier || !days || tier === "sub100K") return null;
  const amounts: Record<string, number> = { "100K": 100000, "300K": 300000, "500K": 500000, "1M": 1000000 };
  const v = amounts[tier]; if (!v) return null;
  return `~$${Math.round(v / days).toLocaleString()}/day`;
}

// ─── Shared dark component styles ─────────────────────────────────────────────
const s = {
  card: {
    background: D.surface, border: `0.5px solid ${D.border}`,
    borderRadius: 10, padding: "14px 16px", marginBottom: 10,
  } as React.CSSProperties,
  label: {
    fontSize: 9, fontWeight: 600, color: D.textDim,
    textTransform: "uppercase" as const, letterSpacing: "0.1em",
    marginBottom: 6, display: "block",
  },
  input: {
    width: "100%", boxSizing: "border-box" as const, fontSize: 12,
    padding: "7px 10px", background: D.bg, border: `0.5px solid ${D.border2}`,
    borderRadius: 7, outline: "none", color: D.text, fontFamily: "inherit",
  },
  textarea: {
    width: "100%", boxSizing: "border-box" as const, fontSize: 13,
    padding: "9px 11px", background: "transparent",
    border: "none", borderRadius: 0, minHeight: 64,
    resize: "vertical" as const, outline: "none",
    fontFamily: "inherit", color: D.text, lineHeight: 1.6,
  },
  btnPrimary: {
    padding: "8px 18px", fontSize: 12, fontWeight: 500, cursor: "pointer",
    borderRadius: 8, border: "none", background: D.blueDark, color: "#fff",
    transition: "background .15s, transform .1s",
  } as React.CSSProperties,
  btnSecondary: {
    padding: "6px 12px", fontSize: 11, fontWeight: 400, cursor: "pointer",
    borderRadius: 7, border: `0.5px solid ${D.border2}`,
    background: "transparent", color: D.textMuted,
    transition: "background .15s, color .15s",
  } as React.CSSProperties,
  btnDanger: {
    padding: "4px 9px", fontSize: 11, cursor: "pointer",
    borderRadius: 6, border: `0.5px solid #6e2020`,
    background: "transparent", color: D.red,
  } as React.CSSProperties,
  badge: (tier: string): React.CSSProperties => ({
    fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
    background: TIER_DARK[tier]?.bg ?? D.surface2,
    color: TIER_DARK[tier]?.text ?? D.textMuted,
    border: `0.5px solid ${TIER_DARK[tier]?.border ?? D.border2}`,
  }),
  chip: (active: boolean, color: "blue" | "green" | "gold" = "blue"): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 20, fontSize: 11,
    cursor: "pointer", transition: "border-color .15s, background .15s, color .15s",
    border: `0.5px solid ${active ? (color === "green" ? D.greenBdr : color === "gold" ? D.goldBdr : D.blueDark) : D.border2}`,
    background: active ? (color === "green" ? D.greenBg : color === "gold" ? D.goldBg : D.blueBg) : "transparent",
    color: active ? (color === "green" ? D.green : color === "gold" ? D.gold : D.blue) : D.textMuted,
  }),
  metric: {
    background: D.surface2, borderRadius: 7, padding: "8px 10px", textAlign: "center" as const,
  },
  error: {
    fontSize: 11, color: D.red, background: D.redBg,
    border: `0.5px solid #6e2020`, borderRadius: 8, padding: "8px 12px", marginTop: 8,
  } as React.CSSProperties,
  info: {
    fontSize: 11, color: D.blue, background: D.blueBg,
    border: `0.5px solid ${D.blueDark}`, borderRadius: 8, padding: "8px 12px", marginTop: 8,
  } as React.CSSProperties,
  gridAuto: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 7 } as React.CSSProperties,
  grid3: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 } as React.CSSProperties,
  sceneWrap: {
    aspectRatio: "9/16", background: D.surface2, borderRadius: 10,
    border: `0.5px solid ${D.border}`, overflow: "hidden",
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center", cursor: "pointer",
  } as React.CSSProperties,
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: {
    background: D.surface, borderRadius: 14, padding: "1.5rem",
    width: "90%", maxWidth: 520, border: `0.5px solid ${D.border2}`,
    maxHeight: "90vh", overflowY: "auto" as const,
  } as React.CSSProperties,
};

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onConfirm, onCancel }: { onConfirm: (cfg: UploadConfig) => void; onCancel: () => void }) {
  const [tier, setTier] = useState<UploadConfig["tier"]>("winner");
  const [adType, setAdType] = useState<UploadConfig["ad_type"]>("moc");
  const [context, setContext] = useState("");
  const [manualFrames, setManualFrames] = useState<File[]>([]);
  const [iterOf, setIterOf] = useState("");
  const frameRef = useRef<HTMLInputElement>(null);
  const refCount = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_")).length;

  return (
    <div style={s.overlay} onClick={onCancel}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 500, color: D.text }}>Upload ads</h2>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: D.textMuted }}>Configure before choosing files.</p>

        <div style={{ marginBottom: 14 }}>
          <span style={s.label}>Ad type</span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["moc", "competitor", "compound"] as const).map(t => (
              <button key={t} onClick={() => setAdType(t)} style={{ flex: 1, padding: "7px 0", fontSize: 11, fontWeight: 500, borderRadius: 8, border: `1.5px solid ${adType === t ? D.blueDark : D.border2}`, background: adType === t ? D.blueBg : "transparent", color: adType === t ? D.blue : D.textMuted, cursor: "pointer", transition: "all .15s" }}>
                {t === "moc" ? "MOC" : t === "competitor" ? "Competitor" : "Compound/Mix"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={s.label}>Performance tier</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {(["winner","scalable","failed","inspiration"] as const).map(t => (
              <button key={t} onClick={() => setTier(t)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 500, borderRadius: 20, border: `1.5px solid ${tier === t ? TIER_DARK[t].border : D.border2}`, background: tier === t ? TIER_DARK[t].bg : "transparent", color: tier === t ? TIER_DARK[t].text : D.textMuted, cursor: "pointer", transition: "all .15s" }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={s.label}>Iteration of</span>
          <input style={s.input} type="text" placeholder="e.g. CT43" value={iterOf} onChange={e => setIterOf(e.target.value)} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={s.label}>Context for Gemini</span>
          <textarea style={{ ...s.textarea, background: D.bg, border: `0.5px solid ${D.border2}`, borderRadius: 7, padding: "8px 10px", minHeight: 72 }} placeholder="Describe biome, hook, key mechanics…" value={context} onChange={e => setContext(e.target.value)} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={s.label}>Manual storyboard frames (optional)</span>
          <input ref={frameRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => setManualFrames(Array.from(e.target.files ?? []))} />
          <button style={s.btnSecondary} onClick={() => frameRef.current?.click()}>
            {manualFrames.length > 0 ? `${manualFrames.length} frame(s) selected` : "+ Add frames"}
          </button>
        </div>

        <div style={{ marginBottom: 16, padding: "8px 12px", background: D.surface2, borderRadius: 8, fontSize: 10, color: D.textMuted, border: `0.5px solid ${D.border}` }}>
          {refCount > 0 ? `✓ ${refCount} MOC refs` : "⚠ No refs"} → Frame extraction → Hook detection → {manualFrames.length > 0 ? `✓ ${manualFrames.length} manual frames` : "No manual frames"} → DNA analysis
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={s.btnSecondary} onClick={onCancel}>Cancel</button>
          <button style={s.btnPrimary} onClick={() => onConfirm({ tier, ad_type: adType, context, manual_frames: manualFrames, iteration_of: iterOf || undefined })}>Choose video →</button>
        </div>
      </div>
    </div>
  );
}

// ─── Spend Tagger ─────────────────────────────────────────────────────────────
function SpendTagger({ entry, onSave }: { entry: DNAEntry; onSave: (fields: Partial<DNAEntry>) => void }) {
  const [tier, setTier] = useState(entry.spend_tier ?? "");
  const [days, setDays] = useState<number | null>(entry.spend_window_days ?? null);
  const [networks, setNetworks] = useState<string[]>(entry.spend_networks ?? []);
  const [notes, setNotes] = useState(entry.spend_notes ?? "");
  const [iterOf, setIterOf] = useState(entry.iteration_of ?? "");
  const [saved, setSaved] = useState(false);
  const vel = velocityPerDay(tier, days);

  function save() {
    onSave({ spend_tier: tier || undefined, spend_window_days: days, spend_networks: networks.length > 0 ? networks : undefined, spend_notes: notes || undefined, iteration_of: iterOf || undefined });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ marginTop: 14, padding: "14px 16px", background: D.surface2, borderRadius: 10, border: `0.5px solid ${D.border}` }}>
      <span style={{ ...s.label, marginBottom: 12 }}>Spend data</span>

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: D.textDim, display: "block", marginBottom: 6 }}>Spend tier</span>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
          {SPEND_TIERS.map(t => (
            <button key={t.value} onClick={() => setTier(tier === t.value ? "" : t.value)}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, borderRadius: 20, cursor: "pointer", transition: "all .15s", border: `1.5px solid ${tier === t.value ? t.border : D.border2}`, background: tier === t.value ? t.bg : "transparent", color: tier === t.value ? t.text : D.textMuted }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tier && tier !== "sub100K" && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 10, color: D.textDim, display: "block", marginBottom: 6 }}>Time to reach that spend</span>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
            {WINDOW_OPTIONS.map(w => (
              <button key={w.value} onClick={() => setDays(days === w.value ? null : w.value)}
                style={{ padding: "4px 10px", fontSize: 11, borderRadius: 20, cursor: "pointer", transition: "all .15s", border: `1.5px solid ${days === w.value ? D.blueDark : D.border2}`, background: days === w.value ? D.blueBg : "transparent", color: days === w.value ? D.blue : D.textMuted }}>
                {w.label}
              </button>
            ))}
          </div>
          {vel && <div style={{ marginTop: 6, fontSize: 11, color: D.blue, fontWeight: 500 }}>{vel}</div>}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: D.textDim, display: "block", marginBottom: 6 }}>Networks</span>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
          {NETWORK_OPTIONS.map(n => (
            <button key={n} onClick={() => setNetworks(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n])}
              style={s.chip(networks.includes(n), "green")}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: D.textDim, display: "block", marginBottom: 6 }}>Iteration of</span>
        <input style={{ ...s.input, fontSize: 11, padding: "5px 8px" }} placeholder="e.g. CT43, CZ66" value={iterOf} onChange={e => setIterOf(e.target.value)} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: D.textDim, display: "block", marginBottom: 6 }}>Notes</span>
        <textarea style={{ ...s.textarea, background: D.bg, border: `0.5px solid ${D.border2}`, borderRadius: 7, padding: "7px 9px", minHeight: 52, fontSize: 11 }} placeholder="e.g. peaked week 2, Meta only, still running low budget…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <button onClick={save} style={{ ...s.btnPrimary, padding: "6px 14px", fontSize: 11 }}>
        {saved ? "Saved ✓" : "Save spend data"}
      </button>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<"Library" | "Brief Studio">("Library");
  const [lib, setLib] = useState<DNAEntry[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/load-library")
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then((data: DNAEntry[]) => {
        if (Array.isArray(data) && data.length > 0) setLib(data);
        else { try { const local = localStorage.getItem("levelly_dna_library"); if (local) setLib(JSON.parse(local)); } catch {} }
        setLibraryLoaded(true);
      })
      .catch(() => {
        try { const local = localStorage.getItem("levelly_dna_library"); if (local) setLib(JSON.parse(local)); } catch {}
        setLibraryLoaded(true);
      });
  }, []);

  const saveLib = useCallback((updated: DNAEntry[]) => {
    setLib(updated);
    try { localStorage.setItem("levelly_dna_library", JSON.stringify(updated)); } catch {}
    if (libraryLoaded) {
      setCloudStatus("saving");
      fetch("/api/save-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) })
        .then(res => { if (!res.ok) throw new Error(); setCloudStatus("saved"); setTimeout(() => setCloudStatus("idle"), 2000); })
        .catch(() => { setCloudStatus("error"); setTimeout(() => setCloudStatus("idle"), 3000); });
    }
  }, [libraryLoaded]);

  const [showModal, setShowModal] = useState(false);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState("");
  const [analyzeInfo, setAnalyzeInfo] = useState("");
  const [expandedDNA, setExpandedDNA] = useState<number | null>(null);
  const [reanalyzingIds, setReanalyzingIds] = useState<Set<number>>(new Set());
  const [reanalyzingAll, setReanalyzingAll] = useState(false);
  const [reanalysisProgress, setReanalysisProgress] = useState("");

  // Brief Studio state
  const [briefCtx, setBriefCtx] = useState("");
  const [segment, setSegment] = useState("Whale");
  const [iterateFrom, setIterateFrom] = useState("");
  const [generating, setGenerating] = useState(false);
  const [briefErr, setBriefErr] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [briefAnalysis, setBriefAnalysis] = useState<BriefAnalysis | null>(null);
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  const [renderingScene, setRenderingScene] = useState<Record<string, boolean>>({});

  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const exportLibrary = () => {
    const blob = new Blob([JSON.stringify(lib, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `levelly-dna-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importLibrary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!Array.isArray(parsed)) throw new Error("Invalid format");
        const merged = [...lib];
        parsed.forEach((entry: DNAEntry) => { if (!merged.find(x => x.id === entry.id)) merged.push(entry); });
        saveLib(merged);
      } catch { alert("Import failed — invalid file format."); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  const reanalyzeSingle = async (entry: DNAEntry): Promise<DNAEntry> => {
    const corrected = await callGeminiDirect(reanalysisSystem(entry), [{ text: `Re-analyze: ${entry.title}` }]);
    return { ...entry, ...corrected, id: entry.id, reanalyzed: true, added_at: entry.added_at, file_name: entry.file_name, tier: entry.tier, ad_type: entry.ad_type };
  };

  const handleReanalyzeSingle = async (entry: DNAEntry) => {
    setReanalyzingIds(prev => new Set(prev).add(entry.id));
    try { const updated = await reanalyzeSingle(entry); saveLib(lib.map(x => x.id === entry.id ? updated : x)); }
    catch (err: any) { alert(`Re-analysis failed: ${err.message}`); }
    finally { setReanalyzingIds(prev => { const s = new Set(prev); s.delete(entry.id); return s; }); }
  };

  const handleReanalyzeAll = async () => {
    if (!confirm(`Re-analyze all ${lib.length} entries? This will make ${lib.length} API calls.`)) return;
    setReanalyzingAll(true); let updated = [...lib];
    for (let i = 0; i < lib.length; i++) {
      setReanalysisProgress(`Re-analyzing ${i + 1}/${lib.length}: ${lib[i].title}…`);
      try { const corrected = await reanalyzeSingle(lib[i]); updated = updated.map(x => x.id === lib[i].id ? corrected : x); saveLib(updated); }
      catch (err) { console.warn(`Failed: ${lib[i].title}`, err); }
      await new Promise(r => setTimeout(r, 1000));
    }
    setReanalyzingAll(false); setReanalysisProgress("");
  };

  const handleModalConfirm = (cfg: UploadConfig) => { setUploadConfig(cfg); setShowModal(false); fileRef.current?.click(); };

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const cfg = uploadConfig || { tier: "winner" as const, ad_type: "moc" as const, context: "", manual_frames: [] };
    setAnalyzing(true); setAnalyzeErr(""); setAnalyzeInfo("");
    try {
      for (const file of files) {
        let videoPart: any;
        if (file.size > 4 * 1024 * 1024) {
          const { fileUri, mimeType } = await uploadToGeminiFileAPI(file, setAnalyzeInfo);
          videoPart = { fileData: { mimeType, fileUri } };
        } else {
          setAnalyzeInfo(`Processing "${file.name}"…`);
          const b64 = await fileToBase64(file);
          videoPart = { inlineData: { mimeType: file.type, data: b64 } };
        }
        setAnalyzeInfo(`Extracting frames from "${file.name}"…`);
        let autoFrames: FrameExtraction[] = []; let duration = 30;
        try { const fr = await callGeminiDirect(frameExtractionSystem(), [{ text: "Extract 8 key frames:" }, videoPart]); autoFrames = fr?.frames || []; duration = fr?.duration_seconds || 30; } catch {}
        setAnalyzeInfo(`Detecting hook moment…`);
        let hookData: any = {};
        try { hookData = await callGeminiDirect(hookDetectionSystem(), [{ text: `Frames: ${JSON.stringify(autoFrames)}. Context: ${cfg.context}. Find hook:` }, videoPart]); } catch {}
        const manualParts: any[] = [];
        if (cfg.manual_frames.length > 0) {
          setAnalyzeInfo(`Processing ${cfg.manual_frames.length} manual frames…`);
          for (const mf of cfg.manual_frames) { const b64 = await fileToBase64(mf); manualParts.push({ text: `Manual frame: ${mf.name}` }); manualParts.push({ inlineData: { mimeType: mf.type, data: b64 } }); }
        }
        setAnalyzeInfo(`Analyzing "${file.name}"…`);
        const refParts = buildReferenceParts();
        const dna = await callGeminiDirect(
          analyzeSystem(lib, cfg, autoFrames, duration, manualParts.length > 0, refParts.length > 0),
          [...refParts, ...(manualParts.length > 0 ? [{ text: "### MANUAL FRAMES:" }, ...manualParts] : []), { text: `HOOK DATA: ${JSON.stringify(hookData)}` }, { text: "### AD VIDEO:" }, videoPart, { text: "Extract Creative DNA." }]
        );
        saveLib([...lib, { ...dna, id: Date.now() + Math.random(), tier: cfg.tier, ad_type: cfg.ad_type, upload_context: cfg.context, file_name: file.name, added_at: new Date().toISOString(), iteration_of: cfg.iteration_of, auto_frames: autoFrames, manual_frames: cfg.manual_frames.map(f => f.name) }]);
        setAnalyzeInfo("");
      }
    } catch (err: any) { setAnalyzeErr(err.message); }
    finally { setAnalyzing(false); setAnalyzeInfo(""); setUploadConfig(null); if (fileRef.current) fileRef.current.value = ""; }
  }, [lib, uploadConfig]);

  const handleGenerateBrief = async () => {
    if (!briefCtx.trim()) { setBriefErr("Enter a brief context first."); return; }
    if (lib.length === 0) { setBriefErr("Add at least one ad to the DNA Library first."); return; }
    setGenerating(true); setBriefErr(""); setConcepts([]); setBriefAnalysis(null);
    try {
      const result = await callGeminiDirect(
        briefSystem(lib, briefCtx, segment, iterateFrom.trim() || undefined),
        [{ text: "Generate 3 MOC ad concepts grounded in the DNA library." }]
      );
      setConcepts(result.concepts ?? []); setBriefAnalysis(result.analysis ?? null); setExpandedConcept(0);
    } catch (err: any) { setBriefErr(err.message); }
    finally { setGenerating(false); }
  };

  const handleRenderScene = async (ci: number, scene: "start" | "middle" | "end") => {
    const k = `${ci}-${scene}`; setRenderingScene(p => ({ ...p, [k]: true }));
    try {
      const concept = concepts[ci]; const refParts = pickRelevantRefs(concept.visual_identity);
      const visualSeed = scene !== "start" && concept.visual_start ? "Match the start scene's environment, lighting, road texture, and art style exactly." : undefined;
      const url = await callImageDirect(imagePrompt(concept, scene, visualSeed), refParts);
      setConcepts(p => p.map((c, i) => i === ci ? { ...c, [`visual_${scene}`]: url } : c));
    } catch (err: any) { alert(`Render failed: ${err.message}`); }
    finally { setRenderingScene(p => ({ ...p, [k]: false })); }
  };

  // ─── Cloud status label ──────────────────────────────────────────────────────
  const cloudLabel = { idle: "", saving: "Saving…", saved: "Saved to GitHub ✓", error: "Cloud save failed" }[cloudStatus];
  const cloudColor = { idle: D.textDim, saving: D.blue, saved: D.green, error: D.red }[cloudStatus];

  // ─── Stats for topbar ────────────────────────────────────────────────────────
  const winners = lib.filter(d => d.tier === "winner").length;
  const topVel = lib.reduce((best, d) => {
    const v = velocityPerDay(d.spend_tier ?? "", d.spend_window_days);
    if (!v) return best;
    const num = parseInt(v.replace(/[^0-9]/g, ""));
    return num > best ? num : best;
  }, 0);
  const networkSet = new Set(lib.flatMap(d => d.spend_networks ?? []));

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: D.bg, minHeight: "100vh", color: D.text, fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
      {showModal && <UploadModal onConfirm={handleModalConfirm} onCancel={() => setShowModal(false)} />}
      <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{ display: "none" }} onChange={handleUpload} />
      <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importLibrary} />

      {/* ── Topbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `0.5px solid ${D.border}`, position: "sticky", top: 0, background: D.bg, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: D.blueDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "#fff", flexShrink: 0 }}>L</div>
          <span style={{ fontSize: 15, fontWeight: 500 }}>Levelly</span>
          <span style={{ fontSize: 12, color: D.textMuted }}>MOC Creative Intelligence</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {cloudStatus !== "idle" && <span style={{ fontSize: 10, color: cloudColor }}>{cloudLabel}</span>}
          {cloudStatus === "idle" && lib.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, background: D.surface, border: `0.5px solid ${D.border2}`, borderRadius: 20, padding: "3px 10px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: D.green }} />
              <span style={{ fontSize: 10, color: D.blue }}>Saved to GitHub</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `0.5px solid ${D.border}` }}>
        {[
          { n: lib.length, label: "CREATIVES", color: D.text },
          { n: winners, label: "WINNERS", color: D.blue },
          { n: topVel > 0 ? `$${topVel >= 1000 ? Math.round(topVel/1000)+"K" : topVel}` : "—", label: "TOP VELOCITY", color: D.gold },
          { n: networkSet.size || "—", label: "NETWORKS", color: D.green },
        ].map(({ n, label, color }, i) => (
          <div key={label} style={{ padding: "14px 20px", borderRight: i < 3 ? `0.5px solid ${D.border}` : "none" }}>
            <div style={{ fontSize: 24, fontWeight: 500, color }}>{n}</div>
            <div style={{ fontSize: 9, letterSpacing: "0.08em", color: D.textMuted, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 0, borderBottom: `0.5px solid ${D.border}`, padding: "0 20px" }}>
        {(["Library", "Brief Studio"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 16px", fontSize: 12, fontWeight: tab === t ? 500 : 400, color: tab === t ? D.text : D.textMuted, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${D.blue}` : "2px solid transparent", cursor: "pointer", marginBottom: -1, transition: "color .15s" }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px", maxWidth: 960, margin: "0 auto" }}>

        {/* ════════════════════════════════════ LIBRARY TAB ═══════════════════ */}
        {tab === "Library" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap" as const, gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12, color: D.textMuted }}>{lib.length} ads · {winners} winners · {lib.filter(d => d.reanalyzed).length} re-analyzed</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                {lib.length > 0 && (<>
                  <button style={s.btnSecondary} onClick={handleReanalyzeAll} disabled={reanalyzingAll || analyzing}>{reanalyzingAll ? "Re-analyzing…" : "Re-analyze all"}</button>
                  <button style={s.btnSecondary} onClick={exportLibrary}>Export</button>
                  <button style={s.btnSecondary} onClick={() => { if (confirm("Clear library?")) saveLib([]); }}>Clear</button>
                </>)}
                <button style={s.btnSecondary} onClick={() => importRef.current?.click()}>Import</button>
                <button style={s.btnPrimary} onClick={() => setShowModal(true)} disabled={analyzing || reanalyzingAll}>{analyzing ? "Analyzing…" : "+ Upload"}</button>
              </div>
            </div>

            {(analyzeErr || reanalysisProgress) && <div style={reanalysisProgress ? s.info : s.error}>{analyzeErr || reanalysisProgress}</div>}
            {analyzeInfo && <div style={s.info}>{analyzeInfo}</div>}
            {!libraryLoaded && <div style={s.info}>Loading library from GitHub…</div>}

            {lib.length === 0 && !analyzing && libraryLoaded && (
              <div style={{ ...s.card, textAlign: "center", padding: "3rem", border: `1px dashed ${D.border2}` }}>
                <p style={{ margin: 0, fontSize: 13, color: D.textMuted }}>Upload MOC ads, competitor ads, or compound mixes to build your Creative DNA library.</p>
              </div>
            )}

            {lib.map((d, di) => {
              const canTag = d.ad_type === "moc" && d.tier !== "inspiration";
              const hasSpend = !!d.spend_tier;
              const spendSt = SPEND_TIERS.find(t => t.value === d.spend_tier);

              return (
                <div key={d.id} style={{ ...s.card, transition: "border-color .15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedDNA(expandedDNA === di ? null : di)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{d.title}</span>
                        <span style={s.badge(d.tier)}>{d.tier}</span>
                        {d.ad_type !== "moc" && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: D.purpleBg, color: D.purple, border: `0.5px solid ${D.purpleBdr}` }}>{d.ad_type}</span>}
                        {d.is_compound && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: D.goldBg, color: D.gold, border: `0.5px solid ${D.goldBdr}` }}>compound</span>}
                        {d.reanalyzed && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: D.greenBg, color: D.green, border: `0.5px solid ${D.greenBdr}` }}>re-analyzed</span>}
                        {d.iteration_of && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: D.surface2, color: D.textMuted, border: `0.5px solid ${D.border2}` }}>iter. of {d.iteration_of}</span>}
                        {hasSpend && spendSt && <span style={{ fontSize: 9, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: spendSt.bg, color: spendSt.text, border: `0.5px solid ${spendSt.border}` }}>{spendSt.label}{d.spend_window_days ? ` / ${WINDOW_OPTIONS.find(w => w.value === d.spend_window_days)?.label ?? d.spend_window_days + "d"}` : ""}</span>}
                        {hasSpend && d.spend_networks && d.spend_networks.length > 0 && <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: D.greenBg, color: D.green, border: `0.5px solid ${D.greenBdr}` }}>{d.spend_networks.join(", ")}</span>}
                      </div>
                      <p style={{ margin: 0, fontSize: 10, color: D.textDim }}>{d.file_name} · {new Date(d.added_at).toLocaleDateString()}</p>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 10, flexShrink: 0 }}>
                      <button style={s.btnSecondary} onClick={() => handleReanalyzeSingle(d)} disabled={reanalyzingIds.has(d.id)}>{reanalyzingIds.has(d.id) ? "…" : "Re-analyze"}</button>
                      <select value={d.tier} onChange={e => saveLib(lib.map(x => x.id === d.id ? { ...x, tier: e.target.value as DNAEntry["tier"] } : x))} style={{ fontSize: 10, padding: "3px 6px", borderRadius: 6, border: `0.5px solid ${D.border2}`, background: D.surface2, color: D.text }}>
                        {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button style={s.btnDanger} onClick={() => saveLib(lib.filter(x => x.id !== d.id))}>✕</button>
                    </div>
                  </div>

                  <div style={{ ...s.gridAuto, marginTop: 10 }}>
                    {[
                      { label: "Hook type", value: d.hook_type },
                      { label: "Hook at", value: d.hook_timing_seconds != null ? `${d.hook_timing_seconds}s` : "—" },
                      { label: "Biome", value: d.biome },
                      { label: "Pacing", value: d.pacing },
                      { label: "Loss event", value: d.loss_event_type },
                      { label: "Swarm peak", value: d.swarm_peak_moment_seconds != null ? `${d.swarm_peak_moment_seconds}s` : "—" },
                    ].map(({ label, value }) => (
                      <div key={label} style={s.metric}>
                        <div style={{ fontSize: 9, color: D.textDim, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: D.text }}>{value ?? "—"}</div>
                      </div>
                    ))}
                  </div>

                  {expandedDNA === di && (
                    <div style={{ marginTop: 14, borderTop: `0.5px solid ${D.border}`, paddingTop: 14 }}>
                      {canTag && <SpendTagger entry={d} onSave={fields => saveLib(lib.map(x => x.id === d.id ? { ...x, ...fields } : x))} />}

                      {d.unit_evolution_chain?.length > 0 && (
                        <div style={{ marginBottom: 10, marginTop: 14 }}>
                          <span style={s.label}>Unit evolution chain</span>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                            {d.unit_evolution_chain.map((step, i) => (
                              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 11, padding: "2px 8px", background: D.blueBg, color: D.blue, borderRadius: 20, border: `0.5px solid ${D.blueDark}` }}>{step}</span>
                                {i < d.unit_evolution_chain.length - 1 && <span style={{ color: D.textDim, fontSize: 11 }}>→</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {d.emotional_beats?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={s.label}>Emotional beats</span>
                          <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                            {d.emotional_beats.map((b, i) => (
                              <div key={i} style={{ fontSize: 11, padding: "5px 10px", background: D.surface2, borderRadius: 6, display: "flex", gap: 10 }}>
                                <span style={{ fontWeight: 500, color: D.blue, minWidth: 32 }}>{b.timestamp_seconds}s</span>
                                <span style={{ color: D.text }}>{b.event}</span>
                                <span style={{ color: D.textDim, fontStyle: "italic", marginLeft: "auto" }}>{b.emotion}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {d.gate_sequence?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={s.label}>Gate sequence</span>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                            {d.gate_sequence.map((g, i) => (
                              <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: g.toLowerCase().includes("death") ? D.redBg : D.blueBg, color: g.toLowerCase().includes("death") ? D.red : D.blue, borderRadius: 20, border: `0.5px solid ${g.toLowerCase().includes("death") ? "#6e2020" : D.blueDark}` }}>{g}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {d.champions_visible?.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={s.label}>Champions / bosses</span>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                            {d.champions_visible.map((c, i) => <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: D.purpleBg, color: D.purple, borderRadius: 20, border: `0.5px solid ${D.purpleBdr}` }}>{c}</span>)}
                          </div>
                        </div>
                      )}

                      {d.biome_visual_notes && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={s.label}>Biome visual notes</span>
                          <p style={{ margin: 0, fontSize: 12, color: D.textMuted, fontStyle: "italic" }}>{d.biome_visual_notes}</p>
                        </div>
                      )}

                      {d.creative_gaps_structured && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={s.label}>Creative gaps</span>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                            {[
                              { label: "Hook strength", value: d.creative_gaps_structured.hook_strength },
                              { label: "Mechanic clarity", value: d.creative_gaps_structured.mechanic_clarity },
                              { label: "Emotional payoff", value: d.creative_gaps_structured.emotional_payoff },
                            ].map(({ label, value }) => (
                              <div key={label} style={{ padding: "8px 10px", background: D.goldBg, borderRadius: 8, border: `0.5px solid ${D.goldBdr}` }}>
                                <div style={{ fontSize: 9, fontWeight: 600, color: D.gold, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
                                <p style={{ margin: 0, fontSize: 11, color: "#c9a227" }}>{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {d.strategic_notes && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={s.label}>Strategic notes</span>
                          <p style={{ margin: 0, fontSize: 12, color: D.blue, lineHeight: 1.5 }}>{d.strategic_notes}</p>
                        </div>
                      )}

                      {d.is_compound && d.segments && d.segments.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={s.label}>Segments ({d.segments.length})</span>
                          {d.segments.map((seg, si) => (
                            <div key={si} style={{ padding: "10px 12px", background: D.surface2, borderRadius: 8, border: `0.5px solid ${D.border}`, marginBottom: 6 }}>
                              <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4, color: D.text }}>Segment {si + 1}: {seg.biome} ({seg.start_seconds}s – {seg.end_seconds}s)</div>
                              <div style={{ fontSize: 11, color: D.textMuted }}>Hook: {seg.hook_type} at {seg.hook_timing_seconds}s · {seg.key_mechanic}</div>
                              {seg.unit_evolution_chain?.length > 0 && <div style={{ fontSize: 11, color: D.textDim, marginTop: 2 }}>Evolution: {seg.unit_evolution_chain.join(" → ")}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      {[
                        { label: "Key mechanic", value: d.key_mechanic },
                        { label: "Emotional arc", value: d.emotional_arc },
                        { label: "Why it works", value: d.why_it_works },
                        { label: "Why it fails", value: d.why_it_fails },
                        { label: "Frame extraction gaps", value: d.frame_extraction_gaps },
                        { label: "Replication instructions", value: d.replication_instructions },
                      ].filter(x => x.value).map(({ label, value }) => (
                        <div key={label} style={{ marginBottom: 10 }}>
                          <span style={s.label}>{label}</span>
                          <p style={{ margin: 0, fontSize: 12, color: D.textMuted, lineHeight: 1.6 }}>{value}</p>
                        </div>
                      ))}

                      {d.auto_frames && d.auto_frames.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <span style={s.label}>Auto-extracted frames</span>
                          <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                            {d.auto_frames.map((f, fi) => (
                              <div key={fi} style={{ fontSize: 11, padding: "5px 10px", background: D.surface2, borderRadius: 6 }}>
                                <span style={{ fontWeight: 500, color: D.blue, marginRight: 8 }}>{f.timestamp_seconds}s</span>
                                <span style={{ color: D.textMuted }}>{f.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <button style={{ ...s.btnSecondary, marginTop: 10, fontSize: 10 }} onClick={() => setExpandedDNA(expandedDNA === di ? null : di)}>
                    {expandedDNA === di ? "Collapse" : "Expand details"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ════════════════════════════════ BRIEF STUDIO TAB ══════════════════ */}
        {tab === "Brief Studio" && (
          <div>
            <div style={s.card}>
              {/* Brief textarea */}
              <span style={s.label}>Brief context</span>
              <div style={{ border: `0.5px solid ${D.border2}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                <textarea style={{ ...s.textarea, background: D.surface2, padding: "10px 12px" }} placeholder="Describe the ad. Levelly will match it to winning DNA patterns from the library…" value={briefCtx} onChange={e => setBriefCtx(e.target.value)} />
              </div>

              {/* Iterate from ref */}
              <div style={{ marginBottom: 14, padding: "12px 14px", background: D.surface2, borderRadius: 8, border: `0.5px solid ${D.border}` }}>
                <span style={{ ...s.label, marginBottom: 4 }}>Iterate from</span>
                <p style={{ margin: "0 0 8px", fontSize: 10, color: D.textDim }}>Optional. Levelly builds on this creative using MOC DNA as the primary guide.</p>
                <input
                  style={s.input}
                  placeholder="Library ID or creative name — e.g. CT43, CC21"
                  value={iterateFrom}
                  onChange={e => setIterateFrom(e.target.value)}
                />
                {iterateFrom.trim() && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: D.purpleBg, border: `0.5px solid ${D.purpleBdr}`, borderRadius: 6, padding: "4px 10px" }}>
                      <div style={{ width: 16, height: 16, borderRadius: 3, background: D.purpleBdr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff" }}>ref</div>
                      <span style={{ fontSize: 11, color: D.purple }}>{iterateFrom.trim()}</span>
                      <span style={{ fontSize: 10, color: D.textDim }}>· MOC DNA primary</span>
                      <button onClick={() => setIterateFrom("")} style={{ fontSize: 9, color: D.textDim, background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}>✕</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Segment + network row */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
                <div>
                  <span style={s.label}>Target segment</span>
                  <div style={{ display: "flex", gap: 5 }}>
                    {SEGMENTS_LIST.map(seg => (
                      <button key={seg} onClick={() => setSegment(seg)} style={s.chip(segment === seg)}>
                        {seg}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" as const }}>
                  <p style={{ margin: "0 0 6px", fontSize: 10, color: D.textDim }}>{lib.length} DNA entries · {winners} winners</p>
                  <button
                    style={{ ...s.btnPrimary, display: "flex", alignItems: "center", gap: 6, opacity: generating ? 0.6 : 1 }}
                    onClick={handleGenerateBrief}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", border: `1.5px solid ${D.border2}`, borderTopColor: "#fff", display: "inline-block", animation: "spin 0.6s linear infinite" }} />
                        Generating…
                      </>
                    ) : "Generate 3 concepts ↗"}
                  </button>
                </div>
              </div>
              {briefErr && <div style={s.error}>{briefErr}</div>}
            </div>

            {/* Strategy block */}
            {briefAnalysis && (
              <div style={{ ...s.card, background: D.surface2, borderColor: D.border2 }}>
                <span style={s.label}>Creative strategy</span>
                <p style={{ margin: "0 0 12px", fontSize: 12, lineHeight: 1.7, color: D.text }}>{briefAnalysis.strategy}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <span style={s.label}>DNA sources used</span>
                    <p style={{ margin: 0, fontSize: 11, color: D.textMuted }}>{briefAnalysis.dna_sources?.join(", ") || briefAnalysis.patterns_used}</p>
                  </div>
                  <div>
                    <span style={s.label}>Segment insight</span>
                    <p style={{ margin: 0, fontSize: 11, color: D.textMuted }}>{briefAnalysis.segment_insight}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Concept cards */}
            {concepts.map((c, ci) => (
              <div key={ci} style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }} onClick={() => setExpandedConcept(expandedConcept === ci ? null : ci)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" as const }}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{c.title}</span>
                      {c.is_data_backed && <span style={{ fontSize: 9, padding: "2px 7px", background: D.goldBg, color: D.gold, border: `0.5px solid ${D.goldBdr}`, borderRadius: 20, fontWeight: 600 }}>Data-backed</span>}
                      {(c as any).dna_source && <span style={{ fontSize: 9, padding: "2px 7px", background: D.greenBg, color: D.green, border: `0.5px solid ${D.greenBdr}`, borderRadius: 20 }}>based on {(c as any).dna_source}</span>}
                      {iterateFrom.trim() && <span style={{ fontSize: 9, padding: "2px 7px", background: D.purpleBg, color: D.purple, border: `0.5px solid ${D.purpleBdr}`, borderRadius: 20 }}>iterates from {iterateFrom.trim()}</span>}
                      <span style={s.badge("scalable")}>{c.target_segment}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: D.textMuted }}>{c.objective}</p>
                  </div>
                  {c.quality_score && (
                    <div style={{ textAlign: "right" as const, marginLeft: 16, flexShrink: 0 }}>
                      <div style={{ fontSize: 24, fontWeight: 500, color: scoreColor(c.quality_score.overall) }}>{c.quality_score.overall}</div>
                      <div style={{ fontSize: 9, color: D.textDim }}>quality</div>
                    </div>
                  )}
                </div>

                {expandedConcept === ci && (
                  <div style={{ marginTop: 16, borderTop: `0.5px solid ${D.border}`, paddingTop: 16 }}>

                    {/* Hook timing callout */}
                    {(c as any).hook_timing_seconds != null && (
                      <div style={{ marginBottom: 12, padding: "8px 12px", background: D.blueBg, borderRadius: 8, fontSize: 11, color: D.blue, border: `0.5px solid ${D.blueDark}` }}>
                        Hook at <strong>{(c as any).hook_timing_seconds}s</strong> — {c.performance_hooks?.[0]?.type || "Challenge"}
                      </div>
                    )}

                    {/* Unit evolution */}
                    {(c as any).unit_evolution_chain?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={s.label}>Unit evolution chain</span>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                          {(c as any).unit_evolution_chain.map((step: string, i: number) => (
                            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 11, padding: "2px 8px", background: D.blueBg, color: D.blue, borderRadius: 20, border: `0.5px solid ${D.blueDark}` }}>{step}</span>
                              {i < (c as any).unit_evolution_chain.length - 1 && <span style={{ color: D.textDim }}>→</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Visual identity */}
                    {c.visual_identity && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={s.label}>Visual identity</span>
                        <div style={s.gridAuto}>
                          {[
                            { l: "Environment", v: c.visual_identity.environment },
                            { l: "Lighting", v: c.visual_identity.lighting },
                            { l: "Cannon", v: c.visual_identity.cannon_type },
                            { l: "Player", v: `${c.visual_identity.player_champion} (${c.visual_identity.player_mob_color})` },
                            { l: "Enemy", v: `${c.visual_identity.enemy_champion} (${c.visual_identity.enemy_mob_color})` },
                            { l: "Gates", v: c.visual_identity.gate_values?.join(", ") },
                          ].map(({ l, v }) => (
                            <div key={l} style={s.metric}>
                              <div style={{ fontSize: 9, color: D.textDim, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 2 }}>{l}</div>
                              <div style={{ fontSize: 11, fontWeight: 500, color: D.text }}>{v ?? "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Network adaptations */}
                    {c.network_adaptations && Object.keys(c.network_adaptations).length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={{ ...s.label, marginBottom: 8 }}>Network adaptations</span>
                        <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                          {(["AppLovin", "Facebook", "Google", "TikTok"] as const).filter(net => c.network_adaptations?.[net]).map(net => {
                            const colors: Record<string, { bg: string; text: string; border: string }> = {
                              AppLovin: { bg: D.blueBg, text: D.blue, border: D.blueDark },
                              Facebook: { bg: D.surface2, text: D.textMuted, border: D.border2 },
                              Google:   { bg: D.greenBg, text: D.green, border: D.greenBdr },
                              TikTok:   { bg: D.purpleBg, text: D.purple, border: D.purpleBdr },
                            };
                            const nc = colors[net];
                            return (
                              <div key={net} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, lineHeight: 1.5 }}>
                                <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 500, flexShrink: 0, marginTop: 1, background: nc.bg, color: nc.text, border: `0.5px solid ${nc.border}` }}>{net}</span>
                                <span style={{ color: D.textMuted }}>{c.network_adaptations![net]}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Scene renders */}
                    <div style={{ marginBottom: 14 }}>
                      <span style={s.label}>Scene renders</span>
                      <div style={s.grid3}>
                        {(["start", "middle", "end"] as const).map(scene => {
                          const imgUrl = c[`visual_${scene}` as keyof Concept] as string | undefined;
                          const loading = renderingScene[`${ci}-${scene}`];
                          return (
                            <div key={scene} style={s.sceneWrap} onClick={() => !imgUrl && !loading && handleRenderScene(ci, scene)}>
                              {imgUrl
                                ? <img src={imgUrl} alt={scene} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : loading
                                  ? <p style={{ margin: 0, fontSize: 11, color: D.textMuted }}>Rendering…</p>
                                  : <div style={{ textAlign: "center", padding: 12 }}>
                                      <p style={{ margin: 0, fontSize: 10, fontWeight: 500, textTransform: "uppercase" as const, color: D.textDim }}>{scene}</p>
                                      <p style={{ margin: "4px 0 0", fontSize: 9, color: D.textDim }}>Click to render</p>
                                    </div>
                              }
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Production script */}
                    {c.production_script?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={s.label}>Production script</span>
                        <div style={{ border: `0.5px solid ${D.border}`, borderRadius: 8, overflow: "hidden" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", padding: "6px 12px", background: D.surface2, borderBottom: `0.5px solid ${D.border}` }}>
                            {["Time", "Action", "Visual", "Audio"].map(h => <span key={h} style={{ fontSize: 9, fontWeight: 600, color: D.textDim, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{h}</span>)}
                          </div>
                          {c.production_script.map((step, si) => (
                            <div key={si} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", padding: "8px 12px", borderBottom: si < c.production_script.length - 1 ? `0.5px solid ${D.border}` : "none", background: si % 2 === 0 ? D.surface : D.surface2 }}>
                              <span style={{ fontSize: 11, fontWeight: 500, color: D.blue }}>{step.time}</span>
                              <span style={{ fontSize: 11, paddingRight: 8, lineHeight: 1.4, color: D.text }}>{step.action}</span>
                              <span style={{ fontSize: 11, color: D.textMuted, paddingRight: 8, lineHeight: 1.4, fontStyle: "italic" }}>{step.visual_cue}</span>
                              <span style={{ fontSize: 11, color: D.textDim, lineHeight: 1.4 }}>{step.audio_cue}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Performance hooks */}
                    {c.performance_hooks?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={s.label}>Performance hooks</span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                          {c.performance_hooks.map((h, hi) => (
                            <div key={hi} style={{ ...s.card, margin: 0, padding: "10px 14px" }}>
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: hi === 0 ? D.goldBg : hi === 1 ? D.greenBg : D.blueBg, color: hi === 0 ? D.gold : hi === 1 ? D.green : D.blue, display: "inline-block", marginBottom: 6 }}>{h.type}</span>
                              <p style={{ margin: 0, fontSize: 12, fontStyle: "italic", color: D.textMuted }}>"{h.text}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quality score */}
                    {c.quality_score && (
                      <div>
                        <span style={s.label}>Quality score</span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 8, marginBottom: 8 }}>
                          {[
                            { l: "Pattern fidelity", v: c.quality_score.pattern_fidelity },
                            { l: "MOC DNA", v: c.quality_score.moc_dna },
                            { l: "Emotional arc", v: c.quality_score.emotional_arc },
                            { l: "Visual clarity", v: c.quality_score.visual_clarity },
                            { l: "Segment fit", v: c.quality_score.segment_fit },
                          ].map(({ l, v }) => (
                            <div key={l} style={s.metric}>
                              <div style={{ fontSize: 9, color: D.textDim, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 3 }}>{l}</div>
                              <div style={{ fontSize: 18, fontWeight: 500, color: scoreColor(v) }}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {c.quality_score.notes && <p style={{ margin: 0, fontSize: 11, color: D.textMuted, fontStyle: "italic" }}>{c.quality_score.notes}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        select option { background: ${D.surface}; color: ${D.text}; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${D.bg}; }
        ::-webkit-scrollbar-thumb { background: ${D.border2}; border-radius: 3px; }
      `}</style>
    </div>
  );
}
