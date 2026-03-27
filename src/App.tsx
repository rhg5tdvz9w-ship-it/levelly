import { useState, useRef, useCallback } from "react";
import { buildReferenceContext, buildReferenceParts, MOC_REFERENCES } from "./refImages";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DNAEntry {
  id: number;
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor";
  upload_context: string;
  file_name: string;
  added_at: string;
  title: string;
  hook_type: string;
  hook_timing_seconds: number | null;
  hook_description: string;
  gate_sequence: string[];
  swarm_peak_moment_seconds: number | null;
  loss_event_type: string;
  loss_event_timing_seconds: number | null;
  emotional_arc: string;
  biome: string;
  biome_visual_notes: string;
  champions_visible: string[];
  pacing: string;
  key_mechanic: string;
  why_it_works: string;
  why_it_fails: string | null;
  creative_gaps: string | null;
  frame_extraction_gaps: string | null;
  replication_instructions: string;
  auto_frames?: FrameExtraction[];
  manual_frames?: string[];
}

interface FrameExtraction {
  timestamp_seconds: number;
  description: string;
  significance: string;
}

interface UploadConfig {
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor";
  context: string;
  manual_frames: File[];
}

interface VisualIdentity {
  environment: string; lighting: string; player_champion: string;
  enemy_champion: string; player_mob_color: string; enemy_mob_color: string;
  gate_values: string[]; cannon_type: string; mood_notes: string;
}
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
const SEGMENTS = ["Whale", "Dolphin", "Minnow", "Non-Payer"];
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const GEMINI_TEXT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
const GEMINI_BRIEF_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

// ─── Direct Gemini call from browser ─────────────────────────────────────────
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
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response: " + cleaned.slice(0, 200));
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ─── Direct Gemini image generation from browser ─────────────────────────────
const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_KEY}`;

// Pick 2-3 most relevant refs based on biome + champion match
function pickRelevantRefs(vi: VisualIdentity): any[] {
  const biome = vi.environment?.toLowerCase() || "";
  const player = vi.player_champion?.toLowerCase() || "";
  const enemy = vi.enemy_champion?.toLowerCase() || "";

  const populated = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_"));
  if (populated.length === 0) return [];

  // Score each ref by relevance
  const scored = populated.map(ref => {
    const label = ref.label.toLowerCase();
    let score = 0;
    if (label.includes(biome)) score += 3;
    if (player && label.includes(player)) score += 2;
    if (enemy && label.includes(enemy)) score += 2;
    if (ref.category === "gate") score += 1; // always useful
    if (ref.category === "biome" && label.includes(biome)) score += 2;
    return { ref, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Always include: best biome match + best champion match + one gate ref
  const selected: typeof populated = [];
  const biomeRef = scored.find(s => s.ref.category === "biome" && s.score > 0)?.ref;
  const champRef = scored.find(s => s.ref.category === "champion" && s.score > 0)?.ref;
  const gateRef = scored.find(s => s.ref.category === "gate")?.ref;

  if (biomeRef) selected.push(biomeRef);
  if (champRef && champRef !== biomeRef) selected.push(champRef);
  if (gateRef && !selected.includes(gateRef)) selected.push(gateRef);

  // Fill to max 3 with highest scoring remaining
  for (const { ref } of scored) {
    if (selected.length >= 3) break;
    if (!selected.includes(ref)) selected.push(ref);
  }

  // Build Gemini parts
  const parts: any[] = [{ text: "### MOC VISUAL REFERENCES — match this exact art style:" }];
  selected.forEach(ref => {
    parts.push({ text: `[${ref.category.toUpperCase()}]: ${ref.label.split(".")[0]}` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data: ref.base64 } });
  });
  return parts;
}

async function callImageDirect(prompt: string, refParts: any[]): Promise<string> {
  const parts = [
    ...refParts,
    { text: prompt }
  ];
  const r = await fetch(GEMINI_IMAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
    })
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Image gen ${r.status}: ${text}`);
  const data = JSON.parse(text);
  const imgPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!imgPart) throw new Error("No image returned — safety filter may have triggered");
  return `data:image/png;base64,${imgPart.inlineData.data}`;
}

