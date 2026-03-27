import { useState, useRef, useCallback } from "react";

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
  replication_instructions: string;
}

interface UploadConfig {
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor";
  context: string;
}

interface VisualIdentity {
  environment: string;
  lighting: string;
  player_champion: string;
  enemy_champion: string;
  player_mob_color: string;
  enemy_mob_color: string;
  gate_values: string[];
  cannon_type: string;
  mood_notes: string;
}

interface ScriptStep {
  time: string;
  action: string;
  visual_cue: string;
  audio_cue: string;
}

interface PerformanceHook {
  type: string;
  text: string;
}

interface QualityScore {
  pattern_fidelity: number;
  moc_dna: number;
  emotional_arc: number;
  visual_clarity: number;
  segment_fit: number;
  overall: number;
  notes: string;
}

interface Concept {
  title: string;
  is_data_backed: boolean;
  objective: string;
  target_segment: string;
  player_motivation: string;
  visual_identity: VisualIdentity;
  layout: string;
  production_script: ScriptStep[];
  performance_hooks: PerformanceHook[];
  engagement_hooks: string;
  quality_score: QualityScore;
  visual_start?: string;
  visual_middle?: string;
  visual_end?: string;
}

interface BriefAnalysis {
  patterns_used: string;
  segment_insight: string;
  strategy: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIERS = ["winner", "scalable", "failed", "inspiration"] as const;

const TIER_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  winner:      { bg: "#EAF3DE", text: "#3B6D11", border: "#97C459" },
  scalable:    { bg: "#E6F1FB", text: "#185FA5", border: "#85B7EB" },
  failed:      { bg: "#FCEBEB", text: "#A32D2D", border: "#F09595" },
  inspiration: { bg: "#FAEEDA", text: "#854F0B", border: "#FAC775" },
};

const SEGMENTS = ["Whale", "Dolphin", "Minnow", "Non-Payer"];
const GEMINI_BROWSER_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// ─── Prompts ──────────────────────────────────────────────────────────────────
const analyzeSystem = (lib: DNAEntry[], config: UploadConfig) => `You are a World-Class Creative Intelligence Analyst specializing in Mob Control mobile game ads. Watch the uploaded video carefully and extract precise data. NEVER guess — only report what you directly observe.

AD TYPE: ${config.ad_type === "moc" ? "MOB CONTROL ORIGINAL AD" : "COMPETITOR / MARKET REFERENCE AD"}
PERFORMANCE TIER: ${config.tier.toUpperCase()}
ANALYST CONTEXT: ${config.context || "No additional context provided."}

EXISTING LIBRARY (${lib.length} entries):
${lib.length > 0 ? JSON.stringify(lib.map(d => ({ title: d.title, tier: d.tier, hook_type: d.hook_type, hook_timing_seconds: d.hook_timing_seconds }))) : "Empty — first entry."}

### STEP 1 — OBSERVE BEFORE CLASSIFYING
Before filling any field, do ALL of these:
1. Watch for the first emotionally engaging moment — count the exact second. It is ALMOST NEVER 0s.
2. Describe the ground texture, tree types, lighting color, and structures you actually see. Then match to biome list.
3. For every character, match their visual design to the champion guide. Write "Unknown" if unsure — never guess.
4. List every gate in the exact order it appears. Include ALL gate types: multiplication (x), addition (+), and DEATH gates.
5. Identify the single most tension-driving mechanic with exact timing.

### GATE TYPES (all must be detected)
- Multiplication gate: marked with X (e.g. x2, x5, x10, x999) — multiplies mob count
- Addition gate: marked with + (e.g. +1, +5, +10) — adds to cannon or mob count  
- Death gate: marked with skull/red — INSTANTLY KILLS all mobs passing through. ALWAYS report if visible.
- Split gate: divides the path into multiple lanes
If you see only one X gate and multiple + gates, report exactly that. Do NOT invent extra gates.

### BIOME RECOGNITION (match what you see, not what you expect)
- Desert: yellow/orange sand, palm trees, bright warm sunlight
- Cyber-City: grey stone/metal paths, orange glowing tech structures
- Forest: green grass, dense green/brown trees, soft natural lighting — MAY HAVE FOG OR MIST
- Volcanic: red/orange lava flows, dark black rocks, dramatic red/orange lighting
- Snow: white snow ground, frozen/icy pipes, blue-white cold lighting
- Toxic: purple-tinted paths, green slime, glowing crystals
- Unknown: if environment doesn't clearly match any above

### CHAMPION RECOGNITION (visual match only — never infer from context)
- Mobzilla: LARGE purple/yellow robotic T-Rex with blue crystalline spikes
- Nexus: blue/white/orange humanoid mech robot with orange glowing energy sword
- Captain Kaboom: SMALL skeleton pirate, skull face, pirate hat, dual pistols
- Explodon: heavily armored blue knight with blue feather plume on helmet
- Big Blob: GIANT round green slime monster with crown and red eyes
- Raccoon (player): cute BLUE raccoon with dual SMGs
- Raccoon (enemy): cute RED raccoon with dual SMGs
- Caveman: blue-skinned muscular caveman with wooden club
- General: red-skinned military commander, red uniform, gold armor, monocle
IMPORTANT: Only list champions you can CLEARLY see. If a character doesn't match any above, write "Unknown".

${config.ad_type === "competitor" ? `
### COMPETITOR AD INSTRUCTIONS
This is NOT a Mob Control ad. Focus on:
- The core gameplay mechanic and how it creates tension
- The hook pattern and emotional arc
- What visual or mechanical elements could be adapted for MOC
- DO NOT try to identify MOC-specific biomes or champions if they are not present
` : ""}

Return ONLY valid JSON, no preamble:
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
  "replication_instructions": string
}`;

