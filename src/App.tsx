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
  parent_id?: string; creative_id?: string;
  creative_status?: "briefed" | "produced" | "running" | "scaling" | "fatigued";
  spend_tier?: string; spend_window_days?: number | null;
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
interface FrameExtraction { timestamp_seconds: number; description: string; significance: string; image_data?: string; }
interface UploadConfig {
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor" | "compound";
  context: string; manual_frames: File[];
  creative_id?: string; parent_id?: string;
}
interface VisualIdentity { environment: string; lighting: string; player_champion: string; enemy_champion: string; player_mob_color: string; enemy_mob_color: string; gate_values: string[]; cannon_type: string; mood_notes: string; }
interface ScriptStep { time: string; action: string; visual_cue: string; audio_cue: string; }
interface PerformanceHook { type: string; text: string; }
interface QualityScore { pattern_fidelity: number; moc_dna: number; emotional_arc: number; visual_clarity: number; segment_fit: number; overall: number; notes: string; }
interface NetworkAdaptations { AppLovin?: string; Facebook?: string; Google?: string; TikTok?: string; }
interface Concept {
  title: string; is_data_backed: boolean; is_experimental?: boolean; experimental_note?: string;
  objective: string; target_segment: string; player_motivation: string;
  visual_identity: VisualIdentity; layout: string;
  production_script: ScriptStep[]; performance_hooks: PerformanceHook[];
  engagement_hooks: string; quality_score: QualityScore;
  network_adaptations?: NetworkAdaptations;
  visual_hook?: string; visual_start?: string; visual_middle?: string; visual_end?: string;
}
interface BriefAnalysis { patterns_used: string; segment_insight: string; strategy: string; dna_sources?: string[]; }

// ─── Constants ────────────────────────────────────────────────────────────────
const TIERS = ["winner", "scalable", "failed", "inspiration"] as const;
const PROVEN_BIOMES = ["Desert", "Foggy Forest", "Water", "Bunker", "Meadow"];
const SEGMENTS_LIST = ["Whale", "Dolphin", "Minnow", "Non-Payer"];
const NETWORK_OPTIONS = ["AppLovin", "Facebook", "TikTok", "Google", "Voodoo Ads", "Unity"];
const CREATIVE_STATUS = [
  { value: "briefed",  label: "Briefed",  bg: "#1a2a4a", text: "#58a6ff", border: "#1f6feb" },
  { value: "produced", label: "Produced", bg: "#1e1a2e", text: "#d2a8ff", border: "#8957e5" },
  { value: "running",  label: "Running",  bg: "#2a1a0a", text: "#f0c53a", border: "#9e6a03" },
  { value: "scaling",  label: "Scaling",  bg: "#1a2a1a", text: "#3fb950", border: "#238636" },
  { value: "fatigued", label: "Fatigued", bg: "#2a1010", text: "#f85149", border: "#6e2020" },
] as const;
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
const SPEND_RANK: Record<string, number> = { "1M": 5, "500K": 4, "300K": 3, "100K": 2, "sub100K": 1 };
type SortMode = "all" | "winner" | "scalable" | "inspiration" | "failed";

// Analysis steps for homepage progress indicator (#7)
const ANALYSIS_STEPS = [
  { key: "uploading",  label: "Uploading video" },
  { key: "frames",     label: "Identifying key moments" },
  { key: "extracting", label: "Extracting frames" },
  { key: "hook",       label: "Detecting hook" },
  { key: "analyzing",  label: "Analysing DNA" },
  { key: "saving",     label: "Saving to library" },
];

const TIER_ACCENT: Record<string, string> = {
  winner: "#3fb950", scalable: "#58a6ff", inspiration: "#f0c53a", failed: "#f85149",
};

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const GEMINI_TEXT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`;

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  bg: "#0d1117", surface: "#161b22", surface2: "#1c2128",
  border: "#21262d", border2: "#30363d",
  text: "#e6edf3", textMuted: "#8b949e", textDim: "#484f58",
  blue: "#58a6ff", blueDark: "#1f6feb", blueBg: "#1a2a4a",
  green: "#3fb950", greenBg: "#1a2a1a", greenBdr: "#238636",
  gold: "#f0c53a", goldBg: "#2a1a0a", goldBdr: "#9e6a03",
  purple: "#d2a8ff", purpleBg: "#1e1a2e", purpleBdr: "#8957e5",
  red: "#f85149", redBg: "#2a1010",
};
const TIER_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  winner:      { bg: D.greenBg, text: D.green,  border: D.greenBdr },
  scalable:    { bg: D.blueBg,  text: D.blue,   border: D.blueDark },
  failed:      { bg: D.redBg,   text: D.red,    border: "#6e2020" },
  inspiration: { bg: D.goldBg,  text: D.gold,   border: D.goldBdr },
};
const scoreColor = (n: number) => n >= 80 ? D.green : n >= 60 ? D.blue : D.red;

// ─── Style helpers ────────────────────────────────────────────────────────────
const pill = (bg: string, text: string, border: string): React.CSSProperties => ({
  fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
  background: bg, color: text, border: `0.5px solid ${border}`, whiteSpace: "nowrap" as const,
});
const btnSec: React.CSSProperties = { padding: "6px 12px", fontSize: 11, background: "transparent", border: `0.5px solid ${D.border2}`, borderRadius: 7, color: D.textMuted, cursor: "pointer", fontFamily: "inherit" };
const btnPri: React.CSSProperties = { padding: "7px 14px", fontSize: 11, background: D.blueDark, border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 };
const btnDanger: React.CSSProperties = { padding: "5px 12px", fontSize: 11, background: "transparent", border: `0.5px solid #6e2020`, borderRadius: 7, color: D.red, cursor: "pointer", fontFamily: "inherit" };
const metricStyle: React.CSSProperties = { background: D.surface2, borderRadius: 7, padding: "8px 10px", textAlign: "center" };
const metricLabel: React.CSSProperties = { fontSize: 9, color: D.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 };
const labelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 600, color: D.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "block" };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", fontSize: 12, padding: "7px 10px", background: D.bg, border: `0.5px solid ${D.border2}`, borderRadius: 7, outline: "none", color: D.text, fontFamily: "inherit" };
const chipStyle = (active: boolean, color: "blue"|"green" = "blue"): React.CSSProperties => ({
  padding: "4px 10px", borderRadius: 20, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
  border: `0.5px solid ${active ? (color === "green" ? D.greenBdr : D.blueDark) : D.border2}`,
  background: active ? (color === "green" ? D.greenBg : D.blueBg) : "transparent",
  color: active ? (color === "green" ? D.green : D.blue) : D.textMuted,
});

function velocityPerDay(tier: string, days: number | null | undefined): string | null {
  if (!tier || !days || tier === "sub100K") return null;
  const amounts: Record<string, number> = { "100K": 100000, "300K": 300000, "500K": 500000, "1M": 1000000 };
  const v = amounts[tier]; if (!v) return null;
  return `~$${Math.round(v / days).toLocaleString()}/day`;
}

// ─── API calls ────────────────────────────────────────────────────────────────
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
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  const jsonStr = cleaned.slice(start, end + 1);
  try { return JSON.parse(jsonStr); }
  catch {
    const sanitized = jsonStr.replace(/[\u0000-\u001F\u007F]/g, (c) => {
      if (c === "\n") return "\\n"; if (c === "\r") return "\\r"; if (c === "\t") return "\\t"; return "";
    });
    return JSON.parse(sanitized);
  }
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

// ─── Canvas frame extraction ──────────────────────────────────────────────────
// Extracts frames from a video file at given timestamps using HTML5 canvas.
// Returns inlineData parts ready to pass to Gemini. Fully non-blocking —
// if anything fails the returned array is empty and analysis runs as before.
async function extractFramesFromVideo(
  file: File,
  timestamps: number[],
  duration: number
): Promise<any[]> {
  if (!timestamps.length) return [];
  return new Promise(resolve => {
    const parts: any[] = [];
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.crossOrigin = "anonymous";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Cap render size to keep payload small (~20KB/frame at JPEG 80%)
    const MAX_W = 480;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.src = "";
      video.load();
    };

    const safeTimestamps = timestamps
      .map(t => Math.min(Math.max(t, 0), Math.max(duration - 0.1, 0)))
      .filter((t, i, arr) => arr.indexOf(t) === i) // dedupe
      .slice(0, 14); // hard cap — matches frameExtractionSystem max

    let idx = 0;

    const seekNext = () => {
      if (idx >= safeTimestamps.length || !ctx) {
        cleanup();
        resolve(parts);
        return;
      }
      video.currentTime = safeTimestamps[idx];
    };

    video.addEventListener("seeked", () => {
      try {
        const scale = Math.min(1, MAX_W / (video.videoWidth || MAX_W));
        canvas.width = Math.round((video.videoWidth || MAX_W) * scale);
        canvas.height = Math.round((video.videoHeight || 854) * scale);
        ctx!.drawImage(video, 0, 0, canvas.width, canvas.height);
        const jpeg = canvas.toDataURL("image/jpeg", 0.80).split(",")[1];
        if (jpeg) {
          parts.push({ text: `[FRAME at ${safeTimestamps[idx]}s]` });
          parts.push({ inlineData: { mimeType: "image/jpeg", data: jpeg } });
        }
      } catch {
        // drawImage failed — skip this frame silently
      }
      idx++;
      seekNext();
    });

    video.addEventListener("error", () => { cleanup(); resolve(parts); });

    // Timeout safety — if video never loads, resolve with empty
    const timeout = setTimeout(() => { cleanup(); resolve(parts); }, 15000);
    video.addEventListener("loadedmetadata", () => {
      clearTimeout(timeout);
      seekNext();
    });

    video.src = url;
    video.load();
  });
}