// ─── Gemini File API upload ───────────────────────────────────────────────────
async function uploadToGeminiFileAPI(file: File, onStatus: (m: string) => void): Promise<{ fileUri: string; mimeType: string }> {
  onStatus(`Uploading "${file.name}" (${Math.round(file.size / 1024 / 1024)}MB)…`);
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_KEY}`,
    { method: "POST", headers: { "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": file.size.toString(), "X-Goog-Upload-Header-Content-Type": file.type, "Content-Type": "application/json" }, body: JSON.stringify({ file: { display_name: file.name } }) }
  );
  if (!initRes.ok) throw new Error(`File API init failed: ${initRes.status}`);
  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL");
  onStatus(`Uploading "${file.name}"… (may take a minute)`);
  const uploadRes = await fetch(uploadUrl, { method: "POST", headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Type": file.type }, body: file });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  const uploadData = await uploadRes.json();
  const fileUri = uploadData.file?.uri;
  const name = uploadData.file?.name;
  if (!fileUri) throw new Error("No file URI");
  onStatus(`Processing "${file.name}"…`);
  for (let i = 0; i < 20; i++) {
    const s = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${GEMINI_KEY}`)).json();
    if (s.state === "ACTIVE") break;
    if (s.state === "FAILED") throw new Error("Gemini file processing failed");
    await new Promise(r => setTimeout(r, 2000));
  }
  return { fileUri, mimeType: file.type };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
const frameExtractionSystem = () => `You are a video analyst. Watch the video and identify the 8 most visually significant moments.
Return ONLY valid JSON: { "frames": [{ "timestamp_seconds": number, "description": string, "significance": string }] }`;

const analyzeSystem = (lib: DNAEntry[], config: UploadConfig, frames: FrameExtraction[], hasManualFrames: boolean, hasRefs: boolean) => `You are a World-Class Creative Intelligence Analyst for Mob Control ads. NEVER guess — only report what you directly observe.

AD TYPE: ${config.ad_type === "moc" ? "MOB CONTROL ORIGINAL AD" : "COMPETITOR / MARKET REFERENCE"}
PERFORMANCE TIER: ${config.tier.toUpperCase()}
ANALYST CONTEXT: ${config.context || "No additional context provided."}

EXISTING LIBRARY (${lib.length} entries):
${lib.length > 0 ? JSON.stringify(lib.map(d => ({ title: d.title, tier: d.tier, hook_type: d.hook_type, hook_timing_seconds: d.hook_timing_seconds }))) : "Empty — first entry."}

${hasRefs ? buildReferenceContext() : ""}

### AUTO-EXTRACTED KEY FRAMES:
${frames.length > 0 ? frames.map(f => `- [${f.timestamp_seconds}s] ${f.description} (${f.significance})`).join("\n") : "Not available."}

${hasManualFrames ? `### MANUAL STORYBOARD FRAMES PROVIDED:
Compare manual frames against auto-extracted descriptions. If manual frames reveal moments NOT in auto-extraction (e.g. a death gate, specific champion, loss moment), flag in frame_extraction_gaps and correct the analysis.` : ""}

### GATE TYPES — detect ALL:
- Multiplication gate: rectangle with X value (x2, x3, x4, x100 etc.) — blue/orange/pink/purple colored
- Addition gate: blue rectangle with + value (+1, +2, +5 etc.)
- Death gate: RED rectangle with SKULL-AND-CROSSBONES — instantly kills ALL mobs
- Report ONLY gates you actually see. Never invent gates.

### BIOME GUIDE:
- Foggy Forest: grey/white atmospheric fog, dark green pine trees through mist, grey road. THE FOG IS NOT SNOW — no white ground.
- Desert: tan/beige sand, flat dunes, bright warm sunlight, blue sky
- Cyber-City: grey metal paths, orange tech structures
- Volcanic: red/orange lava, dark rocks
- Snow: actual WHITE SNOW on ground, icy structures, blue-white lighting
- Toxic: purple paths, green slime

### CHAMPION GUIDE — visual match only:
- Captain Kaboom: SMALL skeleton pirate, mushroom hat, skull face, dual guns
- Hulk/Gold Golem: LARGE golden muscular bodybuilder (gold statue)
- Caveman: blue-skinned muscular, blonde hair
- Yellow Normie: small yellow round humanoid — BOSS ENEMY, not a named champion
- Unknown: if doesn't match any above
${config.ad_type === "competitor" ? "NOTE: Competitor ad — do not force MOC labels if not applicable." : ""}

Return ONLY valid JSON:
{
  "title": string,
  "hook_type": "Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial",
  "hook_timing_seconds": number,
  "hook_description": string,
  "gate_sequence": [string],
  "swarm_peak_moment_seconds": number | null,
  "loss_event_type": "Wrong Gate|Boss Overwhelm|Timer|Death Gate|None",
  "loss_event_timing_seconds": number | null,
  "emotional_arc": string,
  "biome": "Desert|Cyber-City|Forest|Volcanic|Snow|Toxic|Unknown",
  "biome_visual_notes": string,
  "champions_visible": [string],
  "pacing": "Fast|Medium|Slow",
  "key_mechanic": string,
  "why_it_works": string,
  "why_it_fails": string | null,
  "creative_gaps": string,
  "frame_extraction_gaps": string,
  "replication_instructions": string
}`;

