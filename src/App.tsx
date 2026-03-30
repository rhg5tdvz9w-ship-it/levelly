import { useState, useRef, useCallback, useEffect } from "react";
import { buildReferenceContext, buildReferenceParts, MOC_REFERENCES } from "./refImages";

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmotionalBeat { timestamp_seconds: number; event: string; emotion: string; }

interface DNASegment {
  segment_index: number;
  biome: string;
  biome_visual_notes: string;
  start_seconds: number;
  end_seconds: number;
  hook_type: string;
  hook_timing_seconds: number;
  hook_description: string;
  gate_sequence: string[];
  swarm_peak_moment_seconds: number | null;
  loss_event_type: string;
  loss_event_timing_seconds: number | null;
  unit_evolution_chain: string[];
  champions_visible: string[];
  key_mechanic: string;
  emotional_beats: EmotionalBeat[];
  why_it_works: string;
  why_it_fails: string | null;
}

interface DNAEntry {
  id: number;
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor" | "compound";
  upload_context: string;
  file_name: string;
  added_at: string;
  reanalyzed?: boolean;
  performance_score?: number;
  iteration_of?: string;
  strategic_notes?: string;
  // Spend & performance data
  creative_id?: string;
  spend_tier?: string;
  spend_window_days?: number | null;
  spend_notes?: string;
  spend_networks?: string;
  spend_data_source?: string;
  // Single-ad fields
  title: string;
  hook_type: string;
  hook_timing_seconds: number | null;
  hook_description: string;
  gate_sequence: string[];
  swarm_peak_moment_seconds: number | null;
  loss_event_type: string;
  loss_event_timing_seconds: number | null;
  unit_evolution_chain: string[];
  emotional_arc: string;
  emotional_beats: EmotionalBeat[];
  biome: string;
  biome_visual_notes: string;
  champions_visible: string[];
  pacing: string;
  key_mechanic: string;
  why_it_works: string;
  why_it_fails: string | null;
  creative_gaps: string | null;
  creative_gaps_structured?: { hook_strength: string; mechanic_clarity: string; emotional_payoff: string; };
  frame_extraction_gaps: string | null;
  replication_instructions: string;
  auto_frames?: FrameExtraction[];
  manual_frames?: string[];
  // Compound-only fields
  is_compound?: boolean;
  segments?: DNASegment[];
  transition_type?: string;
}

interface FrameExtraction { timestamp_seconds: number; description: string; significance: string; }

interface UploadConfig {
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor" | "compound";
  context: string;
  manual_frames: File[];
  performance_score?: number;
  iteration_of?: string;
}

interface VisualIdentity { environment: string; lighting: string; player_champion: string; enemy_champion: string; player_mob_color: string; enemy_mob_color: string; gate_values: string[]; cannon_type: string; mood_notes: string; }
interface ScriptStep { time: string; action: string; visual_cue: string; audio_cue: string; }
interface PerformanceHook { type: string; text: string; }
interface QualityScore { pattern_fidelity: number; moc_dna: number; emotional_arc: number; visual_clarity: number; segment_fit: number; overall: number; notes: string; }
interface Concept { title: string; is_data_backed: boolean; objective: string; target_segment: string; player_motivation: string; visual_identity: VisualIdentity; layout: string; production_script: ScriptStep[]; performance_hooks: PerformanceHook[]; engagement_hooks: string; quality_score: QualityScore; visual_start?: string; visual_middle?: string; visual_end?: string; }
interface BriefAnalysis { patterns_used: string; segment_insight: string; strategy: string; }

const TIERS = ["winner", "scalable", "failed", "inspiration"] as const;
const TIER_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  winner: { bg: "#EAF3DE", text: "#3B6D11", border: "#97C459" },
  scalable: { bg: "#E6F1FB", text: "#185FA5", border: "#85B7EB" },
  failed: { bg: "#FCEBEB", text: "#A32D2D", border: "#F09595" },
  inspiration: { bg: "#FAEEDA", text: "#854F0B", border: "#FAC775" },
};
const SEGMENTS_LIST = ["Whale", "Dolphin", "Minnow", "Non-Payer"];
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const GEMINI_TEXT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`;

// ─── Gemini direct calls ──────────────────────────────────────────────────────
async function callGeminiDirect(systemPrompt: string, contentParts: any[]): Promise<any> {
  const r = await fetch(GEMINI_TEXT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: contentParts }],
      generationConfig: { response_mime_type: "application/json" }
    })
  });
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
  const r = await fetch(GEMINI_IMAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [...refParts, { text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } })
  });
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
  onStatus(`Uploading "${file.name}"…`);
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

// ─── Ref image helpers ────────────────────────────────────────────────────────
function pickRelevantRefs(vi: VisualIdentity): any[] {
  const biome = vi.environment?.toLowerCase() || "";
  const player = vi.player_champion?.toLowerCase() || "";
  const enemy = vi.enemy_champion?.toLowerCase() || "";
  const populated = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_"));
  if (populated.length === 0) return [];
  const scored = populated.map(ref => {
    const label = ref.label.toLowerCase(); let score = 0;
    if (label.includes(biome)) score += 3;
    if (player && label.includes(player)) score += 2;
    if (enemy && label.includes(enemy)) score += 2;
    if (ref.category === "gate") score += 1;
    return { ref, score };
  });
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

const frameExtractionSystem = () => `You are a precise video timestamp analyst. Watch the video and identify 8 key moments.

${TIMESTAMP_RULES}

Return ONLY valid JSON:
{
  "duration_seconds": number (total video length in real seconds),
  "frames": [
    { "timestamp_seconds": number, "description": string, "significance": "hook|gate|upgrade|swarm|boss|loss|win|fail|transition" }
  ]
}`;

const hookDetectionSystem = () => `You are an expert mobile ad analyst specializing in scroll-stopping hooks.

${HOOK_GUIDE}
${TIMESTAMP_RULES}

Given the video and frame extraction data, identify:
1. The EXACT second a viewer would stop scrolling (hook moment)
2. What makes it scroll-stopping (not just "action starts")

