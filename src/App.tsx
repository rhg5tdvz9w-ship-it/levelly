import React, { useState, useRef, useCallback, useEffect } from "react";
import { MOC_REFERENCES } from "./refImages";

import type { DNAEntry, FrameExtraction, UploadConfig, Concept, BriefAnalysis, SortMode } from "./types";
import { frameExtractionSystem, hookDetectionSystem, parseContextFacts, analyzeSystem, refinementSystem, reanalysisSystem, briefSystem, imagePromptFn } from "./prompts";
import { saveFramesToIDB, mergeFramesFromIDB } from "./storage";
import { velocityPerDay, sanitizeDNA, buildLineageChain, parentValidation, sortLib } from "./library";
import { GEMINI_IMAGE_URL, callGeminiDirect, parseDataURI, callImageDirect, uploadToGeminiFileAPI, fileToBase64, extractFramesFromVideo } from "./analysis";
import { enhanceText } from "./briefing";
import { pickRelevantRefs } from "./rendering";

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
// Analysis steps for homepage progress indicator (#7)
const ANALYSIS_STEPS = [
  { key: "uploading",  label: "Uploading video" },
  { key: "frames",     label: "Identifying key moments" },
  { key: "extracting", label: "Extracting frames" },
  { key: "hook",       label: "Detecting hook" },
  { key: "analyzing",  label: "Analysing DNA" },
  { key: "validating", label: "Validating consistency" },
  { key: "saving",     label: "Saving to library" },
];