const briefSystem = (lib: DNAEntry[], ctx: string, seg: string) => `You are a World-Class Lead Creative Producer for Mob Control.
CREATIVE DNA LIBRARY (${lib.length} analyzed ads): ${JSON.stringify(lib, null, 2)}
BRIEF: ${ctx} | SEGMENT: ${seg}
SEGMENT DATA: Whale(>$50/mo,45-59yo,Motivation=Winning/Rankings), Dolphin($10-50/mo,Motivation=Winning+Fun), Minnow(<$10/mo,Motivation=Fun+Winning), Non-Payer(Motivation=Fun+Challenges).
MOC CHAMPIONS: Mobzilla(purple/yellow T-Rex), Nexus(blue/white mech+orange sword), Captain Kaboom(skeleton pirate), Explodon(blue knight), Big Blob(green slime+crown), Raccoon(blue=player/red=enemy), Caveman(blue muscular), General(red-skinned commander).
9-STEP CURVE: Pressure→Investment→Validate→Investment2→Payoff→False Safety→Pressure++→Almost Win→Fail
3 PILLARS: Danger Lane(X gates), Investment Lane(+ gates), Upgrade Lane(power-ups).
Return ONLY valid JSON:
{"analysis":{"patterns_used":string,"segment_insight":string,"strategy":string},"concepts":[{"title":string,"is_data_backed":boolean,"objective":string,"target_segment":string,"player_motivation":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"layout":string,"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"performance_hooks":[{"type":string,"text":string}],"engagement_hooks":string,"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}]}`;