const briefSystem = (lib: DNAEntry[], ctx: string, seg: string) => `You are a World-Class Lead Creative Producer for Mob Control.

CREATIVE DNA LIBRARY (${lib.length} analyzed ads):
${JSON.stringify(lib, null, 2)}

BRIEF: ${ctx}
SEGMENT: ${seg}

SEGMENT DATA:
- Whale (>$50/mo, 45-59yo): Motivation=Winning/Rankings. Theme=Cute+Sci-fi.
- Dolphin ($10-50/mo, 35-44yo): Motivation=Winning+Fun. Theme=Cute+Sci-fi.
- Minnow (<$10/mo, 35-44yo): Motivation=Fun+Winning. Theme=Cute+Sci-fi.
- Non-Payer: Motivation=Fun+Challenges. Theme=Cute+Sci-fi.

MOC CHAMPIONS: Mobzilla(purple/yellow robotic T-Rex), Nexus(blue/white mech+orange sword), Captain Kaboom(skeleton pirate), Explodon(blue armored knight), Big Blob(green slime+crown), Raccoon(blue=player/red=enemy), Caveman(blue muscular), General(red-skinned commander+monocle).
BIOMES: Desert(yellow sand/palms), Cyber-City(grey metal/orange tech), Forest(green lush), Volcanic(red lava), Snow(white/frozen pipes), Toxic(purple/green slime).

9-STEP TENSION CURVE (mandatory concept 1): Pressure→Investment→Validate→Investment2→Payoff→False Safety→Pressure++→Almost Win→Fail
3 PILLARS (mandatory concept 1): Danger Lane(X gates→mob swarm), Investment Lane(+ gates→cannon upgrade), Upgrade Lane(power-ups/champions).

Return ONLY valid JSON:
{
  "analysis": { "patterns_used": string, "segment_insight": string, "strategy": string },
  "concepts": [{
    "title": string,
    "is_data_backed": boolean,
    "objective": string,
    "target_segment": string,
    "player_motivation": string,
    "visual_identity": { "environment": string, "lighting": string, "player_champion": string, "enemy_champion": string, "player_mob_color": string, "enemy_mob_color": string, "gate_values": [string], "cannon_type": string, "mood_notes": string },
    "layout": string,
    "production_script": [{ "time": string, "action": string, "visual_cue": string, "audio_cue": string }],
    "performance_hooks": [{ "type": string, "text": string }],
    "engagement_hooks": string,
    "quality_score": { "pattern_fidelity": number, "moc_dna": number, "emotional_arc": number, "visual_clarity": number, "segment_fit": number, "overall": number, "notes": string }
  }]
}`;