Return ONLY valid JSON:
{
  "hook_timing_seconds": number,
  "hook_type": "Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial",
  "hook_description": "precise description of WHY this moment stops scrolling — what is surprising/unexpected/compelling"
}`;

const analyzeSystem = (lib: DNAEntry[], config: UploadConfig, frames: FrameExtraction[], duration: number, hasManualFrames: boolean, hasRefs: boolean) => `You are a World-Class Creative Intelligence Analyst for Mob Control ads. NEVER guess — only report what you directly observe.

AD TYPE: ${config.ad_type === "compound" ? "COMPOUND/MIX CREATIVE (multiple gameplay segments)" : config.ad_type === "moc" ? "MOB CONTROL ORIGINAL" : "COMPETITOR / MARKET REFERENCE"}
PERFORMANCE TIER: ${config.tier.toUpperCase()}
${config.performance_score ? `PERFORMANCE SCORE (IPM or similar): ${config.performance_score}` : ""}
${config.iteration_of ? `ITERATION OF: ${config.iteration_of}` : ""}
ANALYST CONTEXT: ${config.context || "No additional context provided."}
VIDEO DURATION: ${duration} seconds

EXISTING LIBRARY (${lib.length} entries):
${lib.length > 0 ? JSON.stringify(lib.map(d => ({ title: d.title, tier: d.tier, hook_type: d.hook_type, hook_timing_seconds: d.hook_timing_seconds }))) : "Empty."}

${hasRefs ? buildReferenceContext() : ""}

AUTO-EXTRACTED FRAMES:
${frames.length > 0 ? frames.map(f => `[${f.timestamp_seconds}s] ${f.description} (${f.significance})`).join("\n") : "Not available."}

${hasManualFrames ? "MANUAL STORYBOARD FRAMES: provided above. Compare against auto-frames and flag gaps in frame_extraction_gaps." : ""}

${TIMESTAMP_RULES}
${HOOK_GUIDE}
${GATE_GUIDE}
${BIOME_GUIDE}
${CHAMPION_GUIDE}

UNIT EVOLUTION CHAIN: Track the player's unit type at every upgrade. Report as ordered array: ["simple cannon (0s)", "double cannon (8s)", "triple cannon (15s)", "tank (22s)"]

EMOTIONAL BEATS: Map the emotional arc to real timestamps: [{ "timestamp_seconds": 3, "event": "skeleton kicks cannon back", "emotion": "surprise" }]

${config.ad_type === "compound" ? `
COMPOUND AD INSTRUCTIONS:
This is a mix of multiple gameplay segments. First identify each segment:
- Segment start/end timestamps
- Biome of each segment  
- Whether there is a transition screen between segments
Then analyze EACH segment separately in the "segments" array.
Set is_compound: true and describe the transition_type.
` : ""}

Return ONLY valid JSON:
{
  "title": string,
  "is_compound": boolean,
  "transition_type": string | null,
  "segments": [] | null,
  "hook_type": "Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial",
  "hook_timing_seconds": number,
  "hook_description": string,
  "gate_sequence": [string],
  "swarm_peak_moment_seconds": number | null,
  "loss_event_type": "Wrong Gate|Boss Overwhelm|Timer|Death Gate|Enemy Overwhelm|None",
  "loss_event_timing_seconds": number | null,
  "unit_evolution_chain": [string],
  "emotional_arc": string,
  "emotional_beats": [{ "timestamp_seconds": number, "event": string, "emotion": string }],
  "biome": "Desert|Cyber-City|Forest|Volcanic|Snow|Toxic|Water|Bunker|Meadow|Unknown",
  "biome_visual_notes": string,
  "champions_visible": [string],
  "pacing": "Fast|Medium|Slow",
  "key_mechanic": string,
  "why_it_works": string,
  "why_it_fails": string | null,
  "creative_gaps": string,
  "creative_gaps_structured": { "hook_strength": string, "mechanic_clarity": string, "emotional_payoff": string },
  "frame_extraction_gaps": string,
  "strategic_notes": string,
  "replication_instructions": string
}`;

const reanalysisSystem = (entry: DNAEntry) => `You are re-analyzing a Mob Control ad based on existing DNA data. Fix systematic errors and enrich the analysis.

EXISTING DNA (needs correction):
${JSON.stringify(entry, null, 2)}

KNOWN SYSTEMATIC ERRORS TO FIX:
1. hook_timing_seconds is likely 0 or a fraction — use the context and frames to determine the REAL second
2. swarm_peak_moment_seconds and loss_event_timing_seconds may be fractions (0.28) — convert to real seconds using video duration
3. gate_sequence may be hallucinated — cross-check against analyst context
4. unit_evolution_chain is likely missing — extract from context and manual frame names
5. emotional_beats are missing — add timestamp-mapped beats from the frames and context
6. creative_gaps_structured is missing — add structured analysis
7. If ad_type is "compound", set is_compound: true and add segments if context describes multiple gameplays

${TIMESTAMP_RULES}
${HOOK_GUIDE}
${GATE_GUIDE}
${BIOME_GUIDE}
${CHAMPION_GUIDE}

Return the CORRECTED full DNA as valid JSON with all original fields plus new fields:
{
  "title": string (improve if generic),
  "hook_type": string,
  "hook_timing_seconds": number (REAL SECONDS — fix if 0 or fraction),
  "hook_description": string (explain WHY it stops scrolling),
  "gate_sequence": [string] (only gates actually in the ad),
  "swarm_peak_moment_seconds": number | null (real seconds),
  "loss_event_type": string,
  "loss_event_timing_seconds": number | null (real seconds),
  "unit_evolution_chain": [string],
  "emotional_arc": string,
  "emotional_beats": [{ "timestamp_seconds": number, "event": string, "emotion": string }],
  "biome": string,
  "biome_visual_notes": string,
  "champions_visible": [string],
  "pacing": string,
  "key_mechanic": string,
  "why_it_works": string,
  "why_it_fails": string | null,
  "creative_gaps": string,
  "creative_gaps_structured": { "hook_strength": string, "mechanic_clarity": string, "emotional_payoff": string },
  "strategic_notes": string,
  "replication_instructions": string,
  "is_compound": boolean,
  "transition_type": string | null,
  "segments": [] | null
}`;

const briefSystem = (lib: DNAEntry[], ctx: string, seg: string) => {
  const winners = lib.filter(d => d.tier === "winner");
  return `You are a World-Class Lead Creative Producer for Mob Control. Ground EVERY concept in specific patterns from the DNA library.