const imagePrompt = (concept: Concept, scene: "start" | "middle" | "end", visualSeed?: string) => {
  const vi = concept.visual_identity;
  const scenes = {
    start:  "SCENE: Opening shot. Player cannon at bottom of frame, small mob swarm just fired. First gate visible ahead. Enemy base visible at top with full health bar. High tension — enemies approaching from base.",
    middle: "SCENE: Mid-battle climax. Massive blue mob swarm filling the screen after passing through multiplier gates. Swarm is overwhelming — screen-filling power fantasy moment. Gate values clearly visible.",
    end:    "SCENE: Dramatic fail moment. Player mob swarm nearly depleted, enemy champion or boss with low health bar but still standing. Cannon about to be overwhelmed. Emotional peak — defeat snatched from near-victory."
  }[scene];

  const consistencyBlock = visualSeed
    ? `\nVISUAL CONSISTENCY (match start scene exactly): ${visualSeed}\n`
    : "";

  return `You are generating a gameplay screenshot for a Mob Control mobile ad. Match the reference images above — same art style, same 3D rendering quality, same lighting approach.

${scenes}

VISUAL IDENTITY (non-negotiable):
- Environment: ${vi.environment}
- Lighting: ${vi.lighting}  
- Player champion: ${vi.player_champion}
- Enemy champion: ${vi.enemy_champion}
- Player mob color: ${vi.player_mob_color} small round blob creatures
- Enemy mob color: ${vi.enemy_mob_color} small round blob creatures
- Gate values shown: ${vi.gate_values?.join(", ")}
- Cannon type: ${vi.cannon_type}
- Mood: ${vi.mood_notes}
${consistencyBlock}
BIOME VISUALS:
- Forest (foggy): grey/white mist atmosphere, dark green pine trees barely visible through fog, grey road
- Desert: tan/beige sand dunes, bright warm sunlight, blue sky, sparse vegetation
- Cyber-City: grey metal paths, orange glowing tech structures
- Volcanic: red/orange lava flows, dark black rocks
- Snow: white snow ground, icy frozen structures, blue-white lighting
- Toxic: purple paths, green slime, glowing crystals

CHAMPION VISUALS:
- Captain Kaboom: small skeleton pirate, mushroom-shaped hat, skull face, dual pistols
- Hulk/Gold Golem: large golden muscular bodybuilder
- Caveman: blue-skinned muscular man with wooden club
- Mobzilla: large purple/yellow robotic T-Rex with blue crystalline spikes
- Nexus: blue/white/orange humanoid mech with orange energy sword

COMPOSITION RULES:
1. Cinematic slightly-tilted top-down view — camera angle matches reference images
2. Cannon always visible at bottom center of frame
3. Gates must be large, clear, and show exact values
4. High contrast between blue player mobs and ${vi.enemy_mob_color} enemy mobs
5. NO text overlays, NO UI elements, NO watermarks, NO logos
6. Photo-realistic 3D game screenshot quality — match reference image fidelity exactly`;
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
  btnPrimary: { padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8, border: "none", background: "#1a56db", color: "#fff" } as React.CSSProperties,
  btnSecondary: { padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", color: "#444" } as React.CSSProperties,
  btnDanger: { padding: "5px 10px", fontSize: 11, cursor: "pointer", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626" } as React.CSSProperties,
  badge: (tier: string): React.CSSProperties => ({ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: TIER_STYLE[tier]?.bg ?? "#eee", color: TIER_STYLE[tier]?.text ?? "#333", border: `1px solid ${TIER_STYLE[tier]?.border ?? "#ccc"}` }),
  error: { fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", marginTop: 8 } as React.CSSProperties,
  info: { fontSize: 12, color: "#1a56db", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px", marginTop: 8 } as React.CSSProperties,
  metric: { background: "#f5f5f5", borderRadius: 8, padding: "8px 12px", textAlign: "center" as const },
  sceneWrap: { aspectRatio: "9/16", background: "#f0f0f0", borderRadius: 10, border: "1px solid #e8e8e8", overflow: "hidden", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", cursor: "pointer" } as React.CSSProperties,
  grid3: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 } as React.CSSProperties,
  gridAuto: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 } as React.CSSProperties,
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: 16, padding: "1.5rem", width: "90%", maxWidth: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" as const } as React.CSSProperties,
};
const scoreColor = (n: number) => n >= 80 ? "#16a34a" : n >= 60 ? "#1a56db" : "#dc2626";

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onConfirm, onCancel }: { onConfirm: (cfg: UploadConfig) => void; onCancel: () => void }) {
  const [tier, setTier] = useState<UploadConfig["tier"]>("winner");
  const [adType, setAdType] = useState<UploadConfig["ad_type"]>("moc");
  const [context, setContext] = useState("");
  const [manualFrames, setManualFrames] = useState<File[]>([]);
  const frameRef = useRef<HTMLInputElement>(null);
  const refCount = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_")).length;

  return (
    <div style={css.overlay} onClick={onCancel}>
      <div style={css.modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600 }}>Upload ads</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666" }}>Configure analysis before choosing files.</p>

        <div style={{ marginBottom: 16 }}>
          <span style={css.label}>Ad type</span>
          <div style={{ display: "flex", gap: 8 }}>
            {(["moc", "competitor"] as const).map(t => (
              <button key={t} onClick={() => setAdType(t)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `2px solid ${adType === t ? "#1a56db" : "#e0e0e0"}`, background: adType === t ? "#eff6ff" : "#fff", color: adType === t ? "#1a56db" : "#666", cursor: "pointer" }}>
                {t === "moc" ? "MOC Original" : "Competitor / Market"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={css.label}>Performance tier</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
            {TIERS.map(t => (
              <button key={t} onClick={() => setTier(t)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `2px solid ${tier === t ? TIER_STYLE[t].border : "#e0e0e0"}`, background: tier === t ? TIER_STYLE[t].bg : "#fff", color: tier === t ? TIER_STYLE[t].text : "#888", cursor: "pointer" }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <span style={css.label}>Context for Gemini (optional)</span>
          <textarea style={css.textarea} placeholder={adType === "moc" ? "E.g. 'Forest biome ad with death gate. Champion on right is Captain Kaboom. Focus on gate sequence and loss moment.'" : "E.g. 'Competitor puzzle game. Analyze hook pattern and tension mechanics.'"} value={context} onChange={e => setContext(e.target.value)} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <span style={css.label}>Manual storyboard frames (optional)</span>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "#888" }}>Screenshots from the video to help identify hard-to-read moments. Compared against auto-extracted frames.</p>
          <input ref={frameRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => setManualFrames(Array.from(e.target.files ?? []))} />
          <button style={css.btnSecondary} onClick={() => frameRef.current?.click()}>
            {manualFrames.length > 0 ? `${manualFrames.length} frame${manualFrames.length > 1 ? "s" : ""} selected` : "+ Add storyboard frames"}
          </button>
          {manualFrames.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 8 }}>
              {manualFrames.map((f, i) => <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: "#f0fdf4", color: "#166534", borderRadius: 6, border: "1px solid #bbf7d0" }}>{f.name}</span>)}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16, padding: "10px 12px", background: "#f8f8f8", borderRadius: 8, fontSize: 11, color: "#666" }}>
          <strong>Pipeline:</strong> {refCount > 0 ? `✓ ${refCount} MOC refs` : "⚠ No refs"} → Auto frame extraction → {manualFrames.length > 0 ? `✓ ${manualFrames.length} manual frames` : "No manual frames"} → DNA analysis
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={css.btnSecondary} onClick={onCancel}>Cancel</button>
          <button style={css.btnPrimary} onClick={() => onConfirm({ tier, ad_type: adType, context, manual_frames: manualFrames })}>Choose video →</button>
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<"Library" | "Brief Studio">("Library");
  const [lib, setLib] = useState<DNAEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("levelly_dna_library") || "[]"); }
    catch { return []; }
  });
  const saveLib = (updated: DNAEntry[]) => {
    setLib(updated);
    try { localStorage.setItem("levelly_dna_library", JSON.stringify(updated)); } catch {}
  };

  const [showModal, setShowModal] = useState(false);
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeErr, setAnalyzeErr] = useState("");
  const [analyzeInfo, setAnalyzeInfo] = useState("");
  const [expandedDNA, setExpandedDNA] = useState<number | null>(null);
  const [briefCtx, setBriefCtx] = useState("");
  const [segment, setSegment] = useState("Whale");
  const [generating, setGenerating] = useState(false);
  const [briefErr, setBriefErr] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [briefAnalysis, setBriefAnalysis] = useState<BriefAnalysis | null>(null);
  const [expandedConcept, setExpandedConcept] = useState<number | null>(null);
  const [renderingScene, setRenderingScene] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const handleModalConfirm = (cfg: UploadConfig) => {
    setUploadConfig(cfg);
    setShowModal(false);
    fileRef.current?.click();
  };

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const cfg = uploadConfig || { tier: "winner" as const, ad_type: "moc" as const, context: "", manual_frames: [] };
    setAnalyzing(true); setAnalyzeErr(""); setAnalyzeInfo("");

    try {
      for (const file of files) {
        // Step 1: get video part
        let videoPart: any;
        if (file.size > 4 * 1024 * 1024) {
          const { fileUri, mimeType } = await uploadToGeminiFileAPI(file, setAnalyzeInfo);
          videoPart = { fileData: { mimeType, fileUri } };
        } else {
          setAnalyzeInfo(`Processing "${file.name}"…`);
          const b64 = await fileToBase64(file);
          videoPart = { inlineData: { mimeType: file.type, data: b64 } };
        }

        // Step 2: extract key frames (Call 1)
        setAnalyzeInfo(`Extracting key frames from "${file.name}"…`);
        let autoFrames: FrameExtraction[] = [];
        try {
          const frameResult = await callGeminiDirect(
            frameExtractionSystem(),
            [{ text: "Watch this video and identify the 8 most significant moments:" }, videoPart]
          );
          autoFrames = frameResult?.frames || [];
        } catch (err) {
          console.warn("Frame extraction failed:", err);
        }

        // Step 3: convert manual frames
        const manualParts: any[] = [];
        if (cfg.manual_frames.length > 0) {
          setAnalyzeInfo(`Processing ${cfg.manual_frames.length} manual frame(s)…`);
          for (const mf of cfg.manual_frames) {
            const b64 = await fileToBase64(mf);
            manualParts.push({ text: `Manual storyboard frame: ${mf.name}` });
            manualParts.push({ inlineData: { mimeType: mf.type, data: b64 } });
          }
        }

        // Step 4: build full analysis content (Call 2)
        setAnalyzeInfo(`Analyzing "${file.name}"…`);
        const refParts = buildReferenceParts();
        const hasRefs = refParts.length > 0;
        const hasManualFrames = manualParts.length > 0;

        const analysisParts: any[] = [
          // Layer 1: MOC visual references
          ...refParts,
          // Layer 3: manual storyboard frames
          ...(hasManualFrames ? [{ text: "### MANUAL STORYBOARD FRAMES FROM THE VIDEO:" }, ...manualParts] : []),
          // The video
          { text: "### THE AD VIDEO — analyze this only, do not analyze the reference images above:" },
          videoPart,
          { text: "Extract Creative DNA from the video above using the reference images and frame data as context." }
        ];

        const dna = await callGeminiDirect(
          analyzeSystem(lib, cfg, autoFrames, hasManualFrames, hasRefs),
          analysisParts
        );

        saveLib([...lib, {
          ...dna,
          id: Date.now() + Math.random(),
          tier: cfg.tier,
          ad_type: cfg.ad_type,
          upload_context: cfg.context,
          file_name: file.name,
          added_at: new Date().toISOString(),
          auto_frames: autoFrames,
          manual_frames: cfg.manual_frames.map(f => f.name),
        }]);
        setAnalyzeInfo("");
      }
    } catch (err: any) {
      setAnalyzeErr(err.message);
    } finally {
      setAnalyzing(false); setAnalyzeInfo(""); setUploadConfig(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [lib, uploadConfig]);

  const handleGenerateBrief = async () => {
    if (!briefCtx.trim()) { setBriefErr("Enter a brief context first."); return; }
    if (lib.length === 0) { setBriefErr("Add at least one ad to the DNA Library first."); return; }
    setGenerating(true); setBriefErr(""); setConcepts([]); setBriefAnalysis(null);
    try {
      const result = await callGeminiDirect(briefSystem(lib, briefCtx, segment), [{ text: "Generate 3 MOC ad concepts based on the DNA library and brief." }]);
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

      // Use start scene as visual seed for middle + end to ensure consistency
      const visualSeed = scene !== "start" && concept.visual_start
        ? `This scene is part of the same ad as the start scene. Maintain identical: biome environment, lighting, road texture, gate style, mob appearance, and overall art style. Only the action/content changes.`
        : undefined;

      const url = await callImageDirect(imagePrompt(concept, scene, visualSeed), refParts);
      setConcepts(p => p.map((c, i) => i === ci ? { ...c, [`visual_${scene}`]: url } : c));
    } catch (err: any) { alert(`Render failed: ${err.message}`); }
    finally { setRenderingScene(p => ({ ...p, [k]: false })); }
  };

  return (
    <div style={css.app}>
      {showModal && <UploadModal onConfirm={handleModalConfirm} onCancel={() => setShowModal(false)} />}
      <input ref={fileRef} type="file" accept="video/*,image/*" multiple style={{ display: "none" }} onChange={handleUpload} />

      <h1 style={css.logo}>Levelly</h1>
      <p style={css.sub}>MOC Creative Intelligence Platform</p>

      <div style={css.tabs}>
        {(["Library", "Brief Studio"] as const).map(t => (
          <button key={t} style={css.tab(tab === t)} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Library" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#666" }}>{lib.length} ad{lib.length !== 1 ? "s" : ""} in DNA library</p>
            <div style={{ display: "flex", gap: 8 }}>
              {lib.length > 0 && <button style={css.btnSecondary} onClick={() => { if (confirm("Clear entire DNA library?")) saveLib([]); }}>Clear library</button>}
              <button style={css.btnPrimary} onClick={() => setShowModal(true)} disabled={analyzing}>{analyzing ? "Analyzing…" : "+ Upload ads"}</button>
            </div>
          </div>

          {analyzeErr && <div style={css.error}>{analyzeErr}</div>}
          {analyzeInfo && <div style={css.info}>{analyzeInfo}</div>}
          {analyzing && !analyzeInfo && <div style={{ ...css.cardGray, textAlign: "center", padding: "2rem" }}><p style={{ margin: 0, fontSize: 13, color: "#666" }}>Extracting creative DNA…</p></div>}

          {lib.length === 0 && !analyzing && (
            <div style={{ ...css.card, textAlign: "center", padding: "3rem", border: "1px dashed #ddd" }}>
              <p style={{ margin: 0, fontSize: 14, color: "#888" }}>Upload MOC ads or competitor ads to build your Creative DNA library.</p>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#aaa" }}>Videos upload directly to Gemini. Auto frame extraction + optional manual storyboard frames.</p>
            </div>
          )}

          {lib.map((d, di) => (
            <div key={d.id} style={css.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedDNA(expandedDNA === di ? null : di)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</span>
                    <span style={css.badge(d.tier)}>{d.tier}</span>
                    {d.ad_type === "competitor" && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: "#faf5ff", color: "#7c3aed", border: "1px solid #ddd6fe" }}>competitor</span>}
                    {d.auto_frames && d.auto_frames.length > 0 && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>{d.auto_frames.length} frames</span>}
                    {d.manual_frames && d.manual_frames.length > 0 && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#fef9c3", color: "#854d0e", border: "1px solid #fde047" }}>{d.manual_frames.length} manual</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: "#aaa" }}>{d.file_name} · {new Date(d.added_at).toLocaleDateString()}</p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 12 }}>
                  <select value={d.tier} onChange={e => saveLib(lib.map(x => x.id === d.id ? { ...x, tier: e.target.value as DNAEntry["tier"] } : x))} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid #e0e0e0" }}>
                    {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button style={css.btnDanger} onClick={() => saveLib(lib.filter(x => x.id !== d.id))}>Remove</button>
                </div>
              </div>

              <div style={{ ...css.gridAuto, marginTop: 12 }}>
                {[
                  { label: "Hook type", value: d.hook_type },
                  { label: "Hook at", value: d.hook_timing_seconds != null ? `${d.hook_timing_seconds}s` : "—" },
                  { label: "Pacing", value: d.pacing },
                  { label: "Loss event", value: d.loss_event_type },
                  { label: "Biome", value: d.biome },
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
                  {d.auto_frames && d.auto_frames.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Auto-extracted frames</span>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                        {d.auto_frames.map((f, fi) => (
                          <div key={fi} style={{ fontSize: 12, padding: "6px 10px", background: "#f8f8f8", borderRadius: 6, border: "1px solid #f0f0f0" }}>
                            <span style={{ fontWeight: 600, color: "#1a56db", marginRight: 8 }}>{f.timestamp_seconds}s</span>
                            <span style={{ color: "#444" }}>{f.description}</span>
                            <span style={{ color: "#aaa", marginLeft: 8, fontStyle: "italic" }}>({f.significance})</span>
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
                      <span style={css.label}>Champions visible</span>
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
                  {[
                    { label: "Key mechanic", value: d.key_mechanic },
                    { label: "Emotional arc", value: d.emotional_arc },
                    { label: "Why it works", value: d.why_it_works },
                    { label: "Creative gaps", value: d.creative_gaps },
                    { label: "Frame extraction gaps", value: d.frame_extraction_gaps },
                    { label: "Why it fails", value: d.why_it_fails },
                    { label: "Replication instructions", value: d.replication_instructions },
                  ].filter(x => x.value).map(({ label, value }) => (
                    <div key={label} style={{ marginBottom: 10 }}>
                      <span style={css.label}>{label}</span>
                      <p style={{ margin: 0, fontSize: 13, color: label === "Creative gaps" || label === "Frame extraction gaps" ? "#854F0B" : "#444", lineHeight: 1.5 }}>{value}</p>
                    </div>
                  ))}
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
            <textarea style={css.textarea} placeholder="Describe the ad. E.g. '30s MOC ad for competitive players, Volcanic biome, x999 gate satisfying mechanic, near-win fail moment...'" value={briefCtx} onChange={e => setBriefCtx(e.target.value)} />
            <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
              <div>
                <span style={css.label}>Target segment</span>
                <select value={segment} onChange={e => setSegment(e.target.value)} style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid #e0e0e0" }}>
                  {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
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
                <div><span style={css.label}>Patterns used</span><p style={{ margin: 0, fontSize: 12, color: "#666", lineHeight: 1.5 }}>{briefAnalysis.patterns_used}</p></div>
                <div><span style={css.label}>Segment insight</span><p style={{ margin: 0, fontSize: 12, color: "#666", lineHeight: 1.5 }}>{briefAnalysis.segment_insight}</p></div>
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
                  {c.visual_identity && (
                    <div style={{ marginBottom: 16 }}>
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
                  <div style={{ marginBottom: 16 }}>
                    <span style={css.label}>Scene renders — click to generate</span>
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
                    <div style={{ marginBottom: 16 }}>
                      <span style={css.label}>Production script</span>
                      <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", padding: "6px 12px", background: "#f8f8f8", borderBottom: "1px solid #f0f0f0" }}>
                          {["Time", "Action", "Visual cue", "Audio cue"].map(h => <span key={h} style={{ fontSize: 9, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</span>)}
                        </div>
                        {c.production_script.map((step, si) => (
                          <div key={si} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", padding: "9px 12px", borderBottom: si < c.production_script.length - 1 ? "1px solid #f8f8f8" : "none", background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
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
                    <div style={{ marginBottom: 16 }}>
                      <span style={css.label}>Performance hooks</span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                        {c.performance_hooks.map((h, hi) => (
                          <div key={hi} style={{ ...css.card, margin: 0, padding: "10px 14px" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: hi === 0 ? "#fef3c7" : hi === 1 ? "#dcfce7" : "#eff6ff", color: hi === 0 ? "#92400e" : hi === 1 ? "#166534" : "#1e40af", display: "inline-block", marginBottom: 6 }}>{h.type}</span>
                            <p style={{ margin: 0, fontSize: 12, fontStyle: "italic", color: "#666", lineHeight: 1.5 }}>"{h.text}"</p>
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