const imagePrompt = (concept: Concept, scene: "start" | "middle" | "end") => {
  const vi = concept.visual_identity;
  const desc = {
    start:  "Opening: enemies approaching fast, cannon ready, first gate choice imminent. High tension.",
    middle: "Mid-battle: massive blue mob swarm surging through multiplier gates. Screen-filling power fantasy.",
    end:    "Climax: player nearly winning — last-second massive enemy snatches victory away. Emotional peak failure.",
  }[scene];
  return `Generate a high-fidelity top-down 3D gameplay screenshot for a Mob Control mobile game ad.
SCENE: ${desc}
CONCEPT: ${concept.title}
ENVIRONMENT: ${vi.environment} | LIGHTING: ${vi.lighting}
PLAYER CHAMPION: ${vi.player_champion} | ENEMY CHAMPION: ${vi.enemy_champion}
GATE VALUES: ${vi.gate_values.join(", ")} | CANNON: ${vi.cannon_type}
MOOD: ${vi.mood_notes}
RULES: Cinematic top-down view. High contrast blue vs red mobs. Gates large and readable. Cannon at bottom. NO text/UI overlays.`;
};

// ─── API ──────────────────────────────────────────────────────────────────────
async function callAPI(task: string, payload: object): Promise<any> {
  const r = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, payload }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`API ${r.status}: ${text}`);
  try { return JSON.parse(text).result; }
  catch { throw new Error(`Invalid response: ${text.slice(0, 300)}`); }
}

