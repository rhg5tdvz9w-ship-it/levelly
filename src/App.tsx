import React, { useState, useRef, useCallback, useEffect } from "react";
import { buildReferenceContext, buildReferenceParts, MOC_REFERENCES } from "./refImages";

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmotionalBeat { timestamp_seconds: number; event: string; emotion: string; }
interface DNASegment {
  segment_index: number; biome: string; biome_visual_notes: string;
  start_seconds: number; end_seconds: number; hook_type: string;
  hook_timing_seconds: number; hook_description: string; gate_sequence: string[];
  swarm_peak_moment_seconds: number | null; loss_event_type: string;
  loss_event_timing_seconds: number | null; unit_evolution_chain: string[]; giant_kills?: Array<{timestamp_seconds: number; giant_name: string; note: string}>;
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
  hook_description?: string;
  unit_evolution_chain?: string[];
  cannon_count_progression?: string;
  lane_design?: string;
  upgrade_triggers?: string[];
  tension_moments?: string[];
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
const SEGMENTS_LIST = ["Whale", "Dolphin"];
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
const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_KEY}`;

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
  const body = JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: contentParts }], generationConfig: { response_mime_type: "application/json" } });
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      const r = await fetch(GEMINI_TEXT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctrl.signal });
      clearTimeout(timer);
      const text = await r.text();
      if (!r.ok) {
        if (attempt < 2 && (r.status === 503 || r.status === 429 || r.status === 500)) { await new Promise(res => setTimeout(res, 3000 * (attempt + 1))); continue; }
        throw new Error(`Gemini ${r.status}: ${text.slice(0, 300)}`);
      }
      const data = JSON.parse(text);
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      return parseJSON(raw);
    } catch (e: any) {
      clearTimeout(timer);
      if (e.name === "AbortError") throw new Error("Analysis timed out — video may be too large. Try a shorter clip.");
      if (attempt === 2) throw e;
      await new Promise(res => setTimeout(res, 3000));
    }
  }
  throw new Error("Gemini call failed after 3 attempts");
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

// Ensure all array fields on a raw DNA response are actually arrays — prevents "e is not iterable"
function sanitizeDNA(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  const ARRAY_FIELDS = ["emotional_beats","gate_sequence","unit_evolution_chain","champions_visible","auto_frames","manual_frames","spend_networks","segments","production_script","performance_hooks","upgrade_triggers","tension_moments","frame_emotions","giant_kills"];
  const out = { ...raw };
  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(out[field])) out[field] = out[field] ? [out[field]] : [];
  }
  // Also sanitize array fields inside each segment
  if (Array.isArray(out.segments)) {
    out.segments = out.segments.map((seg: any) => {
      if (!seg || typeof seg !== "object") return seg;
      const s = { ...seg };
      for (const f of ["gate_sequence","unit_evolution_chain","champions_visible","emotional_beats"]) {
        if (!Array.isArray(s[f])) s[f] = s[f] ? [s[f]] : [];
      }
      return s;
    });
  }
  return out;
}

function parseDataURI(uri: string): { mimeType: string; data: string } {
  const m = uri.match(/^data:([^;]+);base64,(.+)$/s);
  return m ? { mimeType: m[1], data: m[2] } : { mimeType: "image/png", data: uri };
}

async function callImageDirect(prompt: string, refParts: any[]): Promise<string> {
  const body = JSON.stringify({ contents: [{ parts: [...refParts, { text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "9:16" } } });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(GEMINI_IMAGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const text = await r.text();
      if (!r.ok) { if (attempt === 0 && (r.status === 503 || r.status === 429)) { await new Promise(res => setTimeout(res, 3000)); continue; } throw new Error(`Image gen ${r.status}: ${text.slice(0, 500)}`); }
      const data = JSON.parse(text);
      const imgPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (!imgPart) { if (attempt === 0) { await new Promise(res => setTimeout(res, 2000)); continue; } throw new Error("No image returned — model did not generate an image"); }
      return `data:${imgPart.inlineData.mimeType || "image/png"};base64,${imgPart.inlineData.data}`;
    } catch (e: any) { if (attempt === 1) throw e; await new Promise(res => setTimeout(res, 2000)); }
  }
  throw new Error("Render failed after 2 attempts");
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
function pickRelevantRefs(vi: VisualIdentity, unitAtScene?: string): any[] {
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

  const biomeRef = populated.find(r => r.category === "biome" && r.label.toLowerCase().includes(biomeKeyword));
  if (biomeRef) selected.push(biomeRef);

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

  // 3. Gate refs — always include to show correct colours and style
  const gateRef = populated.find(r => r.key === "x_gates_purple");
  const plusGateRef = populated.find(r => r.key === "plus_gates_blue");
  if (gateRef && !selected.includes(gateRef)) selected.push(gateRef);
  if (plusGateRef && !selected.includes(plusGateRef) && selected.length < 5) selected.push(plusGateRef);

  const parts: any[] = [{ text: "### MOC VISUAL REFERENCES — match this exact art style, road layout, gate style, and game aesthetic:" }];
  selected.forEach(ref => {
    parts.push({ text: `[${ref.category.toUpperCase()}]: ${ref.label}` });
    parts.push({ inlineData: { mimeType: (ref as any).mimeType || "image/png", data: ref.base64 } });
  });
  return parts;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
const BIOME_GUIDE = `BIOMES: Foggy Forest(grey/white atmospheric fog,dark pines,grey road—NOT snow), Desert(tan sand,blue sky), Water(grey bridge over blue water), Bunker(grey concrete tunnel,pipes,industrial), Cyber-City(grey metal,orange/blue neon), Volcanic(red/orange lava,black rocks), Snow(white snow ground), Toxic(purple paths,green slime), Meadow(green hills,grey brick bridge)`;
const CHAMPION_GUIDE = `CHAMPIONS (ONLY these exist in Mob Control): Captain Kaboom(blue round mob, green hat with yellow brim, fires 3 golden streams), Gold Golem(LARGE golden muscular humanoid), Caveman(blue-skin muscular humanoid, blonde hair, club), Mobzilla(green dinosaur/T-Rex, pink spines, red mouth, cartoonish), Nexus(blue/white/orange mech, orange sword), Red Hulk(large red humanoid), Kraken(red octopus), Femme Zombie(crawling female zombie boss), Yellow Normie(large yellow/red round creature — BOSS ENEMY with HP bar), Unknown(generic enemy tower). Enemy tower = red/grey fortified block structure with HP number. NEVER invent champion appearances. If a champion name is not on this list, draw Unknown/generic tower.`;
const MOC_EVENTS_GUIDE = `MOC-SPECIFIC EVENTS TO HUNT FOR (timestamp ALL of these if present):
- CONTAINER DESTRUCTION: The MOB SWARM destroys a breakable container/obstacle. Report it with HP number visible. CRITICAL — containers have two types:
  * UPGRADE CONTAINER: Has a cannon/unit icon visible ON TOP of the container. Destroying this one upgrades the cannon tier. Use: "Upgrade container (HP:20, cannon icon) destroyed — cannon upgrades from Simple to Double Cannon"
  * EMPTY CONTAINER: Has NO icon on top — just a health number. Destroying this does NOT upgrade the cannon. Use: "Empty container (HP:184) destroyed — no upgrade"
  * If you cannot see whether there is an icon, look at what happens to the cannon IMMEDIATELY after destruction. If the cannon visually changes shape/size, it was an upgrade container. If the cannon looks the same, it was empty.
  * NEVER assume every container = upgrade. Most containers in a video are empty health obstacles.
- GIANT/BOSS DEATH: Large enemy giant or boss character defeated. ALWAYS timestamp — key emotional payoff. REQUIRED: every boss death MUST appear in the giant_kills array with timestamp, name (e.g. "Yellow Normie", "Red Giant"), and a note on how it died (e.g. "overwhelmed by mob swarm at swarm peak").
- X GATE PASS: The MOB SWARM passes through a multiplication gate (xN). Report gate value and timestamp for EACH pass.
- + GATE PASS: The MOB SWARM passes through an addition gate (+N), which adds more cannons to the firing lineup (not more mobs). Report gate value and timestamp.
- ALMOST-FAIL MOMENT: Player mob count drops to dangerously low level (near wipeout) but survives.
- SWARM PEAK: Maximum mob count on screen.
- FINAL FAIL/DEFEAT: Last mob destroyed, FAILED screen appears.
- GREEN PIPE: Shortcut tunnel that sends mobs directly to the enemy tower or boss area — skipping part of the level.
- RED BLOCK: Red pushable/breakable obstacle that physically blocks access to valuable elements (gates, upgrades). Player must smash through it.
- CHAMPION RELEASE: Sniper cannon charging bar fills up and releases a champion unit onto the field.

CANNON UPGRADE TIERS (exact names):
1. Simple Cannon — single blue barrel, 4 black wheels, compact round body
2. Double Cannon — two blue barrels side-by-side, slightly wider
3. Triple Cannon — three blue barrels, wider body, brown/orange roller wheels
4. Tank — blue military tank, rotating turret/radar dish, tracked treads, yellow-green accent
5. Golden Jet — gold aircraft (airplane), used as aspirational eye-catcher only, shown on platform
6. (Other evolutions may exist — describe what you see)

When you see an upgrade: "Cannon upgrades from [previous tier] to [new tier]" using exact names above.
CRITICAL: Hunt for EVERY container/obstacle on screen — missing one means a wrong evolution chain.
CANNON MULTIPLICATION IS NOT AN UPGRADE: +N gates increase cannon COUNT (how many fire) — the cannon MODEL stays the same. Only container destruction changes Simple→Double→Triple→Tank.
EVIDENCE RULE: For each unit_evolution_chain step, report what triggered it in the description field (e.g. "Blue container HP:20 destroyed" or "red barrel destroyed" or "unknown trigger at 7s — cannon visually changed"). If you can see a container HP number, always include it. If you cannot identify the trigger, describe what you observe visually rather than inventing one.
TIER COUNT RULE: Count the number of UPGRADE CONTAINERS (those with a cannon icon) you saw destroyed. That count equals the number of entries to add to unit_evolution_chain AFTER the starting cannon. Example: started as Simple Cannon, saw 1 upgrade container destroyed → chain is [Simple Cannon, Double Cannon]. Saw 2 upgrade containers → [Simple Cannon, Double Cannon, Triple Cannon]. Do NOT add tiers you did not see upgrade containers for. Trust your container icon count over logical sequence.`;

const GATE_GUIDE = `GATES — CRITICAL: passing through ANY gate NEVER upgrades the cannon model. Gates only affect mob COUNT.
- Multiplication gate (x value, e.g. x3): multiplies the NUMBER OF MOBS in the lane. x3 = triple the mobs. ONLY this changes mob count.
- Addition gate (+ value, e.g. +3): when the mob swarm passes through, it adds +N more CANNONS to the firing lineup (the cannon count grows). Does NOT multiply mobs. Does NOT change the cannon MODEL/TIER.
- Death gate (RED rect + SKULL): instantly kills ALL mobs in the swarm.
- Dynamic gate: activates when nearby structures are broken.

CANNON UPGRADE RULE — ABSOLUTE: The cannon model (Simple/Double/Triple/Tank) ONLY changes when the MOB SWARM physically DESTROYS a breakable obstacle/container on the road. This is a separate event from any gate pass. NEVER write "cannon upgrades after passing a gate". If you see a cannon change and a gate in the same second, the upgrade came from a container that was also destroyed at that moment, NOT from the gate.
Report EVERY gate with its exact value. If unclear: "x?" or "+?".
cannon_count_log: track cannon count as a running string showing only +N gate changes: "1 cannon start → +2 gate at 3s: 3 cannons → +3 gate at 8s: 6 cannons". x-gates do NOT appear here (they affect mobs, not cannons).`;
const HOOK_GUIDE = `HOOK: EXACT SECOND thumb stops scrolling. NEVER 0 unless frame-0 drama. hook_timing_seconds=REAL SECOND (2,4,8) NEVER fraction.`;
const TIMESTAMP_RULES = `TIMESTAMPS: Real seconds only (0,2,5,8,14,22). NEVER fractions (0.03,0.28). 30s video midpoint=15.`;

const frameExtractionSystem = () => `Precise video timestamp analyst for Mob Control ads. Extract key moments.

RULES:
1. MUST timestamp these MOC events if present: container destructions, unit evolutions, giant/boss deaths, every x-gate pass (with value), almost-fail moments, swarm peak, final defeat
2. VERIFICATION RULE: For each event you report, confirm you can see it in the frame image. Trust the extracted frame images above all else.
   - For cannon upgrades specifically: look for a frame where the cannon VISUALLY CHANGES shape. If no frame shows a cannon shape change, do not add that tier to unit_evolution_chain.
   - For container destructions: look for a cannon/unit icon ON TOP of the container before it's destroyed. No icon = empty container = no upgrade.
2. Fill gaps larger than 8 seconds with a filler timestamp
3. Total timestamps: between 10 and 14. Never more than 14.
4. ${TIMESTAMP_RULES}
5. No two timestamps closer than 2 seconds apart
6. ONLY report what you can clearly see. If ambiguous, skip — do not guess.

${MOC_EVENTS_GUIDE}