WINNER DNA LIBRARY (${winners.length} entries — use these as direct templates):
${JSON.stringify(winners.map(d => ({ title: d.title, hook_type: d.hook_type, hook_timing_seconds: d.hook_timing_seconds, gate_sequence: d.gate_sequence.slice(0, 5), unit_evolution_chain: d.unit_evolution_chain, key_mechanic: d.key_mechanic, biome: d.biome, loss_event_type: d.loss_event_type, replication_instructions: d.replication_instructions?.slice(0, 200) })), null, 2)}

BRIEF: ${ctx} | SEGMENT: ${seg}
SEGMENT DATA: Whale(>$50/mo,45-59yo,Motivation=Winning/Rankings), Dolphin($10-50/mo,Motivation=Winning+Fun), Minnow(<$10/mo,Motivation=Fun+Winning), Non-Payer(Motivation=Fun+Challenges).
MOC BIOMES: Desert, Foggy Forest, Water, Bunker, Cyber-City, Volcanic, Snow, Toxic, Meadow
MOC CHAMPIONS: Mobzilla, Nexus, Captain Kaboom, Explodon, Big Blob, Raccoon(blue=player/red=enemy), Caveman, General
9-STEP CURVE: Pressure→Investment→Validate→Investment2→Payoff→False Safety→Pressure++→Almost Win→Fail
3 PILLARS: Danger Lane(X gates), Investment Lane(+ gates), Upgrade Lane(power-ups).

INSTRUCTIONS:
- For each concept, cite which DNA library entry it is based on (use title)
- Replicate the exact gate sequences and unit evolution chains from winners
- Hook timing must NOT be 0 — pick the real second based on the mechanic
- Emotional beats must map to real timestamps

Return ONLY valid JSON:
{"analysis":{"patterns_used":string,"dna_sources":[string],"segment_insight":string,"strategy":string},"concepts":[{"title":string,"dna_source":string,"is_data_backed":boolean,"objective":string,"target_segment":string,"player_motivation":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"layout":string,"hook_timing_seconds":number,"unit_evolution_chain":[string],"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"performance_hooks":[{"type":string,"text":string}],"engagement_hooks":string,"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}]}`;
};

const imagePrompt = (concept: Concept, scene: "start" | "middle" | "end", visualSeed?: string) => {
  const vi = concept.visual_identity;
  const scenes = { start: "Opening: player cannon at bottom, small mob just fired, first gate ahead, enemy base at top with full health bar.", middle: "Mid-battle: massive mob swarm filling screen after multiplier gates. Screen-filling power fantasy moment.", end: "Dramatic fail: player mob nearly gone, enemy/boss still standing, cannon about to be overwhelmed." }[scene];
  return `Mob Control gameplay screenshot — match reference images above EXACTLY in art style and 3D quality.