async function uploadToGeminiFileAPI(file: File, onStatus: (m: string) => void): Promise<{ fileUri: string; mimeType: string }> {
  onStatus(`Uploading "${file.name}" (${Math.round(file.size / 1024 / 1024)}MB) to Gemini…`);
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_BROWSER_KEY}`,
    { method: "POST", headers: { "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Length": file.size.toString(), "X-Goog-Upload-Header-Content-Type": file.type, "Content-Type": "application/json" }, body: JSON.stringify({ file: { display_name: file.name } }) }
  );
  if (!initRes.ok) throw new Error(`File API init failed: ${initRes.status}`);
  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL from Gemini");
  onStatus(`Uploading "${file.name}"… (may take a minute)`);
  const uploadRes = await fetch(uploadUrl, { method: "POST", headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Type": file.type }, body: file });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  const uploadData = await uploadRes.json();
  const fileUri = uploadData.file?.uri;
  const name = uploadData.file?.name;
  if (!fileUri) throw new Error("No file URI from Gemini");
  onStatus(`Processing "${file.name}"…`);
  for (let i = 0; i < 20; i++) {
    const s = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}?key=${GEMINI_BROWSER_KEY}`)).json();
    if (s.state === "ACTIVE") break;
    if (s.state === "FAILED") throw new Error("Gemini file processing failed");
    await new Promise(r => setTimeout(r, 2000));
  }
  return { fileUri, mimeType: file.type };
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = {
  app:          { fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "1.5rem 1rem", color: "#111" } as React.CSSProperties,
  logo:         { fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-0.5px" } as React.CSSProperties,
  sub:          { fontSize: 13, color: "#666", margin: "2px 0 1.5rem" } as React.CSSProperties,
  tabs:         { display: "flex", gap: 2, borderBottom: "1px solid #e5e5e5", marginBottom: "1.5rem" } as React.CSSProperties,
  tab:          (a: boolean): React.CSSProperties => ({ padding: "8px 18px", fontSize: 13, fontWeight: a ? 600 : 400, color: a ? "#111" : "#888", background: "none", border: "none", borderBottom: a ? "2px solid #111" : "2px solid transparent", cursor: "pointer", marginBottom: -1 }),
  card:         { background: "#fff", border: "1px solid #e8e8e8", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 10 } as React.CSSProperties,
  cardGray:     { background: "#f8f8f8", border: "1px solid #e8e8e8", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 10 } as React.CSSProperties,
  label:        { fontSize: 10, fontWeight: 600, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 5, display: "block" },
  textarea:     { width: "100%", boxSizing: "border-box" as const, fontSize: 13, padding: "8px 10px", border: "1px solid #e0e0e0", borderRadius: 8, minHeight: 80, resize: "vertical" as const, outline: "none", fontFamily: "inherit" },
  btnPrimary:   { padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8, border: "none", background: "#1a56db", color: "#fff" } as React.CSSProperties,
  btnSecondary: { padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", color: "#444" } as React.CSSProperties,
  btnDanger:    { padding: "5px 10px", fontSize: 11, cursor: "pointer", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#dc2626" } as React.CSSProperties,
  badge:        (tier: string): React.CSSProperties => ({ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: TIER_STYLE[tier]?.bg ?? "#eee", color: TIER_STYLE[tier]?.text ?? "#333", border: `1px solid ${TIER_STYLE[tier]?.border ?? "#ccc"}` }),
  error:        { fontSize: 12, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", marginTop: 8 } as React.CSSProperties,
  info:         { fontSize: 12, color: "#1a56db", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 12px", marginTop: 8 } as React.CSSProperties,
  metric:       { background: "#f5f5f5", borderRadius: 8, padding: "8px 12px", textAlign: "center" as const },
  sceneWrap:    { aspectRatio: "9/16", background: "#f0f0f0", borderRadius: 10, border: "1px solid #e8e8e8", overflow: "hidden", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" as const },
  grid3:        { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 } as React.CSSProperties,
  gridAuto:     { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 } as React.CSSProperties,
  overlay:      { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal:        { background: "#fff", borderRadius: 16, padding: "1.5rem", width: "90%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" } as React.CSSProperties,
};

const scoreColor = (n: number) => n >= 80 ? "#16a34a" : n >= 60 ? "#1a56db" : "#dc2626";

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadModal({ onConfirm, onCancel }: { onConfirm: (cfg: UploadConfig) => void; onCancel: () => void }) {
  const [tier, setTier] = useState<UploadConfig["tier"]>("winner");
  const [adType, setAdType] = useState<UploadConfig["ad_type"]>("moc");
  const [context, setContext] = useState("");

  return (
    <div style={css.overlay} onClick={onCancel}>
      <div style={css.modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600 }}>Upload ads</h2>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666" }}>Tell Gemini what it's analyzing before upload.</p>

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

        <div style={{ marginBottom: 20 }}>
          <span style={css.label}>Context for Gemini (optional but improves accuracy)</span>
          <textarea
            style={css.textarea}
            placeholder={adType === "moc"
              ? "E.g. 'Forest biome ad with death gate mechanic, targeting whales. Focus on the gate sequence and loss moment.'"
              : "E.g. 'Competitor ad using infinite merge mechanic. Analyze hook pattern and what makes it retain attention.'"}
            value={context}
            onChange={e => setContext(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={css.btnSecondary} onClick={onCancel}>Cancel</button>
          <button style={css.btnPrimary} onClick={() => onConfirm({ tier, ad_type: adType, context })}>
            Choose files →
          </button>
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
    const cfg = uploadConfig || { tier: "winner", ad_type: "moc" as const, context: "" };
    setAnalyzing(true);
    setAnalyzeErr("");
    setAnalyzeInfo("");
    try {
      for (const file of files) {
        let contentPart: any;
        if (file.size > 4 * 1024 * 1024) {
          const { fileUri, mimeType } = await uploadToGeminiFileAPI(file, setAnalyzeInfo);
          setAnalyzeInfo(`Extracting creative DNA from "${file.name}"…`);
          contentPart = { type: "file_uri", fileUri, mimeType };
        } else {
          setAnalyzeInfo(`Processing "${file.name}"…`);
          const base64 = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res((r.result as string).split(",")[1]);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
          contentPart = file.type.startsWith("video/")
            ? { type: "document", source: { type: "base64", media_type: file.type, data: base64 } }
            : { type: "image", source: { type: "base64", media_type: file.type, data: base64 } };
        }

        const dna = await callAPI("analyze", {
          system: analyzeSystem(lib, cfg),
          messages: [{ role: "user", content: [{ type: "text", text: "Analyze this ad and extract Creative DNA:" }, contentPart] }],
        });

        const newLib = [...lib, { ...dna, id: Date.now() + Math.random(), tier: cfg.tier, ad_type: cfg.ad_type, upload_context: cfg.context, file_name: file.name, added_at: new Date().toISOString() }];
        saveLib(newLib);
        setAnalyzeInfo("");
      }
    } catch (err: any) {
      setAnalyzeErr(err.message);
    } finally {
      setAnalyzing(false);
      setAnalyzeInfo("");
      setUploadConfig(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [lib, uploadConfig]);

  const handleGenerateBrief = async () => {
    if (!briefCtx.trim()) { setBriefErr("Enter a brief context first."); return; }
    if (lib.length === 0) { setBriefErr("Add at least one ad to the DNA Library first."); return; }
    setGenerating(true); setBriefErr(""); setConcepts([]); setBriefAnalysis(null);
    try {
      const result = await callAPI("brief", {
        system: briefSystem(lib, briefCtx, segment),
        messages: [{ role: "user", content: "Generate 3 MOC ad concepts based on the DNA library and brief." }],
      });
      setConcepts(result.concepts ?? []);
      setBriefAnalysis(result.analysis ?? null);
      setExpandedConcept(0);
    } catch (err: any) { setBriefErr(err.message); }
    finally { setGenerating(false); }
  };

  const handleRenderScene = async (ci: number, scene: "start" | "middle" | "end") => {
    const k = `${ci}-${scene}`;
    setRenderingScene(p => ({ ...p, [k]: true }));
    try {
      const url = await callAPI("image", { prompt: imagePrompt(concepts[ci], scene) });
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

      {/* ── LIBRARY ── */}
      {tab === "Library" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#666" }}>{lib.length} ad{lib.length !== 1 ? "s" : ""} in DNA library</p>
            <div style={{ display: "flex", gap: 8 }}>
              {lib.length > 0 && (
                <button style={css.btnSecondary} onClick={() => { if (confirm("Clear entire DNA library?")) saveLib([]); }}>
                  Clear library
                </button>
              )}
              <button style={css.btnPrimary} onClick={() => setShowModal(true)} disabled={analyzing}>
                {analyzing ? "Analyzing…" : "+ Upload ads"}
              </button>
            </div>
          </div>

          {analyzeErr && <div style={css.error}>{analyzeErr}</div>}
          {analyzeInfo && <div style={css.info}>{analyzeInfo}</div>}

          {analyzing && !analyzeInfo && (
            <div style={{ ...css.cardGray, textAlign: "center", padding: "2rem" }}>
              <p style={{ margin: 0, fontSize: 13, color: "#666" }}>Extracting creative DNA…</p>
            </div>
          )}

          {lib.length === 0 && !analyzing && (
            <div style={{ ...css.card, textAlign: "center", padding: "3rem", border: "1px dashed #ddd" }}>
              <p style={{ margin: 0, fontSize: 14, color: "#888" }}>Upload MOC ads or competitor ads to build your Creative DNA library.</p>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#aaa" }}>MP4, MOV, PNG, JPG supported. Large videos upload directly to Gemini.</p>
            </div>
          )}

          {lib.map((d, di) => (
            <div key={d.id} style={css.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedDNA(expandedDNA === di ? null : di)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</span>
                    <span style={css.badge(d.tier)}>{d.tier}</span>
                    {d.ad_type === "competitor" && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: "#faf5ff", color: "#7c3aed", border: "1px solid #ddd6fe" }}>competitor</span>
                    )}
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
                  { label: "Hook type",  value: d.hook_type },
                  { label: "Hook at",    value: d.hook_timing_seconds != null ? `${d.hook_timing_seconds}s` : "—" },
                  { label: "Pacing",     value: d.pacing },
                  { label: "Loss event", value: d.loss_event_type },
                  { label: "Biome",      value: d.biome },
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
                  {d.gate_sequence?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Gate sequence</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                        {d.gate_sequence.map((g, i) => (
                          <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: g.toLowerCase().includes("death") || g.includes("☠") ? "#fef2f2" : "#eff6ff", color: g.toLowerCase().includes("death") || g.includes("☠") ? "#dc2626" : "#1e40af", borderRadius: 6, border: `1px solid ${g.toLowerCase().includes("death") ? "#fca5a5" : "#bfdbfe"}` }}>{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.champions_visible?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={css.label}>Champions visible</span>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const }}>
                        {d.champions_visible.map((c, i) => (
                          <span key={i} style={{ fontSize: 11, padding: "2px 8px", background: "#faf5ff", color: "#7c3aed", borderRadius: 6, border: "1px solid #ddd6fe" }}>{c}</span>
                        ))}
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
                    { label: "Key mechanic",            value: d.key_mechanic },
                    { label: "Emotional arc",            value: d.emotional_arc },
                    { label: "Why it works",             value: d.why_it_works },
                    { label: "Creative gaps",            value: d.creative_gaps },
                    { label: "Why it fails",             value: d.why_it_fails },
                    { label: "Replication instructions", value: d.replication_instructions },
                  ].filter(x => x.value).map(({ label, value }) => (
                    <div key={label} style={{ marginBottom: 10 }}>
                      <span style={css.label}>{label}</span>
                      <p style={{ margin: 0, fontSize: 13, color: label === "Creative gaps" ? "#854F0B" : "#444", lineHeight: 1.5 }}>{value}</p>
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

      {/* ── BRIEF STUDIO ── */}
      {tab === "Brief Studio" && (
        <div>
          <div style={css.card}>
            <span style={css.label}>Brief context</span>
            <textarea style={css.textarea} placeholder="Describe the ad you want. E.g. '30s ad for competitive players, Mobzilla vs General in Volcanic biome, x999 gate satisfying mechanic, near-win fail moment...'" value={briefCtx} onChange={e => setBriefCtx(e.target.value)} />
            <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
              <div>
                <span style={css.label}>Target segment</span>
                <select value={segment} onChange={e => setSegment(e.target.value)} style={{ fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid #e0e0e0" }}>
                  {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" as const }}>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: "#999" }}>{lib.length} DNA entries · {lib.filter(d => d.tier === "winner").length} winners</p>
                <button style={css.btnPrimary} onClick={handleGenerateBrief} disabled={generating}>
                  {generating ? "Generating…" : "Generate 3 concepts"}
                </button>
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
                          { l: "Lighting",    v: c.visual_identity.lighting },
                          { l: "Cannon",      v: c.visual_identity.cannon_type },
                          { l: "Player",      v: `${c.visual_identity.player_champion} (${c.visual_identity.player_mob_color})` },
                          { l: "Enemy",       v: `${c.visual_identity.enemy_champion} (${c.visual_identity.enemy_mob_color})` },
                          { l: "Gates",       v: c.visual_identity.gate_values?.join(", ") },
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
                              : <div style={{ textAlign: "center", padding: 12 }}><p style={{ margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#aaa" }}>{scene}</p><p style={{ margin: "4px 0 0", fontSize: 10, color: "#bbb" }}>Click to render</p></div>}
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
                          { l: "MOC DNA",          v: c.quality_score.moc_dna },
                          { l: "Emotional arc",    v: c.quality_score.emotional_arc },
                          { l: "Visual clarity",   v: c.quality_score.visual_clarity },
                          { l: "Segment fit",      v: c.quality_score.segment_fit },
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
