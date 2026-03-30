import { useState, useRef, useCallback, useEffect } from "react";
import { buildReferenceContext, buildReferenceParts, MOC_REFERENCES } from "./refImages";

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
  const parts: any[] = [{ text: "### MOC VISUAL REFERENCES — match this exact art style and game aesthetic precisely:" }];
  selected.forEach(ref => {
    parts.push({ text: `[${ref.category.toUpperCase()}]: ${ref.label.split(".")[0]}` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: ref.base64 } });
  });
  return parts;
}

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
  context: string; manual_frames: File[]; iteration_of?: string;
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

// ─── Constants ────────────────────────────────────────────────────────────────
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
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function velocityPerDay(tier: string, days: number | null | undefined): string | null {
  if (!tier || !days || tier === "sub100K") return null;
  const amounts: Record<string, number> = { "100K": 100000, "300K": 300000, "500K": 500000, "1M": 1000000 };
  const v = amounts[tier]; if (!v) return null;
  return `~$${Math.round(v / days).toLocaleString()}/day`;
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const pill = (bg: string, text: string, border: string): React.CSSProperties => ({
  fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
  background: bg, color: text, border: `0.5px solid ${border}`, whiteSpace: "nowrap" as const,
});
const btnSec: React.CSSProperties = {
  padding: "6px 12px", fontSize: 11, background: "transparent",
  border: `0.5px solid ${D.border2}`, borderRadius: 7,
  color: D.textMuted, cursor: "pointer", fontFamily: "inherit",
};
const btnPri: React.CSSProperties = {
  padding: "7px 14px", fontSize: 11, background: D.blueDark,
  border: "none", borderRadius: 7, color: "#fff",
  cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
};
const btnDel: React.CSSProperties = {
  padding: "4px 9px", fontSize: 11, background: "transparent",
  border: `0.5px solid #6e2020`, borderRadius: 6, color: D.red, cursor: "pointer",
};
const metric: React.CSSProperties = {
  background: "#1c2128", borderRadius: 7, padding: "8px 10px", textAlign: "center",
};
const metricLabel: React.CSSProperties = {
  fontSize: 9, color: D.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3,
};
const label: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, color: D.textDim,
  textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontSize: 12,
  padding: "7px 10px", background: D.bg, border: `0.5px solid ${D.border2}`,
  borderRadius: 7, outline: "none", color: D.text, fontFamily: "inherit",
};
const chip = (active: boolean): React.CSSProperties => ({
  padding: "4px 10px", borderRadius: 20, fontSize: 11, cursor: "pointer",
  border: `0.5px solid ${active ? D.blueDark : D.border2}`,
  background: active ? D.blueBg : "transparent",
  color: active ? D.blue : D.textMuted, fontFamily: "inherit",
  transition: "all .12s",
});

// ─── Gemini calls ─────────────────────────────────────────────────────────────
async function callGeminiDirect(systemPrompt: string, contentParts: any[]): Promise<any> {
  const r = await fetch(GEMINI_TEXT_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: contentParts }], generationConfig: { response_mime_type: "application/json" } }) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${text}`);
  const data = JSON.parse(text);
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return parseJSON(raw);
}
async function callClaude(systemPrompt: string, userMessage: string): Promise<any> {
  const r = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Claude ${r.status}: ${text}`);
  const data = JSON.parse(text);
  const raw = data.content?.[0]?.text ?? "{}";
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
  const scored = populated.map(ref => { const lbl = ref.label.toLowerCase(); let score = 0; if (lbl.includes(biome)) score += 3; if (player && lbl.includes(player)) score += 2; if (enemy && lbl.includes(enemy)) score += 2; if (ref.category === "gate") score += 1; return { ref, score }; });
  scored.sort((a, b) => b.score - a.score);
  const selected: typeof populated = [];
  const biomeRef = scored.find(s => s.ref.category === "biome" && s.score > 0)?.ref;
  const champRef = scored.find(s => s.ref.category === "champion" && s.score > 0)?.ref;
  const gateRef = scored.find(s => s.ref.category === "gate")?.ref;
  if (biomeRef) selected.push(biomeRef);
  if (champRef && champRef !== biomeRef) selected.push(champRef);
  if (gateRef && !selected.includes(gateRef)) selected.push(gateRef);
  for (const { ref } of scored) { if (selected.length >= 3) break; if (!selected.includes(ref)) selected.push(ref); }
  const parts: any[] = [{ text: "### MOC VISUAL REFERENCES:" }];
  selected.forEach(ref => { parts.push({ text: `[${ref.category.toUpperCase()}]: ${ref.label.split(".")[0]}` }); parts.push({ inlineData: { mimeType: "image/jpeg", data: ref.base64 } }); });
  return parts;
}

// ─── Prompts (unchanged from v4) ──────────────────────────────────────────────
const BIOME_GUIDE = `BIOMES: Foggy Forest(grey/white fog,dark pine,grey road), Desert(tan sand,blue sky), Water(grey bridge over blue water), Bunker(grey concrete tunnel), Cyber-City(grey metal,orange tech), Volcanic(red/orange lava,black rocks), Snow(white snow ground), Toxic(purple paths,green slime), Meadow(green hills,grey brick bridge), Unknown`;
const CHAMPION_GUIDE = `CHAMPIONS: Captain Kaboom(SMALL skeleton pirate,mushroom hat,dual pistols), Gold Golem(LARGE golden muscular humanoid), Caveman(blue-skin,blonde,wooden club), Mobzilla(purple/yellow robotic T-Rex), Nexus(blue/white/orange mech,orange sword), Red Hulk(large red humanoid), Kraken(large red octopus), Femme Zombie(large crawling female zombie boss), Yellow Normie(small yellow round humanoid—BOSS ENEMY), Unknown`;
const GATE_GUIDE = `GATES: Multiplication(X value rect), Addition(+ value rect), Death(RED rect+SKULL—kills ALL mobs), Dynamic/upgrade(combine when structures broken). Report ONLY gates you actually see.`;
const HOOK_GUIDE = `HOOK: EXACT SECOND thumb stops scrolling. NEVER 0 unless dramatic frame 0. hook_timing_seconds = REAL SECOND (2,4,8) NEVER fraction (0.03,0.28).`;
const TIMESTAMP_RULES = `TIMESTAMPS: Real seconds only. NEVER fractions. 30s video midpoint=15 not 0.5.`;
const frameExtractionSystem = () => `Precise video timestamp analyst. Extract 8 key moments.\n${TIMESTAMP_RULES}\nReturn ONLY JSON: {"duration_seconds":number,"frames":[{"timestamp_seconds":number,"description":string,"significance":"hook|gate|upgrade|swarm|boss|loss|win|fail|transition"}]}`;
const hookDetectionSystem = () => `Expert mobile ad hook analyst.\n${HOOK_GUIDE}\n${TIMESTAMP_RULES}\nReturn ONLY JSON: {"hook_timing_seconds":number,"hook_type":"Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial","hook_description":string}`;
const analyzeSystem = (lib: DNAEntry[], config: UploadConfig, frames: FrameExtraction[], duration: number, hasManual: boolean, hasRefs: boolean) =>
  `World-Class Creative Intelligence Analyst for Mob Control ads. NEVER guess.\nAD TYPE:${config.ad_type} TIER:${config.tier}${config.iteration_of ? ` ITERATION_OF:${config.iteration_of}` : ""}\nCONTEXT:${config.context||"none"}\nDURATION:${duration}s\nLIBRARY:${lib.length>0?JSON.stringify(lib.map(d=>({title:d.title,tier:d.tier,hook_type:d.hook_type,hook_timing_seconds:d.hook_timing_seconds}))):"empty"}\n${hasRefs?buildReferenceContext():""}\nFRAMES:${frames.length>0?frames.map(f=>`[${f.timestamp_seconds}s]${f.description}(${f.significance})`).join("\n"):"none"}\n${hasManual?"MANUAL FRAMES provided above.":""}\n${TIMESTAMP_RULES}\n${HOOK_GUIDE}\n${GATE_GUIDE}\n${BIOME_GUIDE}\n${CHAMPION_GUIDE}\n${config.ad_type==="compound"?"COMPOUND: is_compound:true, segments array required.":""}\nReturn ONLY JSON:{"title":string,"is_compound":boolean,"transition_type":string|null,"segments":[]|null,"hook_type":"Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial","hook_timing_seconds":number,"hook_description":string,"gate_sequence":[string],"swarm_peak_moment_seconds":number|null,"loss_event_type":"Wrong Gate|Boss Overwhelm|Timer|Death Gate|Enemy Overwhelm|None","loss_event_timing_seconds":number|null,"unit_evolution_chain":[string],"emotional_arc":string,"emotional_beats":[{"timestamp_seconds":number,"event":string,"emotion":string}],"biome":"Desert|Cyber-City|Forest|Volcanic|Snow|Toxic|Water|Bunker|Meadow|Unknown","biome_visual_notes":string,"champions_visible":[string],"pacing":"Fast|Medium|Slow","key_mechanic":string,"why_it_works":string,"why_it_fails":string|null,"creative_gaps":string,"creative_gaps_structured":{"hook_strength":string,"mechanic_clarity":string,"emotional_payoff":string},"frame_extraction_gaps":string,"strategic_notes":string,"replication_instructions":string}`;