Return ONLY JSON: {"duration_seconds":number,"frames":[{"timestamp_seconds":number,"description":string,"significance":"hook|gate|upgrade|boss_death|container|swarm|almost_fail|loss|win|fail|transition|filler"}]}`;
const hookDetectionSystem = () => `Expert mobile ad hook analyst.\n${HOOK_GUIDE}\n${TIMESTAMP_RULES}\nReturn ONLY JSON: {"hook_timing_seconds":number,"hook_type":"Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial","hook_description":string}`;
const analyzeSystem = (lib: DNAEntry[], config: UploadConfig, frames: FrameExtraction[], duration: number, hasFrameImages: boolean, hasRefs: boolean) =>
  `${config.context ? `GROUND TRUTH — USER-PROVIDED FACTS (HIGHEST PRIORITY — override anything you think you see in the video if it contradicts this):
${config.context}
These facts are from the person who made or knows this creative. Trust them completely. Match your unit_evolution_chain, giant_kills, and gate_sequence to what is described here.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

` : ""}World-Class Creative Intelligence Analyst for Mob Control ads. NEVER guess.
ANALYSIS APPROACH:
Your PRIMARY source of truth is the EXTRACTED FRAME IMAGES provided above. These are actual screenshots at specific timestamps. For every event you report, you must be able to point to which frame shows it.
DO NOT use temporal reasoning to invent events between frames. If something happened but is not visible in any extracted frame, report it only if it is explicitly mentioned in the CONTEXT field above.
DISCIPLINE: When in doubt about an upgrade, gate value, or giant kill — omit it rather than guess. Under-reporting is better than hallucinating.
AD TYPE:${config.ad_type} TIER:${config.tier}
DURATION:${duration}s
LIBRARY:${lib.length>0?JSON.stringify(lib.map(d=>({title:d.title,tier:d.tier,hook_type:d.hook_type,hook_timing_seconds:d.hook_timing_seconds}))):"empty"}
${hasRefs?buildReferenceContext():""}
${!hasFrameImages?`TIMESTAMP MAP (Gemini frame observations — use only if no frame images above):
${frames.length>0?frames.map(f=>`[${f.timestamp_seconds}s] ${f.description} (${f.significance})`).join("\n"):"none"}`:"EXTRACTED FRAME IMAGES provided above — use these as your primary visual evidence. Do NOT copy their sequence as emotional beats."}
${TIMESTAMP_RULES}
${HOOK_GUIDE}
${GATE_GUIDE}
${MOC_EVENTS_GUIDE}
${BIOME_GUIDE}
${CHAMPION_GUIDE}
UNIT EVOLUTION CHAIN: Look through the extracted frame images and count how many frames show a cannon WITH A UNIT ICON on a container (= upgrade container). That count = number of upgrades. Add one tier to the chain per upgrade. NEVER add Tank or Golden Jet unless you see a 4th/5th upgrade container icon in the frames. Most ads: 1-2 upgrades. Default to fewer if unsure. CROSS-CHECK: the cannon in later frames should visually look different (more barrels) than earlier frames — use this to validate your upgrade count. Exact tier names: Simple Cannon → Double Cannon → Triple Cannon → Tank.
FRAME EMOTIONS: For each extracted frame timestamp, assign one emotion word for the player's feeling at that moment (Anticipation, Excitement, Satisfaction, Empowerment, Tension, Almost Fail, Dread, Defeat, Triumph). Return as frame_emotions array using the same timestamps as your auto_frames entries.
${config.ad_type==="compound"?"COMPOUND: is_compound:true, segments array required.":""}
Return ONLY JSON:{"title":string,"is_compound":boolean,"transition_type":string|null,"segments":[]|null,"hook_type":"Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial","hook_timing_seconds":number,"hook_description":string,"gate_sequence":[string],"swarm_peak_moment_seconds":number|null,"loss_event_type":"Wrong Gate|Boss Overwhelm|Timer|Death Gate|Enemy Overwhelm|None","loss_event_timing_seconds":number|null,"unit_evolution_chain":[string],"cannon_count_log":string,"emotional_arc":string,"frame_emotions":[{"timestamp_seconds":number,"emotion":string}],"biome":"Desert|Cyber-City|Forest|Volcanic|Snow|Toxic|Water|Bunker|Meadow|Unknown","biome_visual_notes":string,"champions_visible":[string],"giant_kills":[{"timestamp_seconds":number,"giant_name":string,"note":string}],"pacing":"Fast|Medium|Slow","key_mechanic":string,"why_it_works":string,"why_it_fails":string|null,"creative_gaps":string,"creative_gaps_structured":{"hook_strength":string,"mechanic_clarity":string,"emotional_payoff":string},"frame_extraction_gaps":string,"strategic_notes":string,"replication_instructions":string}`;
// Field groups for surgical refinement — each group maps to specific concept fields
const REFINE_FIELD_GROUPS = {
  visual: ["visual_identity","biome_visual_notes"],
  evolution: ["unit_evolution_chain","cannon_count_progression","upgrade_triggers"],
  hook: ["hook_description","hook_timing_seconds","engagement_hooks"],
  lane: ["lane_design"],
  tension: ["tension_moments"],
  strategy: ["objective","title"],
} as const;

const refinementSystem = (fields: Partial<Concept>, userPrompt: string, fieldNames: string[]) =>
  `You are surgically editing specific fields of a Mob Control ad brief.

FIELDS TO MODIFY (ONLY THESE — return ONLY these fields in your JSON response):
${JSON.stringify(fields, null, 2)}

USER REQUEST: ${userPrompt}

RULES:
- Return a JSON object containing ONLY the fields listed above. No other fields.
- Apply the user's request precisely to these fields only.
- For visual_identity: only change the specific sub-field mentioned (e.g. environment only, not lighting or mob colors).
- For unit_evolution_chain: use exact tier names — Simple Cannon, Double Cannon, Triple Cannon, Tank. Also update upgrade_triggers to match.
- Be conservative — if unsure whether a sub-field should change, leave it as-is.
- Return ONLY valid JSON. No explanation. No markdown.`;

const reanalysisSystem = (entry: DNAEntry) =>
  `Re-analyze Mob Control ad. Fix errors.\nEXISTING:${JSON.stringify(entry,null,2)}\nFIX:1.hook_timing fractions→real seconds 2.timestamps→real 3.gate type confusion (+ gates = cannon firing count, x gates = mob multiplier) 4.unit_evolution_chain — count only UPGRADE CONTAINERS (with cannon icon on top) that were destroyed. REMOVE any tier beyond what upgrade containers justify. Most ads: 1-2 upgrades. Only add Tank/Golden Jet if 3rd/4th upgrade container was explicitly seen. Trust extracted frames to count upgrades. 5.frame_emotions — one emotion per timestamp 6.giant_kills — add any missed boss/giant deaths as [{timestamp_seconds, giant_name, note}] 7.creative_gaps_structured 7.compound segments\n${TIMESTAMP_RULES}\n${HOOK_GUIDE}\n${GATE_GUIDE}\n${MOC_EVENTS_GUIDE}\n${BIOME_GUIDE}\n${CHAMPION_GUIDE}\nReturn CORRECTED full JSON with all original fields.`;

const briefSystem = (lib: any[], ctx: string, seg: string, iterateFrom?: string, refNote?: string) => {
  const refBlock = iterateFrom ? `\nITERATE FROM: "${iterateFrom}" — creative starting point.\n` : "";
  const visualRefBlock = refNote ? `\nVISUAL REF: ${refNote}. Inspiration only — DNA is primary.\n` : "";
  return `MOC Lead Creative Producer. Ground concepts in proven spend data.

DNA LIBRARY (${lib.length} winners):
${JSON.stringify(lib, null, 2)}

BRIEF: ${ctx} | SEGMENT: ${seg}
AUDIENCE PROFILE:
${seg==="Whale"?"Whale: Age 45-59 (68%), male, USA. Completionist mindset — #1 motivation is unlocking all elements. Opens game to RELAX (46%). 217 avg active days. Almost-win hook = incompleteness anxiety (so close to unlocking), not competitive pressure.":"Dolphin: Age 35-44, male, USA. Mix of completionist + competitive. 170 avg active days. Responds to clear progression path and almost-win tension."}${refBlock}${visualRefBlock}

MOC MECHANICS TO UNDERSTAND BEFORE GENERATING:
MOC MECHANICS — READ CAREFULLY, THESE ARE EXACT RULES:
- CANNON EVOLUTION: Destroying a breakable obstacle on the road upgrades the cannon tier. Exact chain: Simple Cannon → Double Cannon → Triple Cannon → Tank. STOP AT TANK — Golden Jet is NOT used in ads as a cannon evolution step. Do NOT include Golden Jet in unit_evolution_chain.
- +N GATES (Investment path): Multiply the NUMBER OF CANNONS firing. +3 means 3 more cannons added. This is the ONLY way cannon count grows. cannon_count_progression must only show +gate changes. Example: "1 → 3 (via +2 gate) → 8 (via +5 gate) → 14 (via +6 gate)"
- xN GATES (Danger zone): Multiply the NUMBER OF MOBS already flowing in the lane. x3 triples the mobs currently passing through. Cannon count is UNAFFECTED by xN gates. NEVER write "cannons multiply via x gate". xN gates are dangerous because enemy mobs also surge in.
- LANE ARCHITECTURE: Every MOC ad has 3 structural elements arranged spatially on the road so ALL are visible simultaneously from the top-down camera: (1) INVESTMENT PATH — +N gate panels that grow cannon count; (2) UPGRADE PATH — breakable obstacles (red block, barrel, crate, turret cluster) that trigger cannon tier upgrade when destroyed; (3) DANGER ZONE — xN gates + enemy mobs that multiply mob count with risk. DEFAULT spatial arrangement: +N gates on LEFT sub-lane, xN danger zone in CENTER main lane, upgrade obstacle on RIGHT. Lanes CAN swap — specify the exact arrangement in lane_design if different. The lane_design field must describe: (a) which element is on which side, (b) what obstacle or mechanic blocks access to each element, (c) what tension this creates for the player. This description will be used directly to generate scene renders.
- PHYSICAL MOVEMENT: The cannon does move forward along the road in some ads, but the structural lane elements (investment/upgrade/danger) must ALWAYS be described and shown. Movement does not remove structure.
- CHAMPIONS: Use ONLY these exact names (null if not present): Captain Kaboom, Gold Golem, Caveman, Mobzilla, Nexus, Red Hulk, Kraken, Femme Zombie. Set enemy_champion to "Enemy Tower" for the standard tower, or a named boss if specified by the user. NEVER invent a new champion name. NEVER use "Boss Golem", "Stone Guardian", "Iron Guardian", or any unlisted name.

NETWORK RULES: AppLovin=custom side cam+skeleton/knight hook+blue+3+ evolution steps. Facebook=default cam+almost-win 1-5HP+colour/biome swap. Google=almost-win+foggy forest/water.
HOOK CHARACTERS: The skeleton and knight are ENEMY boss hook characters that appear at 0s. The SKELETON is a large realistic human skeleton (bone-white, full ribcage, skull head) that physically blocks or kicks the cannon. The KNIGHT is a large armored enemy boss that challenges the cannon. They are NOT player avatars, NOT champions — they are the antagonist hook. Do not confuse them with player units.
PLAYER UNIT TERMINOLOGY — CRITICAL:
- CANNON = the wheeled vehicle at the bottom of the screen (Simple Cannon, Double Cannon, etc). This is the player's main unit. It moves up the lane. It does NOT pass through gates.
- MOBS = the small round blob creatures that flow ahead of and around the cannon. They are projectiles/followers. MOBS pass through gates. MOBS destroy containers (by swarming them). MOBS fight enemy mobs.
- NEVER say "player mobs pass through a +1 gate" — +1 gates change how many CANNONS are firing (cannon count), not mob count. The cannon count grows when mobs flow through +N gates.
- NEVER say "player mobs pass through a xN gate" — xN gates multiply the MOB count, not cannon count.
- CORRECT language: "Mob swarm passes through x4 gate, multiplying from 6 to 24 mobs" / "Swarm passes through +1 gate, adding 1 more firing cannon (now 2 cannons)"
- The "player_mob_color" field = the colour of the small blob mobs (e.g. blue). The cannon is always blue/grey.
BIOME SELECTION: If user specifies a biome in their prompt, use EXACTLY that biome for data-backed concepts. Do NOT substitute. Desert+Facebook = CZ65 ($7K/d top-1) + CT43 as primary DNA. Foggy Forest+Facebook = CB57+CR17. Water = CZ94+CV73. Biome directly determines network fit — match the user's stated target.
9-STEP CURVE: Pressure→Investment→Validate→Investment2→Payoff→FalseSafety→Pressure++→AlmostWin→Fail
BIOMES (concepts 1-2): Desert, Foggy Forest, Water, Bunker, Meadow ONLY. Concept 3: experimental biome (is_experimental:true).