${scenes}
ENV: ${vi.environment} | LIGHTING: ${vi.lighting} | PLAYER: ${vi.player_champion} | ENEMY: ${vi.enemy_champion}
PLAYER MOB: ${vi.player_mob_color} round blob creatures | ENEMY MOB: ${vi.enemy_mob_color} round blob creatures
GATES: ${vi.gate_values?.join(", ")} | CANNON: ${vi.cannon_type} | MOOD: ${vi.mood_notes}
${visualSeed ? `CONSISTENCY: ${visualSeed}` : ""}
${BIOME_GUIDE}
RULES: Cinematic top-down angle, cannon at bottom center, gates large and readable, NO text/UI/watermarks.`;
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = {
  app: { fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "1.5rem 1rem", color: "#111" } as React.CSSProperties,
  logo: { fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.5px" } as React.CSSProperties,
  sub: { fontSize: 13, color: "#666", margin: "2px 0 1.5rem" } as React.CSSProperties,
  tabs: { display: "flex", gap: 2, borderBottom: "1px solid #e5e5e5", marginBottom: "1.5rem" } as React.CSSProperties,
  tab: (a: boolean): React.CSSProperties => ({ padding: "8px 18px", fontSize: 13, fontWeight: a ? 600 : 400, color: a ? "#111" : "#888", background: "none", border: "none", borderBottom: a ? "2px solid #111" : "2px solid transparent", cursor: "pointer", marginBottom: -1 }),
  card: { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 10 } as React.CSSProperties,
  cardGray: { background: "#f8f8f8", border: "1px solid #e8e8e8", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 10 } as React.CSSProperties,
  label: { fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 5, display: "block" },
  textarea: { width: "100%", boxSizing: "border-box" as const, fontSize: 13, padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 8, minHeight: 80, resize: "vertical" as const, outline: "none", fontFamily: "inherit" },
  input: { width: "100%", boxSizing: "border-box" as const, fontSize: 13, padding: "7px 10px", border: "1px solid #e0e0e0", borderRadius: 8, outline: "none" },
  btnPrimary: { padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8, border: "none", background: "#1a56db", color: "#fff" } as React.CSSProperties,
  btnSecondary: { padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", color: "#444" } as React.CSSProperties,
  btnDanger: { padding: "5px 10px", fontSize: 11, cursor: "pointer", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626" } as React.CSSProperties,
  btnWarning: { padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 8, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e" } as React.CSSProperties,
  badge: (tier: string): React.CSSProperties => ({ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: TIER_STYLE[tier]?.bg ?? "#eee", color: TIER_STYLE[tier]?.text ?? "#333", border: `1px solid ${TIER_STYLE[tier]?.border ?? "#ccc"}` }),
  error: { fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", marginTop: 8 } as React.CSSProperties,
  info: { fontSize: 12, color: "#1a56db", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px", marginTop: 8 } as React.CSSProperties,
  metric: { background: "#f5f5f5", borderRadius: 8, padding: "8px 12px", textAlign: "center" as const },
  sceneWrap: { aspectRatio: "9/16", background: "#f0f0f0", borderRadius: 10, border: "1px solid #e8e8e8", overflow: "hidden", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", cursor: "pointer" } as React.CSSProperties,
  grid3: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 } as React.CSSProperties,
  gridAuto: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 } as React.CSSProperties,
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: 16, padding: "1.5rem", width: "90%", maxWidth: 540, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" as const } as React.CSSProperties,
};
const scoreColor = (n: number) => n >= 80 ? "#16a34a" : n >= 60 ? "#1a56db" : "#dc2626";

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onConfirm, onCancel }: { onConfirm: (cfg: UploadConfig) => void; onCancel: () => void }) {
  const [tier, setTier] = useState<UploadConfig["tier"]>("winner");
  const [adType, setAdType] = useState<UploadConfig["ad_type"]>("moc");
  const [context, setContext] = useState("");
  const [manualFrames, setManualFrames] = useState<File[]>([]);
  const [perfScore, setPerfScore] = useState("");
  const [iterOf, setIterOf] = useState("");
  const frameRef = useRef<HTMLInputElement>(null);
  const refCount = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_")).length;

  return (
    <div style={css.overlay} onClick={onCancel}>
      <div style={css.modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600 }}>Upload ads</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666" }}>Configure before choosing files.</p>

        <div style={{ marginBottom: 14 }}>
          <span style={css.label}>Ad type</span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["moc", "competitor", "compound"] as const).map(t => (
              <button key={t} onClick={() => setAdType(t)} style={{ flex: 1, padding: "7px 0", fontSize: 11, fontWeight: 600, borderRadius: 8, border: `2px solid ${adType === t ? "#1a56db" : "#e0e0e0"}`, background: adType === t ? "#eff6ff" : "#fff", color: adType === t ? "#1a56db" : "#666", cursor: "pointer" }}>
                {t === "moc" ? "MOC" : t === "competitor" ? "Competitor" : "Compound/Mix"}
              </button>
            ))}
          </div>
          {adType === "compound" && <p style={{ margin: "6px 0 0", fontSize: 11, color: "#854F0B" }}>Each gameplay segment will be analyzed separately.</p>}
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={css.label}>Performance tier</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {TIERS.map(t => (
              <button key={t} onClick={() => setTier(t)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `2px solid ${tier === t ? TIER_STYLE[t].border : "#e0e0e0"}`, background: tier === t ? TIER_STYLE[t].bg : "#fff", color: tier === t ? TIER_STYLE[t].text : "#888", cursor: "pointer" }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <span style={css.label}>Performance score (IPM)</span>
            <input style={css.input} type="number" placeholder="e.g. 8.5" value={perfScore} onChange={e => setPerfScore(e.target.value)} />
          </div>
          <div>
            <span style={css.label}>Iteration of</span>
            <input style={css.input} type="text" placeholder="e.g. CT43" value={iterOf} onChange={e => setIterOf(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <span style={css.label}>Context for Gemini</span>
          <textarea style={css.textarea} placeholder={adType === "compound" ? "Describe each segment: '1st - Water biome zigzag. 2nd - Bunker with tunnel. Segment 1: cannon breaks wall...'" : "Describe biome, hook, key mechanics, what to focus on..."} value={context} onChange={e => setContext(e.target.value)} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={css.label}>Manual storyboard frames (optional)</span>
          <input ref={frameRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => setManualFrames(Array.from(e.target.files ?? []))} />
          <button style={css.btnSecondary} onClick={() => frameRef.current?.click()}>
            {manualFrames.length > 0 ? `${manualFrames.length} frame(s) selected` : "+ Add frames"}
          </button>
        </div>

        <div style={{ marginBottom: 16, padding: "8px 12px", background: "#f8f8f8", borderRadius: 8, fontSize: 11, color: "#666" }}>
          {refCount > 0 ? `✓ ${refCount} MOC refs` : "⚠ No refs"} → Frame extraction → Hook detection → {manualFrames.length > 0 ? `✓ ${manualFrames.length} manual frames` : "No manual frames"} → DNA analysis
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={css.btnSecondary} onClick={onCancel}>Cancel</button>
          <button style={css.btnPrimary} onClick={() => onConfirm({ tier, ad_type: adType, context, manual_frames: manualFrames, performance_score: perfScore ? parseFloat(perfScore) : undefined, iteration_of: iterOf || undefined })}>
            Choose video →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<"Library" | "Brief Studio">("Library");

  // ── Library state — starts empty, loads from GitHub on mount ──────────────
  const [lib, setLib] = useState<DNAEntry[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Load from GitHub on startup, fall back to localStorage if GitHub fails
  useEffect(() => {
    fetch("/api/load-library")
      .then(res => {
        if (!res.ok) throw new Error(`Load failed: ${res.status}`);
        return res.json();
      })
      .then((data: DNAEntry[]) => {
        // If GitHub has data, use it; otherwise fall back to localStorage
        if (Array.isArray(data) && data.length > 0) {
          setLib(data);
        } else {
          // GitHub file is empty — try localStorage as fallback
          try {
            const local = localStorage.getItem("levelly_dna_library");
            if (local) setLib(JSON.parse(local));
          } catch {}
        }
        setLibraryLoaded(true);
      })
      .catch(() => {
        // GitHub load failed entirely — fall back to localStorage
        try {
          const local = localStorage.getItem("levelly_dna_library");
          if (local) setLib(JSON.parse(local));
        } catch {}
        setLibraryLoaded(true);
      });
  }, []);

  // Save to GitHub + localStorage whenever library changes (after initial load)
  const saveLib = useCallback((updated: DNAEntry[]) => {
    setLib(updated);

    // Always save to localStorage as immediate backup
    try { localStorage.setItem("levelly_dna_library", JSON.stringify(updated)); } catch {}

    // Save to GitHub (async, non-blocking)
    if (libraryLoaded) {
      setCloudStatus("saving");
      fetch("/api/save-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      })
        .then(res => {
          if (!res.ok) throw new Error(`Save failed: ${res.status}`);
          setCloudStatus("saved");
          setTimeout(() => setCloudStatus("idle"), 2000);
        })
        .catch(() => {
          setCloudStatus("error");
          setTimeout(() => setCloudStatus("idle"), 3000);
        });
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

  const [briefCtx, setBriefCtx] = useState("");
  const [segment, setSegment] = useState("Whale");
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

  // ── Re-analyze single entry ──────────────────────────────────────────────
  const reanalyzeSingle = async (entry: DNAEntry): Promise<DNAEntry> => {
    const corrected = await callGeminiDirect(
      reanalysisSystem(entry),
      [{ text: `Re-analyze this DNA entry and fix all systematic errors. Entry: ${entry.title}` }]
    );
    return { ...entry, ...corrected, id: entry.id, reanalyzed: true, added_at: entry.added_at, file_name: entry.file_name, tier: entry.tier, ad_type: entry.ad_type };
  };

  const handleReanalyzeSingle = async (entry: DNAEntry) => {
    setReanalyzingIds(prev => new Set(prev).add(entry.id));
    try {
      const updated = await reanalyzeSingle(entry);
      saveLib(lib.map(x => x.id === entry.id ? updated : x));
    } catch (err: any) {
      alert(`Re-analysis failed: ${err.message}`);
    } finally {
      setReanalyzingIds(prev => { const s = new Set(prev); s.delete(entry.id); return s; });
    }
  };

  const handleReanalyzeAll = async () => {
    if (!confirm(`Re-analyze all ${lib.length} entries? This will make ${lib.length} API calls.`)) return;
    setReanalyzingAll(true);
    let updated = [...lib];
    for (let i = 0; i < lib.length; i++) {
      setReanalysisProgress(`Re-analyzing ${i + 1}/${lib.length}: ${lib[i].title}…`);
      try {
        const corrected = await reanalyzeSingle(lib[i]);
        updated = updated.map(x => x.id === lib[i].id ? corrected : x);
        saveLib(updated);
      } catch (err) {
        console.warn(`Failed to re-analyze ${lib[i].title}:`, err);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    setReanalyzingAll(false); setReanalysisProgress("");
  };

  // ── Upload flow ──────────────────────────────────────────────────────────
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
        try {
          const frameResult = await callGeminiDirect(frameExtractionSystem(), [{ text: "Extract 8 key frames with real timestamps:" }, videoPart]);
          autoFrames = frameResult?.frames || [];
          duration = frameResult?.duration_seconds || 30;
        } catch (err) { console.warn("Frame extraction failed:", err); }

        setAnalyzeInfo(`Detecting hook moment…`);
        let hookData: any = {};
        try {
          hookData = await callGeminiDirect(hookDetectionSystem(), [
            { text: `Video frames: ${JSON.stringify(autoFrames)}. Context: ${cfg.context}. Find the real hook second:` },
            videoPart
          ]);
        } catch (err) { console.warn("Hook detection failed:", err); }

        const manualParts: any[] = [];
        if (cfg.manual_frames.length > 0) {
          setAnalyzeInfo(`Processing ${cfg.manual_frames.length} manual frames…`);
          for (const mf of cfg.manual_frames) {
            const b64 = await fileToBase64(mf);
            manualParts.push({ text: `Manual frame: ${mf.name}` });
            manualParts.push({ inlineData: { mimeType: mf.type, data: b64 } });
          }
        }

        setAnalyzeInfo(`Analyzing "${file.name}"…`);
        const refParts = buildReferenceParts();
        const analysisParts: any[] = [
          ...refParts,
          ...(manualParts.length > 0 ? [{ text: "### MANUAL FRAMES:" }, ...manualParts] : []),
          { text: `HOOK DATA FROM DEDICATED DETECTION: ${JSON.stringify(hookData)}` },
          { text: "### AD VIDEO TO ANALYZE:" },
          videoPart,
          { text: "Extract Creative DNA. Use the hook data above for hook_timing_seconds." }
        ];

        const dna = await callGeminiDirect(analyzeSystem(lib, cfg, autoFrames, duration, manualParts.length > 0, refParts.length > 0), analysisParts);

        saveLib([...lib, {
          ...dna,
          id: Date.now() + Math.random(),
          tier: cfg.tier, ad_type: cfg.ad_type, upload_context: cfg.context,
          file_name: file.name, added_at: new Date().toISOString(),
          performance_score: cfg.performance_score, iteration_of: cfg.iteration_of,
          auto_frames: autoFrames, manual_frames: cfg.manual_frames.map(f => f.name),
        }]);
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
      const result = await callGeminiDirect(briefSystem(lib, briefCtx, segment), [{ text: "Generate 3 MOC ad concepts grounded in the DNA library." }]);
      setConcepts(result.concepts ?? []); setBriefAnalysis(result.analysis ?? null); setExpandedConcept(0);
    } catch (err: any) { setBriefErr(err.message); }
    finally { setGenerating(false); }
  };

  const handleRenderScene = async (ci: number, scene: "start" | "middle" | "end") => {
    const k = `${ci}-${scene}`;
    setRenderingScene(p => ({ ...p, [k]: true }));
    try {
      const concept = concepts[ci];
      const refParts = pickRelevantRefs(concept.visual_identity);
      const visualSeed = scene !== "start" && concept.visual_start ? "Match the start scene's environment, lighting, road texture, and art style exactly." : undefined;
      const url = await callImageDirect(imagePrompt(concept, scene, visualSeed), refParts);
      setConcepts(p => p.map((c, i) => i === ci ? { ...c, [`visual_${scene}`]: url } : c));
    } catch (err: any) { alert(`Render failed: ${err.message}`); }
    finally { setRenderingScene(p => ({ ...p, [k]: false })); }
  };

  // Cloud status indicator label
  const cloudLabel: Record<typeof cloudStatus, string> = {
    idle: "", saving: "Saving…", saved: "Saved to GitHub ✓", error: "Cloud save failed — local backup kept",
  };
  const cloudColor: Record<typeof cloudStatus, string> = {
    idle: "", saving: "#1a56db", saved: "#16a34a", error: "#dc2626",
  };

  return (
    <div style={css.app}>
      {showModal && <UploadModal onConfirm={handleModalConfirm} onCancel={() => setShowModal(false)} />}
      <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{ display: "none" }} onChange={handleUpload} />
      <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importLibrary} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={css.logo}>Levelly</h1>
          <p style={css.sub}>MOC Creative Intelligence Platform</p>
        </div>
        {cloudStatus !== "idle" && (
          <span style={{ fontSize: 11, color: cloudColor[cloudStatus], marginTop: 6 }}>
            {cloudLabel[cloudStatus]}
          </span>
        )}
      </div>

      <div style={css.tabs}>
        {(["Library", "Brief Studio"] as const).map(t => (
          <button key={t} style={css.tab(tab === t)} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Library" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap" as const, gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#666" }}>{lib.length} ads · {lib.filter(d => d.tier === "winner").length} winners · {lib.filter(d => d.reanalyzed).length} re-analyzed</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
              {lib.length > 0 && (
                <>
                  <button style={css.btnWarning} onClick={handleReanalyzeAll} disabled={reanalyzingAll || analyzing}>
                    {reanalyzingAll ? "Re-analyzing…" : "Re-analyze all"}
                  </button>
                  <button style={css.btnSecondary} onClick={exportLibrary}>Export</button>
                  <button style={css.btnSecondary} onClick={() => { if (confirm("Clear library?")) saveLib([]); }}>Clear</button>
                </>
              )}
              <button style={css.btnSecondary} onClick={() => importRef.current?.click()}>Import</button>
              <button style={css.btnPrimary} onClick={() => setShowModal(true)} disabled={analyzing || reanalyzingAll}>{analyzing ? "Analyzing…" : "+ Upload"}</button>
            </div>
          </div>

          {(analyzeErr || reanalysisProgress) && (
            <div style={reanalysisProgress ? css.info : css.error}>{analyzeErr || reanalysisProgress}</div>
          )}
          {analyzeInfo && <div style={css.info}>{analyzeInfo}</div>}
          {!libraryLoaded && <div style={css.info}>Loading library from GitHub…</div>}
          {analyzing && !analyzeInfo && <div style={{ ...css.cardGray, textAlign: "center", padding: "2rem" }}><p style={{ margin: 0, fontSize: 13, color: "#666" }}>Extracting creative DNA…</p></div>}

          {lib.length === 0 && !analyzing && libraryLoaded && (
            <div style={{ ...css.card, textAlign: "center", padding: "3rem", border: "1px dashed #ddd" }}>
              <p style={{ margin: 0, fontSize: 14, color: "#888" }}>Upload MOC ads, competitor ads, or compound mixes to build your Creative DNA library.</p>
            </div>
          )}

          {lib.map((d, di) => (
            <div key={d.id} style={css.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedDNA(expandedDNA === di ? null : di)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</span>
                    <span style={css.badge(d.tier)}>{d.tier}</span>
                    {d.ad_type !== "moc" && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: "#faf5ff", color: "#7c3aed", border: "1px solid #ddd6fe" }}>{d.ad_type}</span>}
                    {d.is_compound && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#fef9c3", color: "#854d0e", border: "1px solid #fde047" }}>compound</span>}
                    {d.reanalyzed && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>re-analyzed</span>}
                    {d.performance_score && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}>IPM {d.performance_score}</span>}
                    {d.iteration_of && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#f8f8f8", color: "#666", border: "1px solid #e0e0e0" }}>iter. of {d.iteration_of}</span>}
                    {d.spend_tier && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" }}>{d.spend_tier === "sub100K" ? "<$100K" : `>${d.spend_tier}`}</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>{d.file_name} · {new Date(d.added_at).toLocaleDateString()}</p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 10 }}>
                  <button style={{ ...css.btnSecondary, fontSize: 11, padding: "4px 10px" }} onClick={() => handleReanalyzeSingle(d)} disabled={reanalyzingIds.has(d.id)}>
                    {reanalyzingIds.has(d.id) ? "…" : "Re-analyze"}
                  </button>
                  <select value={d.tier} onChange={e => saveLib(lib.map(x => x.id === d.id ? { ...x, tier: e.target.value as DNAEntry["tier"] } : x))} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid #e0e0e0" }}>
                    {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button style={css.btnDanger} onClick={() => saveLib(lib.filter(x => x.id !== d.id))}>✕</button>
                </div>
              </div>

              <div style={{ ...css.gridAuto, marginTop: 10 }}>
                {[
                  { label: "Hook type", value: d.hook_type },
                  { label: "Hook at", value: d.hook_timing_seconds != null ? `${d.hook_timing_seconds}s` : "—" },
                  { label: "Biome", value: d.biome },
                  { label: "Pacing", value: d.pacing },
                  { label: "Loss event", value: d.loss_event_type },
                  { label: "Swarm peak", value: d.swarm_peak_moment_seconds != null ? `${d.swarm_peak_moment_seconds}s` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={css.metric}>
                    <div style={{ fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{value ?? "—"}</div>
                  </div>
                ))}
              </div>

              {expandedDNA === di && (
                <div style={{ marginTop: 14, borderTop: "1px solid #f0f0f0", paddingTop: 14 }}>

                  {d.unit_evolution_chain?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Unit evolution chain</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                        {d.unit_evolution_chain.map((step, i) => (
                          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 11, padding: "2px 8px", background: "#eff6ff", color: "#1e40af", borderRadius: 6, border: "1px solid #bfdbfe" }}>{step}</span>
                            {i < d.unit_evolution_chain.length - 1 && <span style={{ color: "#aaa", fontSize: 12 }}>→</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {d.emotional_beats?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Emotional beats</span>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                        {d.emotional_beats.map((b, i) => (
                          <div key={i} style={{ fontSize: 12, padding: "5px 10px", background: "#f8f8f8", borderRadius: 6, display: "flex", gap: 10 }}>
                            <span style={{ fontWeight: 600, color: "#1a56db", minWidth: 32 }}>{b.timestamp_seconds}s</span>
                            <span style={{ color: "#444" }}>{b.event}</span>
                            <span style={{ color: "#aaa", fontStyle: "italic", marginLeft: "auto" }}>{b.emotion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {d.gate_sequence?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Gate sequence</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                        {d.gate_sequence.map((g, i) => (
                          <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: g.toLowerCase().includes("death") ? "#fef2f2" : "#eff6ff", color: g.toLowerCase().includes("death") ? "#dc2626" : "#1e40af", borderRadius: 6, border: `1px solid ${g.toLowerCase().includes("death") ? "#fca5a5" : "#bfdbfe"}` }}>{g}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {d.champions_visible?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Champions / bosses</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                        {d.champions_visible.map((c, i) => <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: "#faf5ff", color: "#7c3aed", borderRadius: 6, border: "1px solid #ddd6fe" }}>{c}</span>)}
                      </div>
                    </div>
                  )}

                  {d.biome_visual_notes && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Biome visual notes</span>
                      <p style={{ margin: 0, fontSize: 12, color: "#666", fontStyle: "italic" }}>{d.biome_visual_notes}</p>
                    </div>
                  )}

                  {(d.spend_tier || d.spend_networks || d.spend_notes) && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Spend data</span>
                      <div style={{ padding: "8px 12px", background: "#fef9c3", borderRadius: 8, border: "1px solid #fde047", fontSize: 12 }}>
                        {d.spend_tier && <div><strong>Tier:</strong> {d.spend_tier === "sub100K" ? "<$100K" : `>${d.spend_tier}`}{d.spend_window_days ? ` in ${d.spend_window_days}d` : ""}</div>}
                        {d.spend_networks && <div><strong>Networks:</strong> {d.spend_networks}</div>}
                        {d.spend_notes && <div style={{ color: "#78350f", marginTop: 4 }}>{d.spend_notes}</div>}
                        {d.spend_data_source && <div style={{ color: "#aaa", fontSize: 11, marginTop: 2 }}>⚠ Data source: {d.spend_data_source}</div>}
                      </div>
                    </div>
                  )}

                  {d.creative_gaps_structured && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Creative gaps</span>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        {[
                          { label: "Hook strength", value: d.creative_gaps_structured.hook_strength },
                          { label: "Mechanic clarity", value: d.creative_gaps_structured.mechanic_clarity },
                          { label: "Emotional payoff", value: d.creative_gaps_structured.emotional_payoff },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ padding: "8px 10px", background: "#fef9c3", borderRadius: 8, border: "1px solid #fde047" }}>
                            <div style={{ fontSize: 9, fontWeight: 600, color: "#854d0e", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 3 }}>{label}</div>
                            <p style={{ margin: 0, fontSize: 11, color: "#78350f" }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {d.strategic_notes && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Strategic notes</span>
                      <p style={{ margin: 0, fontSize: 13, color: "#185FA5", lineHeight: 1.5 }}>{d.strategic_notes}</p>
                    </div>
                  )}

                  {d.is_compound && d.segments && d.segments.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Segments ({d.segments.length})</span>
                      {d.segments.map((seg, si) => (
                        <div key={si} style={{ padding: "10px 12px", background: "#f8f8f8", borderRadius: 8, border: "1px solid #f0f0f0", marginBottom: 6 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>Segment {si + 1}: {seg.biome} ({seg.start_seconds}s – {seg.end_seconds}s)</div>
                          <div style={{ fontSize: 11, color: "#666" }}>Hook: {seg.hook_type} at {seg.hook_timing_seconds}s · {seg.key_mechanic}</div>
                          {seg.unit_evolution_chain?.length > 0 && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Evolution: {seg.unit_evolution_chain.join(" → ")}</div>}
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
                      <span style={css.label}>{label}</span>
                      <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.5 }}>{value}</p>
                    </div>
                  ))}

                  {d.auto_frames && d.auto_frames.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Auto-extracted frames</span>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                        {d.auto_frames.map((f, fi) => (
                          <div key={fi} style={{ fontSize: 11, padding: "5px 10px", background: "#f8f8f8", borderRadius: 6 }}>
                            <span style={{ fontWeight: 600, color: "#1a56db", marginRight: 8 }}>{f.timestamp_seconds}s</span>
                            <span style={{ color: "#444" }}>{f.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button style={{ ...css.btnSecondary, marginTop: 10, fontSize: 11 }} onClick={() => setExpandedDNA(expandedDNA === di ? null : di)}>
                {expandedDNA === di ? "Collapse" : "Expand details"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "Brief Studio" && (
        <div>
          <div style={css.card}>
            <span style={css.label}>Brief context</span>
            <textarea style={css.textarea} placeholder="Describe the ad. Levelly will match it to winning DNA patterns from the library..." value={briefCtx} onChange={e => setBriefCtx(e.target.value)} />
            <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
              <div>
                <span style={css.label}>Target segment</span>
                <select value={segment} onChange={e => setSegment(e.target.value)} style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid #e0e0e0" }}>
                  {SEGMENTS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" as const }}>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: "#999" }}>{lib.length} DNA entries · {lib.filter(d => d.tier === "winner").length} winners</p>
                <button style={css.btnPrimary} onClick={handleGenerateBrief} disabled={generating}>{generating ? "Generating…" : "Generate 3 concepts"}</button>
              </div>
            </div>
            {briefErr && <div style={css.error}>{briefErr}</div>}
          </div>

          {briefAnalysis && (
            <div style={css.cardGray}>
              <span style={css.label}>Creative strategy</span>
              <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.6 }}>{briefAnalysis.strategy}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><span style={css.label}>DNA sources used</span><p style={{ margin: 0, fontSize: 12, color: "#666" }}>{(briefAnalysis as any).dna_sources?.join(", ") || briefAnalysis.patterns_used}</p></div>
                <div><span style={css.label}>Segment insight</span><p style={{ margin: 0, fontSize: 12, color: "#666" }}>{briefAnalysis.segment_insight}</p></div>
              </div>
            </div>
          )}

          {concepts.map((c, ci) => (
            <div key={ci} style={css.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }} onClick={() => setExpandedConcept(expandedConcept === ci ? null : ci)}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{c.title}</span>
                    {c.is_data_backed && <span style={{ fontSize: 10, padding: "2px 7px", background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", borderRadius: 6, fontWeight: 600 }}>Data-backed</span>}
                    {(c as any).dna_source && <span style={{ fontSize: 10, padding: "2px 7px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 6 }}>based on {(c as any).dna_source}</span>}
                    <span style={css.badge("scalable")}>{c.target_segment}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "#666" }}>{c.objective}</p>
                </div>
                {c.quality_score && (
                  <div style={{ textAlign: "right" as const, marginLeft: 16, flexShrink: 0 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: scoreColor(c.quality_score.overall) }}>{c.quality_score.overall}</div>
                    <div style={{ fontSize: 10, color: "#aaa" }}>quality</div>
                  </div>
                )}
              </div>

              {expandedConcept === ci && (
                <div style={{ marginTop: 16, borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
                  {(c as any).hook_timing_seconds != null && (
                    <div style={{ marginBottom: 12, padding: "8px 12px", background: "#eff6ff", borderRadius: 8, fontSize: 12, color: "#1a56db" }}>
                      Hook at <strong>{(c as any).hook_timing_seconds}s</strong> — {c.performance_hooks?.[0]?.type || "Challenge"}
                    </div>
                  )}

                  {(c as any).unit_evolution_chain?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={css.label}>Unit evolution chain</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                        {(c as any).unit_evolution_chain.map((step: string, i: number) => (
                          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 11, padding: "2px 8px", background: "#eff6ff", color: "#1e40af", borderRadius: 6, border: "1px solid #bfdbfe" }}>{step}</span>
                            {i < (c as any).unit_evolution_chain.length - 1 && <span style={{ color: "#aaa" }}>→</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.visual_identity && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={css.label}>Visual identity</span>
                      <div style={css.gridAuto}>
                        {[
                          { l: "Environment", v: c.visual_identity.environment },
                          { l: "Lighting", v: c.visual_identity.lighting },
                          { l: "Cannon", v: c.visual_identity.cannon_type },
                          { l: "Player", v: `${c.visual_identity.player_champion} (${c.visual_identity.player_mob_color})` },
                          { l: "Enemy", v: `${c.visual_identity.enemy_champion} (${c.visual_identity.enemy_mob_color})` },
                          { l: "Gates", v: c.visual_identity.gate_values?.join(", ") },
                        ].map(({ l, v }) => (
                          <div key={l} style={css.metric}>
                            <div style={{ fontSize: 9, color: "#999", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>{l}</div>
                            <div style={{ fontSize: 11, fontWeight: 600 }}>{v ?? "—"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 14 }}>
                    <span style={css.label}>Scene renders</span>
                    <div style={css.grid3}>
                      {(["start", "middle", "end"] as const).map(scene => {
                        const imgUrl = c[`visual_${scene}` as keyof Concept] as string | undefined;
                        const loading = renderingScene[`${ci}-${scene}`];
                        return (
                          <div key={scene} style={css.sceneWrap} onClick={() => !imgUrl && !loading && handleRenderScene(ci, scene)}>
                            {imgUrl ? <img src={imgUrl} alt={scene} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : loading ? <p style={{ margin: 0, fontSize: 11, color: "#888" }}>Rendering…</p>
                              : <div style={{ textAlign: "center", padding: 12 }}><p style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "#aaa" }}>{scene}</p><p style={{ margin: "4px 0 0", fontSize: 10, color: "#bbb" }}>Click to render</p></div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {c.production_script?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={css.label}>Production script</span>
                      <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", padding: "6px 12px", background: "#f8f8f8", borderBottom: "1px solid #f0f0f0" }}>
                          {["Time", "Action", "Visual", "Audio"].map(h => <span key={h} style={{ fontSize: 9, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</span>)}
                        </div>
                        {c.production_script.map((step, si) => (
                          <div key={si} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", padding: "8px 12px", borderBottom: si < c.production_script.length - 1 ? "1px solid #f8f8f8" : "none", background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#1a56db" }}>{step.time}</span>
                            <span style={{ fontSize: 12, paddingRight: 8, lineHeight: 1.4 }}>{step.action}</span>
                            <span style={{ fontSize: 12, color: "#666", paddingRight: 8, lineHeight: 1.4, fontStyle: "italic" }}>{step.visual_cue}</span>
                            <span style={{ fontSize: 12, color: "#888", lineHeight: 1.4 }}>{step.audio_cue}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.performance_hooks?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={css.label}>Performance hooks</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                        {c.performance_hooks.map((h, hi) => (
                          <div key={hi} style={{ ...css.card, margin: 0, padding: "10px 14px" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: hi === 0 ? "#fef3c7" : hi === 1 ? "#dcfce7" : "#eff6ff", color: hi === 0 ? "#92400e" : hi === 1 ? "#166534" : "#1e40af", display: "inline-block", marginBottom: 6 }}>{h.type}</span>
                            <p style={{ margin: 0, fontSize: 12, fontStyle: "italic", color: "#666" }}>"{h.text}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {c.quality_score && (
                    <div>
                      <span style={css.label}>Quality score</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 8, marginBottom: 8 }}>
                        {[
                          { l: "Pattern fidelity", v: c.quality_score.pattern_fidelity },
                          { l: "MOC DNA", v: c.quality_score.moc_dna },
                          { l: "Emotional arc", v: c.quality_score.emotional_arc },
                          { l: "Visual clarity", v: c.quality_score.visual_clarity },
                          { l: "Segment fit", v: c.quality_score.segment_fit },
                        ].map(({ l, v }) => (
                          <div key={l} style={css.metric}>
                            <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{l}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor(v) }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {c.quality_score.notes && <p style={{ margin: 0, fontSize: 12, color: "#888", fontStyle: "italic" }}>{c.quality_score.notes}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