const reanalysisSystem = (entry: DNAEntry) =>
  `Re-analyze Mob Control ad. Fix errors.\nEXISTING:${JSON.stringify(entry,null,2)}\nFIX:1.hook_timing fractions→real seconds 2.swarm_peak/loss_event fractions→real seconds 3.gate_sequence hallucinations 4.unit_evolution_chain 5.emotional_beats 6.creative_gaps_structured 7.compound segments\n${TIMESTAMP_RULES}\n${HOOK_GUIDE}\n${GATE_GUIDE}\n${BIOME_GUIDE}\n${CHAMPION_GUIDE}\nReturn CORRECTED full JSON with all original fields.`;
const briefSystem = (lib: DNAEntry[], ctx: string, seg: string, iterateFrom?: string) => {
  const winners = lib.filter(d => d.tier === "winner");
  const refBlock = iterateFrom ? `\nITERATE FROM: "${iterateFrom}" — starting point only, DNA is primary.\n` : "";
  return `World-Class Lead Creative Producer for Mob Control. Ground EVERY concept in DNA library.\nWINNER LIBRARY(${winners.length}):\n${JSON.stringify(winners.map(d=>({title:d.title,hook_type:d.hook_type,hook_timing_seconds:d.hook_timing_seconds,gate_sequence:d.gate_sequence.slice(0,5),unit_evolution_chain:d.unit_evolution_chain,key_mechanic:d.key_mechanic,biome:d.biome,loss_event_type:d.loss_event_type,spend_tier:d.spend_tier,spend_networks:d.spend_networks,replication_instructions:d.replication_instructions?.slice(0,200)})),null,2)}\nBRIEF:${ctx}|SEGMENT:${seg}${refBlock}\nSEGMENT DATA:Whale(>$50/mo,45-59yo,Winning/Rankings),Dolphin($10-50/mo,Winning+Fun),Minnow(<$10/mo,Fun+Winning),Non-Payer(Fun+Challenges)\nBIOMES:Desert,Foggy Forest,Water,Bunker,Cyber-City,Volcanic,Snow,Toxic,Meadow\n9-STEP:Pressure→Investment→Validate→Investment2→Payoff→False Safety→Pressure++→Almost Win→Fail\nNETWORK RULES:AppLovin=skeleton/challenge+custom side cam+blue palette;Facebook=blue/red swap+desert+default cam;Google=strengthen almost-win(boss 1HP)+foggy forest\nReturn ONLY JSON:{"analysis":{"patterns_used":string,"dna_sources":[string],"segment_insight":string,"strategy":string},"concepts":[{"title":string,"dna_source":string,"is_data_backed":boolean,"objective":string,"target_segment":string,"player_motivation":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"layout":string,"hook_timing_seconds":number,"unit_evolution_chain":[string],"network_adaptations":{"AppLovin":string,"Facebook":string,"Google":string},"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"performance_hooks":[{"type":string,"text":string}],"engagement_hooks":string,"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}]}`;
};
const imagePromptFn = (concept: Concept, scene: "start"|"middle"|"end", visualSeed?: string) => {
  const vi = concept.visual_identity;
  const scenes = {
    start: "Opening scene: player cannon at the bottom center of screen, small mob just launched upward, first gate ahead in the middle of the path, enemy base visible at the top with a full health bar.",
    middle: "Mid-battle scene: massive swarm of player mobs fills the screen after passing multiplier gates. Mob count is overwhelming. Cannon still at bottom.",
    end: "Dramatic almost-win / fail scene: player mob count nearly gone, enemy boss still standing with a sliver of health. Intense, tense moment.",
  }[scene];
  const biomeExclusion = `STRICT BIOME RULE: This is a ${vi.environment} environment ONLY. ` + {
    "Bunker": "Grey concrete walls, ceiling pipes, industrial tunnel. NO lava, NO neon, NO outdoor sky, NO trees.",
    "Desert": "Tan sand dunes, bright sky. NO concrete, NO neon, NO fog, NO lava.",
    "Foggy Forest": "Grey misty fog, dark pine trees, grey road. NO snow on ground, NO lava, NO neon.",
    "Volcanic": "Red/orange lava flows, black rocks. NO concrete bunker, NO neon, NO trees.",
    "Water": "Grey bridge/path over clear blue water. NO sand, NO fog, NO lava.",
    "Cyber-City": "Grey metal paths, orange/blue neon tech structures. NO lava, NO sand, NO trees.",
    "Snow": "White snow on ground, icy structures, blue-white lighting. NO fog, NO lava.",
    "Meadow": "Green hills, grey brick bridge, blue sky. NO concrete, NO lava, NO neon.",
    "Toxic": "Purple paths, green slime pools, glowing crystals. NO lava, NO sand, NO concrete.",
  }[vi.environment] || "Render only this specific biome.";
  return [
    "Mob Control mobile game screenshot — you MUST match the reference images above EXACTLY in art style, 3D rendering quality, and game aesthetic.",
    scenes,
    biomeExclusion,
    `LIGHTING: ${vi.lighting}`,
    `PLAYER CHAMPION: ${vi.player_champion} | ENEMY CHAMPION / BOSS: ${vi.enemy_champion}`,
    `PLAYER MOBS: ${vi.player_mob_color} round blob creatures | ENEMY MOBS: ${vi.enemy_mob_color} round blob creatures`,
    `GATES ON PATH: ${vi.gate_values?.join(", ")} — render as large coloured rectangles with text, exactly as shown in references`,
    `CANNON TYPE: ${vi.cannon_type} at bottom center of screen`,
    `MOOD: ${vi.mood_notes}`,
    visualSeed ? `VISUAL CONSISTENCY: ${visualSeed}` : "",
    "COMPOSITION RULES: Cinematic top-down 3/4 angle. Cannon at bottom center. Path/road goes up the center. Gates are large and readable. NO game UI, NO score text, NO watermarks, NO logos.",
    "ART STYLE: Match the exact 3D cartoon render style from the reference images. Same colour palette, same lighting style, same mob design language.",
  ].filter(Boolean).join("\n");
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onCancel}>
      <div style={{ background: D.surface, borderRadius: 14, padding: "1.5rem", width: "90%", maxWidth: 520, border: `0.5px solid ${D.border2}`, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 500, color: D.text }}>Upload ads</h2>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: D.textMuted }}>Configure before choosing files.</p>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Ad type</span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["moc","competitor","compound"] as const).map(t => (
              <button key={t} onClick={() => setAdType(t)} style={{ flex: 1, padding: "7px 0", fontSize: 11, fontWeight: 500, borderRadius: 8, border: `1.5px solid ${adType===t?D.blueDark:D.border2}`, background: adType===t?D.blueBg:"transparent", color: adType===t?D.blue:D.textMuted, cursor: "pointer" }}>
                {t === "moc" ? "MOC" : t === "competitor" ? "Competitor" : "Compound/Mix"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Performance tier</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {TIERS.map(t => (
              <button key={t} onClick={() => setTier(t)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 500, borderRadius: 20, border: `1.5px solid ${tier===t?TIER_STYLE[t].border:D.border2}`, background: tier===t?TIER_STYLE[t].bg:"transparent", color: tier===t?TIER_STYLE[t].text:D.textMuted, cursor: "pointer" }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Iteration of</span>
          <input style={inputStyle} placeholder="e.g. CT43" value={iterOf} onChange={e => setIterOf(e.target.value)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Context for Gemini</span>
          <textarea style={{ ...inputStyle, minHeight: 72, resize: "vertical", background: D.bg, border: `0.5px solid ${D.border2}` }} placeholder="Describe biome, hook, key mechanics…" value={context} onChange={e => setContext(e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <span style={label}>Manual storyboard frames (optional)</span>
          <input ref={frameRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => setManualFrames(Array.from(e.target.files ?? []))} />
          <button style={btnSec} onClick={() => frameRef.current?.click()}>{manualFrames.length > 0 ? `${manualFrames.length} frame(s) selected` : "+ Add frames"}</button>
        </div>
        <div style={{ marginBottom: 16, padding: "8px 12px", background: D.surface2, borderRadius: 8, fontSize: 10, color: D.textMuted, border: `0.5px solid ${D.border}` }}>
          {refCount > 0 ? `✓ ${refCount} MOC refs` : "⚠ No refs"} → Frame extraction → Hook detection → {manualFrames.length > 0 ? `✓ ${manualFrames.length} manual frames` : "No manual frames"} → DNA analysis
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={btnSec} onClick={onCancel}>Cancel</button>
          <button style={btnPri} onClick={() => onConfirm({ tier, ad_type: adType, context, manual_frames: manualFrames, iteration_of: iterOf || undefined })}>Choose video →</button>
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
      <span style={{ ...label, marginBottom: 12 }}>Spend data</span>
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: D.textDim, display: "block", marginBottom: 6 }}>Spend tier</span>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>
          {SPEND_TIERS.map(t => (
            <button key={t.value} onClick={() => setTier(tier === t.value ? "" : t.value)}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, borderRadius: 20, cursor: "pointer", border: `1.5px solid ${tier===t.value?t.border:D.border2}`, background: tier===t.value?t.bg:"transparent", color: tier===t.value?t.text:D.textMuted }}>
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
                style={{ padding: "4px 10px", fontSize: 11, borderRadius: 20, cursor: "pointer", border: `1.5px solid ${days===w.value?D.blueDark:D.border2}`, background: days===w.value?D.blueBg:"transparent", color: days===w.value?D.blue:D.textMuted }}>
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
              style={{ padding: "4px 10px", fontSize: 11, borderRadius: 20, cursor: "pointer", border: `1.5px solid ${networks.includes(n)?D.greenBdr:D.border2}`, background: networks.includes(n)?D.greenBg:"transparent", color: networks.includes(n)?D.green:D.textMuted }}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: D.textDim, display: "block", marginBottom: 6 }}>Iteration of</span>
        <input style={{ ...inputStyle, fontSize: 11, padding: "5px 8px" }} placeholder="e.g. CT43, CZ66" value={iterOf} onChange={e => setIterOf(e.target.value)} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: D.textDim, display: "block", marginBottom: 6 }}>Notes</span>
        <textarea style={{ ...inputStyle, minHeight: 52, resize: "vertical", fontSize: 11, background: D.bg }} placeholder="e.g. peaked week 2, Meta only…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <button onClick={save} style={{ ...btnPri, padding: "6px 14px", fontSize: 11 }}>{saved ? "Saved ✓" : "Save spend data"}</button>
    </div>
  );
}

// ─── Library Card (used inside side panel) ───────────────────────────────────
function LibraryCard({ d, di, expandedDNA, setExpandedDNA, lib, saveLib, reanalyzingIds, handleReanalyzeSingle }: {
  d: DNAEntry; di: number; expandedDNA: number | null; setExpandedDNA: (n: number | null) => void;
  lib: DNAEntry[]; saveLib: (l: DNAEntry[]) => void;
  reanalyzingIds: Set<number>; handleReanalyzeSingle: (e: DNAEntry) => void;
}) {
  const canTag = d.ad_type === "moc" && d.tier !== "inspiration";
  const hasSpend = !!d.spend_tier;
  const spendSt = SPEND_TIERS.find(t => t.value === d.spend_tier);
  return (
    <div style={{ borderBottom: `0.5px solid ${D.border}`, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedDNA(expandedDNA === di ? null : di)}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{d.title}</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const, marginBottom: 3 }}>
            <span style={pill(TIER_STYLE[d.tier].bg, TIER_STYLE[d.tier].text, TIER_STYLE[d.tier].border)}>{d.tier}</span>
            {d.ad_type !== "moc" && <span style={pill(D.purpleBg, D.purple, D.purpleBdr)}>{d.ad_type}</span>}
            {d.is_compound && <span style={pill(D.goldBg, D.gold, D.goldBdr)}>compound</span>}
            {d.reanalyzed && <span style={pill(D.greenBg, D.green, D.greenBdr)}>re-analyzed</span>}
            {d.iteration_of && <span style={pill(D.surface2, D.textMuted, D.border2)}>iter. of {d.iteration_of}</span>}
            {hasSpend && spendSt && <span style={pill(spendSt.bg, spendSt.text, spendSt.border)}>{spendSt.label}{d.spend_window_days ? ` / ${WINDOW_OPTIONS.find(w => w.value === d.spend_window_days)?.label ?? d.spend_window_days+"d"}` : ""}</span>}
            {hasSpend && d.spend_networks && d.spend_networks.length > 0 && <span style={pill(D.greenBg, D.green, D.greenBdr)}>{d.spend_networks.join(", ")}</span>}
          </div>
          <div style={{ fontSize: 10, color: D.textDim }}>{d.file_name} · {new Date(d.added_at).toLocaleDateString()}</div>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", marginLeft: 10, flexShrink: 0 }}>
          <button style={{ ...btnSec, fontSize: 10, padding: "4px 8px" }} onClick={() => handleReanalyzeSingle(d)} disabled={reanalyzingIds.has(d.id)}>{reanalyzingIds.has(d.id) ? "…" : "Re-analyze"}</button>
          <select value={d.tier} onChange={e => saveLib(lib.map(x => x.id === d.id ? { ...x, tier: e.target.value as DNAEntry["tier"] } : x))} style={{ fontSize: 10, padding: "3px 6px", borderRadius: 6, border: `0.5px solid ${D.border2}`, background: D.surface2, color: D.text }}>
            {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button style={btnDel} onClick={() => saveLib(lib.filter(x => x.id !== d.id))}>✕</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginTop: 10 }}>
        {[
          { l: "Hook type", v: d.hook_type }, { l: "Hook at", v: d.hook_timing_seconds != null ? `${d.hook_timing_seconds}s` : "—" },
          { l: "Biome", v: d.biome }, { l: "Pacing", v: d.pacing },
          { l: "Loss event", v: d.loss_event_type }, { l: "Swarm peak", v: d.swarm_peak_moment_seconds != null ? `${d.swarm_peak_moment_seconds}s` : "—" },
        ].map(({ l, v }) => (
          <div key={l} style={metric}>
            <div style={metricLabel}>{l}</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: D.text }}>{v ?? "—"}</div>
          </div>
        ))}
      </div>

      {expandedDNA === di && (
        <div style={{ marginTop: 14, borderTop: `0.5px solid ${D.border}`, paddingTop: 14 }}>
          {canTag && <SpendTagger entry={d} onSave={fields => saveLib(lib.map(x => x.id === d.id ? { ...x, ...fields } : x))} />}
          {d.unit_evolution_chain?.length > 0 && (
            <div style={{ marginBottom: 10, marginTop: 14 }}>
              <span style={label}>Unit evolution chain</span>
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
              <span style={label}>Emotional beats</span>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                {d.emotional_beats.map((b, i) => (
                  <div key={i} style={{ fontSize: 11, padding: "5px 8px", background: D.surface2, borderRadius: 6, display: "flex", gap: 8 }}>
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
              <span style={label}>Gate sequence</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                {d.gate_sequence.map((g, i) => (
                  <span key={i} style={{ fontSize: 10, padding: "2px 7px", background: g.toLowerCase().includes("death") ? D.redBg : D.blueBg, color: g.toLowerCase().includes("death") ? D.red : D.blue, borderRadius: 20, border: `0.5px solid ${g.toLowerCase().includes("death") ? "#6e2020" : D.blueDark}` }}>{g}</span>
                ))}
              </div>
            </div>
          )}
          {d.champions_visible?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={label}>Champions</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                {d.champions_visible.map((c, i) => <span key={i} style={{ fontSize: 10, padding: "2px 7px", background: D.purpleBg, color: D.purple, borderRadius: 20, border: `0.5px solid ${D.purpleBdr}` }}>{c}</span>)}
              </div>
            </div>
          )}
          {d.creative_gaps_structured && (
            <div style={{ marginBottom: 10 }}>
              <span style={label}>Creative gaps</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {[{ l: "Hook strength", v: d.creative_gaps_structured.hook_strength }, { l: "Mechanic clarity", v: d.creative_gaps_structured.mechanic_clarity }, { l: "Emotional payoff", v: d.creative_gaps_structured.emotional_payoff }].map(({ l: lbl, v }) => (
                  <div key={lbl} style={{ padding: "7px 9px", background: D.goldBg, borderRadius: 7, border: `0.5px solid ${D.goldBdr}` }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: D.gold, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 2 }}>{lbl}</div>
                    <p style={{ margin: 0, fontSize: 10, color: "#c9a227" }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {d.strategic_notes && <div style={{ marginBottom: 10 }}><span style={label}>Strategic notes</span><p style={{ margin: 0, fontSize: 11, color: D.blue, lineHeight: 1.5 }}>{d.strategic_notes}</p></div>}
          {[{ l: "Key mechanic", v: d.key_mechanic }, { l: "Emotional arc", v: d.emotional_arc }, { l: "Why it works", v: d.why_it_works }, { l: "Why it fails", v: d.why_it_fails }, { l: "Frame gaps", v: d.frame_extraction_gaps }, { l: "Replication instructions", v: d.replication_instructions }].filter(x => x.v).map(({ l: lbl, v }) => (
            <div key={lbl} style={{ marginBottom: 10 }}><span style={label}>{lbl}</span><p style={{ margin: 0, fontSize: 11, color: D.textMuted, lineHeight: 1.6 }}>{v}</p></div>
          ))}
          {d.is_compound && d.segments && d.segments.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={label}>Segments ({d.segments.length})</span>
              {d.segments.map((seg, si) => (
                <div key={si} style={{ padding: "9px 11px", background: D.surface2, borderRadius: 7, border: `0.5px solid ${D.border}`, marginBottom: 5 }}>
                  <div style={{ fontWeight: 500, fontSize: 11, marginBottom: 3, color: D.text }}>Segment {si+1}: {seg.biome} ({seg.start_seconds}s–{seg.end_seconds}s)</div>
                  <div style={{ fontSize: 10, color: D.textMuted }}>Hook: {seg.hook_type} at {seg.hook_timing_seconds}s · {seg.key_mechanic}</div>
                  {seg.unit_evolution_chain?.length > 0 && <div style={{ fontSize: 10, color: D.textDim, marginTop: 2 }}>Evolution: {seg.unit_evolution_chain.join(" → ")}</div>}
                </div>
              ))}
            </div>
          )}
          {d.auto_frames && d.auto_frames.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span style={label}>Auto-extracted frames</span>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                {d.auto_frames.map((f, fi) => (
                  <div key={fi} style={{ fontSize: 10, padding: "4px 8px", background: D.surface2, borderRadius: 5 }}>
                    <span style={{ fontWeight: 500, color: D.blue, marginRight: 8 }}>{f.timestamp_seconds}s</span>
                    <span style={{ color: D.textMuted }}>{f.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <button style={{ ...btnSec, marginTop: 10, fontSize: 10, padding: "4px 9px" }} onClick={() => setExpandedDNA(expandedDNA === di ? null : di)}>
        {expandedDNA === di ? "Collapse" : "Expand details"}
      </button>
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
  const [expandedDNA, setExpandedDNA] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState("");
  const [analyzeInfo, setAnalyzeInfo] = useState("");
  const [reanalyzingIds, setReanalyzingIds] = useState<Set<number>>(new Set());
  const [reanalyzingAll, setReanalyzingAll] = useState(false);
  const [reanalysisProgress, setReanalysisProgress] = useState("");
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

  const exportLibrary = () => {
    const blob = new Blob([JSON.stringify(lib, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `levelly-dna-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importLibrary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!Array.isArray(parsed)) throw new Error();
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
    if (!confirm(`Re-analyze all ${lib.length} entries?`)) return;
    setReanalyzingAll(true); let updated = [...lib];
    for (let i = 0; i < lib.length; i++) {
      setReanalysisProgress(`Re-analyzing ${i+1}/${lib.length}: ${lib[i].title}…`);
      try { const corrected = await reanalyzeSingle(lib[i]); updated = updated.map(x => x.id === lib[i].id ? corrected : x); saveLib(updated); }
      catch (err) { console.warn(`Failed: ${lib[i].title}`, err); }
      await new Promise(r => setTimeout(r, 1000));
    }
    setReanalyzingAll(false); setReanalysisProgress("");
  };

  const handleModalConfirm = (cfg: UploadConfig) => { setUploadConfig(cfg); setShowModal(false); fileRef.current?.click(); };
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); if (!files.length) return;
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
        setAnalyzeInfo(`Extracting frames…`);
        let autoFrames: FrameExtraction[] = []; let duration = 30;
        try { const fr = await callGeminiDirect(frameExtractionSystem(), [{ text: "Extract 8 key frames:" }, videoPart]); autoFrames = fr?.frames || []; duration = fr?.duration_seconds || 30; } catch {}
        setAnalyzeInfo(`Detecting hook…`);
        let hookData: any = {};
        try { hookData = await callGeminiDirect(hookDetectionSystem(), [{ text: `Frames:${JSON.stringify(autoFrames)}.Context:${cfg.context}.Find hook:` }, videoPart]); } catch {}
        const manualParts: any[] = [];
        if (cfg.manual_frames.length > 0) {
          setAnalyzeInfo(`Processing ${cfg.manual_frames.length} manual frames…`);
          for (const mf of cfg.manual_frames) { const b64 = await fileToBase64(mf); manualParts.push({ text: `Manual:${mf.name}` }); manualParts.push({ inlineData: { mimeType: mf.type, data: b64 } }); }
        }
        setAnalyzeInfo(`Analyzing "${file.name}"…`);
        const refParts = buildReferenceParts();
        const dna = await callGeminiDirect(
          analyzeSystem(lib, cfg, autoFrames, duration, manualParts.length > 0, refParts.length > 0),
          [...refParts, ...(manualParts.length > 0 ? [{ text: "### MANUAL FRAMES:" }, ...manualParts] : []), { text: `HOOK DATA:${JSON.stringify(hookData)}` }, { text: "### AD VIDEO:" }, videoPart, { text: "Extract Creative DNA." }]
        );
        saveLib([...lib, { ...dna, id: Date.now() + Math.random(), tier: cfg.tier, ad_type: cfg.ad_type, upload_context: cfg.context, file_name: file.name, added_at: new Date().toISOString(), iteration_of: cfg.iteration_of, auto_frames: autoFrames, manual_frames: cfg.manual_frames.map(f => f.name) }]);
        setAnalyzeInfo("");
      }
    } catch (err: any) { setAnalyzeErr(err.message); }
    finally { setAnalyzing(false); setAnalyzeInfo(""); setUploadConfig(null); if (fileRef.current) fileRef.current.value = ""; }
  }, [lib, uploadConfig]);

  const handleGenerateBrief = async () => {
    if (!briefCtx.trim()) { setBriefErr("Enter a brief context first."); return; }
    if (lib.length === 0) { setBriefErr("Add at least one ad first."); return; }
    setGenerating(true); setBriefErr(""); setConcepts([]); setBriefAnalysis(null);
    try {
      const result = await callGeminiDirect(briefSystem(lib, briefCtx, segment, iterateFrom.trim() || undefined), [{ text: "Generate 3 MOC ad concepts." }]);
      setConcepts(result.concepts ?? []); setBriefAnalysis(result.analysis ?? null); setExpandedConcept(0);
    } catch (err: any) { setBriefErr(err.message); }
    finally { setGenerating(false); }
  };

  const handleRenderScene = async (ci: number, scene: "start"|"middle"|"end") => {
    const k = `${ci}-${scene}`; setRenderingScene(p => ({ ...p, [k]: true }));
    try {
      const concept = concepts[ci];
      const refParts = pickRelevantRefs(concept.visual_identity);
      // Pass the previous rendered scene as an actual image reference for visual continuity
      const prevImageParts: any[] = [];
      if (scene === "middle" && concept.visual_start) {
        prevImageParts.push({ text: "### PREVIOUS SCENE (start) — match the visual style, environment, assets, and lighting of this image exactly:" });
        prevImageParts.push({ inlineData: { mimeType: "image/png", data: concept.visual_start.replace("data:image/png;base64,", "") } });
      }
      if (scene === "end" && (concept.visual_middle || concept.visual_start)) {
        const prevImg = concept.visual_middle || concept.visual_start!;
        prevImageParts.push({ text: "### PREVIOUS SCENE — match the visual style, environment, assets, and lighting of this image exactly:" });
        prevImageParts.push({ inlineData: { mimeType: "image/png", data: prevImg.replace("data:image/png;base64,", "") } });
      }
      const visualSeed = prevImageParts.length > 0 ? "Match the visual style, biome, lighting, mob design, and art style of the previous scene image provided above." : undefined;
      const url = await callImageDirect(imagePromptFn(concept, scene, visualSeed), [...refParts, ...prevImageParts]);
      setConcepts(p => p.map((c, i) => i === ci ? { ...c, [`visual_${scene}`]: url } : c));
    } catch (err: any) { alert(`Render failed: ${err.message}`); }
    finally { setRenderingScene(p => ({ ...p, [k]: false })); }
  };

  // Stats
  const winners = lib.filter(d => d.tier === "winner").length;
  const topVel = lib.reduce((best, d) => {
    const v = velocityPerDay(d.spend_tier ?? "", d.spend_window_days);
    if (!v) return best;
    const num = parseInt(v.replace(/[^0-9]/g, ""));
    return num > best ? num : best;
  }, 0);
  const networkSet = new Set(lib.flatMap(d => d.spend_networks ?? []));
  const cloudLabel = { idle: "", saving: "Saving…", saved: "Saved to GitHub ✓", error: "Cloud save failed" }[cloudStatus];
  const cloudColor = { idle: D.textDim, saving: D.blue, saved: D.green, error: D.red }[cloudStatus];

  const SB = 48; // sidebar width

  return (
    <div style={{ background: D.bg, minHeight: "100vh", color: D.text, fontFamily: "system-ui, sans-serif", fontSize: 13, position: "relative" }}>
      {showModal && <UploadModal onConfirm={handleModalConfirm} onCancel={() => setShowModal(false)} />}
      <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{ display: "none" }} onChange={handleUpload} />
      <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importLibrary} />

      {/* ── Sidebar ── */}
      <div style={{ position: "fixed", top: 0, left: 0, width: SB, height: "100vh", background: D.surface, borderRight: `0.5px solid ${D.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 6, zIndex: 200 }}>
        {[
          { icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 6.5L8 1l7 5.5V15H1V6.5zm1 .9V14h4v-3h4v3h4V7.4L8 2.5 2 7.4z"/></svg>, key: "home", active: !libPanelOpen },
          { icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>, key: "library", active: libPanelOpen },
          { icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM7.5 4v4.25l3 1.75-.75 1.3L6.5 9V4h1z"/></svg>, key: "history", active: false },
        ].map(({ icon, key, active }) => (
          <button key={key} onClick={() => key === "library" && setLibPanelOpen(p => !p)}
            style={{ width: 32, height: 32, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: active ? D.surface2 : "transparent", border: "none", color: active ? D.text : D.textMuted, cursor: "pointer" }}>
            {icon}
          </button>
        ))}
      </div>

      {/* ── Library side panel ── */}
      <div style={{ position: "fixed", top: 0, left: SB, width: 380, height: "100vh", background: D.surface, borderRight: `0.5px solid ${D.border2}`, display: "flex", flexDirection: "column", zIndex: 150, transform: libPanelOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform .22s ease-out", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `0.5px solid ${D.border}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Creative library</div>
            <div style={{ fontSize: 10, color: D.textMuted, marginTop: 2 }}>{lib.length} entries · {winners} winners · {lib.filter(d => d.reanalyzed).length} re-analyzed</div>
          </div>
          <button onClick={() => setLibPanelOpen(false)} style={{ background: "none", border: "none", color: D.textMuted, fontSize: 11, cursor: "pointer", padding: "3px 6px", borderRadius: 4, fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "10px 16px", borderBottom: `0.5px solid ${D.border}`, flexWrap: "wrap" as const, flexShrink: 0 }}>
          {lib.length > 0 && (<>
            <button style={btnSec} onClick={handleReanalyzeAll} disabled={reanalyzingAll || analyzing}>{reanalyzingAll ? "Re-analyzing…" : "Re-analyze all"}</button>
            <button style={btnSec} onClick={exportLibrary}>Export</button>
            <button style={btnSec} onClick={() => { if (confirm("Clear library?")) saveLib([]); }}>Clear</button>
          </>)}
          <button style={btnSec} onClick={() => importRef.current?.click()}>Import</button>
          <button style={btnPri} onClick={() => { setLibPanelOpen(false); setShowModal(true); }} disabled={analyzing || reanalyzingAll}>{analyzing ? "Analyzing…" : "+ Upload"}</button>
        </div>
        {(analyzeErr || reanalysisProgress) && (
          <div style={{ fontSize: 11, color: reanalysisProgress ? D.blue : D.red, background: reanalysisProgress ? D.blueBg : D.redBg, border: `0.5px solid ${reanalysisProgress ? D.blueDark : "#6e2020"}`, borderRadius: 7, padding: "7px 12px", margin: "8px 16px" }}>
            {analyzeErr || reanalysisProgress}
          </div>
        )}
        {analyzeInfo && <div style={{ fontSize: 11, color: D.blue, background: D.blueBg, border: `0.5px solid ${D.blueDark}`, borderRadius: 7, padding: "7px 12px", margin: "8px 16px" }}>{analyzeInfo}</div>}
        {!libraryLoaded && <div style={{ fontSize: 11, color: D.blue, padding: "12px 16px" }}>Loading library from GitHub…</div>}
        {lib.length === 0 && !analyzing && libraryLoaded && (
          <div style={{ padding: "2rem 16px", textAlign: "center" as const }}>
            <p style={{ margin: 0, fontSize: 12, color: D.textMuted }}>Upload MOC ads, competitor ads, or compound mixes to build your Creative DNA library.</p>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {lib.map((d, di) => (
            <LibraryCard key={d.id} d={d} di={di} expandedDNA={expandedDNA} setExpandedDNA={setExpandedDNA} lib={lib} saveLib={saveLib} reanalyzingIds={reanalyzingIds} handleReanalyzeSingle={handleReanalyzeSingle} />
          ))}
        </div>
      </div>

      {/* ── Main content (offset by sidebar) ── */}
      <div style={{ marginLeft: SB }}>

        {/* Topbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `0.5px solid ${D.border}`, background: D.bg, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: D.blueDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, color: "#fff", flexShrink: 0 }}>L</div>
            <span style={{ fontSize: 15, fontWeight: 500 }}>Levelly</span>
            <span style={{ fontSize: 12, color: D.textMuted }}>MOC Creative Intelligence</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {cloudStatus !== "idle"
              ? <span style={{ fontSize: 10, color: cloudColor }}>{cloudLabel}</span>
              : lib.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, background: D.surface, border: `0.5px solid ${D.border2}`, borderRadius: 20, padding: "4px 12px" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: D.green }} />
                  <span style={{ fontSize: 11, color: D.blue }}>Saved to GitHub</span>
                </div>
              )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `0.5px solid ${D.border}` }}>
          {[
            { n: lib.length, label: "CREATIVES", color: D.text },
            { n: winners, label: "WINNERS", color: D.blue },
            { n: topVel > 0 ? `$${topVel >= 1000 ? Math.round(topVel/1000)+"K" : topVel}` : "—", label: "TOP VELOCITY", color: D.gold },
            { n: networkSet.size || "—", label: "NETWORKS", color: D.green },
          ].map(({ n, label: lbl, color }, i) => (
            <div key={lbl} style={{ padding: "20px 24px", borderRight: i < 3 ? `0.5px solid ${D.border}` : "none" }}>
              <div style={{ fontSize: 28, fontWeight: 500, color, lineHeight: 1 }}>{n}</div>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", color: D.textMuted, marginTop: 4 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* Home content */}
        <div style={{ padding: 20, maxWidth: 960, margin: "0 auto" }}>

          {/* Mode cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              {
                key: "brief", icon: <svg width="20" height="20" viewBox="0 0 16 16" fill="#58a6ff"><path d="M2 2h9l3 3v9H2V2zm1 1v10h10V6.5L9.5 3H3z"/></svg>,
                iconBg: D.blueBg, badgeText: "Primary", badgeColor: D.blue, badgeBorder: D.blueDark,
                title: "Generate brief", desc: "Describe your idea. Levelly matches it to winning DNA patterns and generates a master brief with network adaptations.",
                active: briefPanelOpen, onClick: () => { setBriefPanelOpen(p => !p); setAnalysePanelOpen(false); },
              },
              {
                key: "analyse",                 icon: <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="#3fb950" strokeWidth="1.5"/><line x1="9.5" y1="9.5" x2="14" y2="14" stroke="#3fb950" strokeWidth="1.5"/></svg>,
                iconBg: D.greenBg, badgeText: "Analysis", badgeColor: D.green, badgeBorder: D.greenBdr,
                title: "Analyse creative", desc: "Drop a video or paste a URL. Levelly extracts emotional beats, hook timing, gate patterns, and adds it to the DNA library.",
                active: analysePanelOpen, onClick: () => { setAnalysePanelOpen(p => !p); setBriefPanelOpen(false); },
              },
            ].map(card => (
              <div key={card.key} onClick={card.onClick}
                style={{ background: D.surface, border: `0.5px solid ${card.active ? card.badgeBorder : D.border2}`, borderRadius: 12, padding: 20, cursor: "pointer", transition: "border-color .18s, background .18s, transform .12s", ...(card.active && { background: "#1a2130" }) }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLDivElement).style.borderColor = card.badgeBorder; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.borderColor = card.active ? card.badgeBorder : D.border2; }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: card.iconBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>{card.icon}</div>
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, border: `1px solid ${card.badgeBorder}`, color: card.badgeColor }}>{card.badgeText}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>{card.title}</div>
                <div style={{ fontSize: 12, color: D.textMuted, lineHeight: 1.6 }}>{card.desc}</div>
              </div>
            ))}
          </div>

          {/* Brief panel */}
          {briefPanelOpen && (
            <div style={{ background: D.surface, border: `1.5px solid ${D.blueDark}`, borderRadius: 10, overflow: "hidden", marginBottom: 14, animation: "slideIn .2s ease-out" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `0.5px solid ${D.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: D.blue, fontSize: 13, fontWeight: 500 }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill={D.blue}><path d="M2 2h9l3 3v9H2V2zm1 1v10h10V6.5L9.5 3H3z"/></svg>
                  Generate brief
                </div>
                <button onClick={() => setBriefPanelOpen(false)} style={{ background: "none", border: "none", color: D.textMuted, cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 4, fontFamily: "inherit" }}>✕ Close</button>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <textarea style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "9px 11px", background: "transparent", border: "none", borderRadius: 0, minHeight: 64, resize: "vertical", outline: "none", fontFamily: "inherit", color: D.text, lineHeight: 1.6 }}
                  placeholder="Describe your idea — biome, hook type, emotional arc, network target, which creative to build on…"
                  value={briefCtx} onChange={e => setBriefCtx(e.target.value)} />
              </div>
              {/* Iterate from */}
              <div style={{ padding: "0 16px 12px" }}>
                <div style={{ fontSize: 9, letterSpacing: ".1em", color: D.textMuted, marginBottom: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill={D.textMuted}><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
                  ITERATE FROM
                  <span style={{ fontSize: 9, color: D.textDim, fontWeight: 400, letterSpacing: 0 }}>— optional. Levelly builds on this creative using MOC DNA as the primary guide.</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                  {iterateFrom.trim() && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, background: D.purpleBg, border: `0.5px solid ${D.purpleBdr}`, borderRadius: 6, padding: "4px 10px" }}>
                      <div style={{ width: 16, height: 16, borderRadius: 3, background: D.purpleBdr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", flexShrink: 0 }}>ref</div>
                      <span style={{ fontSize: 11, color: D.purple }}>{iterateFrom.trim()}</span>
                      <span style={{ fontSize: 10, color: D.textDim }}>· MOC DNA primary</span>
                      <button onClick={() => setIterateFrom("")} style={{ fontSize: 9, color: D.textDim, background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}>✕</button>
                    </div>
                  )}
                  <input style={{ ...inputStyle, width: iterateFrom.trim() ? "140px" : "220px", fontSize: 11 }}
                    placeholder="Library ID, e.g. CT43" value={iterateFrom} onChange={e => setIterateFrom(e.target.value)} />
                </div>
              </div>
              {/* Segment + generate */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: `0.5px solid ${D.border}`, flexWrap: "wrap" as const, gap: 8 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                  {SEGMENTS_LIST.map(seg => (
                    <button key={seg} onClick={() => setSegment(seg)} style={chip(segment === seg)}>{seg}</button>
                  ))}
                </div>
                <button onClick={handleGenerateBrief} disabled={generating}
                  style={{ ...btnPri, display: "flex", alignItems: "center", gap: 6, opacity: generating ? 0.7 : 1 }}>
                  {generating ? <><span style={{ width: 10, height: 10, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", display: "inline-block", animation: "spin .6s linear infinite" }} />Generating…</> : "Generate 3 concepts ↗"}
                </button>
              </div>
              {briefErr && <div style={{ fontSize: 11, color: D.red, background: D.redBg, border: `0.5px solid #6e2020`, borderRadius: 7, padding: "7px 12px", margin: "0 16px 12px" }}>{briefErr}</div>}
            </div>
          )}

          {/* Analyse panel placeholder */}
          {analysePanelOpen && (
            <div style={{ background: D.surface, border: `1.5px solid ${D.greenBdr}`, borderRadius: 10, padding: "20px 20px", marginBottom: 14, animation: "slideIn .2s ease-out" }}>
              <p style={{ margin: 0, fontSize: 13, color: D.textMuted }}>Drop a video file or paste a URL below to analyse it and add it to the DNA library.</p>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" as const }}>
                <button style={btnPri} onClick={() => { setAnalysePanelOpen(false); setShowModal(true); }}>+ Upload video</button>
                <button style={btnSec} onClick={() => setAnalysePanelOpen(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Brief analysis */}
          {briefAnalysis && (
            <div style={{ background: D.surface2, border: `0.5px solid ${D.border2}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
              <span style={label}>Creative strategy</span>
              <p style={{ margin: "0 0 12px", fontSize: 12, lineHeight: 1.7, color: D.text }}>{briefAnalysis.strategy}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><span style={label}>DNA sources used</span><p style={{ margin: 0, fontSize: 11, color: D.textMuted }}>{briefAnalysis.dna_sources?.join(", ") || briefAnalysis.patterns_used}</p></div>
                <div><span style={label}>Segment insight</span><p style={{ margin: 0, fontSize: 11, color: D.textMuted }}>{briefAnalysis.segment_insight}</p></div>
              </div>
            </div>
          )}

          {/* Concept cards */}
          {concepts.map((c, ci) => (
            <div key={ci} style={{ background: D.surface, border: `0.5px solid ${D.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }} onClick={() => setExpandedConcept(expandedConcept === ci ? null : ci)}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{c.title}</span>
                    {c.is_data_backed && <span style={pill(D.goldBg, D.gold, D.goldBdr)}>Data-backed</span>}
                    {(c as any).dna_source && <span style={pill(D.greenBg, D.green, D.greenBdr)}>based on {(c as any).dna_source}</span>}
                    {iterateFrom.trim() && <span style={pill(D.purpleBg, D.purple, D.purpleBdr)}>iterates from {iterateFrom.trim()}</span>}
                    <span style={pill(TIER_STYLE["scalable"].bg, TIER_STYLE["scalable"].text, TIER_STYLE["scalable"].border)}>{c.target_segment}</span>
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
                  {(c as any).hook_timing_seconds != null && (
                    <div style={{ marginBottom: 12, padding: "8px 12px", background: D.blueBg, borderRadius: 8, fontSize: 11, color: D.blue, border: `0.5px solid ${D.blueDark}` }}>
                      Hook at <strong>{(c as any).hook_timing_seconds}s</strong> — {c.performance_hooks?.[0]?.type || "Challenge"}
                    </div>
                  )}
                  {(c as any).unit_evolution_chain?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={label}>Unit evolution chain</span>
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
                  {c.visual_identity && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={label}>Visual identity</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 7 }}>
                        {[{ l: "Environment", v: c.visual_identity.environment }, { l: "Lighting", v: c.visual_identity.lighting }, { l: "Cannon", v: c.visual_identity.cannon_type }, { l: "Player", v: `${c.visual_identity.player_champion} (${c.visual_identity.player_mob_color})` }, { l: "Enemy", v: `${c.visual_identity.enemy_champion} (${c.visual_identity.enemy_mob_color})` }, { l: "Gates", v: c.visual_identity.gate_values?.join(", ") }].map(({ l: lbl, v }) => (
                          <div key={lbl} style={metric}><div style={metricLabel}>{lbl}</div><div style={{ fontSize: 11, fontWeight: 500, color: D.text }}>{v ?? "—"}</div></div>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.network_adaptations && Object.keys(c.network_adaptations).length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={{ ...label, marginBottom: 8 }}>Network adaptations</span>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                        {(["AppLovin","Facebook","Google","TikTok"] as const).filter(net => c.network_adaptations?.[net]).map(net => {
                          const nc = { AppLovin: { bg: D.blueBg, text: D.blue, border: D.blueDark }, Facebook: { bg: D.surface2, text: D.textMuted, border: D.border2 }, Google: { bg: D.greenBg, text: D.green, border: D.greenBdr }, TikTok: { bg: D.purpleBg, text: D.purple, border: D.purpleBdr } }[net];
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
                  <div style={{ marginBottom: 14 }}>
                    <span style={label}>Scene renders</span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {(["start","middle","end"] as const).map(scene => {
                        const imgUrl = c[`visual_${scene}` as keyof Concept] as string | undefined;
                        const loading = renderingScene[`${ci}-${scene}`];
                        return (
                          <div key={scene} style={{ aspectRatio: "9/16", background: D.surface2, borderRadius: 10, border: `0.5px solid ${D.border}`, overflow: "hidden", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", cursor: "pointer" }} onClick={() => !imgUrl && !loading && handleRenderScene(ci, scene)}>
                            {imgUrl ? <img src={imgUrl} alt={scene} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : loading ? <p style={{ margin: 0, fontSize: 11, color: D.textMuted }}>Rendering…</p>
                              : <div style={{ textAlign: "center", padding: 12 }}><p style={{ margin: 0, fontSize: 10, fontWeight: 500, textTransform: "uppercase" as const, color: D.textDim }}>{scene}</p><p style={{ margin: "4px 0 0", fontSize: 9, color: D.textDim }}>Click to render</p></div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {c.production_script?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={label}>Production script</span>
                      <div style={{ border: `0.5px solid ${D.border}`, borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", padding: "6px 12px", background: D.surface2, borderBottom: `0.5px solid ${D.border}` }}>
                          {["Time","Action","Visual","Audio"].map(h => <span key={h} style={{ fontSize: 9, fontWeight: 600, color: D.textDim, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{h}</span>)}
                        </div>
                        {c.production_script.map((step, si) => (
                          <div key={si} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", padding: "8px 12px", borderBottom: si < c.production_script.length-1 ? `0.5px solid ${D.border}` : "none", background: si%2===0?D.surface:D.surface2 }}>
                            <span style={{ fontSize: 11, fontWeight: 500, color: D.blue }}>{step.time}</span>
                            <span style={{ fontSize: 11, paddingRight: 8, lineHeight: 1.4, color: D.text }}>{step.action}</span>
                            <span style={{ fontSize: 11, color: D.textMuted, paddingRight: 8, lineHeight: 1.4, fontStyle: "italic" }}>{step.visual_cue}</span>
                            <span style={{ fontSize: 11, color: D.textDim, lineHeight: 1.4 }}>{step.audio_cue}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.performance_hooks?.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <span style={label}>Performance hooks</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                        {c.performance_hooks.map((h, hi) => (
                          <div key={hi} style={{ background: D.surface, border: `0.5px solid ${D.border}`, borderRadius: 10, padding: "10px 14px" }}>
                            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: hi===0?D.goldBg:hi===1?D.greenBg:D.blueBg, color: hi===0?D.gold:hi===1?D.green:D.blue, display: "inline-block", marginBottom: 6 }}>{h.type}</span>
                            <p style={{ margin: 0, fontSize: 12, fontStyle: "italic", color: D.textMuted }}>"{h.text}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {c.quality_score && (
                    <div>
                      <span style={label}>Quality score</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: 8, marginBottom: 8 }}>
                        {[{ l: "Pattern fidelity", v: c.quality_score.pattern_fidelity }, { l: "MOC DNA", v: c.quality_score.moc_dna }, { l: "Emotional arc", v: c.quality_score.emotional_arc }, { l: "Visual clarity", v: c.quality_score.visual_clarity }, { l: "Segment fit", v: c.quality_score.segment_fit }].map(({ l: lbl, v }) => (
                          <div key={lbl} style={metric}><div style={metricLabel}>{lbl}</div><div style={{ fontSize: 18, fontWeight: 500, color: scoreColor(v) }}>{v}</div></div>
                        ))}
                      </div>
                      {c.quality_score.notes && <p style={{ margin: 0, fontSize: 11, color: D.textMuted, fontStyle: "italic" }}>{c.quality_score.notes}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Library preview table */}
          <div style={{ background: D.surface, border: `0.5px solid ${D.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
              <span style={{ fontSize: 12, color: D.textMuted }}>Creative library <span style={{ fontSize: 11 }}>{lib.length} entries</span></span>
              <span style={{ fontSize: 11, color: D.blue, cursor: "pointer" }} onClick={() => setLibPanelOpen(true)}>View all →</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 70px", padding: "6px 16px", fontSize: 9, letterSpacing: ".1em", color: D.textDim, borderBottom: `0.5px solid ${D.border}` }}>
              {["CREATIVE","SPEND","NETWORKS","VELOCITY"].map(h => <div key={h}>{h}</div>)}
            </div>
            {lib.length === 0
              ? <div style={{ padding: "16px", fontSize: 12, color: D.textDim }}>No creatives yet — upload via the library panel.</div>
              : lib.slice(0, 5).map((d, i) => {
                const spendSt = SPEND_TIERS.find(t => t.value === d.spend_tier);
                const vel = velocityPerDay(d.spend_tier ?? "", d.spend_window_days);
                return (
                  <div key={d.id} onClick={() => setLibPanelOpen(true)} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 70px", padding: "9px 16px", borderBottom: i < Math.min(lib.length,5)-1 ? `0.5px solid ${D.border}` : "none", cursor: "pointer", alignItems: "center", transition: "background .12s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = D.surface2}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ""}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", fontSize: 12, fontWeight: 500 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: d.tier === "scalable" ? D.blue : D.green, marginRight: 8, flexShrink: 0 }} />
                        {d.title.length > 35 ? d.title.slice(0,35)+"…" : d.title}
                      </div>
                      <div style={{ fontSize: 10, color: D.textDim, paddingLeft: 14 }}>Open</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#c9d1d9" }}>{spendSt ? spendSt.label : "—"}</div>
                    <div style={{ fontSize: 11, color: D.textMuted }}>{d.spend_networks?.join(", ") || "—"}</div>
                    <div style={{ fontSize: 12, color: D.green }}>{vel ?? "—"}</div>
                  </div>
                );
              })
            }
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        select option { background: ${D.surface}; color: ${D.text}; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${D.bg}; }
        ::-webkit-scrollbar-thumb { background: ${D.border2}; border-radius: 3px; }
      `}</style>
    </div>
  );
}