// ─── Ref image helpers ────────────────────────────────────────────────────────
function pickRelevantRefs(vi: VisualIdentity): any[] {
  const biome = vi.environment?.toLowerCase() || "";
  const player = vi.player_champion?.toLowerCase() || "";
  const enemy = vi.enemy_champion?.toLowerCase() || "";
  const populated = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_"));
  if (populated.length === 0) return [];
  const scored = populated.map(ref => {
    const lbl = ref.label.toLowerCase(); let score = 0;
    if (lbl.includes(biome)) score += 3;
    if (player && lbl.includes(player)) score += 2;
    if (enemy && lbl.includes(enemy)) score += 2;
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
  const parts: any[] = [{ text: "### MOC VISUAL REFERENCES — match this exact art style and game aesthetic:" }];
  selected.forEach(ref => {
    parts.push({ text: `[${ref.category.toUpperCase()}]: ${ref.label.split(".")[0]}` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: ref.base64 } });
  });
  return parts;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
const BIOME_GUIDE = `BIOMES: Foggy Forest(grey/white atmospheric fog,dark pines,grey road—NOT snow), Desert(tan sand,blue sky), Water(grey bridge over blue water), Bunker(grey concrete tunnel,pipes,industrial), Cyber-City(grey metal,orange/blue neon), Volcanic(red/orange lava,black rocks), Snow(white snow ground), Toxic(purple paths,green slime), Meadow(green hills,grey brick bridge)`;
const CHAMPION_GUIDE = `CHAMPIONS (ONLY these exist in Mob Control — NEVER invent new ones): Captain Kaboom(SMALL skeleton pirate,mushroom hat,dual pistols), Gold Golem(LARGE golden muscular humanoid), Caveman(blue-skin,blonde,club), Mobzilla(purple/yellow robotic T-Rex), Nexus(blue/white/orange mech,orange sword), Red Hulk(large red humanoid), Kraken(red octopus), Femme Zombie(crawling female zombie boss), Yellow Normie(small yellow round—BOSS ENEMY), Unknown(generic enemy tower). If a champion name is not on this list, use Unknown and draw a generic enemy tower/boss. NEVER invent champion appearances or names.`;
const MOC_EVENTS_GUIDE = `MOC-SPECIFIC EVENTS TO HUNT FOR (timestamp ALL of these if present):
- CANNON UPGRADE (unit evolution): Player mobs destroy a breakable obstacle on the road (box, barrel, crate, stone, or any destructible object) — this triggers the cannon to visually transform into the next upgrade tier. ALWAYS name the upgrade using the exact tier names below. This is the most important mechanic to identify correctly.
- GIANT/BOSS DEATH: A large enemy giant or boss character is defeated and disappears/explodes. ALWAYS timestamp this — it's a key emotional payoff moment.
- X GATE PASS: Player mobs pass through a multiplication gate (xN). Report the gate value and timestamp for EACH gate pass separately.
- + GATE PASS: Player mobs pass through an addition gate (+N). Report gate value and timestamp.
- ALMOST-FAIL MOMENT: Player's mob count drops to a dangerously low level (near wipeout) but survives.
- SWARM PEAK: Maximum mob count on screen.
- FINAL FAIL/DEFEAT: Last mob destroyed, 'FAILED' screen appears.

CANNON UPGRADE TIERS (use these exact names when identifying unit evolutions):
1. Simple Cannon — single barrel cannon, fires one stream of blobs
2. Double Cannon — two barrels side by side, fires two streams
3. Triple Cannon — three barrels, fires three streams simultaneously
4. Tank — tracked vehicle with a turret, visually very distinct from cannon
5. Golden Jet / Jet — aircraft unit, gold-coloured, flies above the lane
6. (Other evolutions may exist — describe what you see if it doesn't match the above)

When you see an upgrade event, output it as: "Cannon upgrades from [previous tier] to [new tier]" using the exact names above.`;

const GATE_GUIDE = `GATES — understand the mechanical difference:
- Multiplication gate (X value, e.g. x3): multiplies the NUMBER OF MOBS currently moving through the lane. x3 means triple the mob count. Report the EXACT value shown (x2, x3, x4, x10 etc.)
- Addition gate (+ value, e.g. +10): adds to the CANNON's firing count — how many mobs are shot per cannon fire. Does NOT multiply existing mobs.
- Death gate (RED rect + SKULL): instantly kills ALL player mobs. Game over mechanic.
- Dynamic gate: activates when nearby structures are broken.
Report EVERY gate you see with its exact value. NEVER confuse + gates (cannon upgrade) with x gates (mob multiplier). If you see a gate but can't read the value clearly, report it as "x?" or "+?".`;
const HOOK_GUIDE = `HOOK: EXACT SECOND thumb stops scrolling. NEVER 0 unless frame-0 drama. hook_timing_seconds=REAL SECOND (2,4,8) NEVER fraction.`;
const TIMESTAMP_RULES = `TIMESTAMPS: Real seconds only (0,2,5,8,14,22). NEVER fractions (0.03,0.28). 30s video midpoint=15.`;

const frameExtractionSystem = () => `Precise video timestamp analyst for Mob Control ads. Extract key moments.

RULES:
1. MUST timestamp these MOC events if present: container destructions, unit evolutions, giant/boss deaths, every x-gate pass (with value), almost-fail moments, swarm peak, final defeat
2. Fill gaps larger than 8 seconds with a filler timestamp
3. Total timestamps: between 10 and 14. Never more than 14.
4. ${TIMESTAMP_RULES}
5. No two timestamps closer than 2 seconds apart
6. ONLY report what you can clearly see. If ambiguous, skip — do not guess.

${MOC_EVENTS_GUIDE}

Return ONLY JSON: {"duration_seconds":number,"frames":[{"timestamp_seconds":number,"description":string,"significance":"hook|gate|upgrade|boss_death|container|swarm|almost_fail|loss|win|fail|transition|filler"}]}`;
const hookDetectionSystem = () => `Expert mobile ad hook analyst.\n${HOOK_GUIDE}\n${TIMESTAMP_RULES}\nReturn ONLY JSON: {"hook_timing_seconds":number,"hook_type":"Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial","hook_description":string}`;
const analyzeSystem = (lib: DNAEntry[], config: UploadConfig, frames: FrameExtraction[], duration: number, hasFrameImages: boolean, hasRefs: boolean) =>
  `World-Class Creative Intelligence Analyst for Mob Control ads. NEVER guess.
AD TYPE:${config.ad_type} TIER:${config.tier}
CONTEXT (trust this — user-provided facts about the video):${config.context||"none"}
DURATION:${duration}s
LIBRARY:${lib.length>0?JSON.stringify(lib.map(d=>({title:d.title,tier:d.tier,hook_type:d.hook_type,hook_timing_seconds:d.hook_timing_seconds}))):"empty"}
${hasRefs?buildReferenceContext():""}
TIMESTAMP MAP (Gemini's frame-by-frame observations):
${frames.length>0?frames.map(f=>`[${f.timestamp_seconds}s] ${f.description} (${f.significance})`).join("\n"):"none"}
${hasFrameImages?"EXTRACTED FRAME IMAGES provided above — use them to verify exact gate values, unit appearances, container destructions, and boss death moments at each timestamp.":""}
${TIMESTAMP_RULES}
${HOOK_GUIDE}
${GATE_GUIDE}
${MOC_EVENTS_GUIDE}
${BIOME_GUIDE}
${CHAMPION_GUIDE}
CRITICAL: If the CONTEXT mentions a specific number of upgrades or unit evolutions, trust that count and find the correct timestamps for each. Do not under-count.
EMOTIONAL BEATS: Extract a beat for EVERY significant MOC event (container destruction, unit evolution, giant death, gate pass, almost-fail) AND every 7-8 seconds of filler. Minimum 10 beats for a 60s video, 8 for 30s.
${config.ad_type==="compound"?"COMPOUND: is_compound:true, segments array required.":""}
Return ONLY JSON:{"title":string,"is_compound":boolean,"transition_type":string|null,"segments":[]|null,"hook_type":"Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial","hook_timing_seconds":number,"hook_description":string,"gate_sequence":[string],"swarm_peak_moment_seconds":number|null,"loss_event_type":"Wrong Gate|Boss Overwhelm|Timer|Death Gate|Enemy Overwhelm|None","loss_event_timing_seconds":number|null,"unit_evolution_chain":[string],"emotional_arc":string,"emotional_beats":[{"timestamp_seconds":number,"event":string,"emotion":string}],"biome":"Desert|Cyber-City|Forest|Volcanic|Snow|Toxic|Water|Bunker|Meadow|Unknown","biome_visual_notes":string,"champions_visible":[string],"pacing":"Fast|Medium|Slow","key_mechanic":string,"why_it_works":string,"why_it_fails":string|null,"creative_gaps":string,"creative_gaps_structured":{"hook_strength":string,"mechanic_clarity":string,"emotional_payoff":string},"frame_extraction_gaps":string,"strategic_notes":string,"replication_instructions":string}`;
const reanalysisSystem = (entry: DNAEntry) =>
  `Re-analyze Mob Control ad. Fix errors.\nEXISTING:${JSON.stringify(entry,null,2)}\nFIX:1.hook_timing fractions→real seconds 2.timestamps→real 3.gate type confusion (+ gates = cannon firing count, x gates = mob multiplier) 4.unit_evolution_chain — use exact tier names: Simple Cannon, Double Cannon, Triple Cannon, Tank, Golden Jet. Fix any generic names like "Level 1 Tank" to proper tier names. 5.emotional_beats minimum 8 beats with no gaps >7s 6.creative_gaps_structured 7.compound segments\n${TIMESTAMP_RULES}\n${HOOK_GUIDE}\n${GATE_GUIDE}\n${MOC_EVENTS_GUIDE}\n${BIOME_GUIDE}\n${CHAMPION_GUIDE}\nReturn CORRECTED full JSON with all original fields.`;

const briefSystem = (lib: DNAEntry[], ctx: string, seg: string, iterateFrom?: string, refNote?: string) => {
  const activeWinners = lib.filter(d => d.tier === "winner" && d.creative_status !== "fatigued");
  const refBlock = iterateFrom ? `\nITERATE FROM: "${iterateFrom}" — creative starting point, DNA rules are primary.\n` : "";
  const visualRefBlock = refNote ? `\nVISUAL REFERENCE PROVIDED BY USER: ${refNote}. Use for visual inspiration only — DNA patterns and spend rules remain primary.\n` : "";
  return `You are a World-Class Lead Creative Producer for Mob Control (MOC) by Voodoo. Ground EVERY concept in proven spend data.

WINNER DNA LIBRARY (${activeWinners.length} active entries — fatigued excluded):
${JSON.stringify(activeWinners.map(d => ({ title: d.title, creative_id: d.creative_id||null, hook_type: d.hook_type, hook_timing_seconds: d.hook_timing_seconds, gate_sequence: (d.gate_sequence||[]).slice(0,5), unit_evolution_chain: d.unit_evolution_chain, key_mechanic: d.key_mechanic, biome: d.biome, loss_event_type: d.loss_event_type, spend_tier: d.spend_tier||null, spend_networks: d.spend_networks||[], replication_instructions: (d.replication_instructions||"").slice(0,200) })), null, 2)}

BRIEF: ${ctx} | SEGMENT: ${seg}${refBlock}${visualRefBlock}

PROVEN SWAP RULES: BIOME SWAP(CC21/AppLovin→CB57/FB+Google), COLOUR SWAP(CZ66→CZ65 $7K+/d top-1 FB, blue/red+desert=strongest FB), HOOK SWAP(CR86 skeleton/FB→CR85 knight/AppLovin), CAMERA(custom side cam→AppLovin/Google, default→FB/TikTok)
NETWORK RULES: AppLovin=skeleton/knight+custom cam+blue+3+evolution. Facebook=colour/biome swap+default cam+almost-win 1-5HP. Google=strong almost-win+foggy forest/water.
9-STEP CURVE: Pressure→Investment→Validate→Investment2→Payoff→FalseSafety→Pressure++→AlmostWin→Fail
BIOMES (concepts 1-3): Desert, Foggy Forest, Water, Bunker, Meadow ONLY. Concept 4 may use experimental biome with is_experimental:true.

Return ONLY valid JSON:
{"analysis":{"patterns_used":string,"dna_sources":[string],"segment_insight":string,"strategy":string},"concepts":[{"title":string,"dna_source":string,"is_data_backed":boolean,"is_experimental":boolean,"experimental_note":string|null,"objective":string,"target_segment":string,"player_motivation":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"layout":string,"hook_timing_seconds":number,"unit_evolution_chain":[string],"network_adaptations":{"AppLovin":string,"Facebook":string,"Google":string},"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"performance_hooks":[{"type":string,"text":string}],"engagement_hooks":string,"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}]}`;
};

const imagePromptFn = (concept: Concept, scene: "hook"|"start"|"middle"|"end", continuityNote?: string) => {
  const vi = concept.visual_identity;
  const chain: string[] = (concept as any).unit_evolution_chain || [];
  const hookDesc = (concept as any).hook_description || "";
  const unitAtScene = {
    hook:   chain[0] || "basic mob",
    start:  chain[0] || "basic mob",
    middle: chain[Math.floor(chain.length / 2)] || chain[0] || "evolved mob",
    end:    chain[chain.length - 1] || chain[0] || "final evolved mob",
  }[scene];

  const sceneDesc = {
    hook: `HOOK SCENE — the dramatic opening moment that stops the thumb (0-2 seconds):
- This is the VERY FIRST FRAME of the ad — maximum visual impact
- Hook event: ${hookDesc || "enemy boss dramatically kicks the player cannon backward"}
- The player cannon is shown being violently knocked back or in a losing/surprised state
- Enemy boss looms large and threatening at the top, dominant presence
- Player mobs are few or scattered — player is clearly losing at this moment
- DRAMATIC composition — this is the thumb-stopper, NOT a neutral game state
- Unit type: ${unitAtScene} — basic starting units`,
    start: `OPENING SCENE — game state at start of ad:
- Player cannon at bottom center, just fired first shot
- VERY FEW player mobs (5-10 blobs) marching toward the FIRST gate ahead
- First gate clearly visible and readable in the center lane
- Enemy base visible far at top with FULL health bar (completely filled)
- Unit type: ${unitAtScene} — small, basic blobs at this stage, NO upgrades yet
- This is before any gate has been passed — the lane is mostly empty`,
    middle: `MID-BATTLE SCENE — game state after passing several gates:
- Massive swarm of player mobs FLOODS the center lane — hundreds of blobs
- Player mobs have visually UPGRADED to: ${unitAtScene} — larger, evolved, visually distinct from start
- UPGRADE CONTAINERS visible on the road: 1-2 breakable crate/box objects on the lane that the mobs are about to hit or have just broken — these are the cannon upgrade pickups
- 1-2 multiplier gates still ahead, showing values like ${(vi.gate_values||["x3","x5"]).slice(0,2).join(", ")}
- Enemy mobs visible near the top, being overwhelmed
- Enemy boss at ~50% health bar`,
    end: `DRAMATIC ALMOST-WIN / FAIL — final game state:
- Player has reached the final evolved unit: ${unitAtScene}
- Only a TINY cluster of player mobs remains (3-8 blobs) — almost wiped out
- Enemy boss at the top with a paper-thin sliver of health remaining (1-5 HP)
- Maximum tension — player army nearly destroyed, victory just out of reach
- No gates remaining ahead — this is the final confrontation`,
  }[scene];

  const biomeRules: Record<string, string> = {
    "Bunker": "ENVIRONMENT: Grey concrete walls both sides, metal ceiling with industrial pipes, fluorescent strips, dark tunnel. NO lava, NO neon, NO outdoor sky, NO trees, NO sand, NO desert.",
    "Desert": "ENVIRONMENT: Tan/beige sand dunes both sides, bright warm sunlight, blue sky, sparse dry brush. NO concrete walls, NO neon, NO fog, NO lava, NO snow, NO water.",
    "Foggy Forest": "ENVIRONMENT: Dense grey/white atmospheric fog fills background, dark green pine trees barely visible through mist, grey asphalt road. FOG IS NOT SNOW. NO lava, NO neon, NO bunker walls, NO desert sand.",
    "Volcanic": "ENVIRONMENT: Red/orange glowing lava flows both sides, dark black cracked rocks, strong orange glow. NO concrete, NO neon, NO trees, NO sand, NO desert.",
    "Water": "ENVIRONMENT: Grey elevated bridge/path over clear blue water visible both sides. NO lava, NO neon, NO concrete walls, NO sand.",
    "Cyber-City": "ENVIRONMENT: Grey metal industrial path, orange and blue neon tech structures both sides, futuristic city backdrop. NO lava, NO sand, NO trees, NO concrete bunker, NO desert.",
    "Meadow": "ENVIRONMENT: Rolling green hills both sides, scattered leafy trees, grey brick bridge/path, bright blue sky. NO lava, NO neon, NO concrete, NO fog, NO desert.",
    "Snow": "ENVIRONMENT: White snow covering ground, icy frozen structures, blue-white cold lighting. NO lava, NO neon, NO sand, NO fog, NO desert.",
    "Toxic": "ENVIRONMENT: Purple crystalline ground paths, green glowing slime pools both sides, luminescent toxic crystals. NO lava, NO concrete, NO sand, NO neon tech, NO desert.",
  };
  const biomeRule = biomeRules[vi.environment] || `ENVIRONMENT: ${vi.environment} setting. This is NOT a desert. Draw the environment exactly as described.`;

  // Cannon is always a ground-based shooter — never a vehicle like a tank
  const cannonNote = `PLAYER CANNON: A stationary ground-based cannon shooting blobs — it is called "${vi.cannon_type}" but it is ALWAYS a cannon, NEVER a vehicle, NEVER a tank, NEVER a car. It fires player mobs upward. Positioned at bottom center.`;

  return [
    "Mob Control mobile game screenshot. MATCH the MOC reference images above EXACTLY in art style, 3D render quality, colour palette, and game aesthetic.",
    "", sceneDesc, "", biomeRule, "",
    cannonNote,
    `ENEMY BOSS: ${vi.enemy_champion||"generic enemy boss"} at top of lane. IMPORTANT: Only draw champions that actually exist in Mob Control. If the champion name is unfamiliar, draw a generic large enemy boss tower instead — do NOT invent champion appearances.`,
    `PLAYER MOBS: ${vi.player_mob_color} round blob creatures — small, cartoonish, 3D. Current evolution stage: ${unitAtScene}.`,
    `ENEMY MOBS: ${vi.enemy_mob_color} round blob creatures near the top`,
    `GATES: ${(vi.gate_values||[]).join(", ")} — large flat rectangular gates spanning full lane width, bold white text. Gates are flat signs, NOT 3D structures.`,
    `LIGHTING: ${vi.lighting} | MOOD: ${vi.mood_notes}`,
    continuityNote ? `ASSET CONTINUITY: ${continuityNote}` : "",
    "", "COMPOSITION: Cinematic 3/4 top-down angle. Cannon at bottom center. Lane runs up center. Gates clearly readable. NO HUD overlay, NO score counter, NO hearts UI, NO watermarks.",
    "ART STYLE: Exact 3D cartoon render style from reference images — same colour saturation, same mob blob shape, same gate rectangle style. Match references precisely.",
  ].filter(Boolean).join("\n");
};

// ─── Dynamic lineage chain builder ───────────────────────────────────────────
function buildLineageChain(entry: DNAEntry, lib: DNAEntry[]): string[] | null {
  try {
    const id = entry.creative_id?.trim();
    if (!id) return null;
    const visited = new Set<string>();
    const chain: string[] = [];
    let current: DNAEntry | undefined = entry;
    while (current) {
      const cid = current.creative_id?.trim();
      if (!cid || visited.has(cid)) break;
      visited.add(cid);
      chain.unshift(cid);
      const pid = current.parent_id?.trim();
      if (!pid) break;
      current = lib.find(e => { const ecid = e.creative_id?.trim(); return ecid && ecid !== "" && ecid === pid; });
    }
    const seen = new Set(chain);
    let tip = id; let found = true; let safety = 0;
    while (found && safety++ < 50) {
      found = false;
      const child = lib.find(e => { const epid = e.parent_id?.trim(); const ecid = e.creative_id?.trim(); return epid && epid !== "" && epid === tip && ecid && !seen.has(ecid); });
      if (child?.creative_id) { const cid = child.creative_id.trim(); seen.add(cid); chain.push(cid); tip = cid; found = true; }
    }
    return chain.length > 1 ? chain : null;
  } catch { return null; }
}

// ─── Parent ID validator ──────────────────────────────────────────────────────
function parentValidation(parentId: string, currentId: string, lib: DNAEntry[]) {
  const pid = parentId.trim();
  if (!pid) return null;
  const found = lib.find(e => e.creative_id?.trim() === pid && e.creative_id?.trim() !== currentId.trim());
  if (found) return { color: D.green, border: D.greenBdr, bg: D.greenBg, msg: `✓ Found: ${found.creative_id}` };
  return { color: "#f0c53a", border: "#9e6a03", bg: "#2a1a0a", msg: `⚠ Not found in library` };
}

// ─── Sorted library helper ────────────────────────────────────────────────────
function sortLib(lib: DNAEntry[], mode: SortMode): DNAEntry[] {
  const filtered = mode === "all" ? lib : lib.filter(d => d.tier === mode);
  const active = filtered.filter(d => d.creative_status !== "fatigued");
  const fatigued = filtered.filter(d => d.creative_status === "fatigued");
  const now = Date.now();
  const bySpendThenNewest = (a: DNAEntry, b: DNAEntry) => {
    const aNew = !a.spend_tier && (now - new Date(a.added_at).getTime()) < 48 * 60 * 60 * 1000;
    const bNew = !b.spend_tier && (now - new Date(b.added_at).getTime()) < 48 * 60 * 60 * 1000;
    // Untagged entries added in last 48h float to top
    if (aNew && !bNew) return -1;
    if (bNew && !aNew) return 1;
    const spendDiff = (SPEND_RANK[b.spend_tier??""]??0) - (SPEND_RANK[a.spend_tier??""]??0);
    if (spendDiff !== 0) return spendDiff;
    return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
  };
  return [...active.sort(bySpendThenNewest), ...fatigued.sort(bySpendThenNewest)];
}

// ─── #7 Analysis Progress Panel ───────────────────────────────────────────────
function AnalysisProgressPanel({ step, fileName, error }: { step: string; fileName: string; error: string }) {
  const currentIdx = ANALYSIS_STEPS.findIndex(s => s.key === step);
  return (
    <div style={{ background: D.surface, border: `1.5px solid ${error ? "#6e2020" : D.blueDark}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20, animation: "slideIn .2s ease-out" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: error ? 0 : 16 }}>
        {!error && <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid rgba(88,166,255,0.2)`, borderTopColor: D.blue, flexShrink: 0, animation: "spin .7s linear infinite" }} />}
        {error && <span style={{ fontSize: 15 }}>⚠</span>}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: error ? D.red : D.text }}>{error ? "Analysis failed" : `Analysing: ${fileName}`}</div>
          {error && <div style={{ fontSize: 11, color: D.red, marginTop: 3 }}>{error}</div>}
        </div>
      </div>
      {!error && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 7 }}>
          {ANALYSIS_STEPS.map((s, i) => {
            const isDone = i < currentIdx;
            const isActive = i === currentIdx;
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isDone ? D.greenBg : isActive ? D.blueBg : D.surface2, border: `1.5px solid ${isDone ? D.greenBdr : isActive ? D.blueDark : D.border2}`, fontSize: 9, fontWeight: 700, color: isDone ? D.green : isActive ? D.blue : D.textDim, transition: "all .3s" }}>
                  {isDone ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: 12, color: isDone ? D.textMuted : isActive ? D.text : D.textDim, fontWeight: isActive ? 500 : 400, transition: "color .3s" }}>
                  {s.label}{isActive && <span style={{ color: D.blue, marginLeft: 6, fontSize: 10 }}>in progress…</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── #8 Reference Zone (merged: file drop + creative ID) ─────────────────────
function ReferenceDropZone({ onRef, currentRef, onClear, iterateFrom, onIterateFrom }: {
  onRef: (data: { base64: string; mimeType: string; name: string }) => void;
  currentRef: { base64: string; mimeType: string; name: string } | null;
  onClear: () => void;
  iterateFrom: string;
  onIterateFrom: (v: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return;
    const base64 = await fileToBase64(file);
    onRef({ base64, mimeType: file.type, name: file.name });
  };
  const hasAnyRef = currentRef || iterateFrom.trim();
  return (
    <div style={{ marginBottom: 10, borderRadius: 8, border: `1.5px solid ${dragging ? D.purple : hasAnyRef ? D.purpleBdr : D.border2}`, background: hasAnyRef ? D.purpleBg : "transparent", transition: "border-color .15s, background .15s", overflow: "hidden" }}>
      <input ref={inputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />

      {/* Drop area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
        onClick={() => !currentRef && inputRef.current?.click()}
        style={{ padding: "9px 14px", display: "flex", alignItems: "center", gap: 10, cursor: currentRef ? "default" : "pointer" }}
      >
        {currentRef ? (
          <>
            <div style={{ fontSize: 15, flexShrink: 0 }}>{currentRef.mimeType.startsWith("image/") ? "🖼" : "🎬"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: D.purple, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{currentRef.name}</div>
              <div style={{ fontSize: 10, color: D.textDim, marginTop: 1 }}>Visual ref · DNA primary</div>
            </div>
            <button onClick={e => { e.stopPropagation(); onClear(); }} style={{ background: "none", border: "none", color: D.textDim, cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>✕</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, opacity: dragging ? 1 : 0.4 }}>🖼</div>
            <div style={{ fontSize: 11, color: dragging ? D.purple : D.textMuted, fontWeight: 500 }}>
              {dragging ? "Drop to add visual reference" : "Drop image or video reference"}
            </div>
          </>
        )}
      </div>

      {/* Divider + creative ID input */}
      <div style={{ borderTop: `0.5px solid ${hasAnyRef ? D.purpleBdr : D.border2}`, padding: "7px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: D.textDim, letterSpacing: "0.08em", flexShrink: 0 }}>ITERATE FROM</span>
        {iterateFrom.trim() ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: `${D.purpleBdr}22`, border: `0.5px solid ${D.purpleBdr}`, borderRadius: 5, padding: "2px 8px", flex: 1 }}>
            <span style={{ fontSize: 11, color: D.purple, fontWeight: 500, flex: 1 }}>{iterateFrom.trim()}</span>
            <button onClick={() => onIterateFrom("")} style={{ background: "none", border: "none", color: D.textDim, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
          </div>
        ) : (
          <input
            style={{ ...inputStyle, flex: 1, fontSize: 11, padding: "4px 8px", background: "transparent", border: "none", outline: "none" }}
            placeholder="Library ID, e.g. CT43"
            value={iterateFrom}
            onChange={e => onIterateFrom(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

// ─── AI text enhancement (Claude via Netlify) ─────────────────────────────────
async function enhanceText(raw: string, mode: "upload" | "brief"): Promise<string> {
  const systemPrompt = mode === "upload"
    ? `You are a Mob Control creative analyst helping structure upload notes for Gemini DNA analysis.

RULES — follow strictly:
- PRESERVE every fact, detail, and observation the user wrote. Do not change, remove, or contradict anything they said.
- ONLY add: MOC-specific terminology where appropriate (biome name, hook type label, gate type clarification), and structure for clarity.
- Do NOT invent new creative directions, mechanics, or details not mentioned by the user.
- Output: plain text, max 4 sentences, no bullet points.

Your job is to make the user's note more precise for Gemini — not to rewrite it.`
    : `You are a Mob Control creative producer helping structure brief prompts for generation.

RULES — follow strictly:
- PRESERVE the user's exact creative intent, all specific details, unit names, mechanics, and preferences. Do not change or replace anything they said.
- ONLY add: the specific biome name if mentioned vaguely, target network if implied, MOC gate terminology (+N = cannon upgrade, xN = mob multiplier) if gates are mentioned.
- Do NOT invent new biomes, hooks, champions, mechanics, camera rules, or creative directions not mentioned by the user.
- Do NOT expand the scope, add cinematic language, or make it more elaborate than the user intended.
- Output: plain text, max 5 sentences, no bullet points.

Your job is to clarify and structure the user's idea — not to creatively reimagine it.`;
  const r = await fetch("/api/enhance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: systemPrompt, text: raw }),
  });
  if (!r.ok) throw new Error(`Enhance failed: ${r.status}`);
  const data = await r.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("No response from Claude");
  return text.trim();
}

// ─── Enhance Button ────────────────────────────────────────────────────────────
function EnhanceButton({ text, onEnhanced, mode }: { text: string; onEnhanced: (s: string) => void; mode: "upload"|"brief" }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  async function run() {
    setLoading(true);
    try {
      const enhanced = await enhanceText(text, mode);
      onEnhanced(enhanced);
      setDone(true); setTimeout(() => setDone(false), 2000);
    } catch { /* silently fail — user keeps their text */ }
    finally { setLoading(false); }
  }
  return (
    <button onClick={run} disabled={loading} style={{ padding:"3px 10px",fontSize:10,fontWeight:500,borderRadius:20,border:`0.5px solid ${done?D.greenBdr:D.purpleBdr}`,background:done?D.greenBg:D.purpleBg,color:done?D.green:D.purple,cursor:loading?"wait":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap" as const,flexShrink:0,transition:"all .2s" }}>
      {loading?<><span style={{ width:8,height:8,borderRadius:"50%",border:`1.5px solid ${D.purpleBdr}`,borderTopColor:D.purple,display:"inline-block",animation:"spin .6s linear infinite" }} />Enhancing…</>:done?"✓ Enhanced":"✦ Enhance"}
    </button>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onConfirm, onCancel, lib }: { onConfirm: (cfg: UploadConfig) => void; onCancel: () => void; lib: DNAEntry[] }) {
  const [tier, setTier] = useState<UploadConfig["tier"]>("winner");
  const [adType, setAdType] = useState<UploadConfig["ad_type"]>("moc");
  const [context, setContext] = useState("");
  const [manualFrames, setManualFrames] = useState<File[]>([]);
  const [creativeId, setCreativeId] = useState("");
  const [parentId, setParentId] = useState("");
  const frameRef = useRef<HTMLInputElement>(null);
  const refCount = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_")).length;
  const pv = parentValidation(parentId, creativeId, lib);
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }} onClick={onCancel}>
      <div style={{ background:D.surface,borderRadius:14,padding:"1.5rem",width:"90%",maxWidth:520,border:`0.5px solid ${D.border2}`,maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <h2 style={{ margin:"0 0 4px",fontSize:16,fontWeight:500,color:D.text }}>Upload ads</h2>
        <p style={{ margin:"0 0 20px",fontSize:12,color:D.textMuted }}>Configure before choosing files.</p>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14,padding:"12px",background:D.surface2,borderRadius:8,border:`0.5px solid ${D.border}` }}>
          <div>
            <span style={labelStyle}>Production ID</span>
            <input style={{ ...inputStyle,fontSize:12,fontWeight:500 }} placeholder="e.g. CX18" value={creativeId} onChange={e=>setCreativeId(e.target.value)} />
          </div>
          <div>
            <span style={labelStyle}>Parent creative ID</span>
            <input style={{ ...inputStyle,fontSize:12,borderColor:pv?pv.border:D.border2 }} placeholder="e.g. CT43" value={parentId} onChange={e=>setParentId(e.target.value)} />
            {pv&&<div style={{ marginTop:4,fontSize:10,color:pv.color,background:pv.bg,border:`0.5px solid ${pv.border}`,borderRadius:4,padding:"2px 7px" }}>{pv.msg}</div>}
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <span style={labelStyle}>Ad type</span>
          <div style={{ display:"flex",gap:6 }}>
            {(["moc","competitor","compound"] as const).map(t => (
              <button key={t} onClick={()=>setAdType(t)} style={{ flex:1,padding:"7px 0",fontSize:11,fontWeight:500,borderRadius:8,border:`1.5px solid ${adType===t?D.blueDark:D.border2}`,background:adType===t?D.blueBg:"transparent",color:adType===t?D.blue:D.textMuted,cursor:"pointer" }}>
                {t==="moc"?"MOC":t==="competitor"?"Competitor":"Compound/Mix"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <span style={labelStyle}>Performance tier</span>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap" as const }}>
            {TIERS.map(t => <button key={t} onClick={()=>setTier(t)} style={{ padding:"5px 12px",fontSize:11,fontWeight:500,borderRadius:20,border:`1.5px solid ${tier===t?TIER_STYLE[t].border:D.border2}`,background:tier===t?TIER_STYLE[t].bg:"transparent",color:tier===t?TIER_STYLE[t].text:D.textMuted,cursor:"pointer" }}>{t}</button>)}
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 }}>
            <span style={labelStyle}>Context for Gemini</span>
            {context.trim().length>10&&<EnhanceButton text={context} onEnhanced={setContext} mode="upload" />}
          </div>
          <textarea style={{ ...inputStyle,minHeight:72,resize:"vertical",background:D.bg }} placeholder="Describe biome, hook, key mechanics…" value={context} onChange={e=>setContext(e.target.value)} />
        </div>
        <div style={{ marginBottom:16 }}>
          <span style={labelStyle}>Manual storyboard frames (optional)</span>
          <input ref={frameRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e=>setManualFrames(Array.from(e.target.files??[]))} />
          <button style={{ ...btnSec,...(manualFrames.length>0?{border:`1.5px solid ${D.greenBdr}`,color:D.green,background:D.greenBg}:{}) }} onClick={()=>frameRef.current?.click()}>
            {manualFrames.length>0?`✓ ${manualFrames.length} frame(s) selected`:"+ Add frames"}
          </button>
        </div>
        <div style={{ marginBottom:16,padding:"8px 12px",background:D.surface2,borderRadius:8,fontSize:10,color:D.textMuted,border:`0.5px solid ${D.border}` }}>
          {refCount>0?`✓ ${refCount} MOC refs`:"⚠ No refs"} → Frame extraction → Hook detection → {manualFrames.length>0?`✓ ${manualFrames.length} manual frames`:"No manual frames"} → DNA analysis
        </div>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
          <button style={btnSec} onClick={onCancel}>Cancel</button>
          <button style={btnPri} onClick={()=>onConfirm({ tier,ad_type:adType,context,manual_frames:manualFrames,creative_id:creativeId.trim()||undefined,parent_id:parentId.trim()||undefined })}>Choose video →</button>
        </div>
      </div>
    </div>
  );
}

// ─── Spend Tagger ─────────────────────────────────────────────────────────────
function SpendTagger({ entry, onSave, lib }: { entry: DNAEntry; onSave: (fields: Partial<DNAEntry>) => void; lib: DNAEntry[] }) {
  const [creativeId, setCreativeId] = useState(entry.creative_id??"");
  const [tier, setTier] = useState(entry.spend_tier??"");
  const [days, setDays] = useState<number|null>(entry.spend_window_days??null);
  const [networks, setNetworks] = useState<string[]>(entry.spend_networks??[]);
  const [notes, setNotes] = useState(entry.spend_notes??"");
  const [parentId, setParentId] = useState(entry.parent_id??"");
  const [creativeStatus, setCreativeStatus] = useState(entry.creative_status??"");
  const [saved, setSaved] = useState(false);
  const vel = velocityPerDay(tier, days);
  const pv = parentValidation(parentId, creativeId, lib);
  function save() {
    onSave({ creative_id:creativeId.trim()||undefined,spend_tier:tier||undefined,spend_window_days:days,spend_networks:networks.length>0?networks:undefined,spend_notes:notes||undefined,parent_id:parentId.trim()||undefined,creative_status:(creativeStatus||undefined) as DNAEntry["creative_status"] });
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  }
  return (
    <div style={{ marginTop:14,padding:"14px 16px",background:D.surface2,borderRadius:10,border:`0.5px solid ${D.border}` }}>
      <span style={{ ...labelStyle,marginBottom:12 }}>Creative metadata</span>
      <div style={{ marginBottom:12 }}>
        <span style={{ fontSize:10,color:D.textDim,display:"block",marginBottom:6 }}>Production ID <span style={{ fontWeight:400 }}>(e.g. CX18, CR17)</span></span>
        <input style={{ ...inputStyle,fontSize:12,padding:"6px 9px",fontWeight:500 }} placeholder="e.g. CX18" value={creativeId} onChange={e=>setCreativeId(e.target.value)} />
      </div>
      <div style={{ marginBottom:12 }}>
        <span style={{ fontSize:10,color:D.textDim,display:"block",marginBottom:6 }}>Parent creative ID <span style={{ fontWeight:400 }}>(the creative this was iterated from)</span></span>
        <input style={{ ...inputStyle,fontSize:11,padding:"5px 8px",borderColor:pv?pv.border:D.border2 }} placeholder="e.g. CT43" value={parentId} onChange={e=>setParentId(e.target.value)} />
        {pv&&<div style={{ marginTop:4,fontSize:10,color:pv.color,background:pv.bg,border:`0.5px solid ${pv.border}`,borderRadius:4,padding:"2px 7px" }}>{pv.msg}</div>}
      </div>
      <div style={{ marginBottom:12 }}>
        <span style={{ fontSize:10,color:D.textDim,display:"block",marginBottom:6 }}>Creative status</span>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap" as const }}>
          {CREATIVE_STATUS.map(s=>(
            <button key={s.value} onClick={()=>setCreativeStatus(creativeStatus===s.value?"":s.value)}
              style={{ padding:"4px 10px",fontSize:11,fontWeight:500,borderRadius:20,cursor:"pointer",border:`1.5px solid ${creativeStatus===s.value?s.border:D.border2}`,background:creativeStatus===s.value?s.bg:"transparent",color:creativeStatus===s.value?s.text:D.textMuted }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom:12 }}>
        <span style={{ fontSize:10,color:D.textDim,display:"block",marginBottom:6 }}>Spend tier</span>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap" as const }}>
          {SPEND_TIERS.map(t=><button key={t.value} onClick={()=>setTier(tier===t.value?"":t.value)} style={{ padding:"4px 10px",fontSize:11,fontWeight:500,borderRadius:20,cursor:"pointer",border:`1.5px solid ${tier===t.value?t.border:D.border2}`,background:tier===t.value?t.bg:"transparent",color:tier===t.value?t.text:D.textMuted }}>{t.label}</button>)}
        </div>
      </div>
      <div style={{ marginBottom:12 }}>
        <span style={{ fontSize:10,color:D.textDim,display:"block",marginBottom:6 }}>{tier==="sub100K"?"Days in rotation":"Time to reach that spend"}</span>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap" as const }}>
          {WINDOW_OPTIONS.map(w=><button key={w.value} onClick={()=>setDays(days===w.value?null:w.value)} style={{ padding:"4px 10px",fontSize:11,borderRadius:20,cursor:"pointer",border:`1.5px solid ${days===w.value?D.blueDark:D.border2}`,background:days===w.value?D.blueBg:"transparent",color:days===w.value?D.blue:D.textMuted }}>{w.label}</button>)}
        </div>
        {vel&&<div style={{ marginTop:6,fontSize:11,color:D.blue,fontWeight:500 }}>{vel}</div>}
        {tier==="sub100K"&&days&&<div style={{ marginTop:6,fontSize:11,color:D.textMuted,fontStyle:"italic" }}>Rotation tracking — no spend threshold reached</div>}
      </div>
      <div style={{ marginBottom:12 }}>
        <span style={{ fontSize:10,color:D.textDim,display:"block",marginBottom:6 }}>Networks</span>
        <div style={{ display:"flex",gap:5,flexWrap:"wrap" as const }}>
          {NETWORK_OPTIONS.map(n=><button key={n} onClick={()=>setNetworks(p=>p.includes(n)?p.filter(x=>x!==n):[...p,n])} style={chipStyle(networks.includes(n),"green")}>{n}</button>)}
        </div>
      </div>
      <div style={{ marginBottom:12 }}>
        <span style={{ fontSize:10,color:D.textDim,display:"block",marginBottom:6 }}>Notes</span>
        <textarea style={{ ...inputStyle,minHeight:52,resize:"vertical",fontSize:11,background:D.bg } as React.CSSProperties} placeholder="e.g. peaked week 2, Meta only…" value={notes} onChange={e=>setNotes(e.target.value)} />
      </div>
      <button onClick={save} style={{ ...btnPri,padding:"6px 14px",fontSize:11 }}>{saved?"Saved ✓":"Save"}</button>
    </div>
  );
}

// ─── Library Card ─────────────────────────────────────────────────────────────
function LibraryCard({ d, di, expandedDNA, setExpandedDNA, lib, saveLib, reanalyzingIds, handleReanalyzeSingle, onZoomFrame, isReanalyzing }: {
  d: DNAEntry; di: number; expandedDNA: number|null; setExpandedDNA: (n: number|null) => void;
  lib: DNAEntry[]; saveLib: (l: DNAEntry[]) => void;
  reanalyzingIds: Set<number>; handleReanalyzeSingle: (e: DNAEntry) => void;
  onZoomFrame: (src: string) => void;
  isReanalyzing: boolean;
}) {
  // ✅ canTag fix: inspiration tier now shows metadata fields
  const canTag = d.ad_type === "moc";
  const spendSt = SPEND_TIERS.find(t => t.value === d.spend_tier);
  const statusSt = CREATIVE_STATUS.find(s => s.value === d.creative_status);
  const isFatigued = d.creative_status === "fatigued";
  const isExpanded = expandedDNA === di;
  const chain = buildLineageChain(d, lib);
  const displayId = d.creative_id?.trim();
  const vel = velocityPerDay(d.spend_tier ?? "", d.spend_window_days);
  const accentColor = isFatigued ? "#8957e5" : TIER_ACCENT[d.tier] ?? D.border2;

  return (
    <div style={{
      borderBottom: `0.5px solid ${D.border}`,
      opacity: isFatigued ? 0.72 : 1,
      transition: "opacity .2s",
      borderLeft: `3px solid ${isReanalyzing ? D.blue : accentColor}`,
      background: isReanalyzing ? `${D.blueBg}44` : "transparent",
      boxShadow: isReanalyzing ? `inset 0 0 0 1px ${D.blueDark}` : "none",
    }}>
      {/* ── Collapsed card body ── */}
      <div style={{
        padding: "14px 16px",
        background: isExpanded ? D.surface2 : "transparent",
        transition: "background .15s",
      }}>

        {/* Row 1: ID + tier + status badges only */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" as const }}>
          {displayId
            ? <span style={{ fontSize: 20, fontWeight: 700, color: D.text, letterSpacing: "0.01em", lineHeight: 1 }}>{displayId}</span>
            : <span style={{ fontSize: 14, fontWeight: 600, color: D.textMuted }}>{d.title}</span>}
          <span style={pill(TIER_STYLE[d.tier].bg, TIER_STYLE[d.tier].text, TIER_STYLE[d.tier].border)}>{d.tier}</span>
          {statusSt && <span style={pill(statusSt.bg, statusSt.text, statusSt.border)}>{statusSt.label}</span>}
          {d.ad_type !== "moc" && <span style={pill(D.purpleBg, D.purple, D.purpleBdr)}>{d.ad_type}</span>}
          {d.is_compound && <span style={pill(D.goldBg, D.gold, D.goldBdr)}>compound</span>}
          {d.reanalyzed && <span style={pill(D.greenBg, D.green, D.greenBdr)}>re-analyzed</span>}
        </div>

        {/* Row 2: Full title subtitle */}
        {displayId && (
          <div style={{ fontSize: 12, color: D.textMuted, marginBottom: 10, lineHeight: 1.4 }}>
            {d.title}
          </div>
        )}

        {/* Row 3: Spend block — 3-column layout */}
        {(spendSt || vel || d.spend_networks?.length) ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            alignItems: "center",
            padding: "8px 12px",
            background: D.surface2,
            borderRadius: 7,
            marginBottom: 8,
            border: `0.5px solid ${D.border}`,
            gap: 8,
          }}>
            {/* Left: spend + window */}
            <div>
              {spendSt
                ? <span style={{ fontSize: 13, fontWeight: 600, color: spendSt.text }}>
                    {spendSt.label}
                    {d.spend_window_days ? ` / ${WINDOW_OPTIONS.find(w => w.value === d.spend_window_days)?.label ?? d.spend_window_days + "d"}` : ""}
                  </span>
                : <span style={{ fontSize: 11, color: D.textDim, fontStyle: "italic" }}>No spend data</span>}
            </div>
            {/* Center: velocity */}
            <div style={{ textAlign: "center" as const }}>
              {vel && <span style={{ fontSize: 13, fontWeight: 500, color: D.blue }}>{vel}</span>}
            </div>
            {/* Right: networks */}
            <div style={{ textAlign: "right" as const }}>
              {d.spend_networks && d.spend_networks.length > 0 && (
                <span style={{ fontSize: 11, color: D.textMuted }}>{d.spend_networks.join(", ")}</span>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            padding: "6px 12px", background: D.surface2, borderRadius: 7,
            marginBottom: 8, border: `0.5px solid ${D.border}`,
            fontSize: 11, color: D.textDim, fontStyle: "italic",
          }}>
            No spend data — add metadata in expanded view
          </div>
        )}

        {/* Row 4: Lineage */}
        {chain && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8, flexWrap: "nowrap" as const, overflowX: "auto" }}>
            <span style={{ fontSize: 9, color: D.textDim, letterSpacing: "0.07em", marginRight: 2, flexShrink: 0 }}>LINEAGE</span>
            {chain.map((id, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                <span style={{
                  fontSize: 9, padding: "2px 7px", borderRadius: 20,
                  fontWeight: id === displayId ? 700 : 400,
                  background: id === displayId ? `${accentColor}22` : D.surface2,
                  color: id === displayId ? accentColor : D.textDim,
                  border: `0.5px solid ${id === displayId ? accentColor : D.border2}`,
                }}>{id}</span>
                {i < chain.length - 1 && <span style={{ fontSize: 9, color: D.textDim }}>→</span>}
              </span>
            ))}
          </div>
        )}

        {/* Row 5: Footer — filename + date left, Re-analyze + dropdown right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 10, color: D.textDim }}>
            {d.file_name} · {new Date(d.added_at).toLocaleDateString()}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              style={{ ...btnSec, fontSize: 10, padding: "4px 9px" }}
              onClick={e => { e.stopPropagation(); handleReanalyzeSingle(d); }}
              disabled={reanalyzingIds.has(d.id)}
            >
              {reanalyzingIds.has(d.id) ? "…" : "Re-analyze"}
            </button>
            <select
              value={d.tier}
              onChange={e => { e.stopPropagation(); saveLib(lib.map(x => x.id === d.id ? { ...x, tier: e.target.value as DNAEntry["tier"] } : x)); }}
              style={{ fontSize: 10, padding: "3px 6px", borderRadius: 6, border: `0.5px solid ${D.border2}`, background: D.surface2, color: D.text, cursor: "pointer" }}
            >
              {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Bottom action bar — always visible ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        borderTop: `0.5px solid ${D.border}`,
        background: isExpanded ? "#141920" : D.surface,
      }}>
        <button
          onClick={() => setExpandedDNA(isExpanded ? null : di)}
          style={{
            ...btnSec,
            fontSize: 11,
            padding: "5px 14px",
            display: "flex",
            alignItems: "center",
            gap: 5,
            color: isExpanded ? D.blue : D.textMuted,
            borderColor: isExpanded ? D.blueDark : D.border2,
          }}
        >
          {isExpanded ? "▲ Collapse" : "▼ Expand details"}
        </button>
        <button
          style={btnDanger}
          onClick={() => { if (confirm(`Remove "${displayId || d.title}" from library?`)) saveLib(lib.filter(x => x.id !== d.id)); }}
        >
          Remove from library
        </button>
      </div>

      {/* ── Expanded section ── */}
      {isExpanded && (
        <div style={{
          padding: "14px 16px 20px",
          borderTop: `0.5px solid ${D.border}`,
          background: D.surface2,
          borderLeft: "none", // accent is on parent already
        }}>
          {canTag && <SpendTagger entry={d} lib={lib} onSave={fields => saveLib(lib.map(x => x.id === d.id ? { ...x, ...fields } : x))} />}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginTop: 14, marginBottom: 10 }}>
            {[
              { l: "Hook type", v: d.hook_type },
              { l: "Hook at", v: d.hook_timing_seconds != null ? `${d.hook_timing_seconds}s` : "—" },
              { l: "Biome", v: d.biome },
              { l: "Pacing", v: d.pacing },
              { l: "Loss event", v: d.loss_event_type },
              { l: "Swarm peak", v: d.swarm_peak_moment_seconds != null ? `${d.swarm_peak_moment_seconds}s` : "—" },
            ].map(({ l, v }) => (
              <div key={l} style={metricStyle}>
                <div style={metricLabel}>{l}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: D.text }}>{v ?? "—"}</div>
              </div>
            ))}
          </div>

          {d.unit_evolution_chain?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Unit evolution chain</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                {d.unit_evolution_chain.map((step, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", background: D.blueBg, color: D.blue, borderRadius: 20, border: `0.5px solid ${D.blueDark}` }}>{step}</span>
                    {i < d.unit_evolution_chain.length - 1 && <span style={{ color: D.textDim, fontSize: 10 }}>→</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {d.emotional_beats?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Emotional beats</span>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                {d.emotional_beats.map((b, i) => (
                  <div key={i} style={{ fontSize: 11, padding: "5px 8px", background: D.surface, borderRadius: 6, display: "flex", gap: 8 }}>
                    <span style={{ fontWeight: 500, color: D.blue, minWidth: 28 }}>{b.timestamp_seconds}s</span>
                    <span style={{ color: D.text }}>{b.event}</span>
                    <span style={{ color: D.textDim, fontStyle: "italic", marginLeft: "auto" }}>{b.emotion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {d.gate_sequence?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Gate sequence</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                {d.gate_sequence.map((g, i) => (
                  <span key={i} style={{ fontSize: 10, padding: "2px 7px", background: g.toLowerCase().includes("death") ? D.redBg : D.blueBg, color: g.toLowerCase().includes("death") ? D.red : D.blue, borderRadius: 20, border: `0.5px solid ${g.toLowerCase().includes("death") ? "#6e2020" : D.blueDark}` }}>{g}</span>
                ))}
              </div>
            </div>
          )}

          {d.champions_visible?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Champions</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                {d.champions_visible.map((c, i) => (
                  <span key={i} style={{ fontSize: 10, padding: "2px 7px", background: D.purpleBg, color: D.purple, borderRadius: 20, border: `0.5px solid ${D.purpleBdr}` }}>{c}</span>
                ))}
              </div>
            </div>
          )}

          {d.creative_gaps_structured && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Creative gaps</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {[
                  { l: "Hook strength", v: d.creative_gaps_structured.hook_strength },
                  { l: "Mechanic clarity", v: d.creative_gaps_structured.mechanic_clarity },
                  { l: "Emotional payoff", v: d.creative_gaps_structured.emotional_payoff },
                ].map(({ l, v }) => (
                  <div key={l} style={{ padding: "7px 9px", background: D.goldBg, borderRadius: 7, border: `0.5px solid ${D.goldBdr}` }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: D.gold, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 2 }}>{l}</div>
                    <p style={{ margin: 0, fontSize: 10, color: "#c9a227" }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {d.strategic_notes && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Strategic notes</span>
              <p style={{ margin: 0, fontSize: 11, color: D.blue, lineHeight: 1.5 }}>{d.strategic_notes}</p>
            </div>
          )}

          {[
            { l: "Key mechanic", v: d.key_mechanic },
            { l: "Emotional arc", v: d.emotional_arc },
            { l: "Why it works", v: d.why_it_works },
            { l: "Why it fails", v: d.why_it_fails },
            { l: "Frame gaps", v: d.frame_extraction_gaps },
            { l: "Replication instructions", v: d.replication_instructions },
          ].filter(x => x.v).map(({ l, v }) => (
            <div key={l} style={{ marginBottom: 10 }}>
              <span style={labelStyle}>{l}</span>
              <p style={{ margin: 0, fontSize: 11, color: D.textMuted, lineHeight: 1.6 }}>{v}</p>
            </div>
          ))}

          {d.is_compound && d.segments && d.segments.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Segments ({d.segments.length})</span>
              {d.segments.map((seg, si) => (
                <div key={si} style={{ padding: "9px 11px", background: D.surface, borderRadius: 7, border: `0.5px solid ${D.border}`, marginBottom: 5 }}>
                  <div style={{ fontWeight: 500, fontSize: 11, marginBottom: 3, color: D.text }}>Segment {si + 1}: {seg.biome} ({seg.start_seconds}s–{seg.end_seconds}s)</div>
                  <div style={{ fontSize: 10, color: D.textMuted }}>Hook: {seg.hook_type} at {seg.hook_timing_seconds}s · {seg.key_mechanic}</div>
                </div>
              ))}
            </div>
          )}

          {d.auto_frames && d.auto_frames.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Extracted frames</span>
              {/* Filmstrip — only shown if images were saved */}
              {d.auto_frames.some(f => f.image_data) && (
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>
                  {d.auto_frames.filter(f => f.image_data).map((f, fi) => (
                    <div key={fi} style={{ flexShrink: 0, position: "relative" as const, cursor: "zoom-in" }} onClick={() => onZoomFrame(`data:image/jpeg;base64,${f.image_data}`)}>
                      <img src={`data:image/jpeg;base64,${f.image_data}`} alt={`${f.timestamp_seconds}s`}
                        style={{ width: 72, height: 128, objectFit: "cover", borderRadius: 6, border: `0.5px solid ${D.border2}`, display: "block", transition: "transform .1s" }}
                        onMouseEnter={e => (e.currentTarget as HTMLImageElement).style.transform = "scale(1.05)"}
                        onMouseLeave={e => (e.currentTarget as HTMLImageElement).style.transform = ""} />
                      <div style={{ position: "absolute" as const, bottom: 3, left: 0, right: 0, textAlign: "center" as const }}>
                        <span style={{ fontSize: 8, background: "rgba(0,0,0,0.75)", color: "#fff", padding: "1px 4px", borderRadius: 3 }}>{f.timestamp_seconds}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Text list */}
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                {d.auto_frames.map((f, fi) => (
                  <div key={fi} style={{ fontSize: 10, padding: "4px 8px", background: D.surface, borderRadius: 5, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ fontWeight: 500, color: D.blue, minWidth: 28, flexShrink: 0 }}>{f.timestamp_seconds}s</span>
                    <span style={{ color: D.textMuted, flex: 1 }}>{f.description}</span>
                    {f.significance !== "filler" && <span style={{ fontSize: 9, color: D.textDim, flexShrink: 0 }}>{f.significance}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [lib, setLib] = useState<DNAEntry[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [libPanelOpen, setLibPanelOpen] = useState(false);
  const [briefPanelOpen, setBriefPanelOpen] = useState(false);
  const [analysePanelOpen, setAnalysePanelOpen] = useState(false);
  const [expandedDNA, setExpandedDNA] = useState<number|null>(null);
  const [libSort, setLibSort] = useState<SortMode>("all");
  const [showModal, setShowModal] = useState(false);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig|null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState("");
  const [analyzeFileName, setAnalyzeFileName] = useState("");
  const [analyzeErr, setAnalyzeErr] = useState("");
  const [lastAnalyzedId, setLastAnalyzedId] = useState<number|null>(null);
  const [zoomedFrame, setZoomedFrame] = useState<string|null>(null);
  const [reanalyzingIds, setReanalyzingIds] = useState<Set<number>>(new Set());
  const [reanalyzingEntry, setReanalyzingEntry] = useState<number|null>(null);
  const [reanalyzingAll, setReanalyzingAll] = useState(false);
  const [reanalysisProgress, setReanalysisProgress] = useState("");
  const [briefCtx, setBriefCtx] = useState(""); const [segment, setSegment] = useState("Whale");
  const [iterateFrom, setIterateFrom] = useState("");
  const [briefRef, setBriefRef] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [briefErr, setBriefErr] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [briefAnalysis, setBriefAnalysis] = useState<BriefAnalysis|null>(null);
  const [expandedConcept, setExpandedConcept] = useState<number|null>(null);
  const [renderingScene, setRenderingScene] = useState<Record<string,boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{
    fetch("/api/load-library")
      .then(r=>{ if(!r.ok) throw new Error(); return r.json(); })
      .then((data: DNAEntry[])=>{ if(Array.isArray(data)&&data.length>0) setLib(data); else { try { const l=localStorage.getItem("levelly_dna_library"); if(l) setLib(JSON.parse(l)); } catch {} } setLibraryLoaded(true); })
      .catch(()=>{ try { const l=localStorage.getItem("levelly_dna_library"); if(l) setLib(JSON.parse(l)); } catch {} setLibraryLoaded(true); });
  },[]);

  const saveLib = useCallback((updated: DNAEntry[])=>{
    setLib(updated);
    try { localStorage.setItem("levelly_dna_library",JSON.stringify(updated)); } catch {}
    if(libraryLoaded){
      setCloudStatus("saving");
      // Strip image_data from auto_frames before cloud save — images are large and can exceed Blobs limits
      // They're preserved in localStorage and in-memory lib for the current session
      const stripped = updated.map(e => ({
        ...e,
        auto_frames: e.auto_frames?.map(f => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance }))
      }));
      fetch("/api/save-library",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(stripped) })
        .then(r=>{ if(!r.ok) throw new Error(); setCloudStatus("saved"); setTimeout(()=>setCloudStatus("idle"),2000); })
        .catch(()=>{ setCloudStatus("error"); setTimeout(()=>setCloudStatus("idle"),3000); });
    }
  },[libraryLoaded]);

  const exportLibrary=()=>{ const blob=new Blob([JSON.stringify(lib,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`levelly-dna-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); };
  const importLibrary=(e: React.ChangeEvent<HTMLInputElement>)=>{ const file=e.target.files?.[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try { const p=JSON.parse(reader.result as string); if(!Array.isArray(p)) throw new Error(); const m=[...lib]; p.forEach((entry: DNAEntry)=>{ if(!m.find(x=>x.id===entry.id)) m.push(entry); }); saveLib(m); } catch { alert("Import failed."); } }; reader.readAsText(file); e.target.value=""; };

  const reanalyzeSingle=async(entry: DNAEntry): Promise<DNAEntry>=>{
    // Strip image_data from auto_frames before sending — base64 images bloat the prompt and cause JSON parse errors
    const stripped = { ...entry, auto_frames: entry.auto_frames?.map(f => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance })) };
    const corrected=await callGeminiDirect(reanalysisSystem(stripped),[{text:`Re-analyze: ${entry.title}`}]);
    // Preserve image_data from original entry — re-analysis doesn't re-extract frames
    return {...entry,...corrected,id:entry.id,reanalyzed:true,added_at:entry.added_at,file_name:entry.file_name,tier:entry.tier,ad_type:entry.ad_type,auto_frames:entry.auto_frames};
  };
  const handleReanalyzeSingle=async(entry: DNAEntry)=>{
    setReanalyzingIds(p=>new Set(p).add(entry.id));
    setReanalyzingEntry(entry.id);
    try { const u=await reanalyzeSingle(entry); saveLib(lib.map(x=>x.id===entry.id?u:x)); }
    catch(err: any){ alert(`Re-analysis failed: ${err.message}`); }
    finally { setReanalyzingIds(p=>{ const s=new Set(p); s.delete(entry.id); return s; }); setReanalyzingEntry(null); }
  };
  const handleReanalyzeAll=async()=>{ if(!confirm(`Re-analyze all ${lib.length} entries?`)) return; setReanalyzingAll(true); let updated=[...lib]; for(let i=0;i<lib.length;i++){ setReanalysisProgress(`Re-analyzing ${i+1}/${lib.length}: ${lib[i].title}…`); try { const c=await reanalyzeSingle(lib[i]); updated=updated.map(x=>x.id===lib[i].id?c:x); saveLib(updated); } catch(err){ console.warn(`Failed: ${lib[i].title}`,err); } await new Promise(r=>setTimeout(r,1000)); } setReanalyzingAll(false); setReanalysisProgress(""); };

  const handleModalConfirm=(cfg: UploadConfig)=>{ setUploadConfig(cfg); setShowModal(false); fileRef.current?.click(); };
  const handleUpload=useCallback(async(e: React.ChangeEvent<HTMLInputElement>)=>{
    const files=Array.from(e.target.files??[]); if(!files.length) return;
    const cfg=uploadConfig||{tier:"winner" as const,ad_type:"moc" as const,context:"",manual_frames:[]};
    setAnalyzing(true); setAnalyzeErr(""); setAnalyzeStep("uploading"); setAnalyzeFileName(files[0].name);
    setBriefPanelOpen(false); setAnalysePanelOpen(false);
    try {
      for(const file of files){
        setAnalyzeFileName(file.name); setAnalyzeStep("uploading");
        let videoPart: any;
        if(file.size>4*1024*1024){ const {fileUri,mimeType}=await uploadToGeminiFileAPI(file,()=>{}); videoPart={fileData:{mimeType,fileUri}}; }
        else { videoPart={inlineData:{mimeType:file.type,data:await fileToBase64(file)}}; }
        setAnalyzeStep("frames");
        let autoFrames: FrameExtraction[]=[],duration=30;
        try { const fr=await callGeminiDirect(frameExtractionSystem(),[{text:"Extract 8 key frames:"},videoPart]); autoFrames=fr?.frames||[]; duration=fr?.duration_seconds||30; } catch {}

        // Extract actual frame images at Gemini's chosen timestamps (non-blocking fallback)
        let extractedFrameParts: any[] = [];
        try {
          const timestamps = autoFrames.map(f => f.timestamp_seconds).filter(t => typeof t === "number");
          if (timestamps.length > 0) {
            setAnalyzeStep("extracting");
            extractedFrameParts = await extractFramesFromVideo(file, timestamps, duration);
          }
        } catch { /* silent fallback — analysis continues without frames */ }

        setAnalyzeStep("hook");
        let hookData: any={};
        try { hookData=await callGeminiDirect(hookDetectionSystem(),[{text:`Frames:${JSON.stringify(autoFrames)}.Context:${cfg.context}.Find hook:`},videoPart]); } catch {}
        const manualParts: any[]=[];
        if(cfg.manual_frames.length>0){ for(const mf of cfg.manual_frames){ manualParts.push({text:`Manual:${mf.name}`}); manualParts.push({inlineData:{mimeType:mf.type,data:await fileToBase64(mf)}}); } }
        setAnalyzeStep("analyzing");
        const refParts=buildReferenceParts();
        const frameParts = extractedFrameParts.length > 0
          ? [{text:"### EXTRACTED FRAMES — key moments at exact timestamps:"},...extractedFrameParts]
          : [];
        const dna=await callGeminiDirect(analyzeSystem(lib,cfg,autoFrames,duration,frameParts.length>0,refParts.length>0),[...refParts,...frameParts,...(manualParts.length>0?[{text:"### MANUAL FRAMES:"},...manualParts]:[]),{text:`HOOK DATA:${JSON.stringify(hookData)}`},{text:"### AD VIDEO:"},videoPart,{text:"Extract Creative DNA."}]);
        setAnalyzeStep("saving");
        // Build a lookup: timestamp → base64 image from extractedFrameParts
        // extractedFrameParts alternates: [{text:"[FRAME at Xs]"}, {inlineData:{...}}, ...]
        const frameImageMap: Record<number, string> = {};
        for (let pi = 0; pi < extractedFrameParts.length - 1; pi += 2) {
          const label = extractedFrameParts[pi]?.text ?? "";
          const match = label.match(/\[FRAME at ([\d.]+)s\]/);
          const imgData = extractedFrameParts[pi + 1]?.inlineData?.data;
          if (match && imgData) frameImageMap[parseFloat(match[1])] = imgData;
        }
        const autoFramesWithImages: FrameExtraction[] = autoFrames.map(f =>
          frameImageMap[f.timestamp_seconds]
            ? { ...f, image_data: frameImageMap[f.timestamp_seconds] }
            : f
        );
        const newId = Date.now() + Math.random();
        saveLib([...lib,{...dna,id:newId,tier:cfg.tier,ad_type:cfg.ad_type,upload_context:cfg.context,file_name:file.name,added_at:new Date().toISOString(),creative_id:cfg.creative_id,parent_id:cfg.parent_id,auto_frames:autoFramesWithImages,manual_frames:cfg.manual_frames.map(f=>f.name)}]);
        setLastAnalyzedId(newId);
        setAnalyzeStep("");
      }
    } catch(err: any){ setAnalyzeErr(err.message); }
    finally { setAnalyzing(false); setUploadConfig(null); if(fileRef.current) fileRef.current.value=""; }
  },[lib,uploadConfig]);

  const handleGenerateBrief = async () => {
    if (!briefCtx.trim()) { setBriefErr("Enter a brief context first."); return; }
    if (lib.length === 0) { setBriefErr("Add at least one ad first."); return; }
    setGenerating(true); setBriefErr(""); setConcepts([]); setBriefAnalysis(null);
    try {
      const refNote = briefRef ? `User provided visual reference: "${briefRef.name}". It is included as an inline file below.` : undefined;
      const systemPrompt = briefSystem(lib, briefCtx, segment, iterateFrom.trim()||undefined, refNote);
      const userPrompt = briefRef
        ? `Visual reference provided: ${briefRef.name} (${briefRef.mimeType})\nGenerate the analysis and all 4 concepts. Return only JSON.`
        : "Generate the analysis and all 4 concepts. Return only JSON.";

      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, prompt: userPrompt, max_tokens: 4000 }),
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData?.error?.message || errData?.error || `Generate failed: ${r.status}`);
      }
      const result = await r.json();
      if (result.analysis) setBriefAnalysis(result.analysis);
      if (Array.isArray(result.concepts)) {
        result.concepts.forEach((concept: Concept, i: number) => {
          setConcepts(prev => [...prev, concept]);
          if (i === 0) setExpandedConcept(0);
        });
      }
    } catch (err: any) { setBriefErr(err.message); }
    finally { setGenerating(false); }
  };

  const handleRenderScene=async(ci: number,scene: "hook"|"start"|"middle"|"end")=>{
    const k=`${ci}-${scene}`; setRenderingScene(p=>({...p,[k]:true}));
    try {
      const concept=concepts[ci]; const vi=concept.visual_identity;
      const refParts=pickRelevantRefs(vi);
      const prevParts: any[]=[];
      // Continuity chain: hook is rendered first (no ref), start uses hook, middle uses start, end uses middle
      if(scene==="start"&&concept.visual_hook){ prevParts.push({text:"### HOOK SCENE — match ALL assets, environment, lighting, cannon, and art style exactly:"}); prevParts.push({inlineData:{mimeType:"image/png",data:concept.visual_hook.replace("data:image/png;base64,","")}}); }
      if((scene==="middle"||scene==="end")&&concept.visual_start){ prevParts.push({text:"### START SCENE — match ALL assets, environment, lighting, and art style exactly:"}); prevParts.push({inlineData:{mimeType:"image/png",data:concept.visual_start.replace("data:image/png;base64,","")}}); }
      if(scene==="end"&&concept.visual_middle){ prevParts.push({text:"### MIDDLE SCENE — also match this for additional asset consistency:"}); prevParts.push({inlineData:{mimeType:"image/png",data:concept.visual_middle.replace("data:image/png;base64,","")}}); }
      const continuityNote=scene!=="hook"?`Match ALL visual assets from the reference scene image(s) above — same cannon model, same mob blob design, same gate style, same environment. Only the GAME STATE changes.`:undefined;
      const url=await callImageDirect(imagePromptFn(concept,scene,continuityNote),[...refParts,...prevParts]);
      setConcepts(p=>p.map((c,i)=>i===ci?{...c,[`visual_${scene}`]:url}:c));
    } catch(err: any){ alert(`Render failed: ${err.message}`); }
    finally { setRenderingScene(p=>({...p,[k]:false})); }
  };

  const sortedLib = sortLib(lib, libSort);
  const winners=lib.filter(d=>d.tier==="winner").length;
  const activeWinners=lib.filter(d=>d.tier==="winner"&&d.creative_status!=="fatigued").length;
  const topVel=lib.reduce((best,d)=>{ const v=velocityPerDay(d.spend_tier??"",d.spend_window_days); if(!v) return best; const num=parseInt(v.replace(/[^0-9]/g,"")); return num>best?num:best; },0);
  const networkSet=new Set(lib.flatMap(d=>d.spend_networks??[]));
  const cloudLabel={idle:"",saving:"Saving…",saved:"Saved ✓",error:"Save failed"}[cloudStatus];
  const cloudColor={idle:D.textDim,saving:D.blue,saved:D.green,error:D.red}[cloudStatus];
  const SB=48;

  return (
    <div style={{ background:D.bg,minHeight:"100vh",color:D.text,fontFamily:"system-ui,sans-serif",fontSize:13,position:"relative" }}>
      {showModal&&<UploadModal lib={lib} onConfirm={handleModalConfirm} onCancel={()=>setShowModal(false)} />}
      {/* Frame zoom lightbox */}
      {zoomedFrame && (
        <div onClick={() => setZoomedFrame(null)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out" }}>
          <img src={zoomedFrame} alt="frame" style={{ maxHeight:"90vh",maxWidth:"90vw",borderRadius:10,boxShadow:"0 0 60px rgba(0,0,0,0.8)" }} />
          <div style={{ position:"absolute",top:16,right:20,fontSize:20,color:"#fff",opacity:0.6,cursor:"pointer" }}>✕</div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{ display:"none" }} onChange={handleUpload} />
      <input ref={importRef} type="file" accept=".json" style={{ display:"none" }} onChange={importLibrary} />

      {/* Sidebar */}
      <div style={{ position:"fixed",top:0,left:0,width:SB,height:"100vh",background:D.surface,borderRight:`0.5px solid ${D.border}`,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:12,gap:6,zIndex:200 }}>
        {[
          { icon:<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 6.5L8 1l7 5.5V15H1V6.5zm1 .9V14h4v-3h4v3h4V7.4L8 2.5 2 7.4z"/></svg>,key:"home",active:!libPanelOpen },
          { icon:<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>,key:"library",active:libPanelOpen },
          { icon:<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM7.5 4v4.25l3 1.75-.75 1.3L6.5 9V4h1z"/></svg>,key:"history",active:false },
        ].map(({icon,key,active})=>(
          <button key={key} onClick={()=>key==="library"&&setLibPanelOpen(p=>!p)} style={{ width:32,height:32,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",background:active?D.surface2:"transparent",border:"none",color:active?D.text:D.textMuted,cursor:"pointer" }}>{icon}</button>
        ))}
      </div>

      {/* Library side panel */}
      <div style={{ position:"fixed",top:0,left:SB,width:560,height:"100vh",background:D.surface,borderRight:`0.5px solid ${D.border2}`,display:"flex",flexDirection:"column",zIndex:150,transform:libPanelOpen?"translateX(0)":"translateX(-100%)",transition:"transform .22s ease-out" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:`0.5px solid ${D.border}`,flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14,fontWeight:500 }}>Creative library</div>
            <div style={{ fontSize:10,color:D.textMuted,marginTop:2 }}>{lib.length} entries · {activeWinners} active winners · {lib.filter(d=>d.creative_status==="fatigued").length} fatigued</div>
          </div>
          <button onClick={()=>setLibPanelOpen(false)} style={{ background:"none",border:"none",color:D.textMuted,fontSize:11,cursor:"pointer",padding:"3px 6px",borderRadius:4,fontFamily:"inherit" }}>✕</button>
        </div>

        {/* Sort filter */}
        <div style={{ display:"flex",gap:5,padding:"8px 16px",borderBottom:`0.5px solid ${D.border}`,flexShrink:0,flexWrap:"wrap" as const,alignItems:"center" }}>
          {(["all","winner","scalable","inspiration","failed"] as SortMode[]).map(s=>(
            <button key={s} onClick={()=>setLibSort(s)} style={{ padding:"3px 10px",fontSize:10,borderRadius:20,cursor:"pointer",fontFamily:"inherit",border:`0.5px solid ${libSort===s?(s==="all"?D.border2:TIER_STYLE[s]?.border??D.border2):D.border2}`,background:libSort===s?(s==="all"?D.surface2:TIER_STYLE[s]?.bg??"transparent"):"transparent",color:libSort===s?(s==="all"?D.text:TIER_STYLE[s]?.text??D.text):D.textMuted }}>
              {s==="all"?"All":s.charAt(0).toUpperCase()+s.slice(1)}
            </button>
          ))}
          <span style={{ fontSize:10,color:D.textDim,marginLeft:"auto" }}>by spend · fatigued last</span>
        </div>

        <div style={{ display:"flex",gap:6,padding:"10px 16px",borderBottom:`0.5px solid ${D.border}`,flexWrap:"wrap" as const,flexShrink:0 }}>
          {lib.length>0&&(<><button style={btnSec} onClick={handleReanalyzeAll} disabled={reanalyzingAll||analyzing}>{reanalyzingAll?"Re-analyzing…":"Re-analyze all"}</button><button style={btnSec} onClick={exportLibrary}>Export</button><button style={btnSec} onClick={()=>{ if(confirm("Clear library?")) saveLib([]); }}>Clear</button></>)}
          <button style={btnSec} onClick={()=>importRef.current?.click()}>Import</button>
          <button style={btnPri} onClick={()=>{ setLibPanelOpen(false); setShowModal(true); }} disabled={analyzing||reanalyzingAll}>{analyzing?"Analyzing…":"+ Upload"}</button>
        </div>
        {reanalysisProgress&&<div style={{ fontSize:11,color:D.blue,background:D.blueBg,border:`0.5px solid ${D.blueDark}`,borderRadius:7,padding:"7px 12px",margin:"8px 16px" }}>{reanalysisProgress}</div>}
        {!libraryLoaded&&<div style={{ fontSize:11,color:D.blue,padding:"12px 16px" }}>Loading library…</div>}
        {lib.length===0&&!analyzing&&libraryLoaded&&<div style={{ padding:"2rem 16px",textAlign:"center" as const }}><p style={{ margin:0,fontSize:12,color:D.textMuted }}>Upload MOC ads to build your Creative DNA library.</p></div>}
        <div style={{ flex:1,overflowY:"auto" }}>
          {sortedLib.map((d) => {
            const di = lib.indexOf(d);
            return <LibraryCard key={d.id} d={d} di={di} expandedDNA={expandedDNA} setExpandedDNA={setExpandedDNA} lib={lib} saveLib={saveLib} reanalyzingIds={reanalyzingIds} handleReanalyzeSingle={handleReanalyzeSingle} onZoomFrame={setZoomedFrame} isReanalyzing={reanalyzingEntry === d.id} />;
          })}
        </div>
      </div>

      {/* Main */}
      <div style={{ marginLeft:SB }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px",borderBottom:`0.5px solid ${D.border}`,background:D.bg,position:"sticky",top:0,zIndex:100 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:28,height:28,borderRadius:"50%",background:D.blueDark,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:500,color:"#fff",flexShrink:0 }}>L</div>
            <span style={{ fontSize:15,fontWeight:500 }}>Levelly</span>
            <span style={{ fontSize:12,color:D.textMuted }}>MOC Creative Intelligence</span>
          </div>
          <div>{cloudStatus!=="idle"&&<span style={{ fontSize:10,color:cloudColor }}>{cloudLabel}</span>}</div>
        </div>

        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderBottom:`0.5px solid ${D.border}` }}>
          {[{n:lib.length,label:"CREATIVES",color:D.text},{n:winners,label:"WINNERS",color:D.blue},{n:topVel>0?`$${topVel>=1000?Math.round(topVel/1000)+"K":topVel}`:"—",label:"TOP VELOCITY",color:D.gold},{n:networkSet.size||"—",label:"NETWORKS",color:D.green}].map(({n,label,color},i)=>(
            <div key={label} style={{ padding:"20px 24px",borderRight:i<3?`0.5px solid ${D.border}`:"none" }}>
              <div style={{ fontSize:28,fontWeight:500,color,lineHeight:1 }}>{n}</div>
              <div style={{ fontSize:10,letterSpacing:"0.1em",color:D.textMuted,marginTop:4 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ padding:20,maxWidth:960,margin:"0 auto" }}>

          {/* ── #7 Analysis progress panel ── */}
          {(analyzing || (!analyzing && analyzeErr)) && (
            <AnalysisProgressPanel step={analyzeStep} fileName={analyzeFileName} error={analyzeErr} />
          )}

          {/* ── Re-analyze progress ── */}
          {reanalyzingEntry && (() => {
            const entry = lib.find(e => e.id === reanalyzingEntry);
            if (!entry) return null;
            return (
              <div style={{ marginBottom: 20, background: D.surface, border: `1.5px solid ${D.blueDark}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, animation: "slideIn .2s ease-out" }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid rgba(88,166,255,0.2)`, borderTopColor: D.blue, flexShrink: 0, animation: "spin .7s linear infinite" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: D.text }}>Re-analysing{entry.creative_id ? `: ${entry.creative_id}` : ""}</div>
                  <div style={{ fontSize: 11, color: D.textMuted, marginTop: 2 }}>{entry.title}</div>
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <button onClick={() => setLibPanelOpen(true)} style={{ ...btnSec, fontSize: 11 }}>View in library</button>
                </div>
              </div>
            );
          })()}

          {/* ── Analysis complete: full inline report ── */}
          {!analyzing && !analyzeErr && lastAnalyzedId && (() => {
            const entry = lib.find(e => e.id === lastAnalyzedId);
            if (!entry) return null;
            const accentColor = TIER_ACCENT[entry.tier] ?? D.border2;
            return (
              <div style={{ marginBottom: 20, border: `1.5px solid ${accentColor}`, borderRadius: 12, background: D.surface, overflow: "hidden", animation: "slideIn .25s ease-out" }}>
                {/* Header */}
                <div style={{ padding: "12px 16px", borderBottom: `0.5px solid ${D.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: accentColor }}>✓</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: D.text }}>Analysis complete</span>
                    <span style={pill(TIER_STYLE[entry.tier].bg, TIER_STYLE[entry.tier].text, TIER_STYLE[entry.tier].border)}>{entry.tier}</span>
                    {entry.ad_type !== "moc" && <span style={pill(D.purpleBg, D.purple, D.purpleBdr)}>{entry.ad_type}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => setLibPanelOpen(true)} style={{ ...btnSec, fontSize: 11, padding: "5px 12px" }}>Also in library</button>
                    <button onClick={() => setLastAnalyzedId(null)} style={{ background: "none", border: "none", color: D.textDim, cursor: "pointer", fontSize: 13, padding: "0 4px" }}>✕</button>
                  </div>
                </div>

                <div style={{ padding: "16px 16px 20px" }}>
                  {/* Title */}
                  <div style={{ fontSize: 16, fontWeight: 600, color: D.text, marginBottom: 12 }}>
                    {entry.creative_id ? <><span style={{ color: accentColor }}>{entry.creative_id}</span> — </> : ""}{entry.title}
                  </div>

                  {/* Key metrics */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6, marginBottom: 14 }}>
                    {[
                      {l:"Biome",v:entry.biome},
                      {l:"Hook type",v:entry.hook_type},
                      {l:"Hook at",v:entry.hook_timing_seconds!=null?`${entry.hook_timing_seconds}s`:"—"},
                      {l:"Pacing",v:entry.pacing},
                      {l:"Loss event",v:entry.loss_event_type},
                      {l:"Swarm peak",v:entry.swarm_peak_moment_seconds!=null?`${entry.swarm_peak_moment_seconds}s`:"—"},
                    ].map(({l,v})=>(
                      <div key={l} style={metricStyle}><div style={metricLabel}>{l}</div><div style={{ fontSize:11,fontWeight:500,color:D.text }}>{v??"—"}</div></div>
                    ))}
                  </div>

                  {/* Unit evolution chain */}
                  {entry.unit_evolution_chain?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={labelStyle}>Unit evolution chain</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, alignItems: "center" }}>
                        {entry.unit_evolution_chain.map((step, i) => (
                          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 11, padding: "2px 8px", background: D.blueBg, color: D.blue, borderRadius: 20, border: `0.5px solid ${D.blueDark}` }}>{step}</span>
                            {i < entry.unit_evolution_chain.length - 1 && <span style={{ color: D.textDim, fontSize: 10 }}>→</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Filmstrip — zoomable */}
                  {entry.auto_frames?.some(f => f.image_data) && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={labelStyle}>Extracted frames — click to zoom</span>
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                        {entry.auto_frames.filter(f => f.image_data).map((f, fi) => (
                          <div key={fi} style={{ flexShrink: 0, position: "relative" as const, cursor: "zoom-in" }} onClick={() => setZoomedFrame(`data:image/jpeg;base64,${f.image_data}`)}>
                            <img src={`data:image/jpeg;base64,${f.image_data}`} alt={`${f.timestamp_seconds}s`}
                              style={{ width: 80, height: 142, objectFit: "cover", borderRadius: 6, border: `0.5px solid ${D.border2}`, display: "block", transition: "transform .1s" }}
                              onMouseEnter={e => (e.currentTarget as HTMLImageElement).style.transform = "scale(1.05)"}
                              onMouseLeave={e => (e.currentTarget as HTMLImageElement).style.transform = ""} />
                            <div style={{ position: "absolute" as const, bottom: 4, left: 0, right: 0, textAlign: "center" as const }}>
                              <span style={{ fontSize: 9, background: "rgba(0,0,0,0.7)", color: "#fff", padding: "1px 5px", borderRadius: 3 }}>{f.timestamp_seconds}s</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Frame descriptions */}
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, marginTop: 6 }}>
                        {entry.auto_frames.map((f, fi) => (
                          <div key={fi} style={{ fontSize: 10, padding: "3px 8px", background: D.surface2, borderRadius: 4, display: "flex", gap: 8 }}>
                            <span style={{ fontWeight: 500, color: D.blue, minWidth: 28, flexShrink: 0 }}>{f.timestamp_seconds}s</span>
                            <span style={{ color: D.textMuted, flex: 1 }}>{f.description}</span>
                            {f.significance !== "filler" && <span style={{ fontSize: 9, color: D.textDim, flexShrink: 0 }}>{f.significance}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gate sequence */}
                  {entry.gate_sequence?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={labelStyle}>Gate sequence</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                        {entry.gate_sequence.map((g, i) => (
                          <span key={i} style={{ fontSize: 10, padding: "2px 7px", background: g.toLowerCase().includes("death") ? D.redBg : D.blueBg, color: g.toLowerCase().includes("death") ? D.red : D.blue, borderRadius: 20, border: `0.5px solid ${g.toLowerCase().includes("death") ? "#6e2020" : D.blueDark}` }}>{g}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Champions */}
                  {entry.champions_visible?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={labelStyle}>Champions</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                        {entry.champions_visible.map((c, i) => (
                          <span key={i} style={{ fontSize: 10, padding: "2px 7px", background: D.purpleBg, color: D.purple, borderRadius: 20, border: `0.5px solid ${D.purpleBdr}` }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Emotional beats */}
                  {entry.emotional_beats?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={labelStyle}>Emotional beats</span>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                        {entry.emotional_beats.map((b, i) => (
                          <div key={i} style={{ fontSize: 11, padding: "5px 8px", background: D.surface2, borderRadius: 6, display: "flex", gap: 8 }}>
                            <span style={{ fontWeight: 500, color: D.blue, minWidth: 28, flexShrink: 0 }}>{b.timestamp_seconds}s</span>
                            <span style={{ color: D.text, flex: 1 }}>{b.event}</span>
                            <span style={{ color: D.textDim, fontStyle: "italic", flexShrink: 0 }}>{b.emotion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Creative gaps */}
                  {entry.creative_gaps_structured && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={labelStyle}>Creative gaps</span>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                        {[{l:"Hook strength",v:entry.creative_gaps_structured.hook_strength},{l:"Mechanic clarity",v:entry.creative_gaps_structured.mechanic_clarity},{l:"Emotional payoff",v:entry.creative_gaps_structured.emotional_payoff}].map(({l,v})=>(
                          <div key={l} style={{ padding:"7px 9px",background:D.goldBg,borderRadius:7,border:`0.5px solid ${D.goldBdr}` }}>
                            <div style={{ fontSize:9,fontWeight:600,color:D.gold,textTransform:"uppercase" as const,letterSpacing:"0.07em",marginBottom:2 }}>{l}</div>
                            <p style={{ margin:0,fontSize:10,color:"#c9a227" }}>{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Why it works */}
                  {entry.why_it_works && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={labelStyle}>Why it works</span>
                      <p style={{ margin: 0, fontSize: 11, color: D.textMuted, lineHeight: 1.6 }}>{entry.why_it_works}</p>
                    </div>
                  )}

                  {/* Replication instructions */}
                  {entry.replication_instructions && (
                    <div>
                      <span style={labelStyle}>Replication instructions</span>
                      <p style={{ margin: 0, fontSize: 11, color: D.textMuted, lineHeight: 1.6 }}>{entry.replication_instructions}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20 }}>
            {[
              { key:"brief",icon:<svg width="20" height="20" viewBox="0 0 16 16" fill="#58a6ff"><path d="M2 2h9l3 3v9H2V2zm1 1v10h10V6.5L9.5 3H3z"/></svg>,iconBg:D.blueBg,badgeText:"Primary",badgeColor:D.blue,badgeBorder:D.blueDark,title:"Generate brief",desc:"Describe your idea. Levelly matches it to winning DNA patterns and generates a master brief with network adaptations.",active:briefPanelOpen,onClick:()=>{ setBriefPanelOpen(p=>!p); setAnalysePanelOpen(false); } },
              { key:"analyse",icon:<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="#3fb950" strokeWidth="1.5"/><line x1="9.5" y1="9.5" x2="14" y2="14" stroke="#3fb950" strokeWidth="1.5"/></svg>,iconBg:D.greenBg,badgeText:"Analysis",badgeColor:D.green,badgeBorder:D.greenBdr,title:"Analyse creative",desc:"Drop a video or paste a URL. Levelly extracts emotional beats, hook timing, gate patterns, and adds it to the DNA library.",active:analysePanelOpen,onClick:()=>{ setAnalysePanelOpen(p=>!p); setBriefPanelOpen(false); } },
            ].map(card=>(
              <div key={card.key} onClick={card.onClick}
                style={{ background:card.active?"#1a2130":D.surface,border:`0.5px solid ${card.active?card.badgeBorder:D.border2}`,borderRadius:12,padding:20,cursor:"pointer",transition:"border-color .18s,background .18s,transform .12s" }}
                onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.transform="translateY(-1px)"; (e.currentTarget as HTMLDivElement).style.borderColor=card.badgeBorder; }}
                onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.transform=""; (e.currentTarget as HTMLDivElement).style.borderColor=card.active?card.badgeBorder:D.border2; }}>
                <div style={{ width:36,height:36,borderRadius:9,background:card.iconBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14 }}>{card.icon}</div>
                <div style={{ marginBottom:10 }}><span style={{ fontSize:10,padding:"3px 10px",borderRadius:20,border:`1px solid ${card.badgeBorder}`,color:card.badgeColor }}>{card.badgeText}</span></div>
                <div style={{ fontSize:16,fontWeight:500,marginBottom:6 }}>{card.title}</div>
                <div style={{ fontSize:12,color:D.textMuted,lineHeight:1.6 }}>{card.desc}</div>
              </div>
            ))}
          </div>

          {briefPanelOpen&&(
            <div style={{ background:D.surface,border:`1.5px solid ${D.blueDark}`,borderRadius:10,overflow:"hidden",marginBottom:14,animation:"slideIn .2s ease-out" }}>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:`0.5px solid ${D.border}` }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,color:D.blue,fontSize:13,fontWeight:500 }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill={D.blue}><path d="M2 2h9l3 3v9H2V2zm1 1v10h10V6.5L9.5 3H3z"/></svg>Generate brief
                </div>
                <button onClick={()=>setBriefPanelOpen(false)} style={{ background:"none",border:"none",color:D.textMuted,cursor:"pointer",fontSize:11,padding:"2px 6px",borderRadius:4,fontFamily:"inherit" }}>✕ Close</button>
              </div>
              <div style={{ padding:"14px 16px 8px" }}>
                <div style={{ display:"flex",alignItems:"flex-start",gap:8 }}>
                  <textarea style={{ flex:1,boxSizing:"border-box",fontSize:14,padding:"9px 11px",background:"transparent",border:"none",minHeight:64,resize:"vertical",outline:"none",fontFamily:"inherit",color:D.text,lineHeight:1.6 } as React.CSSProperties}
                    placeholder="Describe your idea — biome, hook type, emotional arc, network target…" value={briefCtx} onChange={e=>setBriefCtx(e.target.value)} />
                  {briefCtx.trim().length>10&&<div style={{ paddingTop:4,flexShrink:0 }}><EnhanceButton text={briefCtx} onEnhanced={setBriefCtx} mode="brief" /></div>}
                </div>
              </div>
              {/* ── #8 Reference + iterate from (merged) ── */}
              <div style={{ padding:"0 16px 8px" }}>
                <ReferenceDropZone onRef={setBriefRef} currentRef={briefRef} onClear={() => setBriefRef(null)} iterateFrom={iterateFrom} onIterateFrom={setIterateFrom} />
              </div>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderTop:`0.5px solid ${D.border}`,flexWrap:"wrap" as const,gap:8 }}>
                <div style={{ display:"flex",gap:6,flexWrap:"wrap" as const }}>
                  {SEGMENTS_LIST.map(seg=><button key={seg} onClick={()=>setSegment(seg)} style={chipStyle(segment===seg)}>{seg}</button>)}
                </div>
                <button onClick={handleGenerateBrief} disabled={generating} style={{ ...btnPri,display:"flex",alignItems:"center",gap:6,opacity:generating?.7:1 }}>
                  {generating?<><span style={{ width:10,height:10,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",display:"inline-block",animation:"spin .6s linear infinite" }} />Generating…</>:"Generate concepts ↗"}
                </button>
              </div>
              {briefErr&&<div style={{ fontSize:11,color:D.red,background:D.redBg,border:`0.5px solid #6e2020`,borderRadius:7,padding:"7px 12px",margin:"0 16px 12px" }}>{briefErr}</div>}
            </div>
          )}

          {analysePanelOpen&&(
            <div style={{ background:D.surface,border:`1.5px solid ${D.greenBdr}`,borderRadius:10,padding:"20px",marginBottom:14,animation:"slideIn .2s ease-out" }}>
              <p style={{ margin:0,fontSize:13,color:D.textMuted }}>Drop a video file or paste a URL to analyse it and add it to the DNA library.</p>
              <div style={{ display:"flex",gap:8,marginTop:12 }}>
                <button style={btnPri} onClick={()=>{ setAnalysePanelOpen(false); setShowModal(true); }}>+ Upload video</button>
                <button style={btnSec} onClick={()=>setAnalysePanelOpen(false)}>Cancel</button>
              </div>
            </div>
          )}

          {briefAnalysis&&(
            <div style={{ background:D.surface2,border:`0.5px solid ${D.border2}`,borderRadius:10,padding:"14px 16px",marginBottom:14 }}>
              <span style={labelStyle}>Creative strategy</span>
              <p style={{ margin:"0 0 12px",fontSize:12,lineHeight:1.7,color:D.text }}>{briefAnalysis.strategy}</p>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                <div><span style={labelStyle}>DNA sources used</span><p style={{ margin:0,fontSize:11,color:D.textMuted }}>{briefAnalysis.dna_sources?.join(", ")||briefAnalysis.patterns_used}</p></div>
                <div><span style={labelStyle}>Segment insight</span><p style={{ margin:0,fontSize:11,color:D.textMuted }}>{briefAnalysis.segment_insight}</p></div>
              </div>
            </div>
          )}

          {concepts.map((c,ci)=>(
            <div key={ci} style={{ background:expandedConcept===ci?"#161f2e":D.surface,border:`0.5px solid ${(c as any).is_experimental?"#9d174d":D.border}`,borderRadius:10,padding:0,marginBottom:10,overflow:"hidden",transition:"background .15s,box-shadow .15s",boxShadow:expandedConcept===ci?`0 0 0 2px ${D.blueBg}`:"none",borderLeft:`3px solid ${expandedConcept===ci?D.blue:"transparent"}` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",cursor:"pointer",padding:"14px 16px" }} onClick={()=>setExpandedConcept(expandedConcept===ci?null:ci)}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap" as const }}>
                    <span style={{ fontSize:9,fontWeight:700,color:D.textDim,letterSpacing:"0.1em" }}>CONCEPT {ci+1}</span>
                    {c.is_data_backed&&<span style={pill(D.goldBg,D.gold,D.goldBdr)}>Data-backed</span>}
                    {c.is_experimental&&<span style={pill("#2a1a2e","#f472b6","#9d174d")}>⚠ Experimental</span>}
                    {(c as any).dna_source&&<span style={pill(D.greenBg,D.green,D.greenBdr)}>DNA: {(c as any).dna_source}</span>}
                    {iterateFrom.trim()&&<span style={pill(D.purpleBg,D.purple,D.purpleBdr)}>iterates {iterateFrom.trim()}</span>}
                    <span style={pill(TIER_STYLE["scalable"].bg,TIER_STYLE["scalable"].text,TIER_STYLE["scalable"].border)}>{c.target_segment}</span>
                  </div>
                  <div style={{ fontSize:15,fontWeight:600,color:expandedConcept===ci?D.text:D.textMuted,marginBottom:4,transition:"color .15s" }}>{c.title}</div>
                  {c.is_experimental&&c.experimental_note&&<p style={{ margin:"0 0 4px",fontSize:11,color:"#f472b6",fontStyle:"italic" }}>{c.experimental_note}</p>}
                  <p style={{ margin:0,fontSize:12,color:D.textMuted,lineHeight:1.5 }}>{c.objective}</p>
                </div>
                <div style={{ display:"flex",flexDirection:"column" as const,alignItems:"flex-end",gap:4,marginLeft:16,flexShrink:0 }}>
                  {c.quality_score&&<><div style={{ fontSize:24,fontWeight:600,color:scoreColor(c.quality_score.overall),lineHeight:1 }}>{c.quality_score.overall}</div><div style={{ fontSize:9,color:D.textDim }}>quality</div></>}
                  <div style={{ fontSize:9,color:expandedConcept===ci?D.blue:D.textDim,marginTop:4 }}>{expandedConcept===ci?"▲":"▼"}</div>
                </div>
              </div>
              {expandedConcept===ci&&(
                <div style={{ padding:"0 16px 16px",borderTop:`0.5px solid ${D.border}`,paddingTop:16 }}>
                  {(c as any).hook_timing_seconds!=null&&<div style={{ marginBottom:12,padding:"8px 12px",background:D.blueBg,borderRadius:8,fontSize:11,color:D.blue,border:`0.5px solid ${D.blueDark}` }}>Hook at <strong>{(c as any).hook_timing_seconds}s</strong> — {c.performance_hooks?.[0]?.type||"Challenge"}</div>}
                  {(c as any).unit_evolution_chain?.length>0&&(
                    <div style={{ marginBottom:14 }}>
                      <span style={labelStyle}>Unit evolution chain</span>
                      <div style={{ display:"flex",gap:4,flexWrap:"wrap" as const,alignItems:"center" }}>
                        {(c as any).unit_evolution_chain.map((step: string,i: number)=>(
                          <span key={i} style={{ display:"flex",alignItems:"center",gap:4 }}>
                            <span style={{ fontSize:11,padding:"2px 8px",background:D.blueBg,color:D.blue,borderRadius:20,border:`0.5px solid ${D.blueDark}` }}>{step}</span>
                            {i<(c as any).unit_evolution_chain.length-1&&<span style={{ color:D.textDim }}>→</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.visual_identity&&(
                    <div style={{ marginBottom:14 }}>
                      <span style={labelStyle}>Visual identity</span>
                      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:7 }}>
                        {[{l:"Environment",v:c.visual_identity.environment},{l:"Lighting",v:c.visual_identity.lighting},{l:"Cannon",v:c.visual_identity.cannon_type},{l:"Player",v:`${c.visual_identity.player_champion} (${c.visual_identity.player_mob_color})`},{l:"Enemy",v:`${c.visual_identity.enemy_champion} (${c.visual_identity.enemy_mob_color})`},{l:"Gates",v:c.visual_identity.gate_values?.join(", ")}].map(({l,v})=>(
                          <div key={l} style={metricStyle}><div style={metricLabel}>{l}</div><div style={{ fontSize:11,fontWeight:500,color:D.text }}>{v??"—"}</div></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.network_adaptations&&Object.keys(c.network_adaptations).length>0&&(
                    <div style={{ marginBottom:14 }}>
                      <span style={{ ...labelStyle,marginBottom:8 }}>Network adaptations</span>
                      <div style={{ display:"flex",flexDirection:"column" as const,gap:6 }}>
                        {(["AppLovin","Facebook","Google","TikTok"] as const).filter(net=>c.network_adaptations?.[net]).map(net=>{
                          const nc={AppLovin:{bg:D.blueBg,text:D.blue,border:D.blueDark},Facebook:{bg:D.surface2,text:D.textMuted,border:D.border2},Google:{bg:D.greenBg,text:D.green,border:D.greenBdr},TikTok:{bg:D.purpleBg,text:D.purple,border:D.purpleBdr}}[net];
                          return <div key={net} style={{ display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.5 }}><span style={{ padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:500,flexShrink:0,marginTop:1,background:nc.bg,color:nc.text,border:`0.5px solid ${nc.border}` }}>{net}</span><span style={{ color:D.textMuted }}>{c.network_adaptations![net]}</span></div>;
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{ marginBottom:14 }}>
                    <span style={labelStyle}>Scene renders</span>
                    {c.is_experimental&&<div style={{ marginBottom:8,padding:"7px 12px",background:"#2a1a2e",border:"0.5px solid #9d174d",borderRadius:7,fontSize:11,color:"#f472b6" }}>⚠ Experimental biome — no spend data. Use for inspiration only.</div>}
                    {!c.is_experimental&&PROVEN_BIOMES.includes(c.visual_identity?.environment)&&<div style={{ marginBottom:8,padding:"7px 12px",background:D.greenBg,border:`0.5px solid ${D.greenBdr}`,borderRadius:7,fontSize:11,color:D.green }}>Render Hook first — then Start → Middle → End for continuity.</div>}
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8 }}>
                      {(["hook","start","middle","end"] as const).map(scene=>{
                        const imgUrl=c[`visual_${scene}` as keyof Concept] as string|undefined;
                        const loading=renderingScene[`${ci}-${scene}`];
                        const isHook=scene==="hook";
                        const needsHook=(scene==="start"||scene==="middle"||scene==="end")&&!c.visual_hook;
                        const isNext=(scene==="hook"&&!c.visual_hook)||(scene==="start"&&!!c.visual_hook&&!c.visual_start)||(scene==="middle"&&!!c.visual_start&&!c.visual_middle)||(scene==="end"&&!!c.visual_middle&&!c.visual_end);
                        const sceneColor={hook:D.red,start:D.blue,middle:D.gold,end:D.green}[scene];
                        const borderColor=isNext?sceneColor:D.border;
                        const borderWidth=isNext?"1.5px":"0.5px";
                        const sceneLabel={hook:"Hook",start:"Start",middle:"Middle",end:"End"}[scene];
                        return (
                          <div key={scene} style={{ aspectRatio:"9/16",background:D.surface2,borderRadius:10,border:`${borderWidth} solid ${borderColor}`,overflow:"hidden",display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",cursor:needsHook?"not-allowed":"pointer",position:"relative" as const,transition:"border-color .2s" }}
                            onClick={()=>!imgUrl&&!loading&&!needsHook&&handleRenderScene(ci,scene)}>
                            {isNext&&!imgUrl&&<div style={{ position:"absolute" as const,top:6,left:0,right:0,display:"flex",justifyContent:"center" }}>
                              <span style={{ fontSize:9,padding:"2px 7px",background:sceneColor,color:"#fff",borderRadius:20,fontWeight:600,letterSpacing:"0.05em" }}>{isHook?"START HERE":"RENDER NEXT"}</span>
                            </div>}
                            {imgUrl?<img src={imgUrl} alt={scene} style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                              :loading?<p style={{ margin:0,fontSize:11,fontWeight:500,color:D.textMuted }}>Rendering…</p>
                              :needsHook?<div style={{ textAlign:"center" as const,padding:10 }}><p style={{ margin:0,fontSize:10,color:D.textDim,textTransform:"uppercase" as const }}>{sceneLabel}</p><p style={{ margin:"4px 0 0",fontSize:9,color:D.textDim }}>Render Hook first</p></div>
                              :<div style={{ textAlign:"center" as const,padding:10,marginTop:isNext?18:0 }}><p style={{ margin:0,fontSize:11,fontWeight:500,textTransform:"uppercase" as const,color:isNext?sceneColor:D.textDim }}>{sceneLabel}</p><p style={{ margin:"4px 0 0",fontSize:9,color:isNext?sceneColor:D.textDim }}>{isNext?"Render next":"Click to render"}</p></div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {c.production_script?.length>0&&(
                    <div style={{ marginBottom:14 }}>
                      <span style={labelStyle}>Production script</span>
                      <div style={{ border:`0.5px solid ${D.border}`,borderRadius:8,overflow:"hidden" }}>
                        <div style={{ display:"grid",gridTemplateColumns:"60px 1fr 1fr 1fr",padding:"6px 12px",background:D.surface2,borderBottom:`0.5px solid ${D.border}` }}>
                          {["Time","Action","Visual","Audio"].map(h=><span key={h} style={{ fontSize:9,fontWeight:600,color:D.textDim,textTransform:"uppercase" as const,letterSpacing:"0.07em" }}>{h}</span>)}
                        </div>
                        {c.production_script.map((step,si)=>(
                          <div key={si} style={{ display:"grid",gridTemplateColumns:"60px 1fr 1fr 1fr",padding:"8px 12px",borderBottom:si<c.production_script.length-1?`0.5px solid ${D.border}`:"none",background:si%2===0?D.surface:D.surface2 }}>
                            <span style={{ fontSize:11,fontWeight:500,color:D.blue }}>{step.time}</span>
                            <span style={{ fontSize:11,paddingRight:8,lineHeight:1.4,color:D.text }}>{step.action}</span>
                            <span style={{ fontSize:11,color:D.textMuted,paddingRight:8,lineHeight:1.4,fontStyle:"italic" }}>{step.visual_cue}</span>
                            <span style={{ fontSize:11,color:D.textDim,lineHeight:1.4 }}>{step.audio_cue}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.performance_hooks?.length>0&&(
                    <div style={{ marginBottom:14 }}>
                      <span style={labelStyle}>Performance hooks</span>
                      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:10 }}>
                        {c.performance_hooks.map((h,hi)=>(
                          <div key={hi} style={{ background:D.surface,border:`0.5px solid ${D.border}`,borderRadius:10,padding:"10px 14px" }}>
                            <span style={{ fontSize:9,fontWeight:600,padding:"2px 7px",borderRadius:20,background:hi===0?D.goldBg:hi===1?D.greenBg:D.blueBg,color:hi===0?D.gold:hi===1?D.green:D.blue,display:"inline-block",marginBottom:6 }}>{h.type}</span>
                            <p style={{ margin:0,fontSize:12,fontStyle:"italic",color:D.textMuted }}>"{h.text}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.quality_score&&(
                    <div>
                      <span style={labelStyle}>Quality score</span>
                      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:8,marginBottom:8 }}>
                        {[{l:"Pattern fidelity",v:c.quality_score.pattern_fidelity},{l:"MOC DNA",v:c.quality_score.moc_dna},{l:"Emotional arc",v:c.quality_score.emotional_arc},{l:"Visual clarity",v:c.quality_score.visual_clarity},{l:"Segment fit",v:c.quality_score.segment_fit}].map(({l,v})=>(
                          <div key={l} style={metricStyle}><div style={metricLabel}>{l}</div><div style={{ fontSize:18,fontWeight:500,color:scoreColor(v) }}>{v}</div></div>
                        ))}
                      </div>
                      {c.quality_score.notes&&<p style={{ margin:0,fontSize:11,color:D.textMuted,fontStyle:"italic" }}>{c.quality_score.notes}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        select option { background: #161b22; color: #e6edf3; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
      `}</style>
    </div>
  );
}