Return ONLY valid JSON — be concise, no padding or elaboration:
{"analysis":{"patterns_used":string,"dna_sources":[string],"strategy":string},"concepts":[{"title":string,"dna_source":string,"is_data_backed":boolean,"is_experimental":boolean,"experimental_note":string|null,"objective":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"hook_timing_seconds":number,"hook_description":string,"unit_evolution_chain":[string],"cannon_count_progression":string,"lane_design":string,"upgrade_triggers":[string],"tension_moments":[string],"network_adaptations":{"AppLovin":string,"Facebook":string,"Google":string},"engagement_hooks":string,"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}]}`;
};

const CANNON_VISUALS: Record<string, string> = {
  "Simple Cannon": "Simple Cannon: single blue barrel, round blue body, 4 black wheels — compact, small",
  "Double Cannon": "Double Cannon: two blue barrels side-by-side, slightly wider body than Simple Cannon, same wheel style",
  "Triple Cannon": "Triple Cannon: THREE blue barrels side-by-side on a wider body, brown/orange roller wheels — see reference image for exact appearance",
  "Tank": "Tank: blue military tank body with rotating turret/radar dish on top, wide tracked treads, yellow-green accent ring — see reference image",
  "Golden Jet": "Golden Jet: a GROUND CANNON with gold plating and jet engine aesthetic — still on wheeled base on the road. NOT used as cannon evolution in ads. NOT an airplane. Only shown as aspirational eye-catcher on a platform.",
};

const imagePromptFn = (concept: Concept, scene: "hook"|"start"|"middle"|"end", continuityNote?: string) => {
  const vi = concept.visual_identity;
  const chain: string[] = concept.unit_evolution_chain || (concept as any).unit_evolution_chain || [];
  const hookDesc = concept.hook_description || "";
  const laneDesign = concept.lane_design || "";
  const cannonCount = concept.cannon_count_progression || "";
  const tensionMoments = concept.tension_moments || [];
  const upgradeTriggers = concept.upgrade_triggers || [];

  const unitAtScene = {
    hook:   chain[0] || "Simple Cannon",
    start:  chain[0] || "Simple Cannon",
    middle: chain[Math.floor(chain.length / 2)] || chain[0] || "Triple Cannon",
    end:    chain[chain.length - 1] || chain[0] || "Tank",
  }[scene];

  const cannonVisual = CANNON_VISUALS[unitAtScene] || `${unitAtScene}: a ground-mounted cannon on a wheeled base, NOT a vehicle`;

  const cannonCountAtScene = {
    hook: "1 cannon",
    start: "1 cannon",
    middle: cannonCount ? `cannon count: ${cannonCount.split("→")[1]?.trim() || "multiple cannons"}` : "3-4 cannons firing",
    end: cannonCount ? `final count: ${cannonCount.split("→").pop()?.trim() || "maximum cannons"}` : "maximum cannons",
  }[scene];

  const sceneDesc = {
    hook: `HOOK SCENE — cinematic close-up, NOT top-down:
- Hook event: ${hookDesc || "enemy boss dominates screen, player cannon tiny and threatened"}
- Enemy boss fills 60-70% of frame, menacing
- Player cannon at bottom, dwarfed and threatened
- Cinematic, dramatic, thumb-stopping
- STRICT RULE: ABSOLUTELY NO TEXT OVERLAYS OF ANY KIND — no "CAN YOU...", no speech bubbles, no UI text, no subtitles, no call-to-action text, no numbers floating in the scene. Pure visual only.`,

    start: `OPENING SCENE — 3/4 top-down view of the full lane from above:
- Single ${unitAtScene} cannon at BOTTOM CENTER. Cannon looks EXACTLY like the reference images: small rounded barrel body on 4 small black wheels. Cartoon 3D. Blue/grey color. NOT a military tank, NOT a truck, NOT a realistic vehicle.
- 6-10 ${vi.player_mob_color} round blob mobs near the cannon — very sparse
- CRITICAL — THE ROAD HAS 3 PARALLEL SUB-PATHS SIDE BY SIDE (same road width, divided into 3 lanes):
  * LEFT LANE: 4-6 identical Bright BLUE "+N" flat rectangular gate panels ALL showing the SAME value — they fill the ENTIRE left third of the road
  * CENTER LANE: Main driving path — purple/pink xN gate panel + red enemy mob cluster ahead
  * RIGHT LANE: 3-4 breakable upgrade obstacles in FIXED order weakest→strongest: Simple Cannon icon, then Double Cannon, then Triple Cannon — player sees the full upgrade path
  * [If lane_design specifies a different arrangement: "${laneDesign ? laneDesign.split(".")[0] : "use default described above"}"]
  * ALL THREE sub-paths are visible simultaneously in this top-down view — player can see all options
- Enemy tower at very TOP of lane: health bar 100% full
- Biome environment fills both sides of the road`,

    middle: `MID-BATTLE SCENE — 3/4 top-down view, peak tension:
- ${unitAtScene} cannon — SAME cartoon style as reference images. Small wheeled barrel. NOT a tank or vehicle. ${cannonCountAtScene}
- Large ${vi.player_mob_color} swarm fills 40-55% of lane
- LANE STRUCTURE still present on road:
  * LEFT: +N blue gate (investment already partially used — cannon count grew)  
  * CENTER: purple xN gate (${(vi.gate_values||["x3"]).find(g => g.startsWith("x")) || "x3"}) — danger zone active, red enemy mobs surging
  * RIGHT: ${upgradeTriggers[0] ? `upgrade triggered — "${upgradeTriggers[0]}" — debris visible` : "upgrade obstacle just destroyed — rubble on road, cannon visually upgraded"}
- ALMOST-FAIL: ${tensionMoments[0] || "mob stream thin and critical near enemy — near wipeout moment"}
- Enemy base: 50% health bar
- NO TEXT OVERLAYS`,

    end: `END / ALMOST-WIN SCENE — 3/4 top-down view:
- ${unitAtScene} cannon at bottom — same cartoon style, small wheeled barrel body. ${cannonCountAtScene}
- CRITICAL TENSION: Only 3-5 ${vi.player_mob_color} blobs remain near enemy base, tiny cluster
- All gates passed, road structure behind cannon
- Enemy base: health bar paper-thin sliver (1-3HP), cracks visible on structure
- ${tensionMoments[tensionMoments.length-1] || "army nearly wiped, boss on last HP — maximum tension"}
- NO TEXT OVERLAYS, NO speech bubbles, NO UI text`,
  }[scene];

  const biomeRules: Record<string, string> = {
    "Bunker": "ENVIRONMENT: Grey concrete walls both sides, industrial pipes ceiling, fluorescent strips, dark tunnel. NO lava, NO neon, NO sky, NO trees, NO sand.",
    "Desert": "ENVIRONMENT: Tan/beige sand dunes both sides, bright sunlight, blue sky, sparse brush. NO concrete, NO neon, NO fog, NO lava, NO snow.",
    "Foggy Forest": "ENVIRONMENT: Dense grey/white atmospheric fog, dark pine trees barely visible, grey asphalt road. This is FOG not snow. NO lava, NO neon, NO desert.",
    "Volcanic": "ENVIRONMENT: Red/orange lava rivers both sides, black cracked basalt rocks, strong orange glow from below. NO concrete, NO neon, NO trees, NO desert sand.",
    "Water": "ENVIRONMENT: Grey elevated bridge/path over clear blue water both sides. NO lava, NO neon, NO concrete walls, NO sand.",
    "Cyber-City": "ENVIRONMENT: Grey metal industrial path, orange and blue neon tech structures both sides. NO lava, NO sand, NO trees, NO desert.",
    "Meadow": "ENVIRONMENT: Rolling green hills both sides, scattered leafy trees, grey brick path, bright blue sky. NO lava, NO neon, NO concrete, NO desert.",
    "Snow": "ENVIRONMENT: White snow-covered ground, icy frozen structures, blue-white cold lighting. NO lava, NO neon, NO sand, NO desert.",
    "Toxic": "ENVIRONMENT: Purple crystalline ground paths, green glowing slime pools, luminescent toxic crystals. NO lava, NO concrete, NO desert.",
  };
  const biomeRule = scene === "hook"
    ? `ENVIRONMENT: Match ${vi.environment} biome from the scene reference images.`
    : (biomeRules[vi.environment] || `ENVIRONMENT: ${vi.environment} setting.`);

  const cannonNote = scene === "hook"
    ? `PLAYER CANNON: Match the cannon appearance from the reference images above — small wheeled cannon, cartoonish 3D style. NOT a car, NOT a military vehicle.`
    : `PLAYER CANNON: The cannon MUST look like the reference images above — a small wheeled cannon on the road, cartoonish 3D. ${cannonVisual}. Positioned at bottom center. NOT a car, NOT a military vehicle, NOT a truck.`;

  const gateNote = scene !== "hook"
    ? `GATES: ${(vi.gate_values||[]).join(", ")} — FLAT rectangular panels spanning the full road width. +N gates are BRIGHT BLUE with bold white text. xN gates are PURPLE/PINK with bold white text. Large multipliers (x100+) are YELLOW/GOLD. They have a frame border and slight 3D panel depth but are essentially flat signs. See gate reference images for exact appearance.`
    : "";

  const compositionRule = scene === "hook"
    ? "COMPOSITION: Cinematic close-up or medium shot — dramatic framing, NOT the standard top-down lane view. NO HUD, NO score UI, NO text overlays of any kind."
    : "COMPOSITION: 3/4 cinematic top-down angle. Cannon at bottom center. Lane runs up center. NO HUD, NO score counter, NO hearts, NO text overlays, NO watermarks, NO speech bubbles.";

  const chainNote = chain.length > 0 && scene !== "hook"
    ? `UNIT EVOLUTION CHAIN FOR THIS CREATIVE: ${chain.join(" → ")}. At THIS scene (${scene}), the cannon is: ${unitAtScene}. ${cannonVisual}. The cannon model MUST match this tier exactly — if it's Double Cannon, show 2 barrels. If Triple Cannon, show 3 barrels. If Tank, show tank with turret. Do NOT use a different cannon model.`
    : "";

  return [
    "Mob Control mobile game screenshot. MATCH the MOC reference images above EXACTLY in art style, 3D render quality, colour palette, and cartoon aesthetic.",
    chainNote,
    "", sceneDesc, "", biomeRule, "",
    cannonNote,
    scene !== "hook" ? `ENEMY BOSS: ${vi.enemy_champion||"generic boss tower"} at top of lane.` : "",
    scene !== "hook" ? `PLAYER MOBS: ${vi.player_mob_color} small round blob creatures, cartoonish 3D style.` : "",
    scene !== "hook" ? `ENEMY MOBS: ${vi.enemy_mob_color} round blob creatures near the top of the lane.` : "",
    gateNote,
    `LIGHTING: ${vi.lighting} | MOOD: ${vi.mood_notes}`,
    continuityNote ? `CONTINUITY: ${continuityNote}` : "",
    "", compositionRule,
    "ART STYLE: Exact 3D cartoon render matching the reference images — same colour saturation, same mob blob shape, same flat gate rectangle style. Match references precisely.",
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
async function enhanceText(raw: string, mode: "upload" | "brief" | "refine"): Promise<string> {
  const systemPrompt = mode === "upload"
    ? `You are a Mob Control creative analyst helping structure upload notes for Gemini DNA analysis.

RULES — follow strictly:
- PRESERVE every fact, detail, and observation the user wrote. Do not change, remove, or contradict anything they said.
- ONLY add: MOC-specific terminology where appropriate (biome name, hook type label, gate type clarification), and structure for clarity.
- Do NOT invent new creative directions, mechanics, or details not mentioned by the user.
- Output: plain text, max 4 sentences, no bullet points.

Your job is to make the user's note more precise for Gemini — not to rewrite it.`
    : mode === "refine" ? `You are a Mob Control creative producer refining a specific brief concept. RULES: PRESERVE exact intent. EXPAND vague requests into specific MOC field changes — e.g. "more tension" becomes a specific tension_moment addition. Name cannon tiers exactly: Simple Cannon / Double Cannon / Triple Cannon / Tank. Mention which scene (hook/start/middle/end) for visual changes. Output: plain text, max 4 sentences, no bullets. Make it specific and actionable.`
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

// ─── Re-upload Modal ──────────────────────────────────────────────────────────
function ReuploadModal({ entry, onConfirm, onCancel }: {
  entry: DNAEntry;
  onConfirm: (videoFile: File, manualFrames: File[], context: string) => void;
  onCancel: () => void;
}) {
  const videoRef = React.useRef<HTMLInputElement>(null);
  const framesRef = React.useRef<HTMLInputElement>(null);
  const [videoFile, setVideoFile] = React.useState<File|null>(null);
  const [frameFiles, setFrameFiles] = React.useState<File[]>([]);
  const [reuploadCtx, setReuploadCtx] = React.useState("");
  const displayId = entry.creative_id || `#${entry.id}`;

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }}
      onClick={onCancel}>
      <div style={{ background:"#161b22",borderRadius:14,padding:"1.5rem",width:"90%",maxWidth:440,border:`0.5px solid ${D.border2}` }}
        onClick={e=>e.stopPropagation()}>
        <h2 style={{ margin:"0 0 4px",fontSize:15,fontWeight:500,color:D.text }}>Re-upload {displayId}</h2>
        <p style={{ margin:"0 0 20px",fontSize:11,color:D.textMuted }}>Keeps existing metadata (tier, spend, IDs). Re-runs full analysis on the new video.</p>

        {/* Video file */}
        <div style={{ marginBottom:12 }}>
          <span style={{ fontSize:10,fontWeight:600,color:D.textDim,letterSpacing:"0.08em",textTransform:"uppercase" as const,display:"block",marginBottom:6 }}>Video *</span>
          <input ref={videoRef} type="file" accept="video/*" style={{ display:"none" }}
            onChange={e=>{ const f=e.target.files?.[0]; if(f) setVideoFile(f); e.target.value=""; }} />
          <button style={{ ...D as any, padding:"8px 16px",fontSize:12,background:videoFile?D.greenBg:D.surface2,border:`0.5px solid ${videoFile?D.greenBdr:D.border2}`,borderRadius:8,color:videoFile?D.green:D.text,cursor:"pointer",width:"100%",textAlign:"left" as const,fontFamily:"inherit" }}
            onClick={()=>videoRef.current?.click()}>
            {videoFile ? `✓ ${videoFile.name}` : "Choose video file…"}
          </button>
        </div>

        {/* Manual frames (optional) */}
        <div style={{ marginBottom:20 }}>
          <span style={{ fontSize:10,fontWeight:600,color:D.textDim,letterSpacing:"0.08em",textTransform:"uppercase" as const,display:"block",marginBottom:6 }}>Manual storyboard frames (optional)</span>
          <input ref={framesRef} type="file" accept="image/*" multiple style={{ display:"none" }}
            onChange={e=>{ const files=e.target.files?Array.from(e.target.files):[]; setFrameFiles(files); e.target.value=""; }} />
          <button style={{ padding:"8px 16px",fontSize:12,background:frameFiles.length>0?D.blueBg:D.surface2,border:`0.5px solid ${frameFiles.length>0?D.blueDark:D.border2}`,borderRadius:8,color:frameFiles.length>0?D.blue:D.textMuted,cursor:"pointer",width:"100%",textAlign:"left" as const,fontFamily:"inherit" }}
            onClick={()=>framesRef.current?.click()}>
            {frameFiles.length>0 ? `✓ ${frameFiles.length} frame${frameFiles.length>1?"s":""} selected` : "+ Add frames"}
          </button>
        </div>

        {/* Context field */}
        <div style={{ marginBottom:16 }}>
          <span style={{ fontSize:10,fontWeight:600,color:D.textDim,letterSpacing:"0.08em",textTransform:"uppercase" as const,display:"block",marginBottom:6 }}>Analysis context (optional but recommended)</span>
          <textarea value={reuploadCtx} onChange={e=>setReuploadCtx(e.target.value)}
            placeholder="Describe what you know: number of upgrades, giant kills, biome, key mechanics…"
            style={{ width:"100%",boxSizing:"border-box" as const,fontSize:12,padding:"8px 10px",background:D.surface2,border:`0.5px solid ${D.border2}`,borderRadius:8,color:D.text,resize:"vertical" as const,minHeight:72,fontFamily:"inherit",outline:"none" }} />
        </div>
        <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
          <button onClick={onCancel} style={{ padding:"8px 18px",fontSize:13,background:"none",border:`0.5px solid ${D.border2}`,borderRadius:8,color:D.textMuted,cursor:"pointer",fontFamily:"inherit" }}>Cancel</button>
          <button onClick={()=>{ if(videoFile) onConfirm(videoFile,frameFiles,reuploadCtx); }} disabled={!videoFile}
            style={{ padding:"8px 18px",fontSize:13,background:videoFile?D.blue:"#333",border:"none",borderRadius:8,color:"#fff",cursor:videoFile?"pointer":"not-allowed",fontFamily:"inherit",opacity:videoFile?1:0.5 }}>
            Analyze →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Library Card ─────────────────────────────────────────────────────────────
function LibraryCard({ d, di, expandedDNA, setExpandedDNA, lib, saveLib, reanalyzingIds, handleReanalyzeSingle, onZoomFrame, isReanalyzing, onReupload }: {
  d: DNAEntry; di: number; expandedDNA: number|null; setExpandedDNA: (n: number|null) => void;
  lib: DNAEntry[]; saveLib: (l: DNAEntry[]) => void;
  reanalyzingIds: Set<number>; handleReanalyzeSingle: (e: DNAEntry) => void;
  onZoomFrame: (src: string, list?: string[], index?: number) => void;
  isReanalyzing: boolean;
  onReupload?: (entry: DNAEntry, file: File, manualFrameFiles?: File[], context?: string) => void;
}) {
  const [showReuploadModal, setShowReuploadModal] = React.useState(false);
  const [spendOpen, setSpendOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
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

        {/* Filmstrip — shown when frames are available, even when collapsed */}
        {d.auto_frames && d.auto_frames.some(f => f.image_data) && (
          <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 8, paddingBottom: 2 }}>
            {d.auto_frames.filter(f => f.image_data).map((f, fi) => (
              <div key={fi} style={{ flexShrink: 0, position: "relative" as const, cursor: "zoom-in" }}
                onClick={e => { e.stopPropagation(); const imgs=d.auto_frames!.filter(fr=>fr.image_data).map(fr=>`data:image/jpeg;base64,${fr.image_data}`); onZoomFrame(imgs[fi]??`data:image/jpeg;base64,${f.image_data}`,imgs,fi); }}>
                <img src={`data:image/jpeg;base64,${f.image_data}`} alt={`${f.timestamp_seconds}s`}
                  style={{ width: 48, height: 86, objectFit: "cover", borderRadius: 5, border: `0.5px solid ${D.border2}`, display: "block" }} />
                <div style={{ position: "absolute" as const, bottom: 2, left: 0, right: 0, textAlign: "center" as const }}>
                  <span style={{ fontSize: 7, background: "rgba(0,0,0,0.8)", color: "#fff", padding: "1px 3px", borderRadius: 2 }}>{f.timestamp_seconds}s</span>
                </div>
              </div>
            ))}
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

        {/* Row 5: Footer — filename + date left, tier dropdown right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 10, color: D.textDim }}>
            {d.file_name} · {new Date(d.added_at).toLocaleDateString()}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
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
            color: isExpanded ? D.blue : D.text,
            borderColor: isExpanded ? D.blueDark : D.border,
            background: isExpanded ? D.blueBg : D.surface2,
          }}
        >
{isExpanded ? "▲ Collapse details" : "▼ Expand details"}
        </button>
        <div style={{ display:"flex",gap:6,alignItems:"center" }}>
          {onReupload && (() => {
            const reuploading = reanalyzingIds.has(d.id);
            return (
              <>
                {showReuploadModal && (
                  <ReuploadModal entry={d}
                    onCancel={()=>setShowReuploadModal(false)}
                    onConfirm={(videoFile, manualFrames, ctx)=>{ setShowReuploadModal(false); onReupload(d, videoFile, manualFrames.length>0?manualFrames:undefined, ctx||undefined); }} />
                )}
                <button style={{ ...btnSec, fontSize:10, padding:"4px 9px", cursor:reuploading?"not-allowed":"pointer", opacity:reuploading?0.5:1 }}
                  disabled={reuploading}
                  onClick={e=>{ e.stopPropagation(); setShowReuploadModal(true); }}
                  title="Keep metadata, re-analyze with new video">
                  {reuploading ? "↑ Uploading…" : "↑ Re-upload"}
                </button>
              </>
            );
          })()}
          <button
            onClick={async()=>{
              try {
                const vi = d.visual_identity||{};
                const frames = (d.auto_frames||[]).filter((f:any)=>f.image_data);
                const frameImgs = frames.map((f:any)=>`<div style="text-align:center;flex:1 1 80px"><div style="font-size:9px;color:#8b949e;margin-bottom:3px">${f.timestamp_seconds}s</div><img src="data:image/jpeg;base64,${f.image_data}" style="width:100%;border-radius:4px"/><div style="font-size:9px;color:#8b949e;margin-top:3px">${f.description||""}</div></div>`).join("");
                const timeline = (d.auto_frames||[]).map((f:any)=>`<tr><td style="padding:4px 8px;color:#58a6ff;white-space:nowrap;font-size:11px;vertical-align:top">${f.timestamp_seconds}s</td><td style="padding:4px 8px;font-size:11px;color:#e6edf3">${f.description||""}</td><td style="padding:4px 8px;font-size:10px;color:#8b949e">${f.significance||""}</td></tr>`).join("");
                const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;padding:24px;max-width:960px;margin:0 auto">
<div style="border-bottom:1px solid #21262d;padding-bottom:14px;margin-bottom:20px">
  <div style="font-size:11px;color:#8b949e;margin-bottom:3px">${d.creative_id||"#"+d.id} · ${d.tier} · ${d.biome||""}</div>
  <div style="font-size:22px;font-weight:700">${d.title||""}</div>
</div>
<div style="display:grid;grid-template-columns:auto auto auto auto auto auto;gap:12px;margin-bottom:20px">
  ${[["Hook type",d.hook_type],["Hook at",(d.hook_timing_seconds!=null?d.hook_timing_seconds+"s":"—")],["Biome",d.biome],["Pacing",d.pacing],["Loss event",d.loss_event_type],["Swarm peak",(d.swarm_peak_moment_seconds!=null?d.swarm_peak_moment_seconds+"s":"—")]].map(([l,v])=>`<div><div style="font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">${l}</div><div style="font-size:12px;font-weight:500">${v||"—"}</div></div>`).join("")}
</div>
${(d.unit_evolution_chain||[]).length?`<div style="margin-bottom:16px"><div style="font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Unit evolution chain</div><div>${(d.unit_evolution_chain||[]).map((s:string)=>`<span style="display:inline-block;font-size:11px;padding:3px 10px;border-radius:4px;background:#1d2d3f;color:#58a6ff;border:0.5px solid #1f6feb;margin-right:6px">${s}</span>`).join("→")}</div></div>`:""}
${frames.length?`<div style="margin-bottom:16px"><div style="font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Extracted frames</div><div style="display:flex;gap:8px;flex-wrap:wrap">${frameImgs}</div></div>`:""}
${timeline?`<div style="margin-bottom:16px"><div style="font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Timeline</div><table style="width:100%;border-collapse:collapse;border:0.5px solid #21262d"><tbody>${timeline}</tbody></table></div>`:""}
${d.why_it_works?`<div style="margin-bottom:12px"><div style="font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Why it works</div><div style="font-size:12px;color:#8b949e;line-height:1.6">${d.why_it_works}</div></div>`:""}
${d.creative_gaps?`<div style="margin-bottom:12px"><div style="font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Creative gaps</div><div style="font-size:12px;color:#8b949e;line-height:1.6">${d.creative_gaps}</div></div>`:""}
<div style="margin-top:16px;padding-top:10px;border-top:1px solid #21262d;font-size:10px;color:#484f58">Levelly — MOC Creative Intelligence</div>
</body></html>`;
                await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([html],{type:"text/html"}),"text/plain":new Blob([d.title||""],{type:"text/plain"})})]);
                setCopied(true); setTimeout(()=>setCopied(false),2500);
              } catch(e){ console.error(e); }
            }}
            style={{ ...btnSec,fontSize:10,padding:"4px 9px",background:copied?D.greenBg:D.blueBg,color:copied?D.green:D.blue,border:`0.5px solid ${copied?D.greenBdr:D.blueDark}`,transition:"all .2s" }}>
            {copied?"✓ Copied":"⎘ Copy"}
          </button>
          <button
            style={btnDanger}
            onClick={() => { if (confirm(`Remove "${displayId || d.title}" from library?`)) saveLib(lib.filter(x => x.id !== d.id)); }}
          >
            Remove
          </button>
        </div>
      </div>

      {/* ── Expanded section ── */}
      {isExpanded && (
        <div style={{
          padding: "14px 16px 20px",
          borderTop: `0.5px solid ${D.border}`,
          background: D.surface2,
          borderLeft: "none", // accent is on parent already
        }}>
          {/* SpendTagger moved to bottom — see end of expanded section */}

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



          {canTag && (
            <div style={{ marginTop:14,borderTop:`0.5px solid ${D.border}`,paddingTop:10 }}>
              <button onClick={()=>setSpendOpen(p=>!p)} style={{ background:"none",border:`0.5px solid ${D.border2}`,borderRadius:6,color:spendOpen?D.blue:D.textMuted,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:500,padding:"4px 12px",display:"flex",alignItems:"center",gap:5 }}>
                {spendOpen?"▲ Hide":"▼ Edit"} spend metadata
              </button>
              {spendOpen && <div style={{ marginTop:10 }}><SpendTagger entry={d} lib={lib} onSave={fields => saveLib(lib.map(x => x.id === d.id ? { ...x, ...fields } : x))} /></div>}
            </div>
          )}

          {d.auto_frames && d.auto_frames.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Timeline</span>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
                {d.auto_frames.map((f, i) => {
                  const emotionMap: Record<number,string> = {};
                  (d as any).frame_emotions?.forEach((e: any) => { if (typeof e?.timestamp_seconds === "number") emotionMap[e.timestamp_seconds] = e.emotion; });
                  const emotion = emotionMap[f.timestamp_seconds];
                  const sigColor: Record<string,string> = { hook: D.red, upgrade: D.green, container: D.green, gate: D.blue, swarm: D.gold, almost_fail: "#f472b6", fail: D.red, boss_death: D.gold, battle: "#f472b6" };
                  const color = sigColor[f.significance] || D.textDim;
                  return (
                    <div key={i} style={{ fontSize: 11, padding: "4px 8px", background: D.surface, borderRadius: 5, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontWeight: 600, color: D.blue, minWidth: 28, flexShrink: 0 }}>{f.timestamp_seconds}s</span>
                      <span style={{ color: D.text, flex: 1, lineHeight: 1.4 }}>{f.description}</span>
                      {f.significance && f.significance !== "filler" && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: `${color}22`, color, border: `0.5px solid ${color}44`, flexShrink: 0, alignSelf: "center" }}>{f.significance.replace("_"," ")}</span>}
                      {emotion && <span style={{ fontSize: 9, color: D.textDim, fontStyle: "italic", flexShrink: 0, alignSelf: "center" }}>{emotion}</span>}
                    </div>
                  );
                })}
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
          {(d as any).giant_kills?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={labelStyle}>Giant kills</span>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                {(d as any).giant_kills.map((g: any, i: number) => (
                  <div key={i} style={{ fontSize: 11, padding: "4px 8px", background: D.goldBg, borderRadius: 5, display: "flex", gap: 8, border: `0.5px solid ${D.goldBdr}` }}>
                    <span style={{ fontWeight: 600, color: D.gold, minWidth: 28, flexShrink: 0 }}>{g.timestamp_seconds}s</span>
                    <span style={{ color: D.text, flex: 1 }}>{g.giant_name}</span>
                    {g.note && <span style={{ fontSize: 10, color: D.textDim, fontStyle: "italic" }}>{g.note}</span>}
                  </div>
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
  // Track which panel was last opened — content persists when switching panels
  const [lastOpenPanel, setLastOpenPanel] = useState<"brief"|"analyse"|"lib"|null>(null);
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
  const [zoomedFrameList, setZoomedFrameList] = useState<string[]>([]);
  const [zoomedFrameIndex, setZoomedFrameIndex] = useState<number>(0);

  // Keyboard navigation for zoomed frames/renders
  React.useEffect(()=>{
    if(!zoomedFrame) return;
    const handler=(e: KeyboardEvent)=>{
      if(e.key==="ArrowRight"||e.key==="ArrowDown"){ e.preventDefault(); setZoomedFrameIndex(i=>{ const next=Math.min(i+1,zoomedFrameList.length-1); setZoomedFrame(zoomedFrameList[next]??zoomedFrame); return next; }); }
      if(e.key==="ArrowLeft"||e.key==="ArrowUp"){ e.preventDefault(); setZoomedFrameIndex(i=>{ const prev=Math.max(i-1,0); setZoomedFrame(zoomedFrameList[prev]??zoomedFrame); return prev; }); }
      if(e.key==="Escape"){ setZoomedFrame(null); setZoomedFrameList([]); }
    };
    window.addEventListener("keydown",handler);
    return ()=>window.removeEventListener("keydown",handler);
  },[zoomedFrame,zoomedFrameList]);
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
  const [refineTexts, setRefineTexts] = useState<Record<number,string>>({});
  const [copiedConcept, setCopiedConcept] = useState<number|null>(null);
  const [refining, setRefining] = useState<Record<number,boolean>>({});
  const [refineErr, setRefineErr] = useState<Record<number,string>>({});
  const [renderingScene, setRenderingScene] = useState<Record<string,boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{
    const sanitizeLib = (entries: any[]): DNAEntry[] => entries.map(e => sanitizeDNA(e) as DNAEntry);

    fetch("/api/load-library")
      .then(r=>{ if(!r.ok) throw new Error(); return r.json(); })
      .then((data: DNAEntry[])=>{
      if(Array.isArray(data)&&data.length>0){
        // Restore image_data from localStorage — Blobs strips frames to stay under size limit
        try {
          const local=localStorage.getItem("levelly_dna_library");
          if(local){
            const localMap=new Map(JSON.parse(local).map((e: DNAEntry)=>[e.id,e]));
            const merged=data.map((e: DNAEntry)=>{
              const loc=localMap.get(e.id) as DNAEntry|undefined;
              if(!loc?.auto_frames) return e;
              const imgMap=new Map(loc.auto_frames.map(f=>[f.timestamp_seconds,f.image_data]));
              return{...e,auto_frames:e.auto_frames?.map(f=>({...f,image_data:imgMap.get(f.timestamp_seconds)??f.image_data}))};
            });
            setLib(sanitizeLib(merged));
          } else setLib(sanitizeLib(data));
        } catch { setLib(sanitizeLib(data)); }
      } else { try { const l=localStorage.getItem("levelly_dna_library"); if(l) setLib(sanitizeLib(JSON.parse(l))); } catch {} }
      setLibraryLoaded(true); })
      .catch(()=>{ try { const l=localStorage.getItem("levelly_dna_library"); if(l) setLib(sanitizeLib(JSON.parse(l))); } catch {} setLibraryLoaded(true); });
  },[]);

  const saveLib = useCallback((updated: DNAEntry[])=>{
    setLib(updated);
    try { localStorage.setItem("levelly_dna_library",JSON.stringify(updated)); } catch {}
    if(libraryLoaded){
      setCloudStatus("saving");
      // Strip image_data before cloud save — frames too large for function body limit (6MB)
      // Frames stored in IndexedDB locally for persistence; re-extract on new devices
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
  const importLibrary=(e: React.ChangeEvent<HTMLInputElement>)=>{ const file=e.target.files?.[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try { const p=JSON.parse(reader.result as string); if(!Array.isArray(p)) throw new Error(); const m=[...lib]; p.forEach((entry: DNAEntry)=>{ if(!m.find(x=>x.id===entry.id)) m.push(sanitizeDNA(entry) as DNAEntry); }); saveLib(m); } catch { alert("Import failed."); } }; reader.readAsText(file); e.target.value=""; };

  const reanalyzeSingle=async(entry: DNAEntry): Promise<DNAEntry>=>{
    // Strip image_data from auto_frames before sending — base64 images bloat the prompt and cause JSON parse errors
    const stripped = { ...entry, auto_frames: entry.auto_frames?.map(f => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance })) };
    const corrected=sanitizeDNA(await callGeminiDirect(reanalysisSystem(stripped),[{text:`Re-analyze: ${entry.title}`}]));
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

  // Re-upload: keep existing metadata (tier/spend/creative_id/parent_id), re-run full analysis pipeline on new video
  const handleReupload=useCallback(async(entry: DNAEntry, file: File, manualFrameFiles?: File[], newContext?: string)=>{
    setReanalyzingIds(p=>new Set(p).add(entry.id));
    setReanalyzingEntry(entry.id);
    setAnalyzeStep("uploading"); setAnalyzeFileName(file.name);
    setBriefPanelOpen(false); setAnalysePanelOpen(false);
    try {
      let videoPart: any;
      if(file.size>4*1024*1024){ const {fileUri,mimeType}=await uploadToGeminiFileAPI(file,()=>{}); videoPart={fileData:{mimeType,fileUri}}; }
      else { videoPart={inlineData:{mimeType:file.type,data:await fileToBase64(file)}}; }
      setAnalyzeStep("frames");
      let autoFrames: FrameExtraction[]=[],duration=30;
      try { const fr=await callGeminiDirect(frameExtractionSystem(),[{text:"Extract 8 key frames:"},videoPart]); autoFrames=Array.isArray(fr?.frames)?fr.frames:[]; duration=typeof fr?.duration_seconds==="number"?fr.duration_seconds:30; } catch(frameErr: any){ console.warn("Frame extraction failed:",frameErr?.message); }
      let extractedFrameParts: any[]=[];
      try {
        const timestamps=autoFrames.map(f=>f.timestamp_seconds).filter(t=>typeof t==="number");
        if(timestamps.length>0){ setAnalyzeStep("extracting"); extractedFrameParts=await extractFramesFromVideo(file,timestamps,duration); }
      } catch(canvasErr: any){ console.warn("Canvas extraction failed:",canvasErr?.message); }
      setAnalyzeStep("hook");
      let hookData: any={};
      try { hookData=await callGeminiDirect(hookDetectionSystem(),[{text:`Frames:${JSON.stringify(autoFrames)}.Context:${newContext||entry.upload_context||""}.Find hook:`},videoPart]); } catch {}
      const manualParts: any[]=[];
      if(manualFrameFiles&&manualFrameFiles.length>0){ for(const mf of manualFrameFiles){ manualParts.push({text:`Manual:${mf.name}`}); manualParts.push({inlineData:{mimeType:mf.type,data:await fileToBase64(mf)}}); } }
      setAnalyzeStep("analyzing");
      const refParts=(()=>{try{const r=buildReferenceParts();return Array.isArray(r)?r:[];}catch{return[];}})();
      const frameParts=Array.isArray(extractedFrameParts)&&extractedFrameParts.length>0?[{text:"### EXTRACTED FRAMES:"},...extractedFrameParts]:[];
      const hasManual=manualParts.length>0;
      const cfg={tier:entry.tier,ad_type:entry.ad_type,context:newContext||entry.upload_context||"",manual_frames:[]};
      const rawDna=await callGeminiDirect(analyzeSystem(lib,cfg,autoFrames,duration,frameParts.length>0,refParts.length>0),[...refParts,...frameParts,...(hasManual?[{text:"### MANUAL FRAMES:"},...manualParts]:[]),{text:`HOOK DATA:${JSON.stringify(hookData)}`},{text:"### AD VIDEO:"},videoPart,{text:"Extract Creative DNA."}]);
      const dna=sanitizeDNA(rawDna);
      setAnalyzeStep("saving");
      const frameImageMap: Record<number,string>={};
      for(let pi=0;pi<extractedFrameParts.length-1;pi+=2){ const label=extractedFrameParts[pi]?.text??""; const match=label.match(/\[FRAME at ([\d.]+)s\]/); const imgData=extractedFrameParts[pi+1]?.inlineData?.data; if(match&&imgData) frameImageMap[parseFloat(match[1])]=imgData; }
      const autoFramesWithImages: FrameExtraction[]=Array.isArray(autoFrames)?autoFrames.map(f=>frameImageMap[f.timestamp_seconds]?{...f,image_data:frameImageMap[f.timestamp_seconds]}:f):[];
      // Preserve ALL existing metadata — dna spread last so analysis fields update, then re-apply identity fields
      const updated: DNAEntry={
        ...entry,
        ...dna,
        id: entry.id,
        tier: entry.tier,
        ad_type: entry.ad_type,
        upload_context: newContext||entry.upload_context,
        creative_id: entry.creative_id,
        parent_id: entry.parent_id,
        spend_tier: entry.spend_tier,
        spend_networks: entry.spend_networks||[],
        spend_notes: entry.spend_notes,
        creative_status: entry.creative_status,
        file_name: file.name,
        auto_frames: autoFramesWithImages,
        manual_frames: manualFrameFiles&&manualFrameFiles.length>0?manualFrameFiles.map(f=>f.name):(entry.manual_frames||[]),
        reanalyzed: true,
        added_at: entry.added_at,
      };
      saveLib(lib.map(x=>x.id===entry.id?updated:x));
      setLastAnalyzedId(entry.id);
      setAnalyzeStep("");
    } catch(err: any){ setAnalyzeErr((err as Error).message||String(err)); }
    finally { setReanalyzingIds(p=>{ const s=new Set(p); s.delete(entry.id); return s; }); setReanalyzingEntry(null); }
  },[lib]);
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
        try { const fr=await callGeminiDirect(frameExtractionSystem(),[{text:"Extract 8 key frames:"},videoPart]); autoFrames=Array.isArray(fr?.frames)?fr.frames:[]; duration=typeof fr?.duration_seconds==="number"?fr.duration_seconds:30; } catch(frameErr: any){ console.warn("Frame extraction failed:",frameErr?.message); }

        // Extract actual frame images at Gemini's chosen timestamps (non-blocking fallback)
        let extractedFrameParts: any[] = [];
        try {
          const timestamps = autoFrames.map(f => f.timestamp_seconds).filter(t => typeof t === "number");
          if (timestamps.length > 0) {
            setAnalyzeStep("extracting");
            extractedFrameParts = await extractFramesFromVideo(file, timestamps, duration);
          }
        } catch(canvasErr: any) { console.warn("Canvas extraction failed:",canvasErr?.message); }

        setAnalyzeStep("hook");
        let hookData: any={};
        try { hookData=await callGeminiDirect(hookDetectionSystem(),[{text:`Frames:${JSON.stringify(autoFrames)}.Context:${cfg.context}.Find hook:`},videoPart]); } catch {}
        const manualParts: any[]=[];
        if(cfg.manual_frames.length>0){ for(const mf of cfg.manual_frames){ manualParts.push({text:`Manual:${mf.name}`}); manualParts.push({inlineData:{mimeType:mf.type,data:await fileToBase64(mf)}}); } }
        setAnalyzeStep("analyzing");
        const refParts=(()=>{try{const r=buildReferenceParts();return Array.isArray(r)?r:[];}catch{return[];}})();
        const frameParts = Array.isArray(extractedFrameParts)&&extractedFrameParts.length > 0
          ? [{text:"### EXTRACTED FRAMES — key moments at exact timestamps:"},...extractedFrameParts]
          : [];
        const rawDna=await callGeminiDirect(analyzeSystem(lib,cfg,autoFrames,duration,frameParts.length>0,refParts.length>0),[...refParts,...frameParts,...(manualParts.length>0?[{text:"### MANUAL FRAMES:"},...manualParts]:[]),{text:`HOOK DATA:${JSON.stringify(hookData)}`},{text:"### AD VIDEO:"},videoPart,{text:"Extract Creative DNA."}]);
        const dna=sanitizeDNA(rawDna);
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
      const refNote = briefRef ? `User visual reference: "${briefRef.name}"` : undefined;
      const trimmedLib = lib
        .filter(d => d.tier === "winner" && d.creative_status !== "fatigued")
        .map(d => ({
          id: d.creative_id||null,
          biome: d.biome,
          hook_type: d.hook_type,
          hook_timing_seconds: d.hook_timing_seconds,
          unit_evolution_chain: d.unit_evolution_chain,
          key_mechanic: d.key_mechanic,
          loss_event_type: d.loss_event_type,
          spend_tier: d.spend_tier||null,
          spend_networks: d.spend_networks||[],
        }));
      const systemPrompt = briefSystem(trimmedLib, briefCtx, "Whale+Dolphin", iterateFrom.trim()||undefined, refNote);
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Start background job (returns immediately, Claude runs async)
      const startRes = await fetch("/api/generate-brief-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, jobId, max_tokens: 6000 }),
      });
      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err?.error || `Failed to start: ${startRes.status}`);
      }

      // Poll every 2s for up to 5 minutes
      let lastConceptCount = 0;
      for (let i = 0; i < 240; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`/api/brief-result?id=${jobId}`);
        if (!pollRes.ok) continue;
        const job = await pollRes.json();
        if (job.status === "error") throw new Error(job.error || "Brief generation failed");

        // Handle partial or done — show concepts as they arrive
        if ((job.status === "partial" || job.status === "done") && Array.isArray(job.concepts)) {
          if (job.analysis) setBriefAnalysis(job.analysis);
          // Only add newly arrived concepts
          const newConcepts = job.concepts.slice(lastConceptCount);
          newConcepts.forEach((concept: Concept, i: number) => {
            setConcepts(prev => [...prev, concept]);
            if (lastConceptCount === 0 && i === 0) setExpandedConcept(0);
          });
          lastConceptCount = job.concepts.length;
        }

        if (job.status === "done") return;
      }
      throw new Error("Brief generation timed out — please try again");
    } catch (err: any) { setBriefErr(err.message); }
    finally { setGenerating(false); }
  };

  const handleRegenScript = async (ci: number) => {
    setRefining(p => ({ ...p, [ci]: true }));
    setRefineErr(p => ({ ...p, [ci]: "Regenerating production script…" }));
    try {
      const c = concepts[ci];
      const prompt = `Generate a new production_script for this Mob Control ad concept. Return ONLY a JSON object with a single key "production_script" containing an array of steps.

CONCEPT:
Title: ${c.title}
Hook: ${c.hook_description}
Unit evolution: ${(c.unit_evolution_chain||[]).join(" → ")}
Lane design: ${c.lane_design||""}
Tension moments: ${(c.tension_moments||[]).join("; ")}
Upgrade triggers: ${(c.upgrade_triggers||[]).join("; ")}
Visual identity: ${JSON.stringify(c.visual_identity||{})}

Each production_script step must have: time (e.g. "0:00–0:02"), action (what happens in the game), visual_cue (what Gemini renders), audio_cue (sound design note).
Generate 6–8 steps covering hook → gates → first upgrade → swarm peak → almost-fail → loss/win.
Return ONLY: {"production_script": [{time, action, visual_cue, audio_cue}]}`;

      const result = await callGeminiDirect(prompt, [{ text: "Return the production_script JSON only." }]);
      if (Array.isArray(result?.production_script)) {
        setConcepts(p => p.map((concept, i) => i === ci ? { ...concept, production_script: result.production_script } : concept));
        setRefineErr(p => ({ ...p, [ci]: "✓ Production script regenerated." }));
      } else {
        throw new Error("No production_script returned");
      }
    } catch (err: any) {
      setRefineErr(p => ({ ...p, [ci]: "Script regen failed: " + (err as Error).message }));
    } finally {
      setRefining(p => ({ ...p, [ci]: false }));
    }
  };

    const formatBriefAsHTML = (c: Concept, ci: number): string => {
    const vi = c.visual_identity || {};
    const chain = (c.unit_evolution_chain||[]).join(" → ");
    const seg = (c as any).target_segment||"Whale + Dolphin";

    const section = (title: string, body: string) =>
      `<div style="margin:0 0 18px"><div style="font-size:10px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">${title}</div><div style="font-size:13px;color:#e6edf3;line-height:1.6">${body}</div></div>`;

    const pill = (t: string) => `<span style="display:inline-block;font-size:10px;padding:2px 8px;border-radius:4px;background:#1d2d3f;color:#58a6ff;border:0.5px solid #1f6feb;margin:2px 2px 2px 0">${t}</span>`;

    const renders = (["start","middle","end","hook"] as const)
      .map(scene => {
        const img = c[`visual_${scene}` as keyof Concept] as string|undefined;
        return img
          ? `<div style="text-align:center"><div style="font-size:9px;color:#8b949e;margin-bottom:4px;text-transform:uppercase">${scene}</div><img src="${img}" style="width:100%;border-radius:6px;display:block"/></div>`
          : `<div style="aspect-ratio:9/16;background:#161b22;border-radius:6px;display:flex;align-items:center;justify-content:center"><span style="font-size:10px;color:#484f58">${scene}</span></div>`;
      });

    const scriptRows = Array.isArray(c.production_script) ? c.production_script.map((s:any,i:number) =>
      `<tr style="background:${i%2===0?"#161b22":"#0d1117"}"><td style="padding:6px 10px;color:#58a6ff;white-space:nowrap;vertical-align:top;font-size:11px">${s.time||""}</td><td style="padding:6px 10px;font-size:11px;color:#e6edf3">${s.action||""}</td><td style="padding:6px 10px;font-size:11px;color:#8b949e;font-style:italic">${s.visual_cue||""}</td><td style="padding:6px 10px;font-size:11px;color:#6e7681">${s.audio_cue||""}</td></tr>`
    ).join("") : "";

    const netAdapt = c.network_adaptations ? (["AppLovin","Facebook","Google","TikTok"] as const)
      .filter(n => c.network_adaptations?.[n])
      .map(n => `<div style="margin-bottom:6px"><span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;background:#1d2d3f;color:#58a6ff;margin-right:6px">${n}</span><span style="font-size:12px;color:#8b949e">${c.network_adaptations![n]}</span></div>`)
      .join("") : "";

    return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;padding:24px;max-width:900px;margin:0 auto">
<div style="border-bottom:1px solid #21262d;padding-bottom:16px;margin-bottom:24px">
  <div style="font-size:11px;color:#8b949e;margin-bottom:4px">LEVELLY CREATIVE BRIEF · CONCEPT ${ci+1} · ${seg}</div>
  <div style="font-size:22px;font-weight:700;color:#e6edf3;margin-bottom:6px">${c.title||""}</div>
  <div style="font-size:13px;color:#8b949e">${c.objective||""}</div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
<div>
${(c as any).analysis?.strategy ? section("Strategy", (c as any).analysis.strategy) : ""}
${section("Hook", `<strong style="color:#58a6ff">${(c as any).hook_type||"Challenge"} at ${(c as any).hook_timing_seconds??0}s</strong><br/>${c.hook_description||""}`)}
${chain ? section("Unit evolution chain", pill(chain)) : ""}
${vi.environment ? section("Visual identity", [
  `Biome: <strong>${vi.environment}</strong>`,
  vi.lighting ? `Lighting: ${vi.lighting}` : "",
  vi.player_mob_color ? `Player mobs: ${vi.player_mob_color} · Enemy: ${vi.enemy_mob_color||"red"}` : "",
  vi.mood_notes ? `Mood: ${vi.mood_notes}` : ""
].filter(Boolean).join("<br/>")) : ""}
${c.lane_design ? section("Lane design", c.lane_design) : ""}
${(c.upgrade_triggers||[]).length ? section("Upgrade triggers", (c.upgrade_triggers||[]).map((t:string)=>`↑ ${t}`).join("<br/>")) : ""}
${(c.tension_moments||[]).length ? section("Tension moments", (c.tension_moments||[]).map((t:string)=>`⚡ ${t}`).join("<br/>")) : ""}
${c.engagement_hooks ? section("Engagement hooks", c.engagement_hooks) : ""}
${netAdapt ? section("Network adaptations", netAdapt) : ""}
</div>

<div>
<div style="font-size:10px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Scene renders</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:20px">${renders.join("")}</div>
</div>
</div>

${scriptRows ? `<div style="margin-top:8px"><div style="font-size:10px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Production script</div><table style="width:100%;border-collapse:collapse;border:0.5px solid #21262d;border-radius:8px;overflow:hidden"><thead><tr style="background:#161b22"><th style="padding:6px 10px;text-align:left;font-size:9px;color:#8b949e;font-weight:600;text-transform:uppercase">Time</th><th style="padding:6px 10px;text-align:left;font-size:9px;color:#8b949e;font-weight:600;text-transform:uppercase">Action</th><th style="padding:6px 10px;text-align:left;font-size:9px;color:#8b949e;font-weight:600;text-transform:uppercase">Visual cue</th><th style="padding:6px 10px;text-align:left;font-size:9px;color:#8b949e;font-weight:600;text-transform:uppercase">Audio cue</th></tr></thead><tbody>${scriptRows}</tbody></table></div>` : ""}

<div style="margin-top:20px;padding-top:12px;border-top:1px solid #21262d;font-size:10px;color:#484f58">Generated by Levelly — MOC Creative Intelligence</div>
</body></html>`;
  };

    const handleRefineConcept = async (ci: number, prompt: string) => {
    if (!prompt.trim()) return;
    setRefining(p => ({ ...p, [ci]: true }));
    setRefineErr(p => ({ ...p, [ci]: "" }));
    try {
      const current = concepts[ci];
      const lp = prompt.toLowerCase();

      // Detect which field groups the user wants to change
      const wantsVisual = /biome|environment|lighting|forest|desert|snow|bunker|volcano|cyber|meadow|toxic|mob color|enemy color/.test(lp);
      const wantsEvolution = /cannon|tier|upgrade|evolution|chain|simple|double|triple|tank|golden jet/.test(lp);
      const wantsHook = /hook|opening|first second|thumb|engage/.test(lp);
      const wantsLane = /lane|gate|path|sub.lane|left|right|center/.test(lp);
      const wantsTension = /tension|almost.fail|dramatic|threat|giant|boss|survive/.test(lp);

      // Build the subset of fields to send
      const fieldsToSend: Partial<Concept> = {};
      const fieldNames: string[] = [];
      if (wantsVisual || (!wantsEvolution && !wantsHook && !wantsLane && !wantsTension)) {
        (fieldsToSend as any).visual_identity = current.visual_identity;
        fieldNames.push("visual_identity");
      }
      if (wantsEvolution) {
        (fieldsToSend as any).unit_evolution_chain = current.unit_evolution_chain;
        (fieldsToSend as any).cannon_count_progression = current.cannon_count_progression;
        (fieldsToSend as any).upgrade_triggers = current.upgrade_triggers;
        fieldNames.push("unit_evolution_chain","cannon_count_progression","upgrade_triggers");
      }
      if (wantsHook) {
        (fieldsToSend as any).hook_description = current.hook_description;
        (fieldsToSend as any).hook_timing_seconds = current.hook_timing_seconds;
        (fieldsToSend as any).engagement_hooks = current.engagement_hooks;
        fieldNames.push("hook_description","hook_timing_seconds");
      }
      if (wantsLane) {
        (fieldsToSend as any).lane_design = current.lane_design;
        fieldNames.push("lane_design");
      }
      if (wantsTension) {
        (fieldsToSend as any).tension_moments = current.tension_moments;
        fieldNames.push("tension_moments");
      }

      // Send only the relevant fields to Gemini
      const result = await callGeminiDirect(
        refinementSystem(fieldsToSend, prompt, fieldNames),
        [{ text: "Return only the modified fields as JSON." }]
      );

      // Merge ONLY the fields that were sent — never touch what wasn't in fieldsToSend
      const merged: Concept = { ...current };
      for (const key of fieldNames) { if (key in result) (merged as any)[key] = (result as any)[key]; }

      // Always clear renders after any refinement — brief changed means renders are stale
      const updated: Concept = { ...merged, visual_hook: undefined, visual_start: undefined, visual_middle: undefined, visual_end: undefined };

      setConcepts(p => p.map((c, i) => i === ci ? updated : c));
      setRefineTexts(p => ({ ...p, [ci]: "" }));

      const changedList = fieldNames.join(", ");
      setRefineErr(p => ({ ...p, [ci]: `✓ Updated ${changedList} — renders cleared. Re-render with the updated brief.` }));
    } catch (err: any) {
      setRefineErr(p => ({ ...p, [ci]: "Refine failed: " + (err as Error).message }));
    } finally {
      setRefining(p => ({ ...p, [ci]: false }));
    }
  };

    const handleRenderScene=async(ci: number,scene: "hook"|"start"|"middle"|"end")=>{
    const k=`${ci}-${scene}`; setRenderingScene(p=>({...p,[k]:true}));
    // Clear any previous error for this slot
    setConcepts(p=>p.map((c,i)=>i===ci?{...c,[`render_err_${scene}`]:undefined}:c));
    try {
      const concept=concepts[ci]; const vi=concept.visual_identity;
      const chain: string[] = concept.unit_evolution_chain || [];
      const unitAtScene = {
        hook: chain[0] || "Simple Cannon",
        start: chain[0] || "Simple Cannon",
        middle: chain[Math.floor(chain.length / 2)] || chain[0] || "Triple Cannon",
        end: chain[chain.length - 1] || chain[0] || "Tank",
      }[scene];
      const refParts=pickRelevantRefs(vi, unitAtScene);
      const prevParts: any[]=[];

      if(scene==="hook"){
        // Hook rendered LAST — uses Start/Middle/End as style anchors
        if(concept.visual_start){ prevParts.push({text:"### START SCENE — match art style, cannon, mobs, environment exactly:"}); prevParts.push({inlineData:{mimeType:parseDataURI(concept.visual_start).mimeType,data:parseDataURI(concept.visual_start).data}}); }
        if(concept.visual_middle){ prevParts.push({text:"### MIDDLE SCENE — also match:"}); prevParts.push({inlineData:{mimeType:parseDataURI(concept.visual_middle).mimeType,data:parseDataURI(concept.visual_middle).data}}); }
        if(concept.visual_end){ prevParts.push({text:"### END SCENE — also match:"}); prevParts.push({inlineData:{mimeType:parseDataURI(concept.visual_end).mimeType,data:parseDataURI(concept.visual_end).data}}); }
      } else {
        // Start→Middle→End chain: each scene references the previous
        if(scene==="middle"&&concept.visual_start){ prevParts.push({text:"EDIT THIS IMAGE to show the mid-battle state. KEEP IDENTICAL: cannon model/color/shape, gate colors/positions, road texture, environment, mob blob shape. CHANGE ONLY: increase mob density to fill 45% of lane, reduce enemy HP bar to 50%, show upgrade debris on right lane."}); prevParts.push({inlineData:{mimeType:parseDataURI(concept.visual_start).mimeType,data:parseDataURI(concept.visual_start).data}}); }
        if(scene==="end"&&concept.visual_middle){ prevParts.push({text:"EDIT THIS IMAGE to show the almost-fail state. KEEP IDENTICAL: cannon model/color/shape, gate positions, road texture, environment. CHANGE ONLY: reduce player mobs to 3-5 tiny blobs, set enemy HP bar to near-empty sliver, show tension."}); prevParts.push({inlineData:{mimeType:parseDataURI(concept.visual_middle).mimeType,data:parseDataURI(concept.visual_middle).data}}); }
      }

      const continuityNote = scene === "hook"
        ? `This is a CINEMATIC CLOSE-UP, not top-down. Match the exact art style, colours, cannon design, and mob appearance from the 3 scene references above. Only the composition and framing changes.`
        : scene === "middle" && concept.visual_start
          ? `IMAGE EDITING MODE: You are editing the START SCENE image provided. DO NOT redraw from scratch. Modify ONLY: mob count (increase to fill 45% of lane), enemy HP bar (set to 50%). Everything else — cannon shape, color, gate appearance, road, trees, environment — must be pixel-identical to the source image.`
          : scene === "end" && concept.visual_middle
          ? `IMAGE EDITING MODE: You are editing the MIDDLE SCENE image provided. DO NOT redraw from scratch. Modify ONLY: reduce player mobs to 3-5 blobs, set enemy HP bar to near-empty. Keep cannon, gates, road, and environment identical.`
          : undefined;

      const url=await callImageDirect(imagePromptFn(concept,scene,continuityNote),[...refParts,...prevParts]);
      setConcepts(p=>p.map((c,i)=>i===ci?{...c,[`visual_${scene}`]:url}:c));
    } catch(err: any){ setConcepts(p=>p.map((c,i)=>i===ci?{...c,[`render_err_${scene}`]:(err as Error).message}:c)); }
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
        <div onClick={()=>{ setZoomedFrame(null); setZoomedFrameList([]); }} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center" }}>
          {zoomedFrameList.length>1&&zoomedFrameIndex>0&&(
            <div onClick={e=>{e.stopPropagation();setZoomedFrameIndex(i=>{const p=Math.max(i-1,0);setZoomedFrame(zoomedFrameList[p]);return p;})}} style={{ position:"absolute",left:20,top:"50%",transform:"translateY(-50%)",fontSize:32,color:"#fff",opacity:0.7,cursor:"pointer",background:"rgba(255,255,255,0.1)",borderRadius:"50%",width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center",userSelect:"none" }}>‹</div>
          )}
          <img src={zoomedFrame} alt="frame" style={{ maxHeight:"90vh",maxWidth:"calc(100vw - 120px)",borderRadius:10,boxShadow:"0 0 60px rgba(0,0,0,0.8)",objectFit:"contain" }} onClick={e=>e.stopPropagation()} />
          {zoomedFrameList.length>1&&zoomedFrameIndex<zoomedFrameList.length-1&&(
            <div onClick={e=>{e.stopPropagation();setZoomedFrameIndex(i=>{const n=Math.min(i+1,zoomedFrameList.length-1);setZoomedFrame(zoomedFrameList[n]);return n;})}} style={{ position:"absolute",right:20,top:"50%",transform:"translateY(-50%)",fontSize:32,color:"#fff",opacity:0.7,cursor:"pointer",background:"rgba(255,255,255,0.1)",borderRadius:"50%",width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center",userSelect:"none" }}>›</div>
          )}
          <div style={{ position:"absolute",top:16,left:0,right:0,display:"flex",justifyContent:"center",gap:16,alignItems:"center" }}>
            {zoomedFrameList.length>1&&<span style={{ fontSize:12,color:"rgba(255,255,255,0.6)" }}>{zoomedFrameIndex+1} / {zoomedFrameList.length}</span>}
            <span onClick={()=>{ setZoomedFrame(null); setZoomedFrameList([]); }} style={{ fontSize:18,color:"rgba(255,255,255,0.5)",cursor:"pointer" }}>✕</span>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{ display:"none" }} onChange={handleUpload} />
      <input ref={importRef} type="file" accept=".json" style={{ display:"none" }} onChange={importLibrary} />

      {/* Sidebar */}
      <div style={{ position:"fixed",top:0,left:0,width:SB,height:"100vh",background:D.surface,borderRight:`0.5px solid ${D.border}`,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:12,gap:6,zIndex:200 }}>
        <div style={{ width:32,height:32,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",background:D.surface2,border:"none",color:D.text,cursor:"default" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 6.5L8 1l7 5.5V15H1V6.5zm1 .9V14h4v-3h4v3h4V7.4L8 2.5 2 7.4z"/></svg>
        </div>
        <div style={{ marginTop:"auto",marginBottom:12,width:28,height:28,borderRadius:7,background:"rgba(210,153,34,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,color:D.gold,cursor:"default",letterSpacing:"0.02em" }}>L</div>
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

          {/* 3-column layout: Analyse + Brief (equal) + Library (narrow) */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 0.55fr",gap:12,marginBottom:12,alignItems:"stretch" }}>
            {/* Analyse card */}
            <div onClick={()=>{ setAnalysePanelOpen(p=>!p); setBriefPanelOpen(false); setLibPanelOpen(false); }}
              style={{ background:analysePanelOpen?"#1a2130":D.surface,border:`0.5px solid ${analysePanelOpen?D.greenBdr:D.border2}`,borderRadius:12,padding:20,cursor:"pointer",transition:"border-color .18s,background .18s,transform .12s" }}
              onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.transform="translateY(-1px)"; (e.currentTarget as HTMLDivElement).style.borderColor=D.greenBdr; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.transform=""; (e.currentTarget as HTMLDivElement).style.borderColor=analysePanelOpen?D.greenBdr:D.border2; }}>
              <div style={{ width:38,height:38,borderRadius:10,background:D.greenBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14 }}>
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="#3fb950" strokeWidth="1.5"/><line x1="9.5" y1="9.5" x2="14" y2="14" stroke="#3fb950" strokeWidth="1.5"/></svg>
              </div>
              <div style={{ marginBottom:10 }}><span style={{ fontSize:10,padding:"3px 10px",borderRadius:20,border:`1px solid ${D.greenBdr}`,color:D.green }}>Most used</span></div>
              <div style={{ fontSize:15,fontWeight:500,marginBottom:6 }}>Analyse creative</div>
              <div style={{ fontSize:12,color:D.textMuted,lineHeight:1.6 }}>Drop any video — MOC ad, competitor, or market reference. Extracts DNA: hook timing, gate patterns, emotional beats, cannon chain.</div>
            </div>

            {/* Generate brief card */}
            <div onClick={()=>{ setBriefPanelOpen(p=>!p); setAnalysePanelOpen(false); setLibPanelOpen(false); }}
              style={{ background:briefPanelOpen?"#1a2130":D.surface,border:`0.5px solid ${briefPanelOpen?D.blueDark:D.border2}`,borderRadius:12,padding:20,cursor:"pointer",transition:"border-color .18s,background .18s,transform .12s" }}
              onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.transform="translateY(-1px)"; (e.currentTarget as HTMLDivElement).style.borderColor=D.blueDark; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.transform=""; (e.currentTarget as HTMLDivElement).style.borderColor=briefPanelOpen?D.blueDark:D.border2; }}>
              <div style={{ width:38,height:38,borderRadius:10,background:D.blueBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14 }}>
                <svg width="22" height="22" viewBox="0 0 16 16" fill="#58a6ff"><path d="M2 2h9l3 3v9H2V2zm1 1v10h10V6.5L9.5 3H3z"/></svg>
              </div>
              <div style={{ marginBottom:10 }}><span style={{ fontSize:10,padding:"3px 10px",borderRadius:20,border:`1px solid ${D.blueDark}`,color:D.blue }}>Primary output</span></div>
              <div style={{ fontSize:15,fontWeight:500,marginBottom:6 }}>Generate brief</div>
              <div style={{ fontSize:12,color:D.textMuted,lineHeight:1.6 }}>Describe your idea — biome, network, hook. Generates a master brief with lane design, tension moments, and scene renders.</div>
            </div>

            {/* Library card — narrow */}
            <div onClick={()=>{ setLibPanelOpen(p=>!p); setBriefPanelOpen(false); setAnalysePanelOpen(false); }}
              style={{ background:libPanelOpen?"#1a2130":D.surface,border:`0.5px solid ${libPanelOpen?D.gold:D.border2}`,borderRadius:12,padding:16,cursor:"pointer",transition:"border-color .18s,background .18s,transform .12s",display:"flex",flexDirection:"column" as const }}>
              <div onMouseEnter={e=>{ (e.currentTarget.parentElement as HTMLDivElement).style.transform="translateY(-1px)"; (e.currentTarget.parentElement as HTMLDivElement).style.borderColor=D.gold; }}
                onMouseLeave={e=>{ (e.currentTarget.parentElement as HTMLDivElement).style.transform=""; (e.currentTarget.parentElement as HTMLDivElement).style.borderColor=libPanelOpen?D.gold:D.border2; }}
                style={{ flex:1 }}>
                <div style={{ width:32,height:32,borderRadius:8,background:"rgba(210,153,34,0.12)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:12 }}>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill={D.gold}><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                </div>
                <div style={{ fontSize:13,fontWeight:500,marginBottom:8 }}>Library</div>
                <div style={{ fontSize:11,color:D.textMuted,lineHeight:1.8 }}>{lib.length} entries<br/>{activeWinners} active<br/>{topVel>0?`$${topVel>=1000?Math.round(topVel/1000)+"K":topVel}/d top vel`:""}</div>
              </div>
              <div style={{ fontSize:10,color:libPanelOpen?D.gold:D.textDim,marginTop:10 }}>{libPanelOpen?"▲ collapse":"▼ expand"}</div>
            </div>
          </div>

          {/* Library expanded inline — shows directly below cards */}
          {libPanelOpen&&(
            <div style={{ background:D.surface,border:`0.5px solid ${D.gold}`,borderRadius:10,marginBottom:14,animation:"slideIn .2s ease-out",overflow:"hidden" }}>
              {/* Stats row */}
              <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderBottom:`0.5px solid ${D.border}` }}>
                {[{n:lib.length,label:"CREATIVES",color:D.text},{n:winners,label:"WINNERS",color:D.blue},{n:topVel>0?`$${topVel>=1000?Math.round(topVel/1000)+"K":topVel}`:"—",label:"TOP VELOCITY",color:D.gold},{n:networkSet.size||"—",label:"NETWORKS",color:D.green}].map(({n,label,color},i)=>(
                  <div key={label} style={{ padding:"10px 16px",borderRight:i<3?`0.5px solid ${D.border}`:"none" }}>
                    <div style={{ fontSize:18,fontWeight:500,color,lineHeight:1 }}>{n}</div>
                    <div style={{ fontSize:9,letterSpacing:"0.1em",color:D.textMuted,marginTop:3 }}>{label}</div>
                  </div>
                ))}
              </div>
              {/* Filter + actions */}
              <div style={{ display:"flex",gap:5,padding:"8px 16px",borderBottom:`0.5px solid ${D.border}`,flexWrap:"wrap" as const,alignItems:"center" }}>
                {(["all","winner","scalable","inspiration","failed"] as SortMode[]).map(s=>(
                  <button key={s} onClick={e=>{ e.stopPropagation(); setLibSort(s); }} style={{ padding:"3px 10px",fontSize:10,borderRadius:20,cursor:"pointer",fontFamily:"inherit",border:`0.5px solid ${libSort===s?(s==="all"?D.border2:TIER_STYLE[s]?.border??D.border2):D.border2}`,background:libSort===s?(s==="all"?D.surface2:TIER_STYLE[s]?.bg??"transparent"):"transparent",color:libSort===s?(s==="all"?D.text:TIER_STYLE[s]?.text??D.text):D.textMuted }}>
                    {s==="all"?"All":s.charAt(0).toUpperCase()+s.slice(1)}
                  </button>
                ))}
                <span style={{ fontSize:10,color:D.textDim,marginLeft:"auto" }}>by spend · fatigued last</span>
              </div>
              <div style={{ display:"flex",gap:6,padding:"8px 16px",borderBottom:`0.5px solid ${D.border}`,flexWrap:"wrap" as const }}>
                {lib.length>0&&(<><button style={btnSec} onClick={e=>{ e.stopPropagation(); handleReanalyzeAll(); }} disabled={reanalyzingAll||analyzing}>{reanalyzingAll?"Re-analyzing…":"Re-analyze all"}</button><button style={btnSec} onClick={e=>{ e.stopPropagation(); exportLibrary(); }}>Export</button><button style={btnSec} onClick={e=>{ e.stopPropagation(); if(confirm("Clear library?")) saveLib([]); }}>Clear</button></>)}
                <button style={btnSec} onClick={e=>{ e.stopPropagation(); importRef.current?.click(); }}>Import</button>
                <button style={btnPri} onClick={e=>{ e.stopPropagation(); setLibPanelOpen(false); setShowModal(true); }} disabled={analyzing||reanalyzingAll}>{analyzing?"Analyzing…":"+ Upload"}</button>
              </div>
              {reanalysisProgress&&<div style={{ fontSize:11,color:D.blue,background:D.blueBg,border:`0.5px solid ${D.blueDark}`,borderRadius:7,padding:"7px 12px",margin:"8px 16px" }}>{reanalysisProgress}</div>}
              {/* Library cards */}
              <div style={{ maxHeight:480,overflowY:"auto" as const,padding:"8px 0" }}>
                {lib.length===0&&!analyzing&&libraryLoaded&&<div style={{ padding:"2rem 16px",textAlign:"center" as const }}><p style={{ margin:0,fontSize:12,color:D.textMuted }}>Upload MOC ads to build your Creative DNA library.</p></div>}
                {sortedLib.map((d,di)=><LibraryCard key={d.id} d={d} di={di} expandedDNA={expandedDNA} setExpandedDNA={setExpandedDNA} lib={lib} saveLib={saveLib} reanalyzingIds={reanalyzingIds} handleReanalyzeSingle={handleReanalyzeSingle} onZoomFrame={(src,list,idx)=>{ setZoomedFrame(src); setZoomedFrameList(list??[src]); setZoomedFrameIndex(idx??0); }} isReanalyzing={reanalyzingEntry === d.id} onReupload={handleReupload} />)}
              </div>
            </div>
          )}

          {briefPanelOpen&&!(!generating&&concepts.length>=4)&&(
            /* Brief input panel - hidden when all concepts generated */
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
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderTop:`0.5px solid ${D.border}` }}>
                <span style={{ fontSize:11,color:D.textDim }}>Generating for <strong style={{ color:D.text }}>Whale</strong> + <strong style={{ color:D.text }}>Dolphin</strong></span>
                <button onClick={generating ? undefined : handleGenerateBrief} style={{ ...btnPri,display:"flex",alignItems:"center",gap:6,background:generating?"#1a7f37":D.blueDark,border:generating?`1px solid ${D.greenBdr}`:"none",transition:"background .3s",cursor:generating?"default":"pointer" }}>
                  {generating?<><span style={{ width:10,height:10,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",display:"inline-block",animation:"spin .6s linear infinite" }} />Generating…</>:"Generate concepts ↗"}
                </button>
              </div>
              {briefErr&&<div style={{ fontSize:11,color:D.red,background:D.redBg,border:`0.5px solid #6e2020`,borderRadius:7,padding:"7px 12px",margin:"0 16px 12px" }}>{briefErr}</div>}
            </div>
          )}

          {analysePanelOpen&&(
            <div style={{ background:D.surface,border:`1.5px solid ${D.greenBdr}`,borderRadius:10,padding:"20px",marginBottom:14,animation:"slideIn .2s ease-out",transition:"all .2s" }}>
              <p style={{ margin:0,fontSize:13,color:D.textMuted }}>Drop a video file or paste a URL to analyse it and add it to the DNA library.</p>
              <div style={{ display:"flex",gap:8,marginTop:12 }}>
                <button style={btnPri} onClick={()=>{ setAnalysePanelOpen(false); setShowModal(true); }}>+ Upload video</button>
                <button style={btnSec} onClick={()=>setAnalysePanelOpen(false)}>Cancel</button>
              </div>
            </div>
          )}

          {(!libPanelOpen&&!analysePanelOpen)&&briefAnalysis&&(
<div style={{ background:"#0d1f35",border:`1.5px solid ${D.blueDark}`,borderRadius:10,padding:"16px 18px",marginBottom:16,boxShadow:`0 0 0 1px ${D.blueBg}` }}>
              <div style={{ fontSize:9,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase" as const,color:D.textDim,marginBottom:8 }}>Creative strategy</div>
              <p style={{ margin:"0 0 12px",fontSize:12,lineHeight:1.75,color:D.text }}>{briefAnalysis.strategy}</p>
              <div style={{ display:"flex",gap:16,flexWrap:"wrap" as const,paddingTop:10,borderTop:`0.5px solid ${D.border}` }}>
                <div style={{ display:"flex",flexDirection:"column" as const,gap:4 }}>
                  <span style={{ fontSize:9,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase" as const,color:D.textDim }}>DNA sources</span>
                  <div style={{ display:"flex",gap:4,flexWrap:"wrap" as const }}>
                    {(briefAnalysis.dna_sources||briefAnalysis.patterns_used?.split(",")).map((s:string,i:number)=>(
                      <span key={i} style={{ fontSize:10,padding:"2px 7px",borderRadius:4,background:D.blueBg,color:D.blue,border:`0.5px solid ${D.blueDark}`,fontWeight:500 }}>{s.trim()}</span>
                    ))}
                  </div>
                </div>
                {briefAnalysis.segment_insight&&<div style={{ display:"flex",flexDirection:"column" as const,gap:4,flex:1,minWidth:160 }}>
                  <span style={{ fontSize:9,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase" as const,color:D.textDim }}>Segment insight</span>
                  <span style={{ fontSize:11,color:D.textMuted,lineHeight:1.5 }}>{briefAnalysis.segment_insight}</span>
                </div>}
              </div>
            </div>
          )}

          {(!libPanelOpen&&!analysePanelOpen)&&concepts.map((c,ci)=>(
            <div key={ci} style={{ background:expandedConcept===ci?"#161f2e":D.surface,border:`0.5px solid ${(c as any).is_experimental?"#9d174d":D.border}`,borderRadius:10,padding:0,marginBottom:10,overflow:"hidden",transition:"background .15s,box-shadow .15s,border-color .15s",boxShadow:expandedConcept===ci?`0 0 0 2px ${D.blueBg}`:"none",borderLeft:`3px solid ${expandedConcept===ci?D.blue:"transparent"}`,animation:`slideIn .2s ease-out ${ci*0.05}s both` }}>
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
                  <div style={{ fontSize:15,fontWeight:600,color:expandedConcept===ci?D.text:D.textMuted,marginBottom:6,transition:"color .15s" }}>{c.title}</div>
                  {c.is_experimental&&c.experimental_note&&<p style={{ margin:"0 0 6px",fontSize:11,color:"#f472b6",fontStyle:"italic" }}>{c.experimental_note}</p>}
                  <p style={{ margin:"0 0 10px",fontSize:12,color:D.textMuted,lineHeight:1.5 }}>{c.objective}</p>
                  <div style={{ display:"flex",gap:6,flexWrap:"wrap" as const }}>
                    {(c as any).hook_timing_seconds!=null&&<span style={{ fontSize:10,padding:"2px 8px",borderRadius:4,background:D.blueBg,color:D.blue,border:`0.5px solid ${D.blueDark}` }}>Hook {(c as any).hook_timing_seconds}s</span>}
                    {Array.isArray((c as any).unit_evolution_chain)&&(c as any).unit_evolution_chain.length>0&&<span style={{ fontSize:10,padding:"2px 8px",borderRadius:4,background:D.surface2,color:D.textMuted,border:`0.5px solid ${D.border}` }}>{(c as any).unit_evolution_chain.join(" → ")}</span>}
                    {c.visual_identity?.environment&&<span style={{ fontSize:10,padding:"2px 8px",borderRadius:4,background:D.surface2,color:D.textMuted,border:`0.5px solid ${D.border}` }}>{c.visual_identity.environment}</span>}
                    {c.quality_score&&<span style={{ fontSize:10,padding:"2px 8px",borderRadius:4,background:c.quality_score.overall>=85?D.greenBg:c.quality_score.overall>=75?D.blueBg:D.surface2,color:c.quality_score.overall>=85?D.green:c.quality_score.overall>=75?D.blue:D.textMuted,border:`0.5px solid ${c.quality_score.overall>=85?D.greenBdr:c.quality_score.overall>=75?D.blueDark:D.border}`,fontWeight:600 }}>Score {c.quality_score.overall}</span>}
                  </div>
                </div>
                <div style={{ display:"flex",flexDirection:"column" as const,alignItems:"flex-end",gap:4,marginLeft:16,flexShrink:0 }}>
                  {c.quality_score&&<><div style={{ fontSize:24,fontWeight:600,color:scoreColor(c.quality_score.overall),lineHeight:1 }}>{c.quality_score.overall}</div><div style={{ fontSize:9,color:D.textDim }}>quality</div></>}
  <div style={{ fontSize:11,padding:"4px 10px",borderRadius:6,background:expandedConcept===ci?D.blueBg:D.surface2,color:expandedConcept===ci?D.blue:D.textMuted,border:`0.5px solid ${expandedConcept===ci?D.blueDark:D.border2}`,fontWeight:500,marginTop:4,whiteSpace:"nowrap" as const }}>{expandedConcept===ci?"▲ Collapse":"▼ Expand"}</div>
                  <div onClick={async e=>{ e.stopPropagation();
                    try {
                      const html = formatBriefAsHTML(c,ci);
                      await navigator.clipboard.write([new ClipboardItem({
                        "text/html": new Blob([html],{type:"text/html"}),
                        "text/plain": new Blob([c.title+(c.objective?"\n"+c.objective:"")],{type:"text/plain"})
                      })]);
                    } catch {
                      // Fallback: plain text if ClipboardItem not supported
                      const lines=[c.title||"",c.objective||"",c.hook_description||"",c.lane_design||"",(c.unit_evolution_chain||[]).join(" → ")].filter(Boolean).join("\n");
                      await navigator.clipboard.writeText(lines);
                    }
                    setCopiedConcept(ci); setTimeout(()=>setCopiedConcept(null),2500);
                  }} style={{ fontSize:11,padding:"4px 10px",borderRadius:6,background:copiedConcept===ci?D.greenBg:D.blueBg,color:copiedConcept===ci?D.green:D.blue,border:`0.5px solid ${copiedConcept===ci?D.greenBdr:D.blueDark}`,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap" as const,marginTop:2,transition:"background .2s,color .2s,border-color .2s" }}>{copiedConcept===ci?"✓ Copied!":"⎘ Copy"}</div>
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
                      {c.cannon_count_progression&&<div style={{ marginTop:6,fontSize:11,color:D.textMuted }}><span style={{ color:D.gold,fontWeight:500 }}>Cannon count: </span>{c.cannon_count_progression}</div>}
                    </div>
                  )}
                  {c.lane_design&&(
                    <div style={{ marginBottom:14 }}>
                      <span style={labelStyle}>Lane design</span>
                      <p style={{ margin:0,fontSize:11,color:D.textMuted,lineHeight:1.6 }}>{c.lane_design}</p>
                    </div>
                  )}
                  {c.upgrade_triggers && c.upgrade_triggers.length > 0 && (
                    <div style={{ marginBottom:14 }}>
                      <span style={labelStyle}>Upgrade triggers</span>
                      <div style={{ display:"flex",flexDirection:"column" as const,gap:3 }}>
                        {c.upgrade_triggers.map((t: string,i: number)=>(
                          <div key={i} style={{ fontSize:11,color:D.textMuted,padding:"4px 8px",background:D.surface2,borderRadius:5 }}>↑ {t}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.tension_moments && c.tension_moments.length > 0 && (
                    <div style={{ marginBottom:14 }}>
                      <span style={labelStyle}>Tension moments</span>
                      <div style={{ display:"flex",flexDirection:"column" as const,gap:3 }}>
                        {c.tension_moments.map((t: string,i: number)=>(
                          <div key={i} style={{ fontSize:11,color:D.red,padding:"4px 8px",background:D.redBg,borderRadius:5,border:`0.5px solid #6e2020` }}>⚡ {t}</div>
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

                  <div style={{ marginBottom:14 }}>
                    <span style={labelStyle}>Scene renders</span>
                    {c.is_experimental&&<div style={{ marginBottom:8,padding:"7px 12px",background:"#2a1a2e",border:"0.5px solid #9d174d",borderRadius:7,fontSize:11,color:"#f472b6" }}>⚠ Experimental biome — no spend data. Use for inspiration only.</div>}
                    {!c.is_experimental&&PROVEN_BIOMES.includes(c.visual_identity?.environment)&&<div style={{ marginBottom:8,padding:"7px 12px",background:D.greenBg,border:`0.5px solid ${D.greenBdr}`,borderRadius:7,fontSize:11,color:D.green }}>Render Start → Middle → End first, then Hook last.</div>}
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8 }}>
                      {(["start","middle","end","hook"] as const).map(scene=>{
                        const imgUrl=c[`visual_${scene}` as keyof Concept] as string|undefined;
                        const loading=renderingScene[`${ci}-${scene}`];
                        const isHook=scene==="hook";
                        // Hook needs all 3 scenes first. Others need previous scene.
                        const needsPrev=isHook
                          ? (!c.visual_start||!c.visual_middle||!c.visual_end)
                          : (scene==="middle"&&!c.visual_start)||(scene==="end"&&!c.visual_middle);
                        const isNext=!imgUrl&&!needsPrev&&(
                          (scene==="start"&&!c.visual_start)||
                          (scene==="middle"&&!!c.visual_start&&!c.visual_middle)||
                          (scene==="end"&&!!c.visual_middle&&!c.visual_end)||
                          (scene==="hook"&&!!c.visual_start&&!!c.visual_middle&&!!c.visual_end&&!c.visual_hook)
                        );
                        const sceneColor={start:D.blue,middle:D.gold,end:D.green,hook:D.red}[scene];
                        const borderColor=isNext?sceneColor:D.border;
                        const borderWidth=isNext?"1.5px":"0.5px";
                        const sceneLabel={start:"Start",middle:"Middle",end:"End",hook:"Hook"}[scene];
                        const lockedMsg=isHook?"Render Start, Middle, End first":scene==="middle"?"Render Start first":"Render Middle first";
                        return (
                          <div key={scene} style={{ aspectRatio:"9/16",background:D.surface2,borderRadius:10,border:`${borderWidth} solid ${borderColor}`,overflow:"hidden",display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",cursor:needsPrev?"not-allowed":"pointer",position:"relative" as const,transition:"border-color .2s" }}
                            onClick={()=>(!imgUrl||(c as any)[`render_err_${scene}`])&&!loading&&!needsPrev&&handleRenderScene(ci,scene)}>
                            {isNext&&!imgUrl&&<div style={{ position:"absolute" as const,top:6,left:0,right:0,display:"flex",justifyContent:"center" }}>
                              <span style={{ fontSize:9,padding:"2px 7px",background:sceneColor,color:"#fff",borderRadius:20,fontWeight:600,letterSpacing:"0.05em" }}>{scene==="start"?"START HERE":"RENDER NEXT"}</span>
                            </div>}
                            {imgUrl?<img src={imgUrl} alt={scene} onClick={e=>{e.stopPropagation();const scenes=(["hook","start","middle","end"] as const).map(s=>c[`visual_${s}` as keyof Concept] as string|undefined).filter(Boolean) as string[];const idx=scenes.indexOf(imgUrl!);setZoomedFrameList(scenes);setZoomedFrameIndex(Math.max(idx,0));setZoomedFrame(imgUrl!);}} style={{ width:"100%",height:"100%",objectFit:"contain",background:"#0a0c10",cursor:"zoom-in" }} />
                              :loading?<p style={{ margin:0,fontSize:11,fontWeight:500,color:D.textMuted }}>Rendering…</p>
                              :(c as any)[`render_err_${scene}`]?<div style={{ textAlign:"center" as const,padding:"8px 6px" }}><p style={{ margin:0,fontSize:9,color:D.red,fontWeight:600 }}>Failed — click to retry</p><p style={{ margin:"5px 0 0",fontSize:8,color:D.textDim,wordBreak:"break-word" as const,lineHeight:1.4 }}>{((c as any)[`render_err_${scene}`] as string).slice(0,180)}</p></div>
                              :needsPrev?<div style={{ textAlign:"center" as const,padding:10 }}><p style={{ margin:0,fontSize:10,color:D.textDim,textTransform:"uppercase" as const }}>{sceneLabel}</p><p style={{ margin:"4px 0 0",fontSize:9,color:D.textDim }}>{lockedMsg}</p></div>
                              :<div style={{ textAlign:"center" as const,padding:10,marginTop:isNext?18:0 }}><p style={{ margin:0,fontSize:11,fontWeight:500,textTransform:"uppercase" as const,color:isNext?sceneColor:D.textDim }}>{sceneLabel}</p><p style={{ margin:"4px 0 0",fontSize:9,color:isNext?sceneColor:D.textDim }}>{isNext?"Render next":"Click to render"}</p></div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Refine concept ── */}
                  <div style={{ margin:"16px 0",border:`1.5px solid ${D.blueDark}`,borderRadius:10,overflow:"hidden",background:"#0d1a2d" }}>
                    <div style={{ padding:"12px 16px",borderBottom:`0.5px solid ${D.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                      <span style={{ fontSize:12,fontWeight:600,color:D.blue,letterSpacing:"0.02em" }}>✦ Refine this concept</span>
                      <span style={{ fontSize:11,color:D.textDim }}>Changes apply instantly — renders auto-clear if needed</span>
                    </div>
                    <div style={{ padding:"12px 14px" }}>
                      <div style={{ display:"flex",gap:6,marginBottom:10,flexWrap:"wrap" as const }}>
                        {[
                          {label:"Fix cannon tier",text:"Fix the unit_evolution_chain to exactly match what's described in the brief. Ensure the cannon model shown at each scene matches the correct tier."},
                          {label:"Change biome",text:"Change biome to "},
                          {label:"More tension",text:"Make the almost-fail moment more extreme — reduce surviving mobs to 1-2. Heighten the tension_moments description."},
                          {label:"Aggressive hook",text:"Make the hook more aggressive and threatening. Enemy boss should dominate the frame."},
                          {label:"🔄 Regen renders",text:"__REGEN__"},
                          {label:"📋 Regen script",text:"__REGEN_SCRIPT__"},
                        ].map(({label,text})=>(
                          <button key={label} onClick={()=>{
                            if(text==="__REGEN__"){
                              setConcepts(p=>p.map((cc,i)=>i===ci?{...cc,visual_hook:undefined,visual_start:undefined,visual_middle:undefined,visual_end:undefined}:cc));
                              setRefineErr(p=>({...p,[ci]:"Renders cleared — click render buttons to regenerate."}));
                            } else if(text==="__REGEN_SCRIPT__"){
                              handleRegenScript(ci);
                            } else {
                              setRefineTexts(p=>({...p,[ci]:text}));
                            }
                          }} style={{ fontSize:11,padding:"4px 11px",borderRadius:20,border:`0.5px solid ${label.includes("script")?D.goldBdr:label.includes("Regen")?D.greenBdr:D.blueDark}`,color:label.includes("script")?D.gold:label.includes("Regen")?D.green:D.blue,background:label.includes("script")?D.goldBg:label.includes("Regen")?D.greenBg:D.blueBg,cursor:"pointer",fontFamily:"inherit",transition:"opacity .15s" }}>{label}</button>
                        ))}
                      </div>
                      <textarea
                        value={refineTexts[ci]||""}
                        onChange={e=>setRefineTexts(p=>({...p,[ci]:e.target.value}))}
                        placeholder="Describe what to change… e.g. 'change biome to Desert', 'Triple Cannon should have 3 barrels', 'add a second giant'"
                        rows={3}
                        style={{ width:"100%",boxSizing:"border-box" as const,fontSize:12,padding:"10px 12px",background:D.surface,border:`1px solid ${(refineTexts[ci]||"").trim().length>3?D.blueDark:D.border2}`,borderRadius:8,color:D.text,resize:"vertical" as const,minHeight:70,fontFamily:"inherit",outline:"none",lineHeight:1.6,transition:"border-color .2s",marginBottom:10 }}
                      />
                      <div style={{ display:"flex",gap:8,alignItems:"center",justifyContent:"space-between" }}>
                        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                          {(refineTexts[ci]||"").trim().length>8&&!refining[ci]&&(
                            <button onClick={async()=>{
                              setRefineErr(p=>({...p,[ci]:"Enhancing your prompt…"}));
                              try {
                                const enhanced=await enhanceText(refineTexts[ci],"refine");
                                setRefineTexts(p=>({...p,[ci]:enhanced}));
                                setRefineErr(p=>({...p,[ci]:""}));
                              } catch(e: any) {
                                setRefineErr(p=>({...p,[ci]:"Enhance failed: "+(e as Error).message}));
                              }
                            }} style={{ padding:"8px 14px",fontSize:12,background:"none",border:`1px solid ${D.border2}`,borderRadius:8,color:D.textMuted,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6 }}>
                              <span style={{ fontSize:13 }}>✦</span> Enhance prompt
                            </button>
                          )}
                          {refining[ci]&&(
                            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                              <span style={{ width:14,height:14,borderRadius:"50%",border:`2px solid ${D.blueBg}`,borderTopColor:D.blue,display:"inline-block",animation:"spin .7s linear infinite",flexShrink:0 }} />
                              <span style={{ fontSize:12,color:D.blue }}>Applying refinement…</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={()=>handleRefineConcept(ci,refineTexts[ci]||"")}
                          disabled={refining[ci]||!(refineTexts[ci]||"").trim()}
                          style={{ padding:"9px 20px",fontSize:13,fontWeight:600,background:refining[ci]||!(refineTexts[ci]||"").trim()?"#1a2130":D.blue,border:"none",borderRadius:8,color:refining[ci]||!(refineTexts[ci]||"").trim()?D.textDim:"#fff",cursor:refining[ci]||!(refineTexts[ci]||"").trim()?"not-allowed":"pointer",fontFamily:"inherit",transition:"background .2s,color .2s",letterSpacing:"0.01em" }}>
                          {refining[ci]?"Working…":"Refine →"}
                        </button>
                      </div>
                      {refineErr[ci]&&(
                        <div style={{ marginTop:10,padding:"8px 12px",borderRadius:7,background:refineErr[ci].startsWith("✓")?D.greenBg:refineErr[ci].includes("cleared")||refineErr[ci].includes("Enhancing")?D.blueBg:D.redBg,border:`0.5px solid ${refineErr[ci].startsWith("✓")?D.greenBdr:refineErr[ci].includes("cleared")||refineErr[ci].includes("Enhancing")?D.blueDark:"#6e2020"}`,fontSize:11,color:refineErr[ci].startsWith("✓")?D.green:refineErr[ci].includes("cleared")||refineErr[ci].includes("Enhancing")?D.blue:D.red }}>
                          {refineErr[ci]}
                        </div>
                      )}
                    </div>
                  </div>

                  {Array.isArray(c.production_script)&&c.production_script.length>0&&(
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
                  {Array.isArray(c.performance_hooks)&&c.performance_hooks.length>0&&(
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

                                    {c.network_adaptations&&Object.keys(c.network_adaptations).length>0&&(
                    <div style={{ marginTop:14,paddingTop:12,borderTop:`0.5px solid ${D.border}` }}>
                      <span style={{ ...labelStyle,marginBottom:8 }}>Network adaptations</span>
                      <div style={{ display:"flex",flexDirection:"column" as const,gap:6 }}>
                        {(["AppLovin","Facebook","Google","TikTok"] as const).filter(net=>c.network_adaptations?.[net]).map(net=>{
                          const nc={AppLovin:{bg:D.blueBg,text:D.blue,border:D.blueDark},Facebook:{bg:D.surface2,text:D.textMuted,border:D.border2},Google:{bg:D.greenBg,text:D.green,border:D.greenBdr},TikTok:{bg:D.purpleBg,text:D.purple,border:D.purpleBdr}}[net];
                          return <div key={net} style={{ display:"flex",gap:8,alignItems:"flex-start",fontSize:11,lineHeight:1.5 }}><span style={{ padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:500,flexShrink:0,marginTop:1,background:nc.bg,color:nc.text,border:`0.5px solid ${nc.border}` }}>{net}</span><span style={{ color:D.textMuted }}>{c.network_adaptations![net]}</span></div>;
                        })}
                      </div>
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