const TIER_ACCENT: Record<string, string> = {
  winner: "#3fb950", scalable: "#58a6ff", inspiration: "#f0c53a", failed: "#f85149",
};


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
  const [chainStart, setChainStart] = useState("");
  const [chainEnd, setChainEnd] = useState("");
  const [chainOther, setChainOther] = useState("");
  const [giantKillCount, setGiantKillCount] = useState("");
  const [giantKillSec, setGiantKillSec] = useState("");
  const [upgradeSec, setUpgradeSec] = useState("");
  const [finalGiantSurvives, setFinalGiantSurvives] = useState("");
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
          <span style={labelStyle}>Analysis hints <span style={{ fontWeight:400,color:D.textMuted }}>(helps Gemini avoid hallucinations)</span></span>
          <div style={{ background:D.surface2,borderRadius:8,border:`0.5px solid ${D.border}`,padding:"10px 12px",display:"flex",flexDirection:"column" as const,gap:10 }}>
            {/* Cannon evolution chain */}
            <div>
              <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Unit evolution chain</span>
              <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" as const }}>
                <select style={{ background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit" }}
                  value={chainStart} onChange={e=>{setChainStart(e.target.value);setChainEnd("");}}>
                  <option value="">Starting cannon…</option>
                  <option value="simple">Simple Cannon</option>
                  <option value="double">Double Cannon</option>
                  <option value="triple">Triple Cannon</option>
                  <option value="tank">Tank</option>
                  <option value="other">Other…</option>
                </select>
                {chainStart&&chainStart!=="other"&&(<>
                  <span style={{color:D.textDim,fontSize:11}}>→</span>
                  <select style={{ background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit" }}
                    value={chainEnd} onChange={e=>setChainEnd(e.target.value)}>
                    <option value="">No upgrade</option>
                    <option value="double">→ Double Cannon</option>
                    <option value="triple">→ Triple Cannon</option>
                    <option value="tank">→ Tank</option>
                    <option value="other">→ Other…</option>
                  </select>
                </>)}
                {(chainStart==="other"||chainEnd==="other")&&(
                  <input style={{ background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit",width:130 }}
                    placeholder="e.g. Sniper Cannon" value={chainOther} onChange={e=>setChainOther(e.target.value)} />
                )}
              </div>
            </div>
            {/* Giant kills */}
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8 }}>
              <div>
                <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Upgrade at (sec)</span>
                <input type="number" min="0" max="60" style={{ width:"100%",boxSizing:"border-box" as const,background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit" }} placeholder="e.g. 7" value={upgradeSec} onChange={e=>setUpgradeSec(e.target.value)} />
              </div>
              <div>
                <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Giants killed</span>
                <select style={{ ...inputStyle,fontSize:11,padding:"4px 8px" }} value={giantKillCount} onChange={e=>setGiantKillCount(e.target.value)}>
                  <option value="">Unknown</option>
                  <option value="0">0 — none</option>
                  <option value="1">1 giant</option>
                  <option value="2">2 giants</option>
                  <option value="3">3 giants</option>
                </select>
              </div>
              <div>
                <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Kill at (seconds)</span>
                <input type="number" min="0" max="60" style={{ ...inputStyle,fontSize:11,padding:"4px 8px" }} placeholder="e.g. 10" value={giantKillSec} onChange={e=>setGiantKillSec(e.target.value)} />
              </div>
              <div>
                <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Final giant</span>
                <select style={{ ...inputStyle,fontSize:11,padding:"4px 8px" }} value={finalGiantSurvives} onChange={e=>setFinalGiantSurvives(e.target.value)}>
                  <option value="">Unknown</option>
                  <option value="yes">Survives</option>
                  <option value="no">Is killed</option>
                </select>
              </div>
            </div>
            {/* Free text */}
            <div>
              <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Additional context</span>
              <textarea style={{ ...inputStyle,minHeight:48,resize:"vertical" as const,background:D.bg,fontSize:11 }} placeholder="Biome, hook type, gates destroyed by giant, empty containers…" value={context} onChange={e=>setContext(e.target.value)} />
            </div>
          </div>
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
          <button style={btnPri} onClick={()=>{
                  const parts: string[] = [];
                  const tierLabel2: Record<string,string> = {simple:"Simple Cannon",double:"Double Cannon",triple:"Triple Cannon",tank:"Tank"};
                  if(chainStart){const s=chainStart==="other"?chainOther:tierLabel2[chainStart];const e=chainEnd&&chainEnd!=="other"?tierLabel2[chainEnd]:chainEnd==="other"?chainOther:null;if(s&&e&&s!==e)parts.push(`${s} to ${e} cannon chain`);else if(s)parts.push(`${s} cannon only`);}
                  if(upgradeSec) parts.push(`upgrade at ${upgradeSec}s`);
                  if(giantKillCount) parts.push(`${giantKillCount} giant${parseInt(giantKillCount)!==1?"s":""} killed`);
                  if(giantKillSec) parts.push(`giant killed at ${giantKillSec}s`);
                  if(finalGiantSurvives==="yes") parts.push("final giant is not killed");
                  if(finalGiantSurvives==="no") parts.push("final giant is killed");
                  if(context.trim()) parts.push(context.trim());
                  const fullContext = parts.join(", ");
                  onConfirm({ tier,ad_type:adType,context:fullContext,manual_frames:manualFrames,creative_id:creativeId.trim()||undefined,parent_id:parentId.trim()||undefined });
                }}>Choose video →</button>
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

// ─── Frame Description Toggle (analysis report) ─────────────────────────────
function FrameDescriptionToggle({ frames, keyEvents }: { frames: FrameExtraction[]; keyEvents?: any[] }) {
  const [showAll, setShowAll] = React.useState(false);
  return (
    <div style={{ marginTop: 6 }}>
      {keyEvents && keyEvents.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, marginBottom: 6 }}>
          {keyEvents.map((ev: any, i: number) => {
            const sigColor: Record<string,string> = { hook: D.red, upgrade: D.green, container: D.green, gate: D.blue, swarm: D.gold, almost_fail: "#f472b6", almost_win: "#34d399", loss: D.red, boss_death: D.gold, boss_appear: D.purple, boss_damage: "#f472b6" };
            const color = sigColor[ev.event_type] || D.textDim;
            return (
              <div key={i} style={{ fontSize: 10, padding: "3px 8px", background: D.surface, borderRadius: 4, display: "flex", gap: 8 }}>
                <span style={{ fontWeight: 500, color: D.blue, minWidth: 28, flexShrink: 0 }}>{ev.timestamp_seconds}s</span>
                <span style={{ color: D.text, flex: 1 }}>{ev.description}</span>
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 10, background: `${color}22`, color, border: `0.5px solid ${color}44`, flexShrink: 0 }}>{(ev.event_type||"").replace("_"," ")}</span>
              </div>
            );
          })}
        </div>
      )}
      <button onClick={()=>setShowAll(p=>!p)} style={{ background:"none",border:`0.5px solid ${D.border2}`,borderRadius:6,color:showAll?D.blue:D.textMuted,cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:500,padding:"3px 10px" }}>
        {showAll ? "▲ Hide all frames" : `▼ Show all frames (${frames.length})`}
      </button>
      {showAll && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, marginTop: 4 }}>
          {frames.map((f, fi) => (
            <div key={fi} style={{ fontSize: 10, padding: "3px 8px", background: D.surface2, borderRadius: 4, display: "flex", gap: 8 }}>
              <span style={{ fontWeight: 500, color: D.blue, minWidth: 28, flexShrink: 0 }}>{f.timestamp_seconds}s</span>
              <span style={{ color: D.textMuted, flex: 1 }}>{f.description}</span>
              {f.significance !== "filler" && <span style={{ fontSize: 9, color: D.textDim, flexShrink: 0 }}>{f.significance}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Timeline Section (library card expanded) ────────────────────────────────
function TimelineSection({ frames, keyEvents }: { frames: FrameExtraction[]; keyEvents?: any[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const labelStyle = { display: "block" as const, fontSize: 9, fontWeight: 600, color: D.textDim, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 6 };
  const sigColor: Record<string,string> = { hook: D.red, upgrade: D.green, container: D.green, gate: D.blue, swarm: D.gold, almost_fail: "#f472b6", almost_win: "#34d399", fail: D.red, loss: D.red, boss_death: D.gold, boss_appear: D.purple, boss_damage: "#f472b6" };
  return (
    <div style={{ marginBottom: 10 }}>
      {keyEvents && keyEvents.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <span style={labelStyle}>Key events ({keyEvents.length})</span>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
            {keyEvents.map((ev: any, i: number) => {
              const color = sigColor[ev.event_type] || D.textDim;
              return (
                <div key={i} style={{ fontSize: 11, padding: "4px 8px", background: D.surface, borderRadius: 5, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontWeight: 600, color: D.blue, minWidth: 28, flexShrink: 0 }}>{ev.timestamp_seconds}s</span>
                  <span style={{ color: D.text, flex: 1, lineHeight: 1.4 }}>{ev.description}</span>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: `${color}22`, color, border: `0.5px solid ${color}44`, flexShrink: 0, alignSelf: "center" }}>{(ev.event_type||"").replace("_"," ")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <button onClick={()=>setShowAll(p=>!p)} style={{ background:"none",border:`0.5px solid ${D.border2}`,borderRadius:6,color:showAll?D.blue:D.textMuted,cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:500,padding:"3px 10px",marginBottom:4 }}>
        {showAll ? "▲ Hide all frames" : `▼ Show all frames (${frames.length})`}
      </button>
      {showAll && (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
          {frames.map((f, i) => {
            const color = sigColor[f.significance] || D.textDim;
            return (
              <div key={i} style={{ fontSize: 11, padding: "4px 8px", background: D.surface, borderRadius: 5, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontWeight: 600, color: D.blue, minWidth: 28, flexShrink: 0 }}>{f.timestamp_seconds}s</span>
                <span style={{ color: D.text, flex: 1, lineHeight: 1.4 }}>{f.description}</span>
                {f.significance && f.significance !== "filler" && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 10, background: `${color}22`, color, border: `0.5px solid ${color}44`, flexShrink: 0, alignSelf: "center" }}>{f.significance.replace("_"," ")}</span>}
              </div>
            );
          })}
        </div>
      )}
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
  // Pre-populate chain from existing entry data
  const existingChain = entry.unit_evolution_chain||[];
  const [chainStart, setChainStart] = React.useState(existingChain.length>0?existingChain[0].toLowerCase().replace(" cannon",""):"");
  const [chainEnd, setChainEnd] = React.useState(existingChain.length>1?existingChain[existingChain.length-1].toLowerCase().replace(" cannon",""):"");
  const [chainOther, setChainOther] = React.useState("");
  const [giantKillCount, setGiantKillCount] = React.useState("");
  const [giantKillSec, setGiantKillSec] = React.useState("");
  const [upgradeSec, setUpgradeSec] = React.useState("");
  const [finalGiantSurvives, setFinalGiantSurvives] = React.useState("");
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

        {/* Structured analysis hints */}
        <div style={{ marginBottom:16 }}>
          <span style={{ fontSize:10,fontWeight:600,color:D.textDim,letterSpacing:"0.08em",textTransform:"uppercase" as const,display:"block",marginBottom:6 }}>Analysis hints <span style={{fontWeight:400,color:D.textMuted}}>(helps avoid hallucinations)</span></span>
          <div style={{ background:D.surface2,borderRadius:8,border:`0.5px solid ${D.border}`,padding:"10px 12px",display:"flex",flexDirection:"column" as const,gap:10 }}>
            <div>
              <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Unit evolution chain</span>
              <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" as const }}>
                <select style={{ background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit" }}
                  value={chainStart} onChange={e=>{setChainStart(e.target.value);setChainEnd("");}}>
                  <option value="">Starting cannon…</option>
                  <option value="simple">Simple Cannon</option>
                  <option value="double">Double Cannon</option>
                  <option value="triple">Triple Cannon</option>
                  <option value="tank">Tank</option>
                  <option value="other">Other…</option>
                </select>
                {chainStart&&chainStart!=="other"&&(<>
                  <span style={{color:D.textDim,fontSize:11}}>→</span>
                  <select style={{ background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit" }}
                    value={chainEnd} onChange={e=>setChainEnd(e.target.value)}>
                    <option value="">No upgrade</option>
                    <option value="double">→ Double Cannon</option>
                    <option value="triple">→ Triple Cannon</option>
                    <option value="tank">→ Tank</option>
                    <option value="other">→ Other…</option>
                  </select>
                </>)}
                {(chainStart==="other"||chainEnd==="other")&&(
                  <input style={{ background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit",width:130 }}
                    placeholder="e.g. Sniper Cannon" value={chainOther} onChange={e=>setChainOther(e.target.value)} />
                )}
              </div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8 }}>
              <div>
                <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Upgrade at (sec)</span>
                <input type="number" min="0" max="60" style={{ width:"100%",boxSizing:"border-box" as const,background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit" }} placeholder="e.g. 7" value={upgradeSec} onChange={e=>setUpgradeSec(e.target.value)} />
              </div>
              <div>
                <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Giants killed</span>
                <select style={{ width:"100%",background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit" }} value={giantKillCount} onChange={e=>setGiantKillCount(e.target.value)}>
                  <option value="">Unknown</option>
                  <option value="0">0 — none</option>
                  <option value="1">1 giant</option>
                  <option value="2">2 giants</option>
                  <option value="3">3 giants</option>
                </select>
              </div>
              <div>
                <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Kill at (seconds)</span>
                <input type="number" min="0" max="60" style={{ width:"100%",boxSizing:"border-box" as const,background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit" }} placeholder="e.g. 10" value={giantKillSec} onChange={e=>setGiantKillSec(e.target.value)} />
              </div>
              <div>
                <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Final giant</span>
                <select style={{ width:"100%",background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,fontSize:11,padding:"4px 8px",fontFamily:"inherit" }} value={finalGiantSurvives} onChange={e=>setFinalGiantSurvives(e.target.value)}>
                  <option value="">Unknown</option>
                  <option value="yes">Survives</option>
                  <option value="no">Is killed</option>
                </select>
              </div>
            </div>
            <div>
              <span style={{ fontSize:10,color:D.textMuted,display:"block",marginBottom:4 }}>Additional notes</span>
              <textarea value={reuploadCtx} onChange={e=>setReuploadCtx(e.target.value)}
                placeholder="Biome, gates destroyed by giant, empty containers..."
                style={{ width:"100%",boxSizing:"border-box" as const,fontSize:11,padding:"6px 10px",background:D.bg,border:`0.5px solid ${D.border2}`,borderRadius:6,color:D.text,resize:"vertical" as const,minHeight:44,fontFamily:"inherit",outline:"none" }} />
            </div>
          </div>
        </div>
        <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
          <button onClick={onCancel} style={{ padding:"8px 18px",fontSize:13,background:"none",border:`0.5px solid ${D.border2}`,borderRadius:8,color:D.textMuted,cursor:"pointer",fontFamily:"inherit" }}>Cancel</button>
          <button onClick={()=>{ if(videoFile){
                  const parts: string[] = [];
                  const tierLabel3: Record<string,string> = {simple:"Simple Cannon",double:"Double Cannon",triple:"Triple Cannon",tank:"Tank"};
                  if(chainStart){const s=chainStart==="other"?chainOther:tierLabel3[chainStart];const e=chainEnd&&chainEnd!=="other"?tierLabel3[chainEnd]:chainEnd==="other"?chainOther:null;if(s&&e&&s!==e)parts.push(`${s} to ${e} cannon chain`);else if(s)parts.push(`${s} cannon only`);}
                  if(upgradeSec) parts.push(`upgrade at ${upgradeSec}s`);
                  if(giantKillCount) parts.push(`${giantKillCount} giant${parseInt(giantKillCount)!==1?"s":""} killed`);
                  if(giantKillSec) parts.push(`giant killed at ${giantKillSec}s`);
                  if(finalGiantSurvives==="yes") parts.push("final giant is not killed");
                  if(finalGiantSurvives==="no") parts.push("final giant is killed");
                  if(reuploadCtx.trim()) parts.push(reuploadCtx.trim());
                  onConfirm(videoFile,frameFiles,parts.join(", "));
                }}} disabled={!videoFile}
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
          {(() => {
            const reanalyzing = reanalyzingIds.has(d.id);
            const hasFrames = (d.auto_frames||[]).some(f => f.image_data);
            return hasFrames ? (
              <button style={{ ...btnSec, fontSize:10, padding:"4px 9px", cursor:reanalyzing?"not-allowed":"pointer", opacity:reanalyzing?0.5:1, background: D.greenBg, color: D.green, border: `0.5px solid ${D.greenBdr}` }}
                disabled={reanalyzing}
                onClick={e=>{ e.stopPropagation(); handleReanalyzeSingle(d); }}
                title="Re-run analysis on existing frames — no video needed">
                {reanalyzing ? "⟳ Analyzing…" : "⟳ Re-analyze"}
              </button>
            ) : null;
          })()}
          <button
            onClick={async()=>{
              try {
                const vi = d.visual_identity||{};
                const frames = (d.auto_frames||[]).filter((f:any)=>f.image_data);
                const frameImgs = frames.map((f:any)=>`<div style="text-align:center;flex:1 1 80px"><div style="font-size:9px;color:#666666;margin-bottom:3px">${f.timestamp_seconds}s</div><img src="data:image/jpeg;base64,${f.image_data}" style="width:100%;border-radius:4px"/><div style="font-size:9px;color:#444444;margin-top:3px">${f.description||""}</div></div>`).join("");
                const timeline = (d.auto_frames||[]).map((f:any)=>`<tr style="border-bottom:1px solid #eeeeee"><td style="padding:4px 8px;color:#1a56db;white-space:nowrap;font-size:11px;vertical-align:top;font-weight:500">${f.timestamp_seconds}s</td><td style="padding:4px 8px;font-size:11px;color:#111111">${f.description||""}</td><td style="padding:4px 8px;font-size:10px;color:#666666">${f.significance||""}</td></tr>`).join("");
                const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#ffffff;color:#111111;padding:24px;max-width:960px;margin:0 auto">
<div style="border-bottom:1px solid #e0e0e0;padding-bottom:14px;margin-bottom:20px">
  <div style="font-size:11px;color:#666666;margin-bottom:3px">${d.creative_id||"#"+d.id} · ${d.tier} · ${d.biome||""}</div>
  <div style="font-size:22px;font-weight:700;color:#111111">${d.title||""}</div>
</div>
<div style="display:grid;grid-template-columns:auto auto auto auto auto auto;gap:12px;margin-bottom:20px">
  ${[["Hook type",d.hook_type],["Hook at",(d.hook_timing_seconds!=null?d.hook_timing_seconds+"s":"—")],["Biome",d.biome],["Pacing",d.pacing],["Loss event",d.loss_event_type],["Swarm peak",(d.swarm_peak_moment_seconds!=null?d.swarm_peak_moment_seconds+"s":"—")]].map(([l,v])=>`<div><div style="font-size:9px;color:#666666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">${l}</div><div style="font-size:12px;font-weight:500;color:#111111">${v||"—"}</div></div>`).join("")}
</div>
${(d.unit_evolution_chain||[]).length?`<div style="margin-bottom:16px"><div style="font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Unit evolution chain</div><div>${(d.unit_evolution_chain||[]).map((s:string)=>`<span style="display:inline-block;font-size:11px;padding:3px 10px;border-radius:4px;background:#eff6ff;color:#1a56db;border:0.5px solid #93c5fd;margin-right:6px">${s}</span>`).join("→")}</div></div>`:""}
${frames.length?`<div style="margin-bottom:16px"><div style="font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Extracted frames</div><div style="display:flex;gap:8px;flex-wrap:wrap">${frameImgs}</div></div>`:""}
${timeline?`<div style="margin-bottom:16px"><div style="font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Timeline</div><table style="width:100%;border-collapse:collapse;border:0.5px solid #21262d"><tbody>${timeline}</tbody></table></div>`:""}
${d.why_it_works?`<div style="margin-bottom:12px"><div style="font-size:9px;color:#666666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Why it works</div><div style="font-size:12px;color:#333333;line-height:1.6">${d.why_it_works}</div></div>`:""}
${d.creative_gaps?`<div style="margin-bottom:12px"><div style="font-size:9px;color:#666666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Creative gaps</div><div style="font-size:12px;color:#333333;line-height:1.6">${d.creative_gaps}</div></div>`:""}
<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e0e0e0;font-size:10px;color:#888888">Levelly — MOC Creative Intelligence</div>
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
            <TimelineSection frames={d.auto_frames} keyEvents={(d as any).key_events} />
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

          {[
            { l: "Key mechanic", v: d.key_mechanic },
            { l: "Emotional arc", v: d.emotional_arc },
            { l: "Why it works", v: d.why_it_works },
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
  const [briefProgress, setBriefProgress] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [briefAnalysis, setBriefAnalysis] = useState<BriefAnalysis|null>(null);
  const [expandedConcept, setExpandedConcept] = useState<number|null>(null);
  const [refineTexts, setRefineTexts] = useState<Record<number,string>>({});
  const [refineTargetScene, setRefineTargetScene] = useState<Record<number,string>>({});
  const [copiedConcept, setCopiedConcept] = useState<number|null>(null);
  const [refining, setRefining] = useState<Record<number,boolean>>({});
  const [refineErr, setRefineErr] = useState<Record<number,string>>({});
  const [renderingScene, setRenderingScene] = useState<Record<string,boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // Ref to prevent stale cloud data from overwriting fresh upload results
  const uploadCompletedRef = React.useRef(false);

  useEffect(()=>{
    const sanitizeLib = (entries: any[]): DNAEntry[] => entries.map(e => sanitizeDNA(e) as DNAEntry);

    // Load localStorage immediately (metadata only, no frames) then merge frames from IDB
    try {
      const local = localStorage.getItem("levelly_dna_library");
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized = sanitizeLib(parsed);
          // Merge frames from IDB async — filmstrip appears as soon as IDB resolves
          mergeFramesFromIDB(sanitized).then(withFrames => setLib(withFrames)).catch(() => setLib(sanitized));
        }
      }
    } catch {}

    fetch("/api/load-library")
      .then(r=>{ if(!r.ok) throw new Error(); return r.json(); })
      .then((data: DNAEntry[])=>{
      if(uploadCompletedRef.current) { setLibraryLoaded(true); return; }
      if(Array.isArray(data)&&data.length>0){
        try {
          const local=localStorage.getItem("levelly_dna_library");
          if(local){
            const localParsed: DNAEntry[] = JSON.parse(local);
            const localById=new Map(localParsed.map((e: DNAEntry)=>[e.id,e]));
            const localByCreativeId=new Map(
              localParsed.filter((e: DNAEntry)=>e.creative_id?.trim())
                .map((e: DNAEntry)=>[e.creative_id!.trim(),e])
            );
            const localByTitleFile=new Map(
              localParsed.map((e: DNAEntry)=>[`${e.title||""}__${e.file_name||""}`,e])
            );
            const cloudOnlyNew = data.filter((e: DNAEntry)=>{
              if(localById.has(e.id)) return false;
              if(e.creative_id?.trim() && localByCreativeId.has(e.creative_id.trim())) return false;
              const tfKey = `${e.title||""}__${e.file_name||""}`;
              if(tfKey !== "__" && localByTitleFile.has(tfKey)) return false;
              return true;
            });
            const merged = sanitizeLib([...localParsed, ...cloudOnlyNew]);
            mergeFramesFromIDB(merged).then(withFrames => setLib(withFrames)).catch(() => setLib(merged));
          } else {
            const sanitized = sanitizeLib(data);
            mergeFramesFromIDB(sanitized).then(withFrames => setLib(withFrames)).catch(() => setLib(sanitized));
          }
        } catch {
          const sanitized = sanitizeLib(data);
          mergeFramesFromIDB(sanitized).then(withFrames => setLib(withFrames)).catch(() => setLib(sanitized));
        }
      } else {
        try {
          const l=localStorage.getItem("levelly_dna_library");
          if(l){
            const sanitized = sanitizeLib(JSON.parse(l));
            mergeFramesFromIDB(sanitized).then(withFrames => setLib(withFrames)).catch(() => setLib(sanitized));
          }
        } catch {}
      }
      setLibraryLoaded(true); })
      .catch(()=>{ try { const l=localStorage.getItem("levelly_dna_library"); if(l) setLib(sanitizeLib(JSON.parse(l))); } catch {} setLibraryLoaded(true); });
  },[]);

  const saveLib = useCallback((updated: DNAEntry[])=>{
    setLib(updated);
    // Save metadata to localStorage (tiny — no image_data) and frames to IndexedDB (no size limit)
    try {
      const withoutFrames = updated.map(e => ({
        ...e,
        auto_frames: e.auto_frames?.map((f: FrameExtraction) => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance }))
      }));
      localStorage.setItem("levelly_dna_library", JSON.stringify(withoutFrames));
    } catch {}
    saveFramesToIDB(updated); // async, no-wait — IndexedDB has no size limit
    if(libraryLoaded){
      setCloudStatus("saving");
      const stripped = updated.map(e => ({
        ...e,
        auto_frames: e.auto_frames?.map((f: FrameExtraction) => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance }))
      }));
      fetch("/api/save-library",{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(stripped) })
        .then(r=>{ if(!r.ok) throw new Error(); setCloudStatus("saved"); setTimeout(()=>setCloudStatus("idle"),2000); })
        .catch(()=>{ setCloudStatus("error"); setTimeout(()=>setCloudStatus("idle"),3000); });
    }
  },[libraryLoaded]);

  const exportLibrary=()=>{ const blob=new Blob([JSON.stringify(lib,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`levelly-dna-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); };
  const importLibrary=(e: React.ChangeEvent<HTMLInputElement>)=>{ const file=e.target.files?.[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try { const p=JSON.parse(reader.result as string); if(!Array.isArray(p)) throw new Error(); const m=[...lib]; p.forEach((entry: DNAEntry)=>{ if(!m.find(x=>x.id===entry.id)) m.push(sanitizeDNA(entry) as DNAEntry); }); saveLib(m); } catch { alert("Import failed."); } }; reader.readAsText(file); e.target.value=""; };

  const reanalyzeSingle=async(entry: DNAEntry): Promise<DNAEntry>=>{
    // Build frame image parts from stored auto_frames (IndexedDB)
    const framesWithImages = (entry.auto_frames||[]).filter(f => f.image_data);
    const duration = Math.max(...(entry.auto_frames||[]).map(f=>f.timestamp_seconds), 30);
    const hasRefsAvailable = MOC_REFERENCES.some(r=>!r.base64.startsWith("REPLACE_"));

    if (framesWithImages.length > 0) {
      // Full re-analysis with stored frame images
      const frameParts = framesWithImages.flatMap(f => [
        {text: `[FRAME at ${f.timestamp_seconds}s]`},
        {inlineData: {mimeType: "image/jpeg", data: f.image_data!}}
      ]);
      const cfg = {tier: entry.tier, ad_type: entry.ad_type, context: entry.upload_context||"", manual_frames: [] as File[]};
      const rawDna = await callGeminiDirect(
        analyzeSystem(lib, cfg, entry.auto_frames||[], duration, true, hasRefsAvailable),
        [...frameParts, {text: "INSTRUCTION: Analyze only the extracted frame images above. DO NOT infer events between frames. Base every finding on visible frame evidence only."}]
      );
      const consistentDna = await enforceConsistency(rawDna, frameParts, entry.upload_context||"");
      const dna = sanitizeDNA(consistentDna);
      return {...entry,...dna, id:entry.id, reanalyzed:true, added_at:entry.added_at, file_name:entry.file_name, tier:entry.tier, ad_type:entry.ad_type, auto_frames:entry.auto_frames};
    } else {
      // Fallback: text-only re-analysis if no frame images stored
      const stripped = { ...entry, auto_frames: entry.auto_frames?.map(f => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance })) };
      const corrected = sanitizeDNA(await callGeminiDirect(reanalysisSystem(stripped),[{text:`Re-analyze: ${entry.title}`}]));
      return {...entry,...corrected, id:entry.id, reanalyzed:true, added_at:entry.added_at, file_name:entry.file_name, tier:entry.tier, ad_type:entry.ad_type, auto_frames:entry.auto_frames};
    }
  };
  const handleReanalyzeSingle=async(entry: DNAEntry)=>{
    setReanalyzingIds(p=>new Set(p).add(entry.id));
    setReanalyzingEntry(entry.id);
    try { const u=await reanalyzeSingle(entry); saveLib(lib.map(x=>x.id===entry.id?u:x)); }
    catch(err: any){ alert(`Re-analysis failed: ${err.message}`); }
    finally { setReanalyzingIds(p=>{ const s=new Set(p); s.delete(entry.id); return s; }); setReanalyzingEntry(null); }
  };

  // Re-upload: keep existing metadata (tier/spend/creative_id/parent_id), re-run full analysis pipeline on new video

// Quick consistency check — fixes contradictions between evolution chain and frame descriptions
async function enforceConsistency(dna: any, frameParts: any[], uploadContext?: string): Promise<any> {
  if (!dna || !Array.isArray(dna.unit_evolution_chain) || dna.unit_evolution_chain.length < 2) return dna;
  if (!Array.isArray(dna.auto_frames) || dna.auto_frames.length === 0) return dna;

  // If giant survival is locked in context, remove any erroneously added giant_kills
  if (uploadContext) {
    const facts = parseContextFacts(uploadContext);
    if (facts.giantSurvives === true && Array.isArray(dna.giant_kills) && dna.giant_kills.length > 0) {
      // Context says ALL giants survive — wipe giant_kills and fix any boss_death frame descriptions
      const fixedFrames = (dna.auto_frames as any[]).map((f: any) => {
        if (f.significance === "boss_death") {
          return { ...f, significance: "boss_damage", description: f.description.replace(/GIANT KILL:/gi, "GIANT HP CRITICAL:").replace(/\(HP:0\)/g, "(HP: very low)") };
        }
        return f;
      });
      dna = { ...dna, giant_kills: [], auto_frames: fixedFrames };
    } else if (Array.isArray(facts.giantSurvives) && Array.isArray(dna.giant_kills)) {
      // Final giant survives — only one kill allowed max (the first one)
      if (dna.giant_kills.length > 1) {
        // Keep only the first kill, remove subsequent ones and fix frames
        const firstKillTs = dna.giant_kills[0]?.timestamp_seconds;
        const fixedFrames = (dna.auto_frames as any[]).map((f: any) => {
          if (f.significance === "boss_death" && f.timestamp_seconds !== firstKillTs) {
            return { ...f, significance: "boss_damage", description: f.description.replace(/GIANT KILL:/gi, "GIANT HP LOW:") };
          }
          return f;
        });
        dna = { ...dna, giant_kills: [dna.giant_kills[0]], auto_frames: fixedFrames };
      }
    }
    if (facts.giantKillCount != null && Array.isArray(dna.giant_kills) && dna.giant_kills.length > facts.giantKillCount) {
      // Trim giant_kills to the locked count
      dna = { ...dna, giant_kills: dna.giant_kills.slice(0, facts.giantKillCount) };
    }
  }

  // Check if any frame descriptions contradict the evolution chain
  const chain = dna.unit_evolution_chain as string[];
  const validTiers = new Set(chain.map((t: string) => t.toLowerCase()));
  const allTiers = ["simple cannon","double cannon","triple cannon","tank","golden jet"];
  const invalidTiers = allTiers.filter(t => !validTiers.has(t));

  // Find frames with contradicting tier names
  const contradictions = (dna.auto_frames as any[]).filter((f: any) => {
    const desc = (f.description || "").toLowerCase();
    return invalidTiers.some(t => desc.includes(t));
  });

  if (contradictions.length === 0) return dna; // no contradictions, skip extra call

  try {
    const prompt = `You are correcting cannon tier name errors in frame descriptions.

CORRECT unit_evolution_chain: ${JSON.stringify(chain)}
This means ONLY these cannon tiers exist: ${chain.join(" → ")}

FRAME DESCRIPTIONS TO FIX (${contradictions.length} have wrong cannon tier names):
${contradictions.map((f: any) => `[${f.timestamp_seconds}s]: ${f.description}`).join("\n")}

For each description above:
- Replace any cannon tier name that is NOT in the evolution chain with the correct tier for that point in the video
- If description says "upgrades to Tank" but Tank is not in the chain, use the last tier in the chain instead
- Keep all other description text identical
- Return ONLY a JSON array: [{"timestamp_seconds": number, "description": "corrected text"}]`;

    const corrected = await callGeminiDirect(prompt, [{text: "Fix the descriptions."}]);
    if (!Array.isArray(corrected)) return dna;

    // Apply corrections back to auto_frames
    const corrections = new Map(corrected.map((c: any) => [c.timestamp_seconds, c.description]));
    const fixedFrames = (dna.auto_frames as any[]).map((f: any) =>
      corrections.has(f.timestamp_seconds) ? {...f, description: corrections.get(f.timestamp_seconds)} : f
    );
    return {...dna, auto_frames: fixedFrames};
  } catch {
    return dna; // if consistency check fails, return original — never block analysis
  }
}

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
      try {
        const facts=parseContextFacts(newContext||entry.upload_context||"");
        const chainHint = facts.chain ? `CONTEXT: Starting cannon is "${facts.chain[0]}" — DO NOT identify it as a different tier from visual appearance. Chain: ${facts.chain.join(" → ")}.\n` : "";
        const giantKillHint = facts.giantKillSeconds != null ? `CONTEXT: Giant is killed at approximately ${facts.giantKillSeconds}s.\n` : "";
        const upgradeHint = facts.upgradeSeconds != null ? `CONTEXT: Cannon upgrade happens at approximately ${facts.upgradeSeconds}s.\n` : "";
        const fr=await callGeminiDirect(frameExtractionSystem(entry.ad_type),[{text:`${chainHint}${giantKillHint}${upgradeHint}Extract 20-24 key frames — prioritise every second with a visible change, fill gaps between events:`},videoPart]);
        autoFrames=Array.isArray(fr?.frames)?fr.frames:[]; duration=typeof fr?.duration_seconds==="number"?fr.duration_seconds:30;
      } catch(frameErr: any){ console.warn("Frame extraction failed:",frameErr?.message); }
      let extractedFrameParts: any[]=[];
      try {
        const baseTs=autoFrames.map(f=>f.timestamp_seconds).filter(t=>typeof t==="number").sort((a,b)=>a-b);
        // Fill gaps > 2s with uniform frames so no significant moment is missed
        const filledTs=new Set(baseTs.map(t=>Math.round(t)));
        for(let s=0;s<duration-1;s+=2){
          const nearbyFrame=baseTs.some(t=>Math.abs(t-s)<1.5);
          if(!nearbyFrame&&filledTs.size<25) filledTs.add(s);
        }
        const allTimestamps=Array.from(filledTs).sort((a,b)=>a-b);
        // Extend autoFrames to include gap-fill entries (description will be populated by analysis)
        const autoFrameMap=new Map(autoFrames.map(f=>[Math.round(f.timestamp_seconds),f]));
        autoFrames=allTimestamps.map(t=>autoFrameMap.get(t)??{timestamp_seconds:t,description:"",significance:"filler" as const});
        const timestamps=allTimestamps;
        if(timestamps.length>0){ setAnalyzeStep("extracting"); extractedFrameParts=await extractFramesFromVideo(file,timestamps,duration); }
      } catch(canvasErr: any){ console.warn("Canvas extraction failed:",canvasErr?.message); }
      setAnalyzeStep("hook");
      let hookData: any={};
      try {
        const hookFrameParts = extractedFrameParts.length > 0
          ? [{text:`Extracted frames below. Timestamps: ${autoFrames.map(f=>f.timestamp_seconds).join(",")}s. Context:${newContext||entry.upload_context||""}. Find the hook:`},...extractedFrameParts]
          : [{text:`Frames:${JSON.stringify(autoFrames)}.Context:${newContext||entry.upload_context||""}.Find hook:`}];
        hookData=await callGeminiDirect(hookDetectionSystem(),hookFrameParts);
      } catch {}
      const manualParts: any[]=[];
      if(manualFrameFiles&&manualFrameFiles.length>0){ for(const mf of manualFrameFiles){ manualParts.push({text:`Manual:${mf.name}`}); manualParts.push({inlineData:{mimeType:mf.type,data:await fileToBase64(mf)}}); } }
      setAnalyzeStep("analyzing");
      const hasRefsAvailable=MOC_REFERENCES.some(r=>!r.base64.startsWith("REPLACE_"));
      const frameParts=Array.isArray(extractedFrameParts)&&extractedFrameParts.length>0?[{text:"### EXTRACTED FRAMES:"},...extractedFrameParts]:[];
      const hasManual=manualParts.length>0;
      const cfg={tier:entry.tier,ad_type:entry.ad_type,context:newContext||entry.upload_context||"",manual_frames:[]};
      const rawDna=await callGeminiDirect(analyzeSystem(lib,cfg,autoFrames,duration,frameParts.length>0,hasRefsAvailable),[...frameParts,...(hasManual?[{text:"### MANUAL FRAMES:"},...manualParts]:[]),{text:`HOOK DATA:${JSON.stringify(hookData)}`},{text:"INSTRUCTION: Analyze only the extracted frame images above. DO NOT infer events between frames. Base every finding on visible frame evidence only."}]);
      setAnalyzeStep("validating");
      const consistentDna = await enforceConsistency(rawDna, frameParts, newContext||entry.upload_context||"");
      const dna=sanitizeDNA(consistentDna);
      setAnalyzeStep("saving");
      const frameImageMap: Record<number,string>={};
      for(let pi=0;pi<extractedFrameParts.length-1;pi+=2){ const label=extractedFrameParts[pi]?.text??""; const match=label.match(/\[FRAME at ([\d.]+)s\]/); const imgData=extractedFrameParts[pi+1]?.inlineData?.data; if(match&&imgData){ const ts=parseFloat(match[1]); frameImageMap[ts]=imgData; frameImageMap[Math.round(ts)]=imgData; } }
      const autoFramesWithImages: FrameExtraction[]=Array.isArray(autoFrames)?autoFrames.map(f=>frameImageMap[f.timestamp_seconds]??frameImageMap[Math.round(f.timestamp_seconds)]?{...f,image_data:frameImageMap[f.timestamp_seconds]??frameImageMap[Math.round(f.timestamp_seconds)]}:f):[];
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
      uploadCompletedRef.current = true;
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
        try {
          const uploadFacts=parseContextFacts(cfg.context||"");
          const uploadChainHint = uploadFacts.chain ? `CONTEXT: Starting cannon is "${uploadFacts.chain[0]}" — do NOT name it differently based on visual appearance. Chain: ${uploadFacts.chain.join(" → ")}.\n` : "";
          const uploadGiantHint = uploadFacts.giantKillSeconds != null ? `CONTEXT: Giant is killed at approximately ${uploadFacts.giantKillSeconds}s.\n` : "";
          const uploadUpgradeHint = uploadFacts.upgradeSeconds != null ? `CONTEXT: Cannon upgrade happens at approximately ${uploadFacts.upgradeSeconds}s.\n` : "";
          const fr=await callGeminiDirect(frameExtractionSystem(cfg.ad_type),[{text:`${uploadChainHint}${uploadGiantHint}${uploadUpgradeHint}Extract 20-24 key frames:`},videoPart]);
          autoFrames=Array.isArray(fr?.frames)?fr.frames:[]; duration=typeof fr?.duration_seconds==="number"?fr.duration_seconds:30;
        } catch(frameErr: any){ console.warn("Frame extraction failed:",frameErr?.message); }

        // Extract actual frame images at Gemini's chosen timestamps (non-blocking fallback)
        let extractedFrameParts: any[] = [];
        try {
          const baseTs2=autoFrames.map(f=>f.timestamp_seconds).filter(t=>typeof t==="number").sort((a,b)=>a-b);
          const filledTs2=new Set(baseTs2.map(t=>Math.round(t)));
          for(let s=0;s<duration-1;s+=2){
            const nearbyFrame=baseTs2.some(t=>Math.abs(t-s)<1.5);
            if(!nearbyFrame&&filledTs2.size<25) filledTs2.add(s);
          }
          const allTimestamps2=Array.from(filledTs2).sort((a,b)=>a-b);
          const autoFrameMap2=new Map(autoFrames.map(f=>[Math.round(f.timestamp_seconds),f]));
          autoFrames=allTimestamps2.map(t=>autoFrameMap2.get(t)??{timestamp_seconds:t,description:"",significance:"filler" as const});
          const timestamps=allTimestamps2;
          if (timestamps.length > 0) {
            setAnalyzeStep("extracting");
            extractedFrameParts = await extractFramesFromVideo(file, timestamps, duration);
          }
        } catch(canvasErr: any) { console.warn("Canvas extraction failed:",canvasErr?.message); }

        setAnalyzeStep("hook");
        let hookData: any={};
        try {
          const hookFrameParts = extractedFrameParts.length > 0
            ? [{text:`Extracted frames below. Timestamps: ${autoFrames.map(f=>f.timestamp_seconds).join(",")}s. Context:${cfg.context}. Find the hook:`},...extractedFrameParts]
            : [{text:`Frames:${JSON.stringify(autoFrames)}.Context:${cfg.context}.Find hook:`}];
          hookData=await callGeminiDirect(hookDetectionSystem(),hookFrameParts);
        } catch {}
        const manualParts: any[]=[];
        if(cfg.manual_frames.length>0){ for(const mf of cfg.manual_frames){ manualParts.push({text:`Manual:${mf.name}`}); manualParts.push({inlineData:{mimeType:mf.type,data:await fileToBase64(mf)}}); } }
        setAnalyzeStep("analyzing");
        const hasRefsAvailable=MOC_REFERENCES.some(r=>!r.base64.startsWith("REPLACE_"));
        const frameParts = Array.isArray(extractedFrameParts)&&extractedFrameParts.length > 0
          ? [{text:"### EXTRACTED FRAMES — key moments at exact timestamps:"},...extractedFrameParts]
          : [];
        const rawDna=await callGeminiDirect(analyzeSystem(lib,cfg,autoFrames,duration,frameParts.length>0,hasRefsAvailable),[...frameParts,...(manualParts.length>0?[{text:"### MANUAL FRAMES:"},...manualParts]:[]),{text:`HOOK DATA:${JSON.stringify(hookData)}`},{text:"INSTRUCTION: Analyze only the extracted frame images above. DO NOT infer events between frames. Base every finding on visible frame evidence only."}]);
        setAnalyzeStep("validating");
        const consistentDna = await enforceConsistency(rawDna, frameParts, cfg.context);
        const dna=sanitizeDNA(consistentDna);
        setAnalyzeStep("saving");
        // Build a lookup: timestamp → base64 image from extractedFrameParts
        // extractedFrameParts alternates: [{text:"[FRAME at Xs]"}, {inlineData:{...}}, ...]
        const frameImageMap: Record<number, string> = {};
        for (let pi = 0; pi < extractedFrameParts.length - 1; pi += 2) {
          const label = extractedFrameParts[pi]?.text ?? "";
          const match = label.match(/\[FRAME at ([\d.]+)s\]/);
          const imgData = extractedFrameParts[pi + 1]?.inlineData?.data;
          if (match && imgData){ const ts=parseFloat(match[1]); frameImageMap[ts]=imgData; frameImageMap[Math.round(ts)]=imgData; }
        }
        const autoFramesWithImages: FrameExtraction[] = autoFrames.map(f =>
          (frameImageMap[f.timestamp_seconds] ?? frameImageMap[Math.round(f.timestamp_seconds)])
            ? { ...f, image_data: frameImageMap[f.timestamp_seconds] ?? frameImageMap[Math.round(f.timestamp_seconds)] }
            : f
        );
        const newId = Date.now() + Math.random();
        saveLib([...lib,{...dna,id:newId,tier:cfg.tier,ad_type:cfg.ad_type,upload_context:cfg.context,file_name:file.name,added_at:new Date().toISOString(),creative_id:cfg.creative_id,parent_id:cfg.parent_id,auto_frames:autoFramesWithImages,manual_frames:cfg.manual_frames.map(f=>f.name)}]);
        uploadCompletedRef.current = true;
        setLastAnalyzedId(newId);
        setAnalyzeStep("");
      }
    } catch(err: any){ setAnalyzeErr(err.message); }
    finally { setAnalyzing(false); setUploadConfig(null); if(fileRef.current) fileRef.current.value=""; }
  },[lib,uploadConfig]);

  const handleGenerateBrief = async () => {
    if (!briefCtx.trim()) { setBriefErr("Enter a brief context first."); return; }
    if (lib.length === 0) { setBriefErr("Add at least one ad first."); return; }
    setGenerating(true); setBriefErr(""); setBriefProgress("Starting brief generation…"); setConcepts([]); setBriefAnalysis(null);
    try {
      const refNote = briefRef ? `User visual reference: "${briefRef.name}"` : undefined;
      const trimmedLib = lib
        .filter(d => d.tier === "winner" && d.ad_type !== "competitor" && d.creative_status !== "fatigued")
        .map(d => ({
          id: d.creative_id||null,
          biome: d.biome,
          hook_type: d.hook_type,
          hook_timing_seconds: d.hook_timing_seconds,
          unit_evolution_chain: d.unit_evolution_chain,
          gate_sequence: d.gate_sequence||[],
          key_mechanic: d.key_mechanic,
          why_it_works: d.why_it_works||null,
          loss_event_type: d.loss_event_type,
          spend_tier: d.spend_tier||null,
          spend_networks: d.spend_networks||[],
          cannon_count_log: d.cannon_count_log||null,
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
      setBriefProgress("Generating concept 1 of 4…");
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

          // Update progress indicator
          const failCount = Array.isArray(job.failures) ? job.failures.length : 0;
          const done = lastConceptCount;
          const next = done + failCount + 1;
          if (job.status === "partial" && next <= 4) {
            setBriefProgress(`✓ ${done} concept${done>1?"s":""} ready — generating ${next} of 4…`);
          } else if (job.status === "partial") {
            setBriefProgress(`✓ ${done} concept${done>1?"s":""} ready — finishing up…`);
          }
        }

        if (job.status === "done") {
          const failCount = Array.isArray(job.failures) ? job.failures.length : 0;
          if (failCount > 0) {
            setBriefProgress(`✓ ${lastConceptCount} concept${lastConceptCount>1?"s":""} generated (${failCount} failed)`);
          } else {
            setBriefProgress(`✓ All ${lastConceptCount} concepts generated`);
          }
          return;
        }
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

    const formatBriefAsMarkdown = (c: Concept, ci: number): string => {
      const vi = c.visual_identity || {};
      const chain = (c.unit_evolution_chain||[]).join(" → ");
      const lines: string[] = [];
      lines.push(`# ${c.title||"Brief"}`);
      lines.push(`**Concept ${ci+1}** · ${(c as any).target_segment||"Whale + Dolphin"}`);
      if(c.objective) lines.push(`\n${c.objective}`);
      lines.push("\n---");
      if((c as any).analysis?.strategy) { lines.push("\n## Strategy"); lines.push((c as any).analysis.strategy); }
      lines.push("\n## Hook");
      lines.push(`**${(c as any).hook_type||"Challenge"}** at ${(c as any).hook_timing_seconds??0}s — ${c.hook_description||""}`);
      if(c.hook_a_description) lines.push(`**Hook A (Gameplay Boss):** ${c.hook_a_description}`);
      if(c.hook_b_description) lines.push(`**Hook B (Comedy/Narrative):** ${c.hook_b_description}`);
      if(c.hook_c_description) lines.push(`**Hook C (Stopwatch/Viral):** ${c.hook_c_description}`);
      if(chain) { lines.push("\n## Unit evolution"); lines.push(chain); }
      if(vi.environment) { lines.push("\n## Visual identity"); lines.push(`- Biome: ${vi.environment}`); if(vi.lighting) lines.push(`- Lighting: ${vi.lighting}`); if(vi.mood_notes) lines.push(`- Mood: ${vi.mood_notes}`); }
      if(c.lane_design) { lines.push("\n## Lane design"); lines.push(c.lane_design); }
      if((c.upgrade_triggers||[]).length) { lines.push("\n## Upgrade triggers"); (c.upgrade_triggers||[]).forEach((t:string)=>lines.push(`- ${t}`)); }
      if((c.tension_moments||[]).length) { lines.push("\n## Tension moments"); (c.tension_moments||[]).forEach((t:string)=>lines.push(`- ${t}`)); }
      if(c.engagement_hooks) { lines.push("\n## Engagement hooks"); lines.push(c.engagement_hooks); }
      if(Array.isArray(c.production_script)&&c.production_script.length) {
        lines.push("\n## Production script");
        c.production_script.forEach((s:any)=>{ lines.push(`\n**${s.time||""}** ${s.action||""}`); if(s.visual_cue) lines.push(`*Visual: ${s.visual_cue}*`); if(s.audio_cue) lines.push(`Audio: ${s.audio_cue}`); });
      }
      if(c.network_adaptations) {
        lines.push("\n## Network adaptations");
        (["AppLovin","Facebook","Google","TikTok"] as const).forEach(n=>{ if(c.network_adaptations?.[n]) lines.push(`**${n}:** ${c.network_adaptations[n]}`); });
      }
      lines.push("\n---\n*Generated by Levelly — MOC Creative Intelligence*");
      return lines.join("\n");
    };

    const formatBriefAsHTML = (c: Concept, ci: number): string => {
    const vi = c.visual_identity || {};
    const chain = (c.unit_evolution_chain||[]).join(" → ");
    const seg = (c as any).target_segment||"Whale + Dolphin";

    const section = (title: string, body: string) =>
      `<div style="margin:0 0 18px"><div style="font-size:10px;font-weight:700;color:#666666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">${title}</div><div style="font-size:13px;color:#111111;line-height:1.6">${body}</div></div>`;

    const pill = (t: string) => `<span style="display:inline-block;font-size:10px;padding:2px 8px;border-radius:4px;background:#eff6ff;color:#1a56db;border:0.5px solid #93c5fd;margin:2px 2px 2px 0">${t}</span>`;

    const renders = (["start","middle","end","hook"] as const)
      .map(scene => {
        const img = (scene==="scene"?(c.visual_scene||c.visual_start):c[`visual_${scene}` as keyof Concept]) as string|undefined;
        return img
          ? `<div style="text-align:center"><div style="font-size:9px;color:#8b949e;margin-bottom:4px;text-transform:uppercase">${scene}</div><img src="${img}" style="width:100%;border-radius:6px;display:block"/></div>`
          : `<div style="aspect-ratio:9/16;background:#161b22;border-radius:6px;display:flex;align-items:center;justify-content:center"><span style="font-size:10px;color:#484f58">${scene}</span></div>`;
      });

    const scriptRows = Array.isArray(c.production_script) ? c.production_script.map((s:any,i:number) =>
      `<tr style="background:${i%2===0?"#ffffff":"#f9f9f9"}"><td style="padding:6px 10px;color:#1a56db;white-space:nowrap;vertical-align:top;font-size:11px;font-weight:500">${s.time||""}</td><td style="padding:6px 10px;font-size:11px;color:#111111">${s.action||""}</td><td style="padding:6px 10px;font-size:11px;color:#444444;font-style:italic">${s.visual_cue||""}</td><td style="padding:6px 10px;font-size:11px;color:#666666">${s.audio_cue||""}</td></tr>`
    ).join("") : "";

    const netAdapt = c.network_adaptations ? (["AppLovin","Facebook","Google","TikTok"] as const)
      .filter(n => c.network_adaptations?.[n])
      .map(n => `<div style="margin-bottom:6px"><span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;background:#eff6ff;color:#1a56db;margin-right:6px">${n}</span><span style="font-size:12px;color:#444444">${c.network_adaptations![n]}</span></div>`)
      .join("") : "";

    return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#ffffff;color:#111111;padding:24px;max-width:900px;margin:0 auto">
<div style="border-bottom:1px solid #e0e0e0;padding-bottom:16px;margin-bottom:24px">
  <div style="font-size:11px;color:#666666;margin-bottom:4px">LEVELLY CREATIVE BRIEF · CONCEPT ${ci+1} · ${seg}</div>
  <div style="font-size:22px;font-weight:700;color:#111111;margin-bottom:6px">${c.title||""}</div>
  <div style="font-size:13px;color:#444444">${c.objective||""}</div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
<div>
${(c as any).analysis?.strategy ? section("Strategy", (c as any).analysis.strategy) : ""}
${section("Hook", `<strong style="color:#58a6ff">${(c as any).hook_type||"Challenge"} at ${(c as any).hook_timing_seconds??0}s</strong><br/>${c.hook_description||""}`)}
${c.hook_a_description ? section("Hook A — Gameplay Boss", c.hook_a_description) : ""}
${c.hook_b_description ? section("Hook B — Comedy/Narrative", c.hook_b_description) : ""}
${c.hook_c_description ? section("Hook C — Stopwatch/Viral", c.hook_c_description + "<br/><em style='color:#666;font-size:10px'>Market data slot — will be enriched when market research feature launches</em>") : ""}
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

${scriptRows ? `<div style="margin-top:8px"><div style="font-size:10px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Production script</div><table style="width:100%;border-collapse:collapse;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden"><thead><tr style="background:#f5f5f5"><th style="padding:6px 10px;text-align:left;font-size:9px;color:#666666;font-weight:600;text-transform:uppercase">Time</th><th style="padding:6px 10px;text-align:left;font-size:9px;color:#666666;font-weight:600;text-transform:uppercase">Action</th><th style="padding:6px 10px;text-align:left;font-size:9px;color:#666666;font-weight:600;text-transform:uppercase">Visual cue</th><th style="padding:6px 10px;text-align:left;font-size:9px;color:#666666;font-weight:600;text-transform:uppercase">Audio cue</th></tr></thead><tbody>${scriptRows}</tbody></table></div>` : ""}

<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:10px;color:#888888">Generated by Levelly — MOC Creative Intelligence</div>
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
      const subFieldHints: string[] = [];
      if (wantsVisual || (!wantsEvolution && !wantsHook && !wantsLane && !wantsTension)) {
        (fieldsToSend as any).visual_identity = current.visual_identity;
        fieldNames.push("visual_identity");
        // Detect exactly which sub-field of visual_identity to change
        if (/biome|environment|forest|desert|snow|bunker|volcano|cyber|meadow|toxic/.test(lp)) subFieldHints.push("environment", "biome_visual_notes");
        if (/lighting|light|shadow|glow|bright|dark/.test(lp)) subFieldHints.push("lighting");
        if (/player mob|blue mob|mob color/.test(lp)) subFieldHints.push("player_mob_color");
        if (/enemy mob|red mob/.test(lp)) subFieldHints.push("enemy_mob_color");
        if (/mood|atmosphere|vibe/.test(lp)) subFieldHints.push("mood_notes");
        if (/gate value|gate number|x gate|plus gate/.test(lp)) subFieldHints.push("gate_values");
        if (subFieldHints.length === 0) subFieldHints.push("environment"); // default: just environment
        (fieldsToSend as any).biome_visual_notes = current.biome_visual_notes;
        fieldNames.push("biome_visual_notes");
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
        refinementSystem(fieldsToSend, prompt, fieldNames, subFieldHints),
        [{ text: "Return only the modified fields as JSON." }]
      );

      // Merge ONLY the fields that were sent — never touch what wasn't in fieldsToSend
      const merged: Concept = { ...current };
      for (const key of fieldNames) { if (key in result) (merged as any)[key] = (result as any)[key]; }

      // Never clear renders here — the Refine button handles re-rendering the selected scene only
      const updated: Concept = merged;

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

    const handleRenderScene=async(ci: number,scene: "scene"|"hook_a"|"hook_b"|"hook_c", refinePrompt?: string)=>{
    const k=`${ci}-${scene}`; setRenderingScene(p=>({...p,[k]:true}));
    // Clear any previous error for this slot only
    setConcepts(p=>p.map((c,i)=>i===ci?{...c,[`render_err_${scene}`]:undefined}:c));
    try {
      const concept=concepts[ci]; const vi=concept.visual_identity;
      const chain: string[] = concept.unit_evolution_chain || [];
      const unitAtScene = {
        scene: chain[0] || "Simple Cannon",
        hook_a: chain[0] || "Simple Cannon",
        hook_b: chain[0] || "Simple Cannon",
        hook_c: chain[0] || "Simple Cannon",
      }[scene] || chain[0] || "Simple Cannon";

      // Check if this scene already has a rendered image AND we have a refine prompt — use direct image editing
      const existingImgKey = scene === "scene" ? "visual_scene" : `visual_${scene}`;
      const existingImg = (concept as any)[existingImgKey] as string | undefined;

      if (existingImg && refinePrompt) {
        // ── DIRECT IMAGE EDIT MODE (Nano Banana style) ──────────────────────
        // User's exact instruction + source image only. No brief fields, no extra context.
        // This is what makes Nano Banana work: clean image + clean instruction.
        const { mimeType, data } = parseDataURI(existingImg);
        const editBody = JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType, data } },
              { text: `EDIT THIS IMAGE: ${refinePrompt}\n\nKeep everything else identical — same composition, camera angle, art style, road layout, and all unchanged elements. Output 9:16.` },
            ]
          }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "9:16" } }
        });
        let url: string | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const r = await fetch(GEMINI_IMAGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: editBody });
          const text = await r.text();
          if (!r.ok) { if (attempt === 0 && (r.status === 503 || r.status === 429)) { await new Promise(res => setTimeout(res, 3000)); continue; } throw new Error(`Image edit ${r.status}: ${text.slice(0, 500)}`); }
          const result = JSON.parse(text);
          const imgPart = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
          if (!imgPart) { if (attempt === 0) { await new Promise(res => setTimeout(res, 2000)); continue; } throw new Error("No image returned from edit"); }
          url = `data:${imgPart.inlineData.mimeType || "image/png"};base64,${imgPart.inlineData.data}`;
          break;
        }
        if (!url) throw new Error("Image edit failed after 2 attempts");
        setConcepts(p=>p.map((c,i)=>i===ci?{...c,[existingImgKey]:url}:c));
        return;
      }

      if (existingImg && !refinePrompt) {
        // ── FRESH RE-RENDER (no refine prompt — user clicked ↺ Re-render) ──
        // Fall through to fresh render mode below — regenerate from brief
      }

      // ── FRESH RENDER MODE ───────────────────────────────────────────────────
      const refParts=pickRelevantRefs(vi, unitAtScene, lib, scene==="scene"?"start":"hook");
      const prevParts: any[]=[];

      const sceneRef = concept.visual_scene || concept.visual_start || null;
      if(scene !== "scene" && sceneRef){
        // Hook renders use the scene render as style anchor for visual consistency
        prevParts.push({text:"### LANE SCENE — match art style, cannon type, mob color, environment, biome EXACTLY. This is the visual reference for consistency:"});
        prevParts.push({inlineData:{mimeType:parseDataURI(sceneRef).mimeType,data:parseDataURI(sceneRef).data}});
      }

      const continuityNote = undefined;

      const url=await callImageDirect(imagePromptFn(concept,scene,continuityNote),[...refParts,...prevParts]);
      setConcepts(p=>p.map((c,i)=>i===ci?{...c,[scene==="scene"?"visual_scene":`visual_${scene}`]:url}:c));
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
            <div onClick={e=>{e.stopPropagation();setZoomedFrameIndex(i=>{const p=Math.max(i-1,0);setZoomedFrame(zoomedFrameList[p]);return p;})}} style={{ position:"absolute",left:20,top:"50%",transform:"translateY(-50%)",fontSize:36,color:"#fff",cursor:"pointer",background:"rgba(0,0,0,0.5)",borderRadius:"50%",width:52,height:52,display:"flex",alignItems:"center",justifyContent:"center",userSelect:"none",zIndex:2001,border:"1.5px solid rgba(255,255,255,0.3)",transition:"background .15s" }} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="rgba(255,255,255,0.2)"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="rgba(0,0,0,0.5)"}>‹</div>
          )}
          <img src={zoomedFrame} alt="frame" style={{ maxHeight:"90vh",maxWidth:"calc(100vw - 120px)",borderRadius:10,boxShadow:"0 0 60px rgba(0,0,0,0.8)",objectFit:"contain" }} onClick={e=>e.stopPropagation()} />
          {zoomedFrameList.length>1&&zoomedFrameIndex<zoomedFrameList.length-1&&(
            <div onClick={e=>{e.stopPropagation();setZoomedFrameIndex(i=>{const n=Math.min(i+1,zoomedFrameList.length-1);setZoomedFrame(zoomedFrameList[n]);return n;})}} style={{ position:"absolute",right:20,top:"50%",transform:"translateY(-50%)",fontSize:36,color:"#fff",cursor:"pointer",background:"rgba(0,0,0,0.5)",borderRadius:"50%",width:52,height:52,display:"flex",alignItems:"center",justifyContent:"center",userSelect:"none",zIndex:2001,border:"1.5px solid rgba(255,255,255,0.3)",transition:"background .15s" }} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background="rgba(255,255,255,0.2)"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background="rgba(0,0,0,0.5)"}>›</div>
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
                          <div key={fi} style={{ flexShrink: 0, position: "relative" as const, cursor: "zoom-in" }} onClick={() => { const imgs=entry.auto_frames!.filter(fr=>fr.image_data).map(fr=>`data:image/jpeg;base64,${fr.image_data}`); setZoomedFrameList(imgs); setZoomedFrameIndex(fi); setZoomedFrame(`data:image/jpeg;base64,${f.image_data}`); }}>
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
                      {/* Frame descriptions — collapsed by default */}
                      <FrameDescriptionToggle frames={entry.auto_frames} keyEvents={(entry as any).key_events} />
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

                  {/* Why it works */}
                  {entry.why_it_works && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={labelStyle}>Why it works</span>
                      <p style={{ margin: 0, fontSize: 11, color: D.textMuted, lineHeight: 1.6 }}>{entry.why_it_works}</p>
                    </div>
                  )}

                  {/* Competitor Intelligence — only for competitor ad_type */}
                  {entry.ad_type === "competitor" && (entry.core_fantasy || entry.moc_inspiration || (entry.transferable_elements && entry.transferable_elements.length > 0)) && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "0.5px dashed " + D.border, borderLeft: "2px solid " + D.purple, paddingLeft: 10 }}>
                      <div style={{ fontSize: 10, color: D.purple, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600, marginBottom: 8 }}>Competitor Intelligence</div>
                      {entry.core_fantasy && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={labelStyle}>Core fantasy</span>
                          <p style={{ margin: 0, fontSize: 11, color: D.text, lineHeight: 1.5, fontWeight: 500 }}>{entry.core_fantasy}</p>
                        </div>
                      )}
                      {entry.moc_inspiration && (
                        <div style={{ marginBottom: 8 }}>
                          <span style={labelStyle}>MOC inspiration</span>
                          <p style={{ margin: 0, fontSize: 11, color: D.textMuted, lineHeight: 1.6 }}>{entry.moc_inspiration}</p>
                        </div>
                      )}
                      {entry.transferable_elements && entry.transferable_elements.length > 0 && (
                        <div>
                          <span style={labelStyle}>Transferable elements</span>
                          <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11, color: D.textMuted, lineHeight: 1.6 }}>
                            {entry.transferable_elements.map((el, i) => (
                              <li key={i} style={{ marginBottom: 4 }}>{el}</li>
                            ))}
                          </ul>
                        </div>
                      )}
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
                {generating && briefProgress
                  ? <span style={{ fontSize:11,color:D.green,fontWeight:500,display:"flex",alignItems:"center",gap:6 }}>
                      <span style={{ width:10,height:10,borderRadius:"50%",border:"1.5px solid rgba(63,185,80,0.3)",borderTopColor:D.green,display:"inline-block",animation:"spin .6s linear infinite" }} />
                      {briefProgress}
                    </span>
                  : !generating && briefProgress
                  ? <span style={{ fontSize:11,color:briefProgress.includes("failed")?D.gold:D.green,fontWeight:500 }}>{briefProgress}</span>
                  : <span style={{ fontSize:11,color:D.textDim }}>Generating for <strong style={{ color:D.text }}>Whale</strong> + <strong style={{ color:D.text }}>Dolphin</strong></span>
                }
                <button onClick={generating ? undefined : handleGenerateBrief} style={{ ...btnPri,display:"flex",alignItems:"center",gap:6,background:generating?"#1a7f37":D.blueDark,border:generating?`1px solid ${D.greenBdr}`:"none",transition:"background .3s",cursor:generating?"default":"pointer" }}>
                  {generating?"Generating…":"Generate concepts ↗"}
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
                  <div style={{ display:"flex",gap:4,marginTop:2 }}>
                    <div onClick={async e=>{ e.stopPropagation();
                      try {
                        const html = formatBriefAsHTML(c,ci);
                        await navigator.clipboard.write([new ClipboardItem({
                          "text/html": new Blob([html],{type:"text/html"}),
                          "text/plain": new Blob([c.title+(c.objective?"\n"+c.objective:"")],{type:"text/plain"})
                        })]);
                      } catch {
                        const lines=[c.title||"",c.objective||"",c.hook_description||"",c.lane_design||"",(c.unit_evolution_chain||[]).join(" → ")].filter(Boolean).join("\n");
                        await navigator.clipboard.writeText(lines);
                      }
                      setCopiedConcept(ci); setTimeout(()=>setCopiedConcept(null),2500);
                    }} style={{ fontSize:11,padding:"4px 10px",borderRadius:6,background:copiedConcept===ci?D.greenBg:D.blueBg,color:copiedConcept===ci?D.green:D.blue,border:`0.5px solid ${copiedConcept===ci?D.greenBdr:D.blueDark}`,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap" as const,transition:"background .2s,color .2s,border-color .2s" }}>{copiedConcept===ci?"✓ Copied!":"⎘ Copy"}</div>
                    <div onClick={async e=>{ e.stopPropagation();
                      const md = formatBriefAsMarkdown(c,ci);
                      await navigator.clipboard.writeText(md);
                      setCopiedConcept(-(ci+1)); setTimeout(()=>setCopiedConcept(null),2500);
                    }} style={{ fontSize:11,padding:"4px 10px",borderRadius:6,background:copiedConcept===-(ci+1)?D.greenBg:D.surface2,color:copiedConcept===-(ci+1)?D.green:D.textMuted,border:`0.5px solid ${copiedConcept===-(ci+1)?D.greenBdr:D.border2}`,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap" as const,transition:"background .2s,color .2s,border-color .2s" }} title="Plain text — works in Miro, stays under character limit">{copiedConcept===-(ci+1)?"✓ Copied!":"⎘ Miro"}</div>
                  </div>
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
                  {(c as any).nine_step_curve && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: D.textDim, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 6 }}>9-Step Curve</div>
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
                        {Object.entries((c as any).nine_step_curve).map(([beat, desc]: [string, any]) => (
                          <div key={beat} style={{ display: "flex", gap: 8, fontSize: 11, padding: "3px 0", borderBottom: `0.5px solid ${D.border}` }}>
                            <span style={{ fontWeight: 600, color: D.gold, minWidth: 90, flexShrink: 0 }}>{beat}</span>
                            <span style={{ color: D.text }}>{String(desc)}</span>
                          </div>
                        ))}
                      </div>
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
                    {!c.is_experimental&&PROVEN_BIOMES.includes(c.visual_identity?.environment)&&<div style={{ marginBottom:8,padding:"7px 12px",background:D.greenBg,border:`0.5px solid ${D.greenBdr}`,borderRadius:7,fontSize:11,color:D.green }}>Render Scene first — then Hook A, B, C in any order.</div>}
                    <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8 }}>
                      {(["scene","hook_a","hook_b","hook_c"] as const).map(scene=>{
                        const imgUrl=(scene==="scene"?(c.visual_scene||c.visual_start):c[`visual_${scene}` as keyof Concept]) as string|undefined;
                        const loading=renderingScene[`${ci}-${scene}`];
                        const isHook=scene!=="scene";
                        const hasSceneRef=!!(c.visual_scene||c.visual_start);
                        const needsPrev=isHook&&!hasSceneRef;
                        const isNext=!imgUrl&&!needsPrev&&(
                          (scene==="scene"&&!(c.visual_scene||c.visual_start))||
                          (scene==="hook_a"&&hasSceneRef&&!c.visual_hook_a)||
                          (scene==="hook_b"&&hasSceneRef&&!c.visual_hook_b)||
                          (scene==="hook_c"&&hasSceneRef&&!c.visual_hook_c)
                        );
                        const sceneColor={scene:D.blue,hook_a:D.red,hook_b:D.purple,hook_c:D.gold}[scene]||D.blue;
                        const borderColor=isNext?sceneColor:D.border;
                        const borderWidth=isNext?"1.5px":"0.5px";
                        const sceneLabel={scene:"SCENE",hook_a:"HOOK A",hook_b:"HOOK B",hook_c:"HOOK C"}[scene]||scene;
                        const sceneSubLabel={scene:"Top-down lane",hook_a:"Gameplay Boss",hook_b:"Comedy/Narrative",hook_c:"Stopwatch/Viral"}[scene]||"";
                        const lockedMsg="Render Scene first";
                        return (
                          <div key={scene} style={{ display:"flex",flexDirection:"column" as const,gap:3 }}>
                          <div style={{ aspectRatio:"9/16",background:D.surface2,borderRadius:10,border:`${borderWidth} solid ${borderColor}`,overflow:"hidden",display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",cursor:needsPrev?"not-allowed":imgUrl?"zoom-in":"pointer",position:"relative" as const,transition:"border-color .2s" }}
                            onClick={()=>{
                              if(imgUrl&&!(c as any)[`render_err_${scene}`]){const scenes=(["scene","hook_a","hook_b","hook_c"] as const).map(s=>c[s==="scene"?"visual_scene":`visual_${s}` as keyof Concept] as string|undefined).filter(Boolean) as string[];const idx=scenes.indexOf(imgUrl);setZoomedFrameList(scenes);setZoomedFrameIndex(Math.max(idx,0));setZoomedFrame(imgUrl);}
                              else if(!loading&&!needsPrev) handleRenderScene(ci,scene);
                            }}>
                            {isNext&&!imgUrl&&<div style={{ position:"absolute" as const,top:6,left:0,right:0,display:"flex",justifyContent:"center" }}>
                              <span style={{ fontSize:9,padding:"2px 7px",background:sceneColor,color:"#fff",borderRadius:20,fontWeight:600,letterSpacing:"0.05em" }}>{scene==="scene"?"START HERE":"RENDER NEXT"}</span>
                            </div>}
                            {imgUrl?(
                              <div style={{ position:"relative" as const,width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center" }}>
                                <img src={imgUrl} alt={scene}
                                  style={{ width:"100%",height:"100%",objectFit:"contain",background:"#0a0c10",display:"block",opacity:loading?0.4:1,transition:"opacity .2s",cursor:"zoom-in" }} />
                                {loading&&<div style={{ position:"absolute" as const,inset:0,display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",gap:8,background:"rgba(0,0,0,0.5)" }}>
                                  <div style={{ width:20,height:20,borderRadius:"50%",border:`2px solid ${sceneColor}44`,borderTopColor:sceneColor,animation:"spin .7s linear infinite" }} />
                                  <span style={{ fontSize:9,color:sceneColor,fontWeight:600 }}>Rendering…</span>
                                </div>}
                              </div>
                            )
                              :loading?<p style={{ margin:0,fontSize:11,fontWeight:500,color:D.textMuted }}>Rendering…</p>
                              :(c as any)[`render_err_${scene}`]?<div style={{ textAlign:"center" as const,padding:"8px 6px" }}><p style={{ margin:0,fontSize:9,color:D.red,fontWeight:600 }}>Failed</p><p style={{ margin:"4px 0 0",fontSize:8,color:D.textDim,wordBreak:"break-word" as const,lineHeight:1.4 }}>{((c as any)[`render_err_${scene}`] as string).slice(0,120)}</p></div>
                              :needsPrev?<div style={{ textAlign:"center" as const,padding:10 }}><p style={{ margin:0,fontSize:10,color:D.textDim,textTransform:"uppercase" as const }}>{sceneLabel}</p><p style={{ margin:"4px 0 0",fontSize:9,color:D.textDim }}>{lockedMsg}</p></div>
                              :<div style={{ textAlign:"center" as const,padding:10,marginTop:isNext?18:0 }}><p style={{ margin:0,fontSize:11,fontWeight:600,textTransform:"uppercase" as const,color:isNext?sceneColor:D.textDim,letterSpacing:"0.05em" }}>{sceneLabel}</p><p style={{ margin:"3px 0 0",fontSize:8,color:isNext?`${sceneColor}cc`:D.textDim,fontStyle:"italic" }}>{sceneSubLabel}</p><p style={{ margin:"6px 0 0",fontSize:9,color:isNext?sceneColor:D.textDim }}>{isNext?"Click to render":"Click to render"}</p></div>}
                          </div>
                          {/* Re-render button below each slot — only shown when image exists */}
                          {imgUrl&&!loading&&<button onClick={e=>{e.stopPropagation();handleRenderScene(ci,scene);}}
                            style={{ fontSize:9,padding:"3px 0",borderRadius:5,border:`0.5px solid ${D.border2}`,color:D.textDim,background:D.surface2,cursor:"pointer",fontFamily:"inherit",width:"100%",transition:"color .15s,border-color .15s" }}
                            onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.color=sceneColor;(e.currentTarget as HTMLButtonElement).style.borderColor=sceneColor;}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.color=D.textDim;(e.currentTarget as HTMLButtonElement).style.borderColor=D.border2;}}>
                            ↺ Re-render
                          </button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Refine concept ── */}
                  <div style={{ margin:"16px 0",border:`1.5px solid ${D.blueDark}`,borderRadius:10,overflow:"hidden",background:"#0d1a2d" }}>
                    <div style={{ padding:"12px 16px",borderBottom:`0.5px solid ${D.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                      <span style={{ fontSize:12,fontWeight:600,color:D.blue,letterSpacing:"0.02em" }}>✦ Refine</span>
                      <span style={{ fontSize:11,color:D.textDim }}>Select a scene, describe the change, press Refine</span>
                    </div>
                    <div style={{ padding:"12px 14px" }}>
                      {/* Scene target selector */}
                      <div style={{ display:"flex",gap:5,marginBottom:10,alignItems:"center" }}>
                        <span style={{ fontSize:10,color:D.textDim,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase" as const,flexShrink:0 }}>Refine:</span>
                        {(["scene","hook_a","hook_b","hook_c"] as const).map(s=>{
                          const hasImg=!!(s==="scene"?(c.visual_scene||c.visual_start):c[`visual_${s}` as keyof Concept]);
                          const lbl={scene:"Scene",hook_a:"Hook A",hook_b:"Hook B",hook_c:"Hook C"}[s];
                          const col={scene:D.blue,hook_a:D.red,hook_b:D.purple,hook_c:D.gold}[s];
                          const active=(refineTargetScene[ci]||"scene")===s;
                          return (
                            <button key={s} onClick={()=>setRefineTargetScene((p:Record<number,string>)=>({...p,[ci]:s}))}
                              style={{ fontSize:11,padding:"3px 10px",borderRadius:20,border:`1px solid ${active?col:D.border2}`,color:active?col:D.textMuted,background:active?`${col}18`:"transparent",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4,transition:"all .15s" }}>
                              {lbl}{hasImg&&<span style={{ width:5,height:5,borderRadius:"50%",background:active?col:"#3fb950",flexShrink:0 }} />}
                            </button>
                          );
                        })}
                        <div style={{ marginLeft:"auto",display:"flex",gap:5 }}>
                          <button onClick={()=>{setConcepts(p=>p.map((cc,i)=>i===ci?{...cc,visual_scene:undefined,visual_start:undefined,visual_hook_a:undefined,visual_hook_b:undefined,visual_hook_c:undefined,visual_hook:undefined,visual_middle:undefined,visual_end:undefined}:cc));setRefineErr(p=>({...p,[ci]:"Renders cleared."}));}}
                            style={{ fontSize:10,padding:"3px 9px",borderRadius:20,border:`0.5px solid ${D.greenBdr}`,color:D.green,background:D.greenBg,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap" as const }}>🔄 Clear renders</button>
                          <button onClick={()=>handleRegenScript(ci)}
                            style={{ fontSize:10,padding:"3px 9px",borderRadius:20,border:`0.5px solid ${D.goldBdr}`,color:D.gold,background:D.goldBg,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap" as const }}>📋 Regen script</button>
                        </div>
                      </div>
                      {/* Quick suggestion chips */}
                      {(()=>{
                        const vi=c.visual_identity||{};
                        const biome=vi.environment||"";
                        const chain=(c.unit_evolution_chain||[]).join(" → ");
                        type ChipColor="blue"|"red"|"gold"|"purple";
                        const chips:{label:string;text:string;color:ChipColor}[]=[
                          ...PROVEN_BIOMES.filter(b=>b!==biome).slice(0,2).map(b=>({label:`→ ${b}`,text:`Change biome to ${b}`,color:"blue" as ChipColor})),
                          {label:"More tension",text:"Make the almost-fail moment more extreme — reduce surviving mobs to 1-2.",color:"red"},
                          {label:"Stronger hook",text:"Make the hook more aggressive — enemy boss should dominate the frame.",color:"red"},
                          {label:"Darker mood",text:"Make the lighting darker and more dramatic.",color:"gold"},
                          {label:"AppLovin cut",text:"Optimize for AppLovin — fast cut within 2s, cannon visible immediately.",color:"purple"},
                          ...(!chain.includes("Triple Cannon")?[{label:"+Triple Cannon",text:"Add Triple Cannon to the unit_evolution_chain.",color:"blue" as ChipColor}]:[]),
                        ];
                        const cm:{[k in ChipColor]:{bg:string;text:string;border:string}}={blue:{bg:D.blueBg,text:D.blue,border:D.blueDark},red:{bg:D.redBg,text:D.red,border:"#6e2020"},gold:{bg:D.goldBg,text:D.gold,border:D.goldBdr},purple:{bg:D.purpleBg,text:D.purple,border:D.purpleBdr}};
                        return <div style={{ display:"flex",gap:5,marginBottom:8,flexWrap:"wrap" as const }}>{chips.map(({label,text,color})=><button key={label} onClick={()=>setRefineTexts(p=>({...p,[ci]:text}))} style={{ fontSize:10,padding:"3px 9px",borderRadius:20,border:`0.5px solid ${cm[color].border}`,color:cm[color].text,background:cm[color].bg,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap" as const }}>{label}</button>)}</div>;
                      })()}
                      <textarea
                        value={refineTexts[ci]||""}
                        onChange={e=>setRefineTexts(p=>({...p,[ci]:e.target.value}))}
                        placeholder="Describe what to change… e.g. 'add more mobs', 'make the boss bigger', 'change biome to Desert'"
                        rows={2}
                        style={{ width:"100%",boxSizing:"border-box" as const,fontSize:12,padding:"9px 12px",background:D.surface,border:`1px solid ${(refineTexts[ci]||"").trim().length>3?D.blueDark:D.border2}`,borderRadius:8,color:D.text,resize:"vertical" as const,minHeight:60,fontFamily:"inherit",outline:"none",lineHeight:1.6,transition:"border-color .2s",marginBottom:8 }}
                      />
                      <div style={{ display:"flex",gap:8,alignItems:"center",justifyContent:"flex-end" }}>
                        {(refineTexts[ci]||"").trim().length>8&&!refining[ci]&&(
                          <button onClick={async()=>{
                            setRefineErr(p=>({...p,[ci]:"Enhancing…"}));
                            try { const enhanced=await enhanceText(refineTexts[ci],"refine"); setRefineTexts(p=>({...p,[ci]:enhanced})); setRefineErr(p=>({...p,[ci]:""})); }
                            catch(e: any){ setRefineErr(p=>({...p,[ci]:"Enhance failed: "+(e as Error).message})); }
                          }} style={{ padding:"7px 12px",fontSize:11,background:"none",border:`1px solid ${D.border2}`,borderRadius:8,color:D.textMuted,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5 }}>
                            <span style={{ fontSize:12 }}>✦</span> Enhance
                          </button>
                        )}
                        {refining[ci]&&<div style={{ display:"flex",alignItems:"center",gap:6 }}><span style={{ width:12,height:12,borderRadius:"50%",border:`2px solid ${D.blueBg}`,borderTopColor:D.blue,display:"inline-block",animation:"spin .7s linear infinite" }} /><span style={{ fontSize:11,color:D.blue }}>Refining…</span></div>}
                        <button
                          onClick={async()=>{
                            const targetScene=(refineTargetScene[ci]||"scene") as "scene"|"hook_a"|"hook_b"|"hook_c";
                            const prompt=refineTexts[ci]||"";
                            if(!prompt.trim()) return;
                            setRefining(p=>({...p,[ci]:true}));
                            try {
                              // Always directly edit the image with the user's exact prompt
                              // handleRefineConcept still runs to keep brief fields in sync (text only, no render clear)
                              await handleRefineConcept(ci,prompt);
                              // Pass the user's prompt directly to image edit — this is the Nano Banana approach
                              await handleRenderScene(ci,targetScene,prompt);
                              setRefineTexts(p=>({...p,[ci]:""}));
                              setRefineErr(p=>({...p,[ci]:"✓ Done"}));
                            } catch(err:any){
                              setRefineErr(p=>({...p,[ci]:"Refine failed: "+(err as Error).message}));
                            } finally {
                              setRefining(p=>({...p,[ci]:false}));
                            }
                          }}
                          disabled={refining[ci]||renderingScene[`${ci}-${refineTargetScene[ci]||"scene"}`]||!(refineTexts[ci]||"").trim()}
                          style={{ padding:"8px 18px",fontSize:13,fontWeight:600,background:refining[ci]||!(refineTexts[ci]||"").trim()?"#1a2130":D.blue,border:"none",borderRadius:8,color:refining[ci]||!(refineTexts[ci]||"").trim()?D.textDim:"#fff",cursor:refining[ci]||!(refineTexts[ci]||"").trim()?"not-allowed":"pointer",fontFamily:"inherit",letterSpacing:"0.01em" }}>
                          {(()=>{
                            const ts=(refineTargetScene[ci]||"scene") as "scene"|"hook_a"|"hook_b"|"hook_c";
                            const hasImg=!!(ts==="scene"?(c.visual_scene||c.visual_start):c[`visual_${ts}` as keyof Concept]);
                            const lbl={scene:"Scene",hook_a:"Hook A",hook_b:"Hook B",hook_c:"Hook C"}[ts];
                            const busy=refining[ci]||renderingScene[`${ci}-${ts}`];
                            if(busy) return "Working…";
                            return hasImg?`Edit ${lbl} →`:`Render ${lbl} →`;
                          })()}
                        </button>
                      </div>
                      {refineErr[ci]&&(
                        <div style={{ marginTop:8,padding:"7px 12px",borderRadius:7,background:refineErr[ci].startsWith("✓")?D.greenBg:refineErr[ci].includes("cleared")||refineErr[ci].includes("Enhancing")||refineErr[ci].includes("Refining")?D.blueBg:D.redBg,border:`0.5px solid ${refineErr[ci].startsWith("✓")?D.greenBdr:refineErr[ci].includes("cleared")||refineErr[ci].includes("Enhancing")||refineErr[ci].includes("Refining")?D.blueDark:"#6e2020"}`,fontSize:11,color:refineErr[ci].startsWith("✓")?D.green:refineErr[ci].includes("cleared")||refineErr[ci].includes("Enhancing")||refineErr[ci].includes("Refining")?D.blue:D.red }}>
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
                      {/* Hook B / Hook C descriptions — shown below script if present */}
                      {(c.hook_b_description||c.hook_c_description)&&(
                        <div style={{ marginTop:8,display:"flex",flexDirection:"column" as const,gap:5 }}>
                          {c.hook_b_description&&(
                            <div style={{ display:"flex",gap:8,padding:"8px 12px",background:D.surface2,borderRadius:7,border:`0.5px solid ${D.purpleBdr}` }}>
                              <span style={{ fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,background:D.purpleBg,color:D.purple,border:`0.5px solid ${D.purpleBdr}`,flexShrink:0,alignSelf:"flex-start" as const,letterSpacing:"0.05em" }}>HOOK B</span>
                              <span style={{ fontSize:11,color:D.textMuted,lineHeight:1.5 }}>{c.hook_b_description}</span>
                            </div>
                          )}
                          {c.hook_c_description&&(
                            <div style={{ display:"flex",gap:8,padding:"8px 12px",background:D.surface2,borderRadius:7,border:`0.5px solid ${D.goldBdr}` }}>
                              <span style={{ fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,background:D.goldBg,color:D.gold,border:`0.5px solid ${D.goldBdr}`,flexShrink:0,alignSelf:"flex-start" as const,letterSpacing:"0.05em" }}>HOOK C</span>
                              <span style={{ fontSize:11,color:D.textMuted,lineHeight:1.5 }}>{c.hook_c_description}</span>
                            </div>
                          )}
                        </div>
                      )}
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
