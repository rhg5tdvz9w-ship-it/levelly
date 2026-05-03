import React, { useState, useRef, useCallback, useEffect } from "react";
import { MOC_REFERENCES } from "./refImages";

import type { DNAEntry, FrameExtraction, UploadConfig, Concept, BriefAnalysis, SortMode } from "./types";
import { frameExtractionSystem, hookDetectionSystem, parseContextFacts, analyzeSystem, refinementSystem, reanalysisSystem, briefSystem, imagePromptFn } from "./prompts";
import { saveFramesToIDB, mergeFramesFromIDB } from "./storage";
import { velocityPerDay, sanitizeDNA, buildLineageChain, parentValidation, sortLib, SPEND_RANK } from "./library";
import { GEMINI_IMAGE_URL, callGeminiDirect, parseDataURI, callImageDirect, uploadToGeminiFileAPI, fileToBase64, extractFramesFromVideo } from "./analysis";
import { enhanceText } from "./briefing";
import { pickRelevantRefs } from "./rendering";

// ─── Deploy D: ErrorBoundary — prevents white screen on uncaught errors ─────
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px 20px", maxWidth: 720, margin: "60px auto", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", color: "#c9d1d9", background: "#0d1117", borderRadius: 12, border: "1px solid #6e2020" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#f85149" }}>⚠ Something broke</h2>
          <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5 }}>Levelly hit an error and stopped rendering. Your library data is safe — just reload the page.</p>
          <pre style={{ background: "#161b22", padding: "12px", borderRadius: 8, fontSize: 11, overflow: "auto", color: "#8b949e", whiteSpace: "pre-wrap" as const }}>{this.state.error?.message || "Unknown error"}{"\n\n"}{this.state.error?.stack?.split("\n").slice(0, 5).join("\n") || ""}</pre>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", fontSize: 12, background: "#1f6feb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>Reload page</button>
            <button onClick={() => this.setState({ hasError: false, error: null })} style={{ padding: "8px 16px", fontSize: 12, background: "transparent", color: "#c9d1d9", border: "0.5px solid #30363d", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>Dismiss</button>
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 11, color: "#6e7681" }}>If this keeps happening, screenshot the message above and send to Dmitriy.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

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
// ─── Deploy F: Refine annotation drop zone — compact horizontal version for inside refine UI ──
function RefineDropZone({ currentRef, onDrop, onClear }: {
  currentRef: { base64: string; mimeType: string; name: string } | null;
  onDrop: (file: File) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const processFile = (f: File) => { if (f.type.startsWith("image/")) onDrop(f); };
  return (
    <div style={{ marginBottom: 8 }}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }} />
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
        onClick={() => !currentRef && inputRef.current?.click()}
        style={{
          padding: currentRef ? "8px 12px" : "10px 12px",
          border: `1.5px dashed ${dragging ? D.blue : currentRef ? D.purpleBdr : D.border2}`,
          borderRadius: 6,
          background: dragging ? D.blueBg : currentRef ? D.purpleBg : "transparent",
          cursor: currentRef ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          transition: "border-color .15s, background .15s",
        }}
      >
        {currentRef ? (
          <>
            <img src={`data:${currentRef.mimeType};base64,${currentRef.base64}`} alt="annotation preview" style={{ width: 32, height: 32, objectFit: "cover" as const, borderRadius: 4, flexShrink: 0, border: `0.5px solid ${D.purpleBdr}` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: D.purple, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>📎 {currentRef.name}</div>
              <div style={{ fontSize: 9, color: D.textDim }}>annotation will guide the edit</div>
            </div>
            <button onClick={e => { e.stopPropagation(); onClear(); }} style={{ background: "none", border: "none", color: D.textDim, cursor: "pointer", fontSize: 14, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}>✕</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14, opacity: dragging ? 1 : 0.5 }}>📎</span>
            <div style={{ fontSize: 11, color: dragging ? D.blue : D.textMuted, fontWeight: 500 }}>
              {dragging ? "Drop annotation image" : "Optional: drag screenshot/annotation here to guide the edit"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
          <div style={{ flex: 1, padding: "14px 8px", border: `2px dashed ${dragging ? D.purple : D.border2}`, borderRadius: 8, textAlign: "center" as const, transition: "border-color .15s, background .15s", background: dragging ? `${D.purpleBg}` : "transparent", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 4 }}>
            <div style={{ fontSize: 22, opacity: dragging ? 1 : 0.55 }}>📥</div>
            <div style={{ fontSize: 12, color: dragging ? D.purple : D.text, fontWeight: 600 }}>
              {dragging ? "Release to add reference" : "Drag & drop image or video"}
            </div>
            <div style={{ fontSize: 10, color: D.textDim, fontWeight: 400 }}>
              {dragging ? " " : "or click to browse"}
            </div>
          </div>
        )}
      </div>

      {/* Divider + creative ID input — Deploy D fix: input always rendered (was vanishing on first keystroke) */}
      <div style={{ borderTop: `0.5px solid ${hasAnyRef ? D.purpleBdr : D.border2}`, padding: "7px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9, fontWeight: 600, color: D.textDim, letterSpacing: "0.08em", flexShrink: 0 }}>ITERATE FROM</span>
        <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 6, background: iterateFrom.trim() ? `${D.purpleBdr}22` : "transparent", border: iterateFrom.trim() ? `0.5px solid ${D.purpleBdr}` : "none", borderRadius: 5, padding: iterateFrom.trim() ? "1px 8px" : 0 }}>
          <input
            style={{ ...inputStyle, flex: 1, fontSize: 11, padding: "4px 0", background: "transparent", border: "none", outline: "none", color: iterateFrom.trim() ? D.purple : D.text, fontWeight: iterateFrom.trim() ? 500 : 400 }}
            placeholder="Library ID, e.g. CT43"
            value={iterateFrom}
            onChange={e => onIterateFrom(e.target.value)}
          />
          {iterateFrom.trim() && <button onClick={() => onIterateFrom("")} style={{ background: "none", border: "none", color: D.textDim, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>}
        </div>
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
// Deploy O: Bulk upload modal — handles 2+ video files at once, all marked as competitors,
// optional shared game_title applied to all. Processes 3 in parallel via the existing single-file pipeline.
// Each file flows through the same handleUpload(...) as a regular competitor upload, just batched.
type BulkItemStatus = "queued" | "analyzing" | "done" | "failed";
type BulkItem = { file: File; status: BulkItemStatus; error?: string };
function BulkUploadModal({ files, onClose, onProcessOne }: {
  files: File[];
  onClose: () => void;
  onProcessOne: (file: File, gameTitle: string) => Promise<void>;
}) {
  const [items, setItems] = React.useState<BulkItem[]>(files.map(f => ({ file: f, status: "queued" as BulkItemStatus })));
  const [gameTitle, setGameTitle] = React.useState<string>("");
  const [running, setRunning] = React.useState<boolean>(false);
  const allDone = items.every(i => i.status === "done" || i.status === "failed");
  const successCount = items.filter(i => i.status === "done").length;
  const failedCount = items.filter(i => i.status === "failed").length;
  const startBatch = async () => {
    setRunning(true);
    // Deploy O.1: HOTFIX — bulk concurrency dropped from 3 to 1 (sequential).
    // handleUpload's closure-captured `lib` + saveLib's diff-vs-libPrevRef pattern is NOT safe under concurrency.
    // Parallel runs cause each new bulk entry to silently DELETE prior bulk entries from cloud (last-writer-wins).
    // Sequential processing fully serializes lib state mutations. Slower (3x) but correct.
    const CONCURRENCY = 1;
    let cursor = 0;
    const updateOne = (idx: number, partial: Partial<BulkItem>) => {
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...partial } : it));
    };
    const worker = async () => {
      while (true) {
        const myIdx = cursor++;
        if (myIdx >= items.length) return;
        updateOne(myIdx, { status: "analyzing" });
        try {
          await onProcessOne(items[myIdx].file, gameTitle.trim());
          updateOne(myIdx, { status: "done" });
        } catch (err: any) {
          updateOne(myIdx, { status: "failed", error: err?.message || String(err) });
          console.error("[Levelly O] bulk item failed:", items[myIdx].file.name, err);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    setRunning(false);
  };
  return (
    <div onClick={e=>e.stopPropagation()} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:24 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:D.surface,border:`0.5px solid ${D.border}`,borderRadius:14,padding:22,width:560,maxWidth:"95vw",maxHeight:"86vh",overflow:"auto" }}>
        <h3 style={{ margin:"0 0 6px",fontSize:16,fontWeight:600,color:D.text }}>Bulk competitor upload</h3>
        <p style={{ margin:"0 0 6px",fontSize:12,color:D.textMuted }}>{items.length} files queued. Processed sequentially — one at a time, ~30-60s per file.</p>
        <p style={{ margin:"0 0 14px",fontSize:11,color:D.gold,fontStyle:"italic" as const }}>⚠ Keep this tab focused during the run. Switching tabs can throttle video processing and cause filmstrips to be missing.</p>
        <div style={{ display:"flex",flexDirection:"column",gap:4,marginBottom:14 }}>
          <label style={{ fontSize:11,color:D.textMuted,fontWeight:500 }}>Game title (applies to all)</label>
          <input
            type="text"
            value={gameTitle}
            disabled={running}
            onChange={e => setGameTitle(e.target.value)}
            placeholder="e.g. Last War, Whiteout Survival, Gold and Goblins"
            style={{ fontSize:12,padding:"8px 10px",borderRadius:6,background:D.surface2,border:`0.5px solid ${D.border}`,color:D.text,outline:"none",opacity:running?0.6:1 }}
          />
          <span style={{ fontSize:10,color:D.textDim }}>Optional. Applies to every file in this batch. Leave blank if mixed sources.</span>
        </div>
        <div style={{ background:D.surface2,border:`0.5px solid ${D.border}`,borderRadius:8,maxHeight:280,overflow:"auto",marginBottom:14 }}>
          {items.map((item, idx) => {
            const statusColor = item.status === "done" ? D.green : item.status === "failed" ? D.red : item.status === "analyzing" ? D.blue : D.textDim;
            const statusIcon = item.status === "done" ? "✓" : item.status === "failed" ? "✕" : item.status === "analyzing" ? "⏳" : "•";
            return (
              <div key={idx} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:`0.5px solid ${D.border}`,fontSize:11 }}>
                <span style={{ minWidth:18,color:statusColor,fontWeight:600 }}>{statusIcon}</span>
                <span style={{ flex:1,color:D.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const }}>{item.file.name}</span>
                <span style={{ fontSize:10,color:D.textDim }}>{(item.file.size / (1024*1024)).toFixed(1)} MB</span>
                <span style={{ fontSize:10,color:statusColor,minWidth:62,textAlign:"right" as const }}>{item.status}</span>
              </div>
            );
          })}
        </div>
        {allDone && running === false && items.length > 0 && (
          <div style={{ background:D.greenBg,border:`0.5px solid ${D.greenBdr}`,borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:D.green }}>
            ✓ Done: {successCount} succeeded{failedCount > 0 ? `, ${failedCount} failed` : ""}
          </div>
        )}
        <div style={{ display:"flex",gap:8,justifyContent:"flex-end" }}>
          <button onClick={onClose} disabled={running} style={{ padding:"8px 16px",fontSize:12,borderRadius:6,background:"transparent",border:`0.5px solid ${D.border2}`,color:D.textMuted,cursor:running?"not-allowed":"pointer",opacity:running?0.5:1 }}>
            {allDone ? "Close" : "Cancel"}
          </button>
          {!allDone && (
            <button onClick={startBatch} disabled={running} style={{ padding:"8px 16px",fontSize:12,fontWeight:600,borderRadius:6,background:running?D.blueBg:D.blue,color:running?D.blue:"#fff",border:`0.5px solid ${D.blueDark}`,cursor:running?"wait":"pointer" }}>
              {running ? "Analyzing…" : `Start (${items.length} files)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function UploadModal({ onConfirm, onCancel, lib, droppedFile }: { onConfirm: (cfg: UploadConfig, preAttachedFile?: File) => void; onCancel: () => void; lib: DNAEntry[]; droppedFile?: File | null }) {
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
  const [levellyBriefTitle, setLevellyBriefTitle] = useState("");
  const frameRef = useRef<HTMLInputElement>(null);
  const refCount = MOC_REFERENCES.filter(r => !r.base64.startsWith("REPLACE_")).length;
  const pv = parentValidation(parentId, creativeId, lib);
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000 }} onClick={onCancel}>
      <div style={{ background:D.surface,borderRadius:14,padding:"1.5rem",width:"90%",maxWidth:520,border:`0.5px solid ${D.border2}`,maxHeight:"90vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <h2 style={{ margin:"0 0 4px",fontSize:16,fontWeight:500,color:D.text }}>Upload ads</h2>
        <p style={{ margin:"0 0 20px",fontSize:12,color:D.textMuted }}>{adType==="competitor" ? "Competitor ad — ad type + tier only." : "Configure before choosing files."}</p>
        {/* Deploy H.1: pre-attached file indicator (shown when user drag-dropped a video onto Analyse card) */}
        {droppedFile && (
          <div style={{ marginBottom:14,padding:"8px 12px",background:D.greenBg,border:`1px solid ${D.greenBdr}`,borderRadius:8,display:"flex",alignItems:"center",gap:8,fontSize:12 }}>
            <span style={{ color:D.green,fontSize:14 }}>⇪</span>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ color:D.text,fontWeight:500 }}>Video ready: {droppedFile.name}</div>
              <div style={{ color:D.textMuted,fontSize:10,marginTop:2 }}>{Math.round(droppedFile.size/1024/1024*10)/10} MB — will analyse on Confirm</div>
            </div>
          </div>
        )}
        {adType !== "competitor" && (<><div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14,padding:"12px",background:D.surface2,borderRadius:8,border:`0.5px solid ${D.border}` }}>
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
        <div style={{ marginBottom:14,padding:"10px 12px",background:D.surface2,borderRadius:8,border:`0.5px solid ${D.border}` }}>
          <span style={labelStyle}>Levelly brief reference <span style={{ color:D.textDim,fontWeight:400,textTransform:"none",letterSpacing:0 }}>(if this creative was produced from a Levelly brief)</span></span>
          <input style={{ ...inputStyle,fontSize:12 }} placeholder="e.g. Desert Skeleton Hook v2" value={levellyBriefTitle} onChange={e=>setLevellyBriefTitle(e.target.value)} />
        </div></>)}
        {/* Deploy H: competitor mode strips MOC-specific fields */}
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
        {/* Deploy H.1: Analysis hints + Manual frames hidden entirely for competitors (MOC-specific noise) */}
        {adType !== "competitor" && (<div style={{ marginBottom:14 }}>
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
        </div>)}
        {/* Deploy H.1: Competitor-mode compact context input (replaces full hints block) */}
        {adType === "competitor" && (<div style={{ marginBottom:14 }}>
          <span style={labelStyle}>Context <span style={{ fontWeight:400,color:D.textMuted }}>(optional — e.g. game title, source, market observation)</span></span>
          <textarea style={{ ...inputStyle,minHeight:48,resize:"vertical" as const,background:D.bg,fontSize:11 }} placeholder="Game: [name] — context. e.g. 'Game: Last War — trophy room hook' (helps market intel group by game)" value={context} onChange={e=>setContext(e.target.value)} />
        </div>)}
        {/* Deploy H.1: Manual frames — hidden for competitors (not useful for market-reference analysis) */}
        {adType !== "competitor" && (<div style={{ marginBottom:16 }}>
          <span style={labelStyle}>Manual storyboard frames (optional)</span>
          <input ref={frameRef} type="file" accept="image/*" multiple style={{ display:"none" }} onChange={e=>setManualFrames(Array.from(e.target.files??[]))} />
          <button style={{ ...btnSec,...(manualFrames.length>0?{border:`1.5px solid ${D.greenBdr}`,color:D.green,background:D.greenBg}:{}) }} onClick={()=>frameRef.current?.click()}>
            {manualFrames.length>0?`✓ ${manualFrames.length} frame(s) selected`:"+ Add frames"}
          </button>
        </div>)}
        <div style={{ marginBottom:16,padding:"8px 12px",background:D.surface2,borderRadius:8,fontSize:10,color:D.textMuted,border:`0.5px solid ${D.border}` }}>
          {refCount>0?`✓ ${refCount} MOC refs`:"⚠ No refs"} → Frame extraction → Hook detection → {manualFrames.length>0?`✓ ${manualFrames.length} manual frames`:"No manual frames"} → DNA analysis
        </div>
        <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
          <button style={btnSec} onClick={onCancel}>Cancel</button>
          <button style={btnPri} onClick={()=>{
                  const parts: string[] = [];
                  const tierLabel2: Record<string,string> = {simple:"Simple Cannon",double:"Double Cannon",triple:"Triple Cannon",tank:"Tank"};
                  // Deploy H.1: analysis hints only apply to non-competitor uploads
                  if(adType !== "competitor") {
                    if(chainStart){const s=chainStart==="other"?chainOther:tierLabel2[chainStart];const e=chainEnd&&chainEnd!=="other"?tierLabel2[chainEnd]:chainEnd==="other"?chainOther:null;if(s&&e&&s!==e)parts.push(`${s} to ${e} cannon chain`);else if(s)parts.push(`${s} cannon only`);}
                    if(upgradeSec) parts.push(`upgrade at ${upgradeSec}s`);
                    if(giantKillCount) parts.push(`${giantKillCount} giant${parseInt(giantKillCount)!==1?"s":""} killed`);
                    if(giantKillSec) parts.push(`giant killed at ${giantKillSec}s`);
                    if(finalGiantSurvives==="yes") parts.push("final giant is not killed");
                    if(finalGiantSurvives==="no") parts.push("final giant is killed");
                  }
                  if(context.trim()) parts.push(context.trim());
                  const fullContext = parts.join(", ");
                  // Deploy H.1: when droppedFile present, pass it through so handleModalConfirm skips file picker
                  onConfirm({ tier,ad_type:adType,context:fullContext,manual_frames:adType==="competitor"?[]:manualFrames,creative_id:creativeId.trim()||undefined,parent_id:parentId.trim()||undefined,levelly_brief_title:levellyBriefTitle.trim()||undefined }, droppedFile || undefined);
                }}>{droppedFile ? "Confirm & analyse →" : "Choose video →"}</button>
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

// ─── Deploy E: Generate 150px thumbnail (q65 JPEG) from existing 480px image_data base64 ────
async function generateCloudThumbnail(base64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const aspectRatio = img.height / img.width;
        const targetWidth = 150;
        const targetHeight = Math.round(targetWidth * aspectRatio);
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas context unavailable"));
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
        const b64 = dataUrl.split(",")[1];
        if (!b64) return reject(new Error("Empty data URL"));
        resolve(b64);
      } catch (err) { reject(err); }
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

// ─── Deploy C: Grid thumbnail card (entry in library grid) ──────────────────
function LibraryCardGrid({ d, index, onClick }: {
  d: DNAEntry; index: number; onClick: () => void;
}) {
  // Deploy E: thumbnail priority — local IDB first frame > cloud_thumbnail (cross-browser fallback) > "No preview"
  const firstAutoFrame = d.auto_frames?.find(f => f.image_data);
  const thumbnail = firstAutoFrame?.image_data
    ? `data:image/jpeg;base64,${firstAutoFrame.image_data}`
    : d.cloud_thumbnail
      ? `data:image/jpeg;base64,${d.cloud_thumbnail}`
      : null;
  const [imgFailed, setImgFailed] = React.useState(false);
  const tierStyle = TIER_STYLE[d.tier];
  const statusSt = CREATIVE_STATUS.find(s => s.value === d.creative_status);
  const isFatigued = d.creative_status === "fatigued";
  const accentColor = isFatigued ? "#8957e5" : TIER_ACCENT[d.tier] ?? D.border2;
  const displayId = d.creative_id?.trim() || d.title;
  return (
    <div
      onClick={onClick}
      style={{
        background: D.surface,
        border: `0.5px solid ${D.border}`,
        borderTop: `3px solid ${accentColor}`,
        borderRadius: 8,
        overflow: "hidden",
        cursor: "pointer",
        opacity: isFatigued ? 0.75 : 1,
        animation: `cardFadeIn .3s ease-out ${Math.min(index, 20) * 0.02}s both`,
        transition: "transform .2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow .2s ease-out",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 12px rgba(0,0,0,0.35), 0 0 0 1.5px ${D.blue}`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
    >
      <div style={{ aspectRatio: "9/16", background: thumbnail ? "transparent" : D.surface2, position: "relative" as const, overflow: "hidden" }}>
        {thumbnail && !imgFailed ? (
          <img src={thumbnail} alt="" onError={() => setImgFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: D.textDim, fontSize: 11, fontStyle: "italic" as const }}>No preview</div>
        )}
        {d.is_compound && <span style={{ position: "absolute" as const, top: 6, right: 6, ...pill(D.goldBg, D.gold, D.goldBdr), fontSize: 8, padding: "1px 5px" }}>compound</span>}
      </div>
      <div style={{ padding: "8px 10px 10px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: D.text, lineHeight: 1.3, marginBottom: 3, overflow: "hidden" as const, textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{displayId}</div>
        {d.creative_id && d.title && <div style={{ fontSize: 10, color: D.textMuted, lineHeight: 1.3, marginBottom: 6, overflow: "hidden" as const, textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{d.title}</div>}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, marginBottom: 5 }}>
          {tierStyle && <span style={{ ...pill(tierStyle.bg, tierStyle.text, tierStyle.border), fontSize: 9, padding: "1px 6px" }}>{d.tier}</span>}
          {statusSt && <span style={{ ...pill(statusSt.bg, statusSt.text, statusSt.border), fontSize: 9, padding: "1px 6px" }}>{statusSt.label}</span>}
          {d.ad_type !== "moc" && <span style={{ ...pill(D.purpleBg, D.purple, D.purpleBdr), fontSize: 9, padding: "1px 6px" }}>{d.ad_type}</span>}
        </div>
        {d.biome && <div style={{ fontSize: 9, color: D.textDim, overflow: "hidden" as const, textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{d.biome}</div>}
      </div>
    </div>
  );
}

// ─── Deploy C: Fullscreen modal wrapping LibraryCard expanded view ──────────
function LibraryModal(props: {
  entry: DNAEntry; di: number; lib: DNAEntry[]; saveLib: (l: DNAEntry[]) => void;
  expandedDNA: number; setExpandedDNA: (n: number|null) => void;
  reanalyzingIds: Set<number>; handleReanalyzeSingle: (e: DNAEntry) => void;
  onZoomFrame: (src: string, list?: string[], index?: number) => void;
  isReanalyzing: boolean;
  onReupload?: (entry: DNAEntry, file: File, manualFrameFiles?: File[], context?: string) => void;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") props.onClose(); };
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [props]);
  return (
    <div
      onClick={props.onClose}
      style={{
        position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.72)", zIndex: 1000,
        display: "flex", justifyContent: "center", alignItems: "flex-start",
        padding: "40px 20px", overflowY: "auto" as const,
        animation: "modalBackdrop .18s ease-out",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: D.surface, borderRadius: 12, maxWidth: 760, width: "100%",
          position: "relative" as const, animation: "modalSlideUp .22s ease-out",
          border: `1px solid ${D.border2}`, overflow: "hidden",
        }}
      >
        {/* Deploy D: Share link button */}
        <button
          onClick={async () => {
            try {
              const shareUrl = `${window.location.origin}${window.location.pathname}?entry=${props.entry.id}`;
              await navigator.clipboard.writeText(shareUrl);
              const btn = document.getElementById(`share-btn-${props.entry.id}`);
              if (btn) { btn.textContent = "✓ copied"; setTimeout(() => { if (btn) btn.textContent = "🔗 share"; }, 1500); }
            } catch (err) { alert("Could not copy. URL: " + window.location.origin + window.location.pathname + "?entry=" + props.entry.id); }
          }}
          id={`share-btn-${props.entry.id}`}
          aria-label="Share link to this entry"
          style={{
            position: "absolute" as const, top: 10, right: 48, zIndex: 10,
            background: "rgba(0,0,0,0.6)", color: "#fff", border: "none",
            borderRadius: 14, height: 28, padding: "0 10px", fontSize: 11,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "inherit", lineHeight: 1, gap: 4,
          }}
        >🔗 share</button>
        <button
          onClick={props.onClose}
          aria-label="Close"
          style={{
            position: "absolute" as const, top: 10, right: 10, zIndex: 10,
            background: "rgba(0,0,0,0.6)", color: "#fff", border: "none",
            borderRadius: "50%", width: 28, height: 28, fontSize: 14,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "inherit", lineHeight: 1,
          }}
        >✕</button>
        <LibraryCard
          d={props.entry} di={props.di}
          expandedDNA={props.expandedDNA} setExpandedDNA={props.setExpandedDNA}
          lib={props.lib} saveLib={props.saveLib}
          reanalyzingIds={props.reanalyzingIds} handleReanalyzeSingle={props.handleReanalyzeSingle}
          onZoomFrame={props.onZoomFrame}
          isReanalyzing={props.isReanalyzing} onReupload={props.onReupload}
          alwaysExpanded={true} inModal={true}
        />
      </div>
    </div>
  );
}

function LibraryCard({ d, di, expandedDNA, setExpandedDNA, lib, saveLib, reanalyzingIds, handleReanalyzeSingle, onZoomFrame, isReanalyzing, onReupload, alwaysExpanded, inModal }: {
  d: DNAEntry; di: number; expandedDNA: number|null; setExpandedDNA: (n: number|null) => void;
  lib: DNAEntry[]; saveLib: (l: DNAEntry[]) => void;
  reanalyzingIds: Set<number>; handleReanalyzeSingle: (e: DNAEntry) => void;
  onZoomFrame: (src: string, list?: string[], index?: number) => void;
  isReanalyzing: boolean;
  onReupload?: (entry: DNAEntry, file: File, manualFrameFiles?: File[], context?: string) => void;
  alwaysExpanded?: boolean; inModal?: boolean;
}) {
  const [showReuploadModal, setShowReuploadModal] = React.useState(false);
  const [spendOpen, setSpendOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  // ✅ canTag fix: inspiration tier now shows metadata fields
  const canTag = d.ad_type === "moc";
  const spendSt = SPEND_TIERS.find(t => t.value === d.spend_tier);
  const statusSt = CREATIVE_STATUS.find(s => s.value === d.creative_status);
  const isFatigued = d.creative_status === "fatigued";
  const isExpanded = alwaysExpanded === true || expandedDNA === di;
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
          <select
            value={d.tier}
            onChange={e => { e.stopPropagation(); saveLib(lib.map(x => x.id === d.id ? { ...x, tier: e.target.value as DNAEntry["tier"] } : x)); }}
            onClick={e => e.stopPropagation()}
            title="Click to change tier"
            style={{ fontSize: 10, fontWeight: 500, padding: "2px 18px 2px 8px", borderRadius: 20, background: TIER_STYLE[d.tier].bg, color: TIER_STYLE[d.tier].text, border: `0.5px solid ${TIER_STYLE[d.tier].border}`, cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", backgroundImage: `linear-gradient(45deg, transparent 50%, ${TIER_STYLE[d.tier].text} 50%), linear-gradient(135deg, ${TIER_STYLE[d.tier].text} 50%, transparent 50%)`, backgroundPosition: "calc(100% - 9px) 50%, calc(100% - 5px) 50%", backgroundSize: "4px 4px, 4px 4px", backgroundRepeat: "no-repeat", fontFamily: "inherit" }}
          >
            {TIERS.map(t => <option key={t} value={t} style={{ background: D.surface2, color: D.text }}>{t}</option>)}
          </select>
          {statusSt && <span style={pill(statusSt.bg, statusSt.text, statusSt.border)}>{statusSt.label}</span>}
          {/* Deploy H.1.1: ad_type editable dropdown (was read-only pill). Fixes misclassified entries from H.1 drop-upload bug. */}
          <select
            value={d.ad_type}
            onChange={e => { e.stopPropagation(); saveLib(lib.map(x => x.id === d.id ? { ...x, ad_type: e.target.value as DNAEntry["ad_type"] } : x)); }}
            onClick={e => e.stopPropagation()}
            title="Change ad type — re-analyze the entry afterwards to refresh DNA with correct prompts"
            style={{ fontSize: 10, fontWeight: 500, padding: "2px 18px 2px 8px", borderRadius: 20, background: d.ad_type === "moc" ? D.surface2 : D.purpleBg, color: d.ad_type === "moc" ? D.textMuted : D.purple, border: `0.5px solid ${d.ad_type === "moc" ? D.border2 : D.purpleBdr}`, cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", backgroundImage: `linear-gradient(45deg, transparent 50%, ${d.ad_type === "moc" ? D.textMuted : D.purple} 50%), linear-gradient(135deg, ${d.ad_type === "moc" ? D.textMuted : D.purple} 50%, transparent 50%)`, backgroundPosition: "calc(100% - 9px) 50%, calc(100% - 5px) 50%", backgroundSize: "4px 4px, 4px 4px", backgroundRepeat: "no-repeat", fontFamily: "inherit" }}
          >
            <option value="moc" style={{ background: D.surface2, color: D.text }}>moc</option>
            <option value="competitor" style={{ background: D.surface2, color: D.text }}>competitor</option>
            <option value="compound" style={{ background: D.surface2, color: D.text }}>compound</option>
          </select>
          {/* Deploy N: show game_title pill for competitors when available */}
          {d.ad_type === "competitor" && (d as any).game_title && <span style={pill(D.blueBg, D.blue, D.blueDark)}>🎮 {(d as any).game_title}</span>}
          {d.ad_type === "competitor" && d.core_fantasy && <span style={pill(D.purpleBg, D.purple, D.purpleBdr)}>{d.core_fantasy}</span>}
          {/* Deploy S: also clickable in the expanded pill row for competitors. */}
          {d.is_compound && d.ad_type === "competitor" ? (
            <span
              onClick={e => {
                e.stopPropagation();
                if (confirm("Mark this competitor ad as NOT compound? This clears the flag.")) {
                  saveLib(lib.map(x => x.id === d.id ? { ...x, is_compound: false } : x));
                }
              }}
              title="Click to clear compound flag"
              style={{ ...pill(D.goldBg, D.gold, D.goldBdr), cursor: "pointer" }}
            >
              compound ✕
            </span>
          ) : d.is_compound ? (
            <span style={pill(D.goldBg, D.gold, D.goldBdr)}>compound</span>
          ) : null}
          {/* Deploy I: gate upgrade badge — shows when analyze detected an ascending xN sequence in the video. (Renamed P.1: data field stays gate_escalation.) */}
          {d.gate_escalation && <span style={pill(D.purpleBg, D.purple, D.purpleBdr)} title={`Gate upgrade detected: ${d.gate_escalation}`}>⚡ Gate upgrade: {d.gate_escalation.replace(/\s*\(.*?\).*$/, "")}</span>}
          {/* Deploy BC2.1: family pill HIDDEN from producer UI.
              Reason: F-codes (F1/F2/V1+V5/F4) confused producers — they didn't know what they meant
              and tagged inconsistently. mechanic_family field still ALIVE under the hood:
                - Gemini auto-tags during analyze (analyzeSystem schema)
                - Used by pickRelevantRefs (rendering.ts) for visual anchoring
                - Used by briefSystem for prompt-side mechanic diversity
              If producer override needed in future: re-enable by changing SHOW_FAMILY_OVERRIDE to true,
              or move to an admin/dev-mode panel. Field itself stays in DNAEntry schema. */}
          {false && (
            <select
              value={(d as any).mechanic_family || ""}
              onChange={e => { e.stopPropagation(); const newVal = e.target.value || null; saveLib(lib.map(x => x.id === d.id ? { ...x, mechanic_family: newVal as any } : x)); }}
              onClick={e => e.stopPropagation()}
              style={{ ...pill(D.surface2, D.text, D.border2), fontSize: 9, padding: "2px 6px", border: `0.5px solid ${D.border2}`, cursor: "pointer", fontFamily: "inherit" }}
              title="Mechanic family override — used by render picker to anchor visual style"
            >
              <option value="">⚙ family: untagged</option>
              <option value="F1">F1 — gate progression</option>
              <option value="F2/V1">F2/V1 — break (unlock)</option>
              <option value="F2/V2">F2/V2 — break (decorative)</option>
              <option value="F2/V3">F2/V3 — push/rotate</option>
              <option value="F2/V4">F2/V4 — lift platform</option>
              <option value="F2/V5">F2/V5 — swarm-destroy</option>
              <option value="F2/V1+V5">F2/V1+V5 — break + swarm</option>
              <option value="F2/V3+V5">F2/V3+V5 — push + swarm</option>
              <option value="F2/V4+V5">F2/V4+V5 — lift + swarm</option>
              <option value="F2/V1+V3">F2/V1+V3 — break + push</option>
              <option value="F3">F3 — multi-lane choice</option>
              <option value="F4">F4 — idle core loop</option>
              <option value="F3+F2/V1">F3+F2/V1 — multi-lane + break</option>
              <option value="F2/V4+F4">F2/V4+F4 — lift + idle base</option>
              <option value="F4+F2/V3">F4+F2/V3 — idle + push</option>
              <option value="other">other</option>
            </select>
          )}
          {d.levelly_brief_title && <span style={pill(D.blueBg, D.blue, D.blueDark)} title={`Levelly brief: ${d.levelly_brief_title}`}>⎇ Levelly</span>}
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

        {/* Row 5: Footer — filename + date (tier edit moved to pill in Row 1) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: D.textDim }}>
            {d.file_name} · {new Date(d.added_at).toLocaleDateString()}
          </span>
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
        {!inModal && (
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
        )}
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
          {/* Producer correction card — audit + override hallucinated fields */}
          {/* Deploy H: ValidationCard hidden for competitors (producer verification is MOC-specific) */}
          {d.ad_type !== "competitor" && <ValidationCard entry={d} lib={lib} saveLib={saveLib} />}
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

          {/* Deploy P.1: game title editor — always shown for competitors (not gated on intel fields).
              Lets producer add or edit game_title for previously-analyzed entries. */}
          {d.ad_type === "competitor" && (
            <GameTitleEditor entry={d} lib={lib} saveLib={saveLib} />
          )}
          {d.ad_type === "competitor" && (d.core_fantasy || d.moc_inspiration || (d.transferable_elements && d.transferable_elements.length > 0)) && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderLeft: "2px solid " + D.purple, background: D.purpleBg + "40", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: D.purple, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600, marginBottom: 8 }}>Competitor Intelligence</div>
              {d.core_fantasy && (
                <div style={{ marginBottom: 8 }}>
                  <span style={labelStyle}>Core fantasy</span>
                  <p style={{ margin: 0, fontSize: 11, color: D.text, lineHeight: 1.5, fontWeight: 500 }}>{d.core_fantasy}</p>
                </div>
              )}
              {d.moc_inspiration && (
                <div style={{ marginBottom: 8 }}>
                  <span style={labelStyle}>MOC inspiration</span>
                  <p style={{ margin: 0, fontSize: 11, color: D.textMuted, lineHeight: 1.6 }}>{d.moc_inspiration}</p>
                </div>
              )}
              {d.transferable_elements && d.transferable_elements.length > 0 && (
                <div>
                  <span style={labelStyle}>Transferable elements</span>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11, color: D.textMuted, lineHeight: 1.6 }}>
                    {d.transferable_elements.map((el, i) => (<li key={i} style={{ marginBottom: 4 }}>{el}</li>))}
                  </ul>
                </div>
              )}
            </div>
          )}
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




// ─── ValidationCard ──────────────────────────────────────────────────────────
// Deploy P.1: inline editor for competitor game_title. Lets user add/change game name on
// previously-analyzed entries (game_title was only settable via upload-context prefix in Deploy N).
function GameTitleEditor({ entry: d, lib, saveLib }: { entry: DNAEntry; lib: DNAEntry[]; saveLib: (updated: DNAEntry[]) => void }) {
  const [gameTitle, setGameTitle] = React.useState<string>(((d as any).game_title || "").toString());
  const [editing, setEditing] = React.useState<boolean>(false);
  const [saving, setSaving] = React.useState<boolean>(false);
  // Re-sync when prop changes (e.g. lazy-load finishes)
  React.useEffect(() => {
    setGameTitle(((d as any).game_title || "").toString());
  }, [d.id, (d as any).game_title]);
  const save = async () => {
    setSaving(true);
    try {
      const trimmed = gameTitle.trim();
      const updated = lib.map(x => x.id === d.id ? { ...x, game_title: trimmed || undefined } as DNAEntry : x);
      saveLib(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  const current = ((d as any).game_title || "").toString();
  return (
    <div style={{ marginTop: 10, padding: "8px 12px", borderLeft: "2px solid " + D.blue, background: D.blueBg + "40", borderRadius: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: D.blue, textTransform: "uppercase" as const, letterSpacing: ".08em", fontWeight: 600, minWidth: 80 }}>🎮 Game</span>
        {!editing ? (
          <>
            <span style={{ fontSize: 12, color: current ? D.text : D.textDim, fontStyle: current ? "normal" : "italic", flex: 1 }}>
              {current || "(not set — click edit to add)"}
            </span>
            <button
              onClick={() => setEditing(true)}
              style={{ fontSize: 10, padding: "3px 9px", borderRadius: 5, background: "transparent", color: D.blue, border: `0.5px dashed ${D.blue}`, cursor: "pointer", fontFamily: "inherit" }}
            >
              {current ? "Edit" : "+ Add"}
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              autoFocus
              value={gameTitle}
              disabled={saving}
              onChange={e => setGameTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") save(); else if (e.key === "Escape") { setGameTitle(current); setEditing(false); } }}
              placeholder="e.g. Last War, Whiteout Survival"
              style={{ flex: 1, fontSize: 12, padding: "4px 8px", borderRadius: 5, background: D.surface2, border: `0.5px solid ${D.border2}`, color: D.text, fontFamily: "inherit", outline: "none" }}
            />
            <button
              onClick={save}
              disabled={saving}
              style={{ fontSize: 10, padding: "3px 9px", borderRadius: 5, background: D.blue, color: "#fff", border: `0.5px solid ${D.blueDark}`, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", fontWeight: 600 }}
            >
              {saving ? "…" : "Save"}
            </button>
            <button
              onClick={() => { setGameTitle(current); setEditing(false); }}
              disabled={saving}
              style={{ fontSize: 10, padding: "3px 7px", borderRadius: 5, background: "transparent", color: D.textMuted, border: `0.5px solid ${D.border2}`, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
// Post-analysis producer review panel. Direct-override mode — no Gemini re-run.
// Principle: producer always wins when they disagree with Gemini/Claude.
function ValidationCard({ entry: d, lib, saveLib }: { entry: DNAEntry; lib: DNAEntry[]; saveLib: (updated: DNAEntry[]) => void }) {
  const TIER_OPTIONS = ["Simple Cannon", "Double Cannon", "Triple Cannon", "Tank"];
  const LOSS_OPTIONS = ["None", "Wrong Gate", "Boss Overwhelm", "Obstacle Hit", "Death Gate", "Enemy Overwhelm"];

  const parseDestructions = (seq: string[]) => seq
    .filter(s => s.toLowerCase().includes("destroyed"))
    .map(s => {
      const m = s.match(/^(x\d+|\+\d+)\s+destroyed by\s+(.+?)\s+at\s+(\d+)s/i);
      return m ? { xn: m[1], giant: m[2], seconds: m[3] } : { xn: "x2", giant: "Unknown", seconds: "0" };
    });

  const [chain, setChain] = React.useState<string[]>(d.unit_evolution_chain ?? []);
  const [killCount, setKillCount] = React.useState<number>((d.giant_kills ?? []).length);
  const [destructions, setDestructions] = React.useState<{ xn: string; giant: string; seconds: string }[]>(parseDestructions(d.gate_sequence ?? []));
  const [lossType, setLossType] = React.useState<string>(d.loss_event_type ?? "None");
  const [lossTiming, setLossTiming] = React.useState<string>(d.loss_event_timing_seconds != null ? String(d.loss_event_timing_seconds) : "");
  const [compound, setCompound] = React.useState<boolean>(!!d.is_compound);
  // Deploy Q: producer override for gate upgrade. checkbox toggles field on/off; text input sets the value.
  const [hasGateUpgrade, setHasGateUpgrade] = React.useState<boolean>(!!d.gate_escalation);
  const [gateUpgrade, setGateUpgrade] = React.useState<string>(d.gate_escalation || "");
  const [applying, setApplying] = React.useState(false);

  // Deploy P.1: re-sync local state when the entry prop changes (e.g. lazy-load finishes mid-modal).
  // Without this, ValidationCard's local state stays stale and shows empty form on first card-open.
  // Re-init on entry id change OR when key fields appear (post-hydration).
  // Deploy Q: include gate_escalation in re-sync.
  React.useEffect(() => {
    setChain(d.unit_evolution_chain ?? []);
    setKillCount((d.giant_kills ?? []).length);
    setDestructions(parseDestructions(d.gate_sequence ?? []));
    setLossType(d.loss_event_type ?? "None");
    setLossTiming(d.loss_event_timing_seconds != null ? String(d.loss_event_timing_seconds) : "");
    setCompound(!!d.is_compound);
    setHasGateUpgrade(!!d.gate_escalation);
    setGateUpgrade(d.gate_escalation || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id, JSON.stringify(d.unit_evolution_chain), JSON.stringify(d.giant_kills), d.loss_event_type, d.gate_escalation]);

  const originalDestructions = parseDestructions(d.gate_sequence ?? []);
  const isDirty =
    JSON.stringify(chain) !== JSON.stringify(d.unit_evolution_chain ?? []) ||
    killCount !== (d.giant_kills ?? []).length ||
    JSON.stringify(destructions) !== JSON.stringify(originalDestructions) ||
    lossType !== (d.loss_event_type ?? "None") ||
    lossTiming !== (d.loss_event_timing_seconds != null ? String(d.loss_event_timing_seconds) : "") ||
    compound !== !!d.is_compound ||
    // Deploy Q: gate upgrade dirty checks
    hasGateUpgrade !== !!d.gate_escalation ||
    (hasGateUpgrade && gateUpgrade.trim() !== (d.gate_escalation || ""));

  const apply = async () => {
    setApplying(true);
    try {
      const currentKills = d.giant_kills ?? [];
      let newKills = currentKills.slice(0, killCount);
      while (newKills.length < killCount) {
        newKills = [...newKills, { timestamp_seconds: 0, giant_name: "Unknown", note: "Producer correction — details missing" }];
      }

      // Rebuild gate_sequence: keep non-destructions, merge edited destructions, sort by timestamp
      const nonDestructions = (d.gate_sequence ?? []).filter(s => !s.toLowerCase().includes("destroyed"));
      const newDestructionStrings = destructions
        .filter(r => r.xn.trim() && r.giant.trim() && r.seconds.trim())
        .map(r => `${r.xn} destroyed by ${r.giant} at ${r.seconds}s`);
      const newGateSequence = [...nonDestructions, ...newDestructionStrings].sort((a, b) => {
        const ta = parseInt((a.match(/at (\d+)s/) || [])[1] || "0", 10);
        const tb = parseInt((b.match(/at (\d+)s/) || [])[1] || "0", 10);
        return ta - tb;
      });

      // Deploy Q: gate_escalation override — null when checkbox unchecked, trimmed string when checked.
      const newGateEscalation: string | null = hasGateUpgrade && gateUpgrade.trim().length > 0 ? gateUpgrade.trim() : null;
      const corrected: DNAEntry = {
        ...d,
        unit_evolution_chain: chain.filter(c => c.trim().length > 0),
        giant_kills: newKills,
        gate_sequence: newGateSequence,
        loss_event_type: lossType,
        loss_event_timing_seconds: lossTiming.trim() === "" ? null : Number(lossTiming),
        is_compound: compound,
        gate_escalation: newGateEscalation,
        reanalyzed: true,
      };

      saveLib(lib.map(x => x.id === d.id ? corrected : x));
    } finally {
      setApplying(false);
    }
  };

  const cardStyle: React.CSSProperties = { padding: "12px 14px", background: D.surface, borderRadius: 8, border: `0.5px solid ${D.blueDark}`, borderLeft: `3px solid ${D.blue}`, marginBottom: 14 };
  const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "110px 1fr", gap: 10, alignItems: "start", marginBottom: 10 };
  const fieldLabel: React.CSSProperties = { fontSize: 10, color: D.textDim, textTransform: "uppercase" as const, letterSpacing: ".08em", paddingTop: 4 };
  const inputStyle: React.CSSProperties = { fontSize: 11, padding: "3px 7px", borderRadius: 5, border: `0.5px solid ${D.border2}`, background: D.surface2, color: D.text, fontFamily: "inherit" };
  const ghostBtn: React.CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "transparent", color: D.blue, border: `0.5px dashed ${D.blue}`, cursor: "pointer", fontFamily: "inherit" };
  const removeBtn: React.CSSProperties = { background: "transparent", border: "none", color: D.red, cursor: "pointer", fontSize: 12, padding: "0 3px", fontFamily: "inherit" };

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 10, color: D.blue, letterSpacing: ".08em", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>
        ⚐ Producer review — correct hallucinated fields
      </div>

      {/* 1. unit_evolution_chain */}
      <div style={rowStyle}>
        <div style={fieldLabel}>Unit chain</div>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, alignItems: "center" }}>
          {chain.map((step, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <select value={TIER_OPTIONS.includes(step) ? step : TIER_OPTIONS[0]} onChange={e => setChain(chain.map((c, ci) => ci === i ? e.target.value : c))} style={{ ...inputStyle, fontSize: 10 }}>
                {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={() => setChain(chain.filter((_, ci) => ci !== i))} style={removeBtn} title="Remove tier">✕</button>
              {i < chain.length - 1 && <span style={{ color: D.textDim, fontSize: 10 }}>→</span>}
            </span>
          ))}
          <button onClick={() => setChain([...chain, TIER_OPTIONS[0]])} style={ghostBtn}>+ tier</button>
        </div>
      </div>

      {/* 2. giant_kills count */}
      <div style={rowStyle}>
        <div style={fieldLabel}>Giant kills</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="number" min="0" max="10" value={killCount} onChange={e => setKillCount(Math.max(0, parseInt(e.target.value || "0", 10)))} style={{ ...inputStyle, width: 50 }} />
          <span style={{ fontSize: 10, color: D.textDim }}>kills total in this ad</span>
        </div>
      </div>

      {/* 3. gate destruction moments */}
      <div style={rowStyle}>
        <div style={fieldLabel}>Gate destructions</div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
          {destructions.length === 0 && <span style={{ fontSize: 10, color: D.textDim, fontStyle: "italic" }}>None recorded</span>}
          {destructions.map((row, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" as const }}>
              <input value={row.xn} onChange={e => setDestructions(destructions.map((r, ri) => ri === i ? { ...r, xn: e.target.value } : r))} placeholder="x4" style={{ ...inputStyle, width: 46 }} />
              <span style={{ fontSize: 10, color: D.textDim }}>by</span>
              <input value={row.giant} onChange={e => setDestructions(destructions.map((r, ri) => ri === i ? { ...r, giant: e.target.value } : r))} placeholder="Yellow Normie" style={{ ...inputStyle, flex: 1, minWidth: 90 }} />
              <span style={{ fontSize: 10, color: D.textDim }}>at</span>
              <input type="number" min="0" value={row.seconds} onChange={e => setDestructions(destructions.map((r, ri) => ri === i ? { ...r, seconds: e.target.value } : r))} style={{ ...inputStyle, width: 46 }} />
              <span style={{ fontSize: 10, color: D.textDim }}>s</span>
              <button onClick={() => setDestructions(destructions.filter((_, ri) => ri !== i))} style={removeBtn} title="Remove">✕</button>
            </div>
          ))}
          <button onClick={() => setDestructions([...destructions, { xn: "x2", giant: "", seconds: "0" }])} style={{ ...ghostBtn, alignSelf: "flex-start" }}>+ destruction</button>
        </div>
      </div>

      {/* 4. loss event */}
      <div style={rowStyle}>
        <div style={fieldLabel}>Fail (final)</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <select value={lossType} onChange={e => setLossType(e.target.value)} style={inputStyle}>
            {LOSS_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span style={{ fontSize: 10, color: D.textDim }}>at</span>
          <input type="number" min="0" value={lossTiming} onChange={e => setLossTiming(e.target.value)} placeholder="—" style={{ ...inputStyle, width: 50 }} disabled={lossType === "None"} />
          <span style={{ fontSize: 10, color: D.textDim }}>s</span>
        </div>
      </div>

      {/* Deploy Q: 4b. gate upgrade override */}
      <div style={rowStyle}>
        <div style={fieldLabel}>Gate upgrade</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: D.text }}>
            <input type="checkbox" checked={hasGateUpgrade} onChange={e => setHasGateUpgrade(e.target.checked)} style={{ cursor: "pointer" }} />
            <span>Has xN gate upgrade sequence</span>
          </label>
          {hasGateUpgrade && (
            <input
              type="text"
              value={gateUpgrade}
              onChange={e => setGateUpgrade(e.target.value)}
              placeholder="e.g. x2 → x6 → x60"
              style={{ ...inputStyle, fontSize: 11, minWidth: 200 }}
            />
          )}
        </div>
      </div>

      {/* 5. compound toggle */}
      <div style={rowStyle}>
        <div style={fieldLabel}>Compound ad</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: D.text }}>
          <input type="checkbox" checked={compound} onChange={e => setCompound(e.target.checked)} style={{ cursor: "pointer" }} />
          <span>Mark as compound (multiple ads stitched together)</span>
        </label>
      </div>

      {/* Apply */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, gap: 8 }}>
        <button
          onClick={apply}
          disabled={!isDirty || applying}
          style={{ fontSize: 11, padding: "5px 14px", borderRadius: 6, background: isDirty ? D.blue : D.surface2, color: isDirty ? "#fff" : D.textDim, border: "none", cursor: isDirty && !applying ? "pointer" : "not-allowed", fontWeight: 500, fontFamily: "inherit" }}
        >
          {applying ? "Applying…" : isDirty ? "Apply corrections" : "No changes"}
        </button>
      </div>
    </div>
  );
}


// ─── App ──────────────────────────────────────────────────────────────────────
// ─── Deploy D: Wrap App in ErrorBoundary — uncaught errors show a message instead of white screen ──
export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}

// Deploy G.2: module-level tracker for lazy-loaded entries.
// Two Sets: loading (currently fetching) + attempted (don't retry failed fetches on every re-render).
const loadEntryLazy = { loading: new Set<number>(), attempted: new Set<number>() };

// Deploy G.3: once-per-session backfill flag. Prevents repeated walks.
let backfillFramesOnceRan = false;

// Deploy H: Levelly logo — wordmark where the double-l is replaced by 2 chart bars.
// Default variant = dark mode (app uses dark theme). Sizing scales via `scale` prop.
function LevellyLogo({ scale = 1, variant = "dark" }: { scale?: number; variant?: "light"|"dark" }) {
  // Colors per variant
  const bar = variant === "dark" ? "#38bdf8" : "#0ea5e9";
  const text = variant === "dark" ? "#f0f2f5" : "#1a2332";
  // Text size scales from 28px base
  const fontSize = 28 * scale;
  const barWidth = 9 * scale;
  const bar1Height = 11 * scale;
  const bar2Height = 19 * scale;
  const barGap = 3 * scale;
  const bar2Offset = 3 * scale; // how much higher bar-2 sits
  const barRadius = 2 * scale;
  const letterSpacing = -1 * scale;
  return (
    <div aria-label="Levelly" role="img" style={{ display:"inline-flex", alignItems:"flex-end", lineHeight:1 }}>
      <span style={{ fontSize, fontWeight:800, letterSpacing, color:text, fontFamily:"Inter, system-ui, sans-serif" }}>leve</span>
      <div style={{ display:"flex", gap:barGap, alignItems:"flex-end", margin:`0 ${1 * scale}px`, paddingBottom:`${2 * scale}px` }}>
        <div style={{ width:barWidth, height:bar1Height, background:bar, opacity:0.45, borderRadius:`${barRadius}px ${barRadius}px 1px 1px` }} />
        <div style={{ width:barWidth, height:bar2Height, background:bar, borderRadius:`${barRadius}px ${barRadius}px 1px 1px`, position:"relative" as const, bottom:bar2Offset }} />
      </div>
      <span style={{ fontSize, fontWeight:800, letterSpacing, color:text, fontFamily:"Inter, system-ui, sans-serif" }}>y</span>
    </div>
  );
}

function AppInner() {
  const [lib, setLib] = useState<DNAEntry[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  // Deploy T: track entries that are in localStorage but not in cloud (silent cloud-write failures).
  // Persists in localStorage so it survives reloads. User sees a banner with retry option.
  const [pendingCloudSync, setPendingCloudSync] = useState<Array<string | number>>(() => {
    try { return JSON.parse(localStorage.getItem("levelly_pending_cloud_sync") || "[]"); }
    catch { return []; }
  });
  const [syncingPending, setSyncingPending] = useState(false);
  const updatePendingSync = React.useCallback((next: Array<string | number>) => {
    const dedupe = Array.from(new Set(next.map(id => String(id))));
    setPendingCloudSync(dedupe);
    try { localStorage.setItem("levelly_pending_cloud_sync", JSON.stringify(dedupe)); } catch {}
  }, []);
  const [cloudStatus, setCloudStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [libPanelOpen, setLibPanelOpen] = useState(false);
  const [briefPanelOpen, setBriefPanelOpen] = useState(false);
  const [analysePanelOpen, setAnalysePanelOpen] = useState(false);
  // Track which panel was last opened — content persists when switching panels
  const [lastOpenPanel, setLastOpenPanel] = useState<"brief"|"analyse"|"lib"|null>(null);
  const [expandedDNA, setExpandedDNA] = useState<number|null>(null);
  // Deploy H: tier filter moved from single-select (libSort) to multi-select (libTiers) to match other filters.
  // Empty array = no tier filter applied. Sort-by-spend etc. now handled by separate libSortMode.
  const [libTiers, setLibTiers] = useState<string[]>([]);
  // Deploy H: separate sort mode — "newest" | "oldest" | "spend". Default newest.
  const [libSortMode, setLibSortMode] = useState<"newest"|"oldest"|"spend">("newest");
  // Deploy E (Bug 1 fix): deep link — closure-trap-free rewrite
  // Old version polled with setInterval but captured stale lib from closure.
  // New version re-runs on lib.length changes, so closure refreshes when lib actually populates.
  // Ref guard prevents re-opening modal on subsequent lib changes (e.g., after user adds an entry).
  const deepLinkProcessedRef = React.useRef(false);
  React.useEffect(() => {
    if (deepLinkProcessedRef.current) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const entryId = params.get("entry");
      if (entryId === null) { deepLinkProcessedRef.current = true; return; }
      // Deploy F Bug 3 fix: entry IDs are floats (Date.now() + Math.random() → "1774790686389.984"). parseInt truncates the decimal → never matches. Use parseFloat.
      const id = parseFloat(entryId);
      if (isNaN(id)) { deepLinkProcessedRef.current = true; return; }
      // Wait for both flags before searching (lib.length > 0 catches the IDB merge timing)
      if (!libraryLoaded) return;
      const found = lib.find(e => e.id === id);
      if (found) {
        setLibPanelOpen(true);
        setLibModalId(id);
        deepLinkProcessedRef.current = true;
      } else if (lib.length > 0) {
        // Library is loaded with content but entry not found — give up (e.g., shared link to deleted entry)
        deepLinkProcessedRef.current = true;
      }
      // else: lib still empty post-load (cloud miss?), wait for next render
    } catch { deepLinkProcessedRef.current = true; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryLoaded, lib.length]);
  // Deploy C: library search + multi-filter + fullscreen modal state
  const [libSearch, setLibSearch] = useState("");
  const [libFilters, setLibFilters] = useState<{ ad_types: string[]; statuses: string[]; spend_tiers: string[]; biomes: string[] }>({ ad_types: [], statuses: [], spend_tiers: [], biomes: [] });
  const [libModalId, setLibModalId] = useState<number|null>(null);
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
  // Deploy BC2 P3: multi-image-ref support. Up to 4 image refs per brief, all propagate to renders + brief prompt.
  // Video ref stays in `briefRef` (single — only one video can be analyzed for DNA).
  // Image refs use this separate array. Either or both can be active.
  const [briefImageRefs, setBriefImageRefs] = useState<{ base64: string; mimeType: string; name: string }[]>([]);
  // Deploy BC2 P4: ad_type toggle for video ref. When user drops a video, default to "competitor" (universal
  // analyzer strips MOC-specific vocab). User can flip to "moc" if dropping a MOC-internal clip — runs MOC
  // analyzer, extracts MOC-vocab DNA (cannon tiers, gate sequences, biome, etc) for richer brief context.
  const [briefRefAdType, setBriefRefAdType] = useState<"moc" | "competitor">("competitor");
  const [lastCompetitorEntry, setLastCompetitorEntry] = useState<DNAEntry | null>(null);
  const [competitorExpanded, setCompetitorExpanded] = useState(false);
  const [liftIntent, setLiftIntent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [briefErr, setBriefErr] = useState("");
  const [briefProgress, setBriefProgress] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [briefAnalysis, setBriefAnalysis] = useState<BriefAnalysis|null>(null);
  // Deploy I: tracks which concepts have "More details" section expanded (session state only, not persisted).
  const [briefDetailsExpanded, setBriefDetailsExpanded] = useState<Record<number, boolean>>({});
  // Deploy J: concept accent colors — 4 rotating accents cycled by concept index. Makes 4 cards visually distinct at a glance.
  const CONCEPT_ACCENTS = [
    { border: D.blueDark, bg: D.blueBg,   text: D.blue,   label: "1" },
    { border: D.goldBdr,  bg: D.goldBg,   text: D.gold,   label: "2" },
    { border: D.purpleBdr,bg: D.purpleBg, text: D.purple, label: "3" },
    { border: D.greenBdr, bg: D.greenBg,  text: D.green,  label: "4" },
  ];
  // Deploy O: bulk competitor upload state — when 2+ files are dropped, open BulkUploadModal instead.
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  // Deploy K: cached market intelligence envelope loaded from /api/load-market-intel.
  // Synthesized from competitor library entries via /api/refresh-market-intel. Injected into briefSystem.
  const [marketIntel, setMarketIntel] = useState<any | null>(null);
  const [marketIntelRefreshing, setMarketIntelRefreshing] = useState(false);
  const [marketIntelError, setMarketIntelError] = useState<string>("");
  // Deploy L: snapshot of marketIntel AT the moment of last brief generation. Used to show "📊 Intel used" badge
  // on generated concepts so user can audit what Claude was given.
  const [briefIntelSnapshot, setBriefIntelSnapshot] = useState<any | null>(null);
  const [showIntelPanel, setShowIntelPanel] = useState(false);
  // Deploy O: bulk upload helper — calls the existing handleUpload pipeline once per file with competitor cfg.
  // handleUpload's signature expects a React.ChangeEvent<HTMLInputElement>, so we construct a minimal fake event
  // exposing target.files via Array.from(...). Shares game_title via upload_context (same convention as Deploy N).
  const handleBulkUploadOne = React.useCallback(async (file: File, gameTitle: string) => {
    const contextPrefix = gameTitle.trim() ? `[Game: ${gameTitle.trim()}] ` : "";
    const cfg: UploadConfig = { tier: "inspiration", ad_type: "competitor", context: contextPrefix, manual_frames: [] };
    // Fake event: handleUpload uses Array.from(e.target.files ?? []), so target.files needs to be array-like.
    // We pass a single-item array masquerading as FileList. Object.assign to satisfy Array.from's iteration.
    const fakeFiles = Object.assign([file], { item: (i: number) => i === 0 ? file : null, length: 1 });
    const fakeEvent = { target: { files: fakeFiles as unknown as FileList } } as React.ChangeEvent<HTMLInputElement>;
    await handleUpload(fakeEvent, cfg);
  }, []);
  const refreshMarketIntel = React.useCallback(async () => {
    setMarketIntelRefreshing(true); setMarketIntelError("");
    try {
      const r = await fetch("/api/refresh-market-intel", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setMarketIntel(data);
      console.log("[Levelly K] Market intel refreshed:", { competitors: data.competitor_count, titles: data.titles_covered });
    } catch (err: any) {
      console.error("[Levelly K] refreshMarketIntel failed:", err);
      setMarketIntelError(err.message || "Refresh failed");
    } finally { setMarketIntelRefreshing(false); }
  }, []);
  // Deploy K: auto-refresh market intel when competitor library has grown by ≥20 since last sync.
  // Runs ONLY when marketIntel already exists (never auto-fires on fresh install — user triggers first time manually).
  React.useEffect(() => {
    if (!marketIntel) return;
    if (marketIntelRefreshing) return;
    const currentCompCount = lib.filter(d => d.ad_type === "competitor").length;
    const syncedCount = (marketIntel as any)?.competitor_count ?? 0;
    const delta = currentCompCount - syncedCount;
    if (delta >= 20) {
      console.log(`[Levelly K] Auto-refresh triggered: ${delta} new competitors since last sync`);
      refreshMarketIntel();
    }
  }, [lib, marketIntel, marketIntelRefreshing, refreshMarketIntel]);
  const [expandedConcept, setExpandedConcept] = useState<number|null>(null);
  const [feedbackSessionId, setFeedbackSessionId] = useState<string>("");
  const [conceptVotes, setConceptVotes] = useState<Record<number, "up" | "down">>({});
  const [conceptNotes, setConceptNotes] = useState<Record<number, string>>({});
  const submitFeedback = useCallback(async (ci: number, conceptTitle: string, vote: "up" | "down", note: string) => {
    try {
      await fetch("/api/brief-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: feedbackSessionId,
          concept_index: ci,
          concept_title: conceptTitle,
          vote,
          note: note.trim() || undefined,
          segment,
          iterate_from: iterateFrom.trim() || undefined,
        }),
      });
    } catch { /* fire-and-forget */ }
  }, [feedbackSessionId]);
  const [refineTexts, setRefineTexts] = useState<Record<number,string>>({});
  // Deploy F: per-concept annotation reference image for refine — user drops a screenshot/marker, Gemini uses it as visual guidance
  const [refineRefs, setRefineRefs] = useState<Record<number, { base64: string; mimeType: string; name: string } | null>>({});
  const handleRefineRefDrop = async (ci: number, file: File) => {
    if (!file.type.startsWith("image/")) { setRefineErr(p => ({ ...p, [ci]: "Only image files supported as refine annotation" })); return; }
    try {
      const base64 = await fileToBase64(file);
      setRefineRefs(p => ({ ...p, [ci]: { base64, mimeType: file.type, name: file.name } }));
      setRefineErr(p => ({ ...p, [ci]: "" }));
    } catch (err: any) {
      setRefineErr(p => ({ ...p, [ci]: "Failed to read annotation: " + err.message }));
    }
  };
  const [refineTargetScene, setRefineTargetScene] = useState<Record<number,string>>({});
  const [copiedConcept, setCopiedConcept] = useState<number|null>(null);
  const [refining, setRefining] = useState<Record<number,boolean>>({});
  const [refineErr, setRefineErr] = useState<Record<number,string>>({});
  const [renderingScene, setRenderingScene] = useState<Record<string,boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // Ref to prevent stale cloud data from overwriting fresh upload results
  const uploadCompletedRef = React.useRef(false);

  // Deploy H.1: drag-and-drop state. When a video is dropped on the Analyse card,
  // we capture it here, open the modal, and skip the file-picker step on confirm.
  const [droppedFile, setDroppedFile] = React.useState<File | null>(null);
  const [homeDropActive, setHomeDropActive] = React.useState(false);

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

    // Deploy G.2: kick off silent migration on load (idempotent — no-op if already migrated)
    // Does not block UI; fire-and-forget. Console.log for devtools visibility per Dmitriy's "silent" choice.
    fetch("/api/migrate-library", { method: "POST" })
      .then(r => r.ok ? r.json() : null)
      .then(res => { if (res?.migrated) console.log("[Levelly G.2] Migration ran:", res); else if (res) console.log("[Levelly G.2] Migration status:", res); })
      .catch(err => console.warn("[Levelly G.2] Migration call failed (non-fatal — old blob still works):", err));
    // Deploy K: load cached market intelligence (if it exists)
    fetch("/api/load-market-intel")
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === "object" && data.digest) {
          setMarketIntel(data);
          console.log(`[Levelly K] Loaded market intel: ${data.competitor_count} competitors, synced ${data.synced_at}`);
        }
      })
      .catch(err => console.warn("[Levelly K] load-market-intel failed (non-fatal):", err));

    // Deploy G.3: primary load from /api/load-index (fast summary) with fallback to /api/load-library.
    fetch("/api/load-index")
      .then(r=>{ if(!r.ok) throw new Error(); return r.json(); })
      .then((indexData: any[])=>{
        // If index returned empty but we know entries exist (e.g. first load post-G.3 before migration writes flag),
        // fall back to full load-library.
        if(!Array.isArray(indexData) || indexData.length === 0){
          console.log("[Levelly G.3] load-index empty — falling back to load-library");
          return fetch("/api/load-library").then(r => r.ok ? r.json() : []);
        }
        console.log(`[Levelly G.3] Loaded ${indexData.length} entries from index`);
        return indexData;
      })
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
            // Deploy U: cloud index fields override localStorage for matching entries.
            // Index summary fields (cloud_thumbnail, spend_networks, spend_window_days, has_frames,
            // hook_description, is_compound, etc) are authoritative from cloud. localStorage retains
            // full-detail fields (auto_frames, gate_sequence, etc — which cloud index does not store).
            // Pre-U: filtered out cloud entries when localStorage had same ID, leaving lib state with
            // stale localStorage data — caused thumbnails written by Sync to disappear after refresh.
            const cloudOnlyNew: DNAEntry[] = [];
            const cloudOverrides = new Map<any, Partial<DNAEntry>>();
            for (const cloudEntry of data as DNAEntry[]) {
              const matchedLocal =
                localById.get(cloudEntry.id) ||
                (cloudEntry.creative_id?.trim() ? localByCreativeId.get(cloudEntry.creative_id.trim()) : undefined) ||
                localByTitleFile.get(`${cloudEntry.title||""}__${cloudEntry.file_name||""}`);
              if (matchedLocal) {
                cloudOverrides.set(matchedLocal.id, cloudEntry);
              } else {
                cloudOnlyNew.push(cloudEntry);
              }
            }
            // Deploy BC1.3: revert BC1's "local wins if non-empty" logic. BC1 was treating the symptom
            // (cloud wiping local fields after repair-index regenerated stale summaries) instead of the
            // cause. BC1.1 fixed the actual cause by adding mechanic_family/hook_format/champions_unverified/
            // game_title to repair-index + save-entry summaries — cloud is now reliable. With cloud reliable,
            // BC1's local-wins logic became actively harmful: it preserved stale localStorage values when
            // cloud was up-to-date (e.g. user changed tier→cloud got it, but localStorage stayed stale somehow,
            // and BC1 trusted localStorage over cloud).
            //
            // Restored: original Deploy U behavior — cloud authoritative for summary fields.
            // For auto_frames specifically: prefer localStorage's version IF it has any image_data
            // (preserves IDB-backed frames). Otherwise take cloud's version.
            const localWithCloudFields = localParsed.map((lsEntry: DNAEntry) => {
              const cloudOverride = cloudOverrides.get(lsEntry.id);
              if (!cloudOverride) return lsEntry;
              const lsHasFrameData = Array.isArray(lsEntry.auto_frames) && lsEntry.auto_frames.some((f: any) => f && f.image_data);
              const merged: any = { ...lsEntry, ...cloudOverride };
              if (lsHasFrameData) merged.auto_frames = lsEntry.auto_frames;
              return merged as DNAEntry;
            });
            const merged = sanitizeLib([...localWithCloudFields, ...cloudOnlyNew]);
            // Deploy BC1.2: write merged state back to localStorage so future saveLib calls work from
            // cloud-corrected data. Without this, localStorage stays stale until next user action,
            // and intermittent saves can persist the stripped state to cloud (e.g. lazy-load timing).
            try {
              const withoutFrames = merged.map((e: DNAEntry) => ({
                ...e,
                auto_frames: e.auto_frames?.map((f: any) => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance }))
              }));
              localStorage.setItem("levelly_dna_library", JSON.stringify(withoutFrames));
            } catch {}
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
      setLibraryLoaded(true);

      // Deploy G.3.1: frame backfill — fixed to read IDB directly + repair-index flags first.
      // Two fixes vs G.3:
      //  (a) Read from IDB via mergeFramesFromIDB (not libPrevRef which was stale at backfill time)
      //  (b) Call /api/repair-index first so has_frames flags reflect actual cloud blob state
      //      (needed because entries saved via G.2's save-entry pre-G.3 didn't set has_frames)
      if (!backfillFramesOnceRan) {
        backfillFramesOnceRan = true;
        setTimeout(async () => {
          try {
            // Step 1: Repair index so has_frames flags are accurate
            try {
              const repairResp = await fetch("/api/repair-index", { method: "POST" });
              if (repairResp.ok) {
                const repairRes = await repairResp.json();
                console.log("[Levelly G.3.1] repair-index result:", repairRes);
              } else {
                console.warn("[Levelly G.3.1] repair-index call failed (continuing anyway)");
              }
            } catch (err) {
              console.warn("[Levelly G.3.1] repair-index error (continuing anyway):", err);
            }

            // Step 2: Re-fetch index AFTER repair so we see correct has_frames flags
            const idxResp = await fetch("/api/load-index");
            if (!idxResp.ok) return;
            const index: any[] = await idxResp.json();
            if (!Array.isArray(index) || index.length === 0) return;

            // Step 3: Read IDB frames directly — fixes stale-ref bug from G.3.
            // mergeFramesFromIDB(index) returns entries keyed by id, filling in auto_frames from IDB.
            // We don't need full lib state — just a map of id → frames from local IDB.
            const indexAsEntries = index.map(s => ({ id: s.id, auto_frames: [] })) as any[];
            const withFrames = await mergeFramesFromIDB(indexAsEntries as DNAEntry[]).catch(() => [] as DNAEntry[]);
            const localFrameMap = new Map<number | string, any[]>();
            for (const e of withFrames) {
              const withData = e.auto_frames?.filter((f: any) => f.image_data);
              if (withData && withData.length > 0) localFrameMap.set(e.id, e.auto_frames!);
            }
            console.log(`[Levelly G.3.1] Found ${localFrameMap.size} entries with local frame data in IDB`);

            // Step 4: Intersect index (needs frames) with localFrameMap (has frames) — that's our backfill set
            const needsBackfill = index.filter(s => !s.has_frames && localFrameMap.has(s.id));
            if (needsBackfill.length === 0) {
              console.log("[Levelly G.3.1 backfill] Nothing to push — either all entries already have cloud frames, or no matching local frames in IDB");
              return;
            }
            console.log(`[Levelly G.3.1 backfill] Will push frames for ${needsBackfill.length} entries to cloud`);

            let successCount = 0;
            for (let i = 0; i < needsBackfill.length; i++) {
              const summary = needsBackfill[i];
              const localFrames = localFrameMap.get(summary.id);
              if (!localFrames) continue;
              try {
                // Fetch current cloud entry (metadata, possibly no frames)
                const cloudResp = await fetch(`/api/load-entry?id=${summary.id}`);
                if (!cloudResp.ok) { console.warn(`[Levelly G.3.1 backfill] Could not fetch cloud entry ${summary.id}`); continue; }
                const cloudEntry: any = await cloudResp.json();
                // Merge: cloud data + our local frames
                const merged = { ...cloudEntry, auto_frames: localFrames };
                const pushResp = await fetch("/api/save-entry", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ entry: merged })
                });
                if (pushResp.ok) {
                  successCount++;
                  console.log(`[Levelly G.3.1 backfill] Pushed frames for ${summary.title || summary.id} (${successCount}/${needsBackfill.length})`);
                } else {
                  console.warn(`[Levelly G.3.1 backfill] save-entry failed for ${summary.id}`);
                }
              } catch (err) {
                console.warn(`[Levelly G.3.1 backfill] Error for ${summary.id}:`, err);
              }
              if (i < needsBackfill.length - 1) await new Promise(r => setTimeout(r, 2000));
            }
            console.log(`[Levelly G.3.1 backfill] Complete — ${successCount}/${needsBackfill.length} pushed`);
          } catch (err) {
            console.warn("[Levelly G.3.1 backfill] Top-level error (non-fatal):", err);
          }
        }, 3000);
      }
      })
      .catch(()=>{ try { const l=localStorage.getItem("levelly_dna_library"); if(l) setLib(sanitizeLib(JSON.parse(l))); } catch {} setLibraryLoaded(true); });
  },[]);

  // Deploy G.2: saveLib with diff-based dual-write.
  // - Old path: full library POSTed to /api/save-library (unchanged — backcompat for 30 days)
  // - New path: only CHANGED entries POSTed to /api/save-entry. Deletions to /api/delete-entry.
  //   Per-entry blobs include FULL frames (image_data) for cache-clear survivability.
  // Deploy T: on libraryLoaded, detect any localStorage-only entries (cloud_index doesn't have them)
  // and add them to pendingCloudSync. Recovers entries silently lost during pre-T cloud-write failures.
  React.useEffect(() => {
    if (!libraryLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const cloudResp = await fetch("/api/load-index");
        if (!cloudResp.ok) return;
        const cloudIndex: any[] = await cloudResp.json();
        if (!Array.isArray(cloudIndex)) return;
        const cloudIds = new Set(cloudIndex.map(e => String(e.id)));
        const ls = (() => {
          try { return JSON.parse(localStorage.getItem("levelly_dna_library") || "[]"); }
          catch { return []; }
        })();
        if (!Array.isArray(ls)) return;
        const orphanIds = ls
          .filter((e: any) => e && typeof e.id !== "undefined" && !cloudIds.has(String(e.id)))
          .map((e: any) => String(e.id));
        if (cancelled) return;
        if (orphanIds.length > 0) {
          console.warn(`[Levelly T] Detected ${orphanIds.length} localStorage-only entries (not in cloud). Banner will offer retry.`);
          // Merge with any existing pending list
          const existing = (() => {
            try { return JSON.parse(localStorage.getItem("levelly_pending_cloud_sync") || "[]"); }
            catch { return []; }
          })();
          const combined = Array.from(new Set([...existing.map(String), ...orphanIds]));
          try { localStorage.setItem("levelly_pending_cloud_sync", JSON.stringify(combined)); } catch {}
          setPendingCloudSync(combined);
        }
      } catch (err) {
        console.warn("[Levelly T] orphan detection failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [libraryLoaded]);
  // libPrevRef tracks the previous state so we can compute the diff on each save.
  const libPrevRef = React.useRef<DNAEntry[]>([]);
  // Deploy Q: libRef tracks CURRENT lib state, updated on every lib change (not just length changes).
  // Used by handleUpload to read latest lib at call time instead of via closure capture.
  // Critical for safety when handleUpload is called concurrently or when other state mutations interleave.
  const libRef = React.useRef<DNAEntry[]>([]);
  const saveLib = useCallback((updated: DNAEntry[])=>{
    const prev = libPrevRef.current;
    setLib(updated);
    libPrevRef.current = updated;
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
      // ── Deploy G.3: per-entry writes only. /api/save-library no longer called. ──
      // Diff vs prev state: changed/new IDs → save-entry (with full frames, up to ~500KB each).
      // Removed IDs → delete-entry. Old /api/save-library function stays in codebase for rollback but is dormant.
      const prevById = new Map(prev.map(e => [e.id, e]));
      const updatedById = new Map(updated.map(e => [e.id, e]));
      const toSave: DNAEntry[] = [];
      const toDelete: (number | string)[] = [];
      for (const entry of updated) {
        const prevEntry = prevById.get(entry.id);
        if (!prevEntry || JSON.stringify(prevEntry) !== JSON.stringify(entry)) {
          toSave.push(entry);
        }
      }
      for (const prevEntry of prev) {
        if (!updatedById.has(prevEntry.id)) toDelete.push(prevEntry.id);
      }
      // Deploy BC2 P2: cloud-write failure recovery. Pre-BC2, individual save-entry failures were caught
      // by Promise.all.catch but only logged + status-flagged. The failed entry's localStorage state was
      // left "ahead" of cloud — next refresh trusted cloud (BC1.3), reverting user's change silently.
      // Now: each save tracks its own success. Failed IDs are added to pendingCloudSync (Deploy T's banner)
      // so user gets explicit retry affordance instead of silent data loss.
      const saves = toSave.map(entry =>
        fetch("/api/save-entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entry }) })
          .then(r => {
            if (!r.ok) {
              console.warn(`[Levelly BC2 P2] save-entry HTTP ${r.status} for ${entry.id}`);
              return { id: entry.id, ok: false } as const;
            }
            return { id: entry.id, ok: true } as const;
          })
          .catch(err => {
            console.warn(`[Levelly BC2 P2] save-entry threw for ${entry.id}:`, err);
            return { id: entry.id, ok: false } as const;
          })
      );
      // Deploy BC2.1: deletes also need retry + failure tracking. Pre-BC2.1, single .catch swallowed
      // any delete failure silently. Cloud kept entries that user removed locally → reappeared on refresh.
      // Now: 3 retries with backoff, failed delete IDs tracked in pendingCloudSync (with "delete:" prefix
      // so the retry handler knows to call delete-entry instead of save-entry).
      const deletes = toDelete.map(async id => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const r = await fetch("/api/delete-entry?id=" + id, { method: "DELETE" });
            if (r.ok) return { id, ok: true } as const;
            console.warn(`[Levelly BC2.1] delete-entry HTTP ${r.status} for ${id} (attempt ${attempt}/3)`);
          } catch (err) {
            console.warn(`[Levelly BC2.1] delete-entry threw for ${id} (attempt ${attempt}/3):`, err);
          }
          if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
        }
        return { id, ok: false } as const;
      });
      Promise.all(saves)
        .then(saveResults => {
          const failedIds = saveResults.filter(r => !r.ok).map(r => String(r.id));
          if (failedIds.length > 0) {
            // Add failed entry IDs to pendingCloudSync — Deploy T's retry banner picks them up.
            try {
              const stored = JSON.parse(localStorage.getItem("levelly_pending_cloud_sync") || "[]");
              const combined = Array.from(new Set([...(stored as any[]).map(String), ...failedIds]));
              localStorage.setItem("levelly_pending_cloud_sync", JSON.stringify(combined));
              setPendingCloudSync(combined);
            } catch (e) { console.warn("[Levelly BC2 P2] failed to persist pending list:", e); }
            setCloudStatus("error");
            setTimeout(() => setCloudStatus("idle"), 3000);
          } else {
            setCloudStatus("saved");
            setTimeout(() => setCloudStatus("idle"), 2000);
          }
          // Deploy BC2.1: deletes use same pendingCloudSync surfacing as saves (P2).
          // Failed delete IDs prefixed with "delete:" so the retry handler distinguishes them from
          // failed saves (which use raw IDs). Banner counts both.
          return Promise.all(deletes).then(deleteResults => {
            const failedDeletes = deleteResults.filter(r => !r.ok).map(r => `delete:${r.id}`);
            if (failedDeletes.length > 0) {
              try {
                const stored = JSON.parse(localStorage.getItem("levelly_pending_cloud_sync") || "[]");
                const combined = Array.from(new Set([...(stored as any[]).map(String), ...failedDeletes]));
                localStorage.setItem("levelly_pending_cloud_sync", JSON.stringify(combined));
                setPendingCloudSync(combined);
              } catch (e) { console.warn("[Levelly BC2.1] failed to persist pending delete list:", e); }
              setCloudStatus("error");
              setTimeout(() => setCloudStatus("idle"), 3000);
            }
          });
        });
    }
  },[libraryLoaded]);

  // Keep libPrevRef in sync on initial load (otherwise first save treats everything as new)
  React.useEffect(() => { libPrevRef.current = lib; }, [lib.length === 0 ? 0 : 1]);
  // Deploy Q: keep libRef in sync on EVERY lib change. Used by handleUpload + appendEntryToCloud
  // for stable, fresh state access without closure capture.
  React.useEffect(() => { libRef.current = lib; }, [lib]);

  // Deploy Q: appendEntryToCloud writes a single entry directly to /api/save-entry. Bypasses saveLib's
  // diff math entirely — no risk of treating a parallel-added entry as "deleted" because libPrevRef was stale.
  // Per-entry POST is the atomic cloud unit. localStorage and lib state get updated separately via saveLibAppend.
  const appendEntryToCloud = React.useCallback(async (entry: DNAEntry) => {
    try {
      const resp = await fetch("/api/save-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry }),
      });
      if (!resp.ok) throw new Error(`save-entry HTTP ${resp.status}`);
      setCloudStatus("saved");
      setTimeout(() => setCloudStatus("idle"), 2000);
    } catch (err) {
      console.warn("[Levelly Q] appendEntryToCloud failed:", err);
      setCloudStatus("error");
      setTimeout(() => setCloudStatus("idle"), 3000);
      throw err;
    }
  }, []);

  // Deploy Q: saveLibAppend uses functional setLib(prev => ...) so it ALWAYS reads the latest state,
  // even when called from a stale closure (e.g. parallel handleUpload calls or interleaved state changes).
  // Three-step write:
  //   1) Functional setLib appends entry — guaranteed correct concurrent-safe state update
  //   2) libPrevRef + libRef updated immediately so subsequent diff/saves see correct previous state
  //   3) appendEntryToCloud POSTs the new entry directly (no diff)
  // localStorage write happens inside the setLib callback so it sees the same prev as the state update.
  const saveLibAppend = React.useCallback(async (newEntry: DNAEntry) => {
    let nextLib: DNAEntry[] = [];
    setLib(prev => {
      nextLib = [...prev, newEntry];
      libPrevRef.current = nextLib;
      libRef.current = nextLib;
      // Update localStorage with stripped frames (same convention as saveLib)
      try {
        const withoutFrames = nextLib.map(e => ({
          ...e,
          auto_frames: e.auto_frames?.map((f: FrameExtraction) => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance })),
        }));
        localStorage.setItem("levelly_dna_library", JSON.stringify(withoutFrames));
      } catch {}
      return nextLib;
    });
    // Cache new entry's frames in IDB (same convention as saveLib)
    saveFramesToIDB([newEntry]);
    // Cloud write — direct POST, atomic, no diff
    if (libraryLoaded) {
      setCloudStatus("saving");
      try {
        await appendEntryToCloud(newEntry);
      } catch {
        // Deploy T: track failed cloud write so user sees a persistent banner with retry option.
        // appendEntryToCloud already logged + set error status. Don't rethrow — local state is correct,
        // user can retry via "Sync to cloud" banner that appears when this list is non-empty.
        const currentPending = (() => {
          try { return JSON.parse(localStorage.getItem("levelly_pending_cloud_sync") || "[]"); }
          catch { return []; }
        })();
        const updated = [...currentPending, String(newEntry.id)];
        const dedupe = Array.from(new Set(updated));
        try { localStorage.setItem("levelly_pending_cloud_sync", JSON.stringify(dedupe)); } catch {}
        setPendingCloudSync(dedupe);
      }
    }
  }, [libraryLoaded, appendEntryToCloud]);

  const exportLibrary=()=>{ const blob=new Blob([JSON.stringify(lib,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`levelly-dna-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url); };
  const importLibrary=(e: React.ChangeEvent<HTMLInputElement>)=>{ const file=e.target.files?.[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try { const p=JSON.parse(reader.result as string); if(!Array.isArray(p)) throw new Error(); const m=[...lib]; p.forEach((entry: DNAEntry)=>{ if(!m.find(x=>x.id===entry.id)) m.push(sanitizeDNA(entry) as DNAEntry); }); saveLib(m); } catch { alert("Import failed."); } }; reader.readAsText(file); e.target.value=""; };

  // Deploy BC2 P1: defensive merge helper. Filters out null/undefined/empty-array/empty-string values
  // from an object so they don't overwrite good values when spread on top of an existing entry.
  // Used during re-analyze to prevent Gemini's sparse JSON responses from wiping populated fields.
  const filterEmptyForMerge = (obj: any): any => {
    if (!obj || typeof obj !== "object") return {};
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      const isEmpty = v === undefined || v === null
        || (Array.isArray(v) && v.length === 0)
        || (typeof v === "string" && v.trim() === "");
      if (!isEmpty) out[k] = v;
    }
    return out;
  };

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
      // Deploy P: when entry has reanalyzed:true (producer reviewed it via ValidationCard), preserve
      // producer-touched fields. Producer's intent supersedes any new Gemini analysis. Only re-analyze
      // wipes producer corrections if reanalyzed flag is false (i.e. card was never producer-reviewed).
      // Deploy P.1: gate_escalation added to preserved list — re-analyze should not re-add this field if
      // producer already corrected gate_sequence (which is the source of the chip).
      const preservedFields: any = entry.reanalyzed === true ? {
        unit_evolution_chain: entry.unit_evolution_chain,
        giant_kills: entry.giant_kills,
        gate_sequence: entry.gate_sequence,
        gate_escalation: entry.gate_escalation,
        loss_event_type: entry.loss_event_type,
        loss_event_timing_seconds: entry.loss_event_timing_seconds,
        is_compound: entry.is_compound,
        mechanic_family: (entry as any).mechanic_family,
      } : {};
      // Deploy BC1.2: ALWAYS preserve producer-set tags (mechanic_family, hook_format) regardless of
      // reanalyzed flag. Pre-BC1.2, these were only preserved when entry.reanalyzed === true. But manual
      // tagging via dropdown doesn't set reanalyzed, so the FIRST re-analyze after manual tag wiped it.
      const alwaysPreserve: any = {};
      if ((entry as any).mechanic_family) alwaysPreserve.mechanic_family = (entry as any).mechanic_family;
      if ((entry as any).hook_format) alwaysPreserve.hook_format = (entry as any).hook_format;
      // Deploy BC2 P1: defensive re-analyze merge. Filter null/empty values from `dna` BEFORE spread.
      // Pre-BC2, Gemini's text-only / sparse responses with hook_type=null, pacing=null etc. were
      // overwriting entry's good values via spread. Result: re-analyze wiped analysis fields permanently
      // (cloud blob got nulls, repair-index propagated nulls to summary). Now: only non-empty dna keys
      // survive into the spread — entry's existing values are preserved when dna lacks them.
      const dnaFiltered = filterEmptyForMerge(dna);
      return {...entry, ...dnaFiltered, ...preservedFields, ...alwaysPreserve, id:entry.id, reanalyzed:true, added_at:entry.added_at, file_name:entry.file_name, tier:entry.tier, ad_type:entry.ad_type, auto_frames:entry.auto_frames};
    } else {
      // Fallback: text-only re-analysis if no frame images stored
      const stripped = { ...entry, auto_frames: entry.auto_frames?.map(f => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance })) };
      const corrected = sanitizeDNA(await callGeminiDirect(reanalysisSystem(stripped),[{text:`Re-analyze: ${entry.title}`}]));
      // Deploy P: same producer-preservation logic for text-only fallback path.
      // Deploy P.1: gate_escalation added.
      const preservedFieldsText: any = entry.reanalyzed === true ? {
        unit_evolution_chain: entry.unit_evolution_chain,
        giant_kills: entry.giant_kills,
        gate_sequence: entry.gate_sequence,
        gate_escalation: entry.gate_escalation,
        loss_event_type: entry.loss_event_type,
        loss_event_timing_seconds: entry.loss_event_timing_seconds,
        is_compound: entry.is_compound,
        mechanic_family: (entry as any).mechanic_family,
      } : {};
      // Deploy BC1.2: same always-preserve logic for text-only path.
      const alwaysPreserveText: any = {};
      if ((entry as any).mechanic_family) alwaysPreserveText.mechanic_family = (entry as any).mechanic_family;
      if ((entry as any).hook_format) alwaysPreserveText.hook_format = (entry as any).hook_format;
      // Deploy BC2 P1: defensive merge for text-only path (same fix as frame-path above).
      const correctedFiltered = filterEmptyForMerge(corrected);
      return {...entry, ...correctedFiltered, ...preservedFieldsText, ...alwaysPreserveText, id:entry.id, reanalyzed:true, added_at:entry.added_at, file_name:entry.file_name, tier:entry.tier, ad_type:entry.ad_type, auto_frames:entry.auto_frames};
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

  // Deploy E: bulk-sync cloud thumbnails for entries missing them (one-time migration helper)
  const [syncingThumbs, setSyncingThumbs] = React.useState(false);
  const [syncProgress, setSyncProgress] = React.useState("");
  // Deploy AA3: recover frames from IndexedDB → cloud for entries where cloud lost frames.
  // For each lib entry, check IDB. If IDB has frames with image_data AND cloud blob is missing
  // frames (or has stripped frames), POST the entry+frames back via save-entry.
  // Frame protection in save-entry (AA1) ensures this can never overwrite good cloud frames.
  const [syncingIDBFrames, setSyncingIDBFrames] = React.useState<boolean>(false);
  const [idbSyncProgress, setIdbSyncProgress] = React.useState<string>("");
  const handleSyncFramesFromIDB = async () => {
    if (!confirm(`Scan IndexedDB for frames missing from cloud, then push them back? This recovers entries whose cloud frames were destroyed by re-analyze. Safe: server-side AA1 protection prevents overwriting any existing good cloud frames. Estimated time: ~30s for full scan.`)) return;
    setSyncingIDBFrames(true);
    setIdbSyncProgress("Reading IndexedDB…");
    let recovered = 0;
    let skipped = 0;
    let failed = 0;
    try {
      // Open IDB and read all frame entries
      const idbFrames = await new Promise<Map<any, any[]>>((resolve, reject) => {
        const req = indexedDB.open("levelly-frames", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("frames", "readonly");
          const store = tx.objectStore("frames");
          const allReq = store.getAll();
          allReq.onsuccess = () => {
            const map = new Map();
            for (const rec of allReq.result || []) {
              if (rec && rec.id !== undefined && Array.isArray(rec.frames)) {
                map.set(rec.id, rec.frames);
              }
            }
            resolve(map);
          };
          allReq.onerror = () => reject(allReq.error);
        };
      });
      setIdbSyncProgress(`IDB has ${idbFrames.size} entries. Checking each against cloud…`);

      // For each lib entry, check if IDB has good frames AND cloud is missing them
      const candidates: any[] = [];
      for (const entry of lib) {
        const idbEntryFrames = idbFrames.get(entry.id);
        if (!idbEntryFrames) continue;
        const idbHasData = idbEntryFrames.some((f: any) => f && f.image_data);
        if (!idbHasData) continue;
        // Check current cloud state via load-entry
        try {
          const r = await fetch(`/api/load-entry?id=${entry.id}`);
          if (!r.ok) {
            console.warn(`[Levelly AA3] load-entry ${entry.id} returned ${r.status}, skipping`);
            continue;
          }
          const cloud = await r.json();
          const cloudHasData = Array.isArray(cloud.auto_frames)
            && cloud.auto_frames.some((f: any) => f && f.image_data);
          if (!cloudHasData) {
            candidates.push({ entry, cloudEntry: cloud, idbFrames: idbEntryFrames });
          } else {
            skipped++;
          }
        } catch (err) {
          console.warn(`[Levelly AA3] check failed for ${entry.id}:`, err);
        }
      }
      setIdbSyncProgress(`${candidates.length} entries need recovery. Pushing frames back to cloud…`);

      // Push frames back for each candidate
      for (let i = 0; i < candidates.length; i++) {
        const { entry, cloudEntry, idbFrames: frames } = candidates[i];
        setIdbSyncProgress(`Recovering ${i+1}/${candidates.length}: ${entry.creative_id || entry.title?.slice(0, 30) || entry.id}…`);
        try {
          // Build the full entry: cloud blob's data + IDB frames
          const merged = { ...cloudEntry, auto_frames: frames };
          const r = await fetch("/api/save-entry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entry: merged }),
          });
          if (!r.ok) throw new Error(`save-entry HTTP ${r.status}`);
          recovered++;
        } catch (err) {
          failed++;
          console.warn(`[Levelly AA3] recover failed for ${entry.id}:`, err);
        }
      }
    } catch (err: any) {
      alert(`IDB sync failed: ${err.message || err}`);
    } finally {
      setSyncingIDBFrames(false);
      setIdbSyncProgress("");
    }
    alert(`✓ Frame recovery complete.\n\n• Recovered: ${recovered}\n• Already had frames in cloud: ${skipped}\n• Failed: ${failed}\n\n${recovered > 0 ? "Hard refresh the page to see restored filmstrips." : ""}`);
  };

  const handleSyncThumbnails = async () => {
    // Deploy P: fetches per-entry blobs from cloud sequentially (no parallel state-mutation risk).
    // For each entry without cloud_thumbnail: fetch full entry → take first frame with image_data →
    // generate 150px JPEG → save back via saveLib (which writes per-entry blob + updates index).
    // Works regardless of which browser, no IDB dependency.
    const candidates = lib.filter(e => !e.cloud_thumbnail);
    if (candidates.length === 0) {
      alert("All entries already have cloud thumbnails. Nothing to sync.");
      return;
    }
    if (!confirm(`Generate cloud thumbnails for ${candidates.length} entries? This fetches each entry's frames from cloud and creates a 150px thumbnail. Safe — adds thumbnails only, no other changes. Estimated time: ~${Math.ceil(candidates.length * 1.5)}s.`)) return;
    setSyncingThumbs(true);
    let updated = [...lib];
    let success = 0;
    let skipped = 0;
    let failed = 0;
    for (let i = 0; i < candidates.length; i++) {
      const entry = candidates[i];
      setSyncProgress(`Syncing ${i+1}/${candidates.length}: ${entry.creative_id || entry.title?.slice(0,30) || entry.id}…`);
      try {
        // Fetch full per-entry blob from cloud (has auto_frames with image_data)
        const fullResp = await fetch(`/api/load-entry?id=${entry.id}`);
        if (!fullResp.ok) throw new Error(`load-entry HTTP ${fullResp.status}`);
        const full = await fullResp.json();
        const firstFrame = full.auto_frames?.find((f: any) => f.image_data);
        if (!firstFrame?.image_data) {
          skipped++;
          console.warn(`[Levelly P] No frame image_data in cloud for ${entry.creative_id || entry.id}, skipping`);
          continue;
        }
        const thumb = await generateCloudThumbnail(firstFrame.image_data);
        // Save thumbnail back via single-entry update (avoids whole-lib saveLib which has race risk).
        const updatedEntry = { ...full, cloud_thumbnail: thumb };
        const saveResp = await fetch("/api/save-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry: updatedEntry }),
        });
        if (!saveResp.ok) throw new Error(`save-entry HTTP ${saveResp.status}`);
        // Reflect in local lib state (so user sees thumbnail immediately without refresh)
        updated = updated.map(x => x.id === entry.id ? { ...x, cloud_thumbnail: thumb } : x);
        success++;
      } catch (err: any) {
        failed++;
        console.warn(`[Levelly P] Thumbnail backfill failed for ${entry.creative_id || entry.id}:`, err?.message || err);
      }
    }
    // Update local React state directly — DO NOT call saveLib (would trigger 41-entry diff write).
    setLib(updated);
    libPrevRef.current = updated;
    // Also update localStorage (just metadata, no frames, tiny payload).
    try {
      const withoutFrames = updated.map(e => ({
        ...e,
        auto_frames: e.auto_frames?.map((f: FrameExtraction) => ({ timestamp_seconds: f.timestamp_seconds, description: f.description, significance: f.significance })),
      }));
      localStorage.setItem("levelly_dna_library", JSON.stringify(withoutFrames));
    } catch {}
    setSyncingThumbs(false);
    setSyncProgress("");
    alert(`✓ Thumbnail sync complete.\n\n• Generated: ${success}\n• Skipped (no source frames): ${skipped}\n• Failed: ${failed}\n\nRefresh the page to see all thumbnails update.`);
  };
  // Deploy P: one-time admin button — calls /api/repair-index to rebuild the index from per-entry blobs.
  // Picks up new summary fields (spend_networks, spend_window_days) for all existing entries.
  // Deploy T: retry cloud sync for entries stuck in localStorage. Iterates pendingCloudSync list,
  // POSTs each one's full entry data to /api/save-entry. Removes successful syncs from pending list.
  const handleRetryCloudSync = async () => {
    if (syncingPending) return;
    if (pendingCloudSync.length === 0) return;
    setSyncingPending(true);
    let succeeded = 0;
    let failed = 0;
    const stillPending: string[] = [];
    // Deploy BC2.1: retry handler now handles BOTH failed saves AND failed deletes.
    // Delete entries are prefixed with "delete:" in pendingCloudSync. Detect prefix → call delete-entry.
    // Save entries (no prefix) → existing save-entry retry logic.
    for (const idVal of pendingCloudSync) {
      const idStr = String(idVal);
      const isDelete = idStr.startsWith("delete:");
      const cleanId = isDelete ? idStr.slice("delete:".length) : idStr;

      if (isDelete) {
        // Failed delete — retry the delete
        try {
          const resp = await fetch(`/api/delete-entry?id=${cleanId}`, { method: "DELETE" });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          succeeded++;
        } catch (err) {
          failed++;
          stillPending.push(idStr);
          console.warn(`[Levelly BC2.1] retry delete failed for ${cleanId}:`, err);
        }
        continue;
      }

      // Find by string match (ids stored as numbers, list stores strings)
      const entry = lib.find(e => String(e.id) === cleanId);
      if (!entry) {
        // Entry was deleted from lib but still in pending list — drop it
        continue;
      }
      try {
        // Need the full entry with frames if available — try IDB first
        let fullEntry: any = { ...entry };
        try {
          const withFrames = await mergeFramesFromIDB([entry] as any);
          if (withFrames && withFrames[0]) fullEntry = { ...entry, ...withFrames[0] };
        } catch { /* IDB unavailable — push without frames, can be recovered later */ }
        const resp = await fetch("/api/save-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry: fullEntry }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        succeeded++;
      } catch (err) {
        failed++;
        stillPending.push(idStr);
        console.warn(`[Levelly T] retry failed for entry ${cleanId}:`, err);
      }
    }
    updatePendingSync(stillPending);
    setSyncingPending(false);
    alert(`✓ Cloud sync complete.\n\n• Succeeded: ${succeeded}\n• Still failing: ${failed}\n\n${failed > 0 ? "Entries still in pending list — click again to retry, or contact support if persistent." : "All entries synced. Banner will dismiss."}`);
  };

  // Deploy S.1: diagnose orphan summaries (in index but no per-entry blob), then offer prune.
  // Two-step flow: diagnose shows the list, prompts for confirmation; prune actually removes from index.
  const handleDiagnoseLibrary = async () => {
    try {
      const resp = await fetch("/api/diagnose-library");
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      const orphans: Array<{ id: any; title: string; ad_type: string; added_at: string; creative_id?: string }> = data.orphans || [];
      if (orphans.length === 0) {
        alert(`✓ Library healthy.\n\nTotal entries: ${data.total}\nOrphan summaries: 0`);
        return;
      }
      const orphanList = orphans.map(o => `  • ${o.creative_id || o.id} — ${o.title} (${o.ad_type})`).join("\n");
      const proceed = confirm(`Found ${orphans.length} orphan entries (in index but missing per-entry blob in cloud):\n\n${orphanList}\n\nThese were likely created during pre-Q bulk uploads where parallel writes silently lost data. They cannot be expanded (404 on click) and pollute aggregate counters.\n\nClick OK to remove them from the library index.\nClick Cancel to keep them and investigate manually.\n\nThis only modifies the index — no per-entry blobs are touched.`);
      if (!proceed) return;
      const pruneResp = await fetch("/api/prune-orphans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const pruneData = await pruneResp.json();
      if (!pruneResp.ok || !pruneData.ok) throw new Error(pruneData.error || `HTTP ${pruneResp.status}`);
      alert(`✓ Pruned ${pruneData.pruned} orphan entries.\n\nLibrary now has ${pruneData.kept} entries.\n\nReload the page (Cmd+Shift+R) to see the cleaned-up library.`);
    } catch (err: any) {
      alert(`Diagnose/prune failed: ${err.message}`);
    }
  };
  const handleRepairIndex = async () => {
    if (!confirm("Rebuild library index? This is safe — no entry data is touched. It rebuilds the summary index from per-entry blobs so aggregate counters (NETWORKS, TOP VELOCITY) read correct values.")) return;
    try {
      const resp = await fetch("/api/repair-index", { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      alert(`✓ Index rebuilt.\n\n• Total entries: ${data.total}\n• Repaired: ${data.repaired}\n• Missing per-entry blobs: ${data.missing_blobs}\n\nReload the page (Cmd+Shift+R) to see updated counters.`);
    } catch (err: any) {
      alert(`Repair failed: ${err.message}`);
    }
  };

  // Deploy H.1: when file was pre-attached via drag-drop, skip file picker and feed directly to handleUpload.
  // Deploy H.1.1: pass cfg directly to handleUpload via cfgOverride (state was committing too late for the sync call).
  const handleModalConfirm=(cfg: UploadConfig, preAttachedFile?: File)=>{
    setUploadConfig(cfg);
    setShowModal(false);
    if (preAttachedFile) {
      const fakeEvent = { target: { files: [preAttachedFile], value: "" } } as any;
      setDroppedFile(null);
      handleUpload(fakeEvent, cfg); // Deploy H.1.1: cfg passed directly — no async state dependency
    } else {
      fileRef.current?.click();
    }
  };
  // Deploy H.1.1: handleUpload accepts optional cfgOverride.
  // Drop path passes cfg directly (React state is async — uploadConfig may not be committed yet when drop path fires).
  // Click path leaves cfgOverride undefined and relies on uploadConfig state (already committed by the time user picks a file).
  const handleUpload=useCallback(async(e: React.ChangeEvent<HTMLInputElement>, cfgOverride?: UploadConfig)=>{
    const files=Array.from(e.target.files??[]); if(!files.length) return;
    const cfg=cfgOverride||uploadConfig||{tier:"winner" as const,ad_type:"moc" as const,context:"",manual_frames:[]};
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
        // Deploy Q: read latest lib from libRef.current (not closure-captured lib). Stable closure.
        const rawDna=await callGeminiDirect(analyzeSystem(libRef.current,cfg,autoFrames,duration,frameParts.length>0,hasRefsAvailable),[...frameParts,...(manualParts.length>0?[{text:"### MANUAL FRAMES:"},...manualParts]:[]),{text:`HOOK DATA:${JSON.stringify(hookData)}`},{text:"INSTRUCTION: Analyze only the extracted frame images above. DO NOT infer events between frames. Base every finding on visible frame evidence only."}]);
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
        // Deploy E: generate cloud thumbnail (150px @ q65) from first auto_frame for cross-browser visibility
        let cloudThumbnail: string | undefined;
        try {
          const firstFrameWithData = autoFramesWithImages.find((f: any) => f.image_data);
          if (firstFrameWithData?.image_data) {
            cloudThumbnail = await generateCloudThumbnail(firstFrameWithData.image_data);
          }
        } catch (err) { console.warn("Could not generate cloud thumbnail (non-fatal):", err); }
        // Deploy Q: replaced saveLib([...lib,...]) with saveLibAppend(newEntry).
        // Atomic single-entry append — no closure-captured lib, no diff math, no race risk under concurrency.
        const newEntry: DNAEntry = {...dna,id:newId,tier:cfg.tier,ad_type:cfg.ad_type,upload_context:cfg.context,file_name:file.name,added_at:new Date().toISOString(),creative_id:cfg.creative_id,parent_id:cfg.parent_id,levelly_brief_title:cfg.levelly_brief_title,auto_frames:autoFramesWithImages,manual_frames:cfg.manual_frames.map(f=>f.name),cloud_thumbnail:cloudThumbnail};
        await saveLibAppend(newEntry);
        uploadCompletedRef.current = true;
        setLastAnalyzedId(newId);
        setAnalyzeStep("");
      }
    } catch(err: any){ setAnalyzeErr(err.message); }
    finally { setAnalyzing(false); setUploadConfig(null); if(fileRef.current) fileRef.current.value=""; }
  },[uploadConfig, saveLibAppend]); // Deploy Q: removed lib from deps — read via libRef.current. Stable callback identity.

  // Deploy BC2 P4: parameterized — accepts adType to route through MOC analyzer or competitor analyzer.
  // "competitor" (default) — universal vocabulary, strips MOC-specific terms (existing behavior).
  // "moc" — MOC analyzer with full vocab (cannon tiers, gate sequences, biome). Use for MOC-internal video refs.
  const analyzeCompetitorForBrief = async (ref: { base64: string; mimeType: string; name: string }, adType: "moc" | "competitor" = "competitor"): Promise<DNAEntry | null> => {
    try {
      const rawB64 = ref.base64.includes(",") ? ref.base64.split(",")[1] : ref.base64;
      const byteChars = atob(rawB64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const file = new File([bytes], ref.name, { type: ref.mimeType });
      let videoPart: any;
      if (file.size > 4 * 1024 * 1024) {
        const { fileUri, mimeType } = await uploadToGeminiFileAPI(file, () => {});
        videoPart = { fileData: { mimeType, fileUri } };
      } else {
        videoPart = { inlineData: { mimeType: file.type, data: await fileToBase64(file) } };
      }
      let autoFrames: FrameExtraction[] = [];
      let duration = 30;
      try {
        const fr = await callGeminiDirect(frameExtractionSystem(adType), [
          { text: adType === "moc" ? "Extract 20-24 key frames from this MOC ad — gates, upgrades, tier changes, boss appearances, almost-fail/win moments:" : "Extract 20-24 key frames from this competitor ad — focus on gameplay moments, mechanics, transformations:" },
          videoPart,
        ]);
        autoFrames = Array.isArray(fr?.frames) ? fr.frames : [];
        duration = typeof fr?.duration_seconds === "number" ? fr.duration_seconds : 30;
      } catch (err: any) { console.warn(`${adType} frame extraction failed:`, err?.message); }
      let extractedFrameParts: any[] = [];
      try {
        const timestamps = autoFrames.map(f => f.timestamp_seconds).filter(t => typeof t === "number").sort((a, b) => a - b);
        if (timestamps.length > 0) extractedFrameParts = await extractFramesFromVideo(file, timestamps, duration);
      } catch (err: any) { console.warn(`Canvas extraction failed for ${adType}:`, err?.message); }
      const cfg: UploadConfig = { tier: "inspiration", ad_type: adType, context: "", manual_frames: [] };
      const hasRefsAvailable = MOC_REFERENCES.some(r => !r.base64.startsWith("REPLACE_"));
      const rawDna = await callGeminiDirect(
        analyzeSystem(lib, cfg, autoFrames, duration, extractedFrameParts.length > 0, hasRefsAvailable),
        [...extractedFrameParts, { text: "INSTRUCTION: Analyze only the extracted frame images above. DO NOT infer events between frames. Base every finding on visible frame evidence only." }]
      );
      const dna = sanitizeDNA(rawDna);
      const frameImageMap: Record<number, string> = {};
      for (let pi = 0; pi < extractedFrameParts.length - 1; pi += 2) {
        const label = extractedFrameParts[pi]?.text ?? "";
        const match = label.match(/\[FRAME at ([\d.]+)s\]/);
        const imgData = extractedFrameParts[pi + 1]?.inlineData?.data;
        if (match && imgData) {
          const ts = parseFloat(match[1]);
          frameImageMap[ts] = imgData;
          frameImageMap[Math.round(ts)] = imgData;
        }
      }
      const autoFramesWithImages: FrameExtraction[] = autoFrames.map(f =>
        frameImageMap[f.timestamp_seconds] ?? frameImageMap[Math.round(f.timestamp_seconds)]
          ? { ...f, image_data: frameImageMap[f.timestamp_seconds] ?? frameImageMap[Math.round(f.timestamp_seconds)] }
          : f
      );
      // Deploy BC2.1: generate cloud_thumbnail for competitor entries created via brief panel.
      // Pre-BC2.1, this function never set cloud_thumbnail — caused "No preview" tiles on every
      // brief-uploaded competitor entry. Fix: generate from first frame with image_data, same as upload flow.
      let cloudThumbnail: string | undefined = undefined;
      try {
        const firstFrameWithData = autoFramesWithImages.find(f => f.image_data);
        if (firstFrameWithData?.image_data) {
          cloudThumbnail = await generateCloudThumbnail(firstFrameWithData.image_data);
        }
      } catch (err: any) { console.warn(`[BC2.1] thumbnail generation failed:`, err?.message); }
      return {
        ...dna,
        id: Date.now() + Math.random(),
        tier: "inspiration",
        ad_type: adType,
        upload_context: "",
        file_name: ref.name,
        added_at: new Date().toISOString(),
        auto_frames: autoFramesWithImages,
        manual_frames: [],
        cloud_thumbnail: cloudThumbnail,
      } as DNAEntry;
    } catch (err: any) {
      console.warn(`analyzeCompetitorForBrief failed (${adType}):`, err?.message);
      return null;
    }
  };

  const handleGenerateBrief = async () => {
    if (!briefCtx.trim()) { setBriefErr("Enter a brief context first."); return; }
    if (lib.length === 0) { setBriefErr("Add at least one ad first."); return; }
    setGenerating(true); setBriefErr(""); setBriefProgress("Starting brief generation…"); setConcepts([]); setBriefAnalysis(null); setLastCompetitorEntry(null);
    setConceptVotes({}); setConceptNotes({}); setFeedbackSessionId(Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    try {
      let competitorContext: { core_fantasy?: string; moc_inspiration?: string; transferable_elements?: string[]; title?: string } | undefined = undefined;
      let refNote: string | undefined = undefined;
      if (briefRef) {
        const isVideo = briefRef.mimeType.startsWith("video/");
        if (isVideo) {
          // Deploy BC2 P4: pass adType from user toggle. Default "competitor" preserves prior behavior.
          // "moc" routes through MOC analyzer for richer DNA when user drops a MOC-internal clip.
          setBriefProgress(`Analyzing ${briefRefAdType === "moc" ? "MOC" : "competitor"} video…`);
          const newEntry = await analyzeCompetitorForBrief(briefRef, briefRefAdType);
          if (newEntry) {
            saveLib([...lib, newEntry]);
            setLastCompetitorEntry(newEntry);
            // Deploy W: send the full structural DNA, not just 4 high-level fields.
            // Brief prompt now reads gate_sequence, unit_evolution_chain, key_mechanic, pacing,
            // tension_moments, biome, hook_type, hook_description — gives Claude the full blueprint.
            competitorContext = {
              title: newEntry.title,
              core_fantasy: newEntry.core_fantasy,
              moc_inspiration: newEntry.moc_inspiration,
              transferable_elements: newEntry.transferable_elements || [],
              lift_intent: liftIntent.trim() || undefined,
              // Deploy W expanded fields:
              gate_sequence: newEntry.gate_sequence || [],
              unit_evolution_chain: newEntry.unit_evolution_chain || [],
              key_mechanic: newEntry.key_mechanic,
              pacing: newEntry.pacing,
              tension_moments: (newEntry as any).tension_moments,
              biome: newEntry.biome,
              hook_type: newEntry.hook_type,
              hook_description: newEntry.hook_description,
              gate_escalation: newEntry.gate_escalation,
            } as any;
            setBriefProgress("Competitor saved to library. Generating briefs…");
            setBriefRef(null);
            setLiftIntent("");
          } else {
            refNote = `User visual reference: "${briefRef.name}" (analysis failed)`;
          }
        } else {
          // Deploy BC2 P3: primary briefRef is image — treat as first item of multi-ref pipeline.
          // (Logic for analyzing all image refs runs below outside this if-block.)
        }
      }
      // Deploy BC2 P3: collect ALL image refs (primary briefRef if image + extras from briefImageRefs).
      // Each ref runs through analyze-image-ref independently → array of descriptions.
      // briefSystem receives `user_visual_references` array (replacing single user_visual_reference).
      const allImageRefs: { base64: string; mimeType: string; name: string }[] = [];
      if (briefRef && !briefRef.mimeType.startsWith("video/")) allImageRefs.push(briefRef);
      for (const r of briefImageRefs) allImageRefs.push(r);
      if (allImageRefs.length > 0) {
        setBriefProgress(`Analyzing ${allImageRefs.length} visual reference${allImageRefs.length > 1 ? "s" : ""}…`);
        const descriptions: any[] = [];
        const refNotes: string[] = [];
        for (const r of allImageRefs) {
          try {
            const vresp = await fetch("/api/analyze-image-ref", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ images: [{ base64: r.base64, mimeType: r.mimeType }] }),
            });
            const vdata = await vresp.json();
            if (vresp.ok && vdata.ok && vdata.description) {
              descriptions.push({ name: r.name, description: vdata.description });
              refNotes.push(`"${r.name}" — ${(vdata.description.spatial_layout || "").slice(0, 60)}`);
            } else {
              console.warn(`[Levelly BC2 P3] image analysis failed for ${r.name}:`, vdata.error);
              refNotes.push(`"${r.name}" (analysis failed)`);
            }
          } catch (err: any) {
            console.warn(`[Levelly BC2 P3] image analysis error for ${r.name}:`, err);
            refNotes.push(`"${r.name}" (analysis error)`);
          }
        }
        if (descriptions.length > 0) {
          if (!competitorContext) {
            competitorContext = {
              title: descriptions.length === 1 ? `Visual reference: ${descriptions[0].name}` : `${descriptions.length} visual references`,
              user_visual_references: descriptions,
              lift_intent: liftIntent.trim() || undefined,
            } as any;
          } else {
            (competitorContext as any).user_visual_references = descriptions;
          }
        }
        refNote = `Visual references parsed (${descriptions.length}/${allImageRefs.length}): ${refNotes.join("; ")}`;
        setBriefProgress("References parsed. Generating briefs…");
        // Clear refs after use (consistent with pre-BC2 behavior for primary ref)
        if (briefRef && !briefRef.mimeType.startsWith("video/")) setBriefRef(null);
        if (briefImageRefs.length > 0) setBriefImageRefs([]);
        setLiftIntent("");
      }
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
      // Deploy K: inject market intelligence into brief generation
      // Deploy L: snapshot the intel used so we can show it on the brief UI
      setBriefIntelSnapshot(marketIntel);
      const systemPrompt = briefSystem(trimmedLib, briefCtx, "Whale+Dolphin", iterateFrom.trim()||undefined, refNote, competitorContext, marketIntel);
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
          // Deploy BC2 P3: propagate ALL image refs (primary briefRef if image + extras from briefImageRefs)
          // to every concept as `user_uploaded_refs` array. Render side loops over array, pushes each as a
          // Gemini Image part. Backward-compat: also keep `user_uploaded_ref` singular pointing at first ref.
          const conceptImageRefs: { base64: string; mimeType: string; name: string }[] = [];
          if (briefRef && !briefRef.mimeType.startsWith("video/")) conceptImageRefs.push(briefRef);
          for (const r of briefImageRefs) conceptImageRefs.push(r);
          newConcepts.forEach((concept: Concept, i: number) => {
            const conceptWithRef = conceptImageRefs.length > 0
              ? {
                  ...concept,
                  user_uploaded_refs: conceptImageRefs.map(r => ({ base64: r.base64, mimeType: r.mimeType, name: r.name })),
                  user_uploaded_ref: { base64: conceptImageRefs[0].base64, mimeType: conceptImageRefs[0].mimeType, name: conceptImageRefs[0].name },
                }
              : concept;
            setConcepts(prev => [...prev, conceptWithRef]);
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
      if(c.hook_b_description) lines.push(`**Hook B (UGC):** ${c.hook_b_description}`);
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

    // Deploy J: use CURRENT scene keys — visual_scene, visual_hook_a, visual_hook_b, visual_hook_c.
    // Previous code used legacy keys (visual_start/middle/end/hook) which are no longer populated by brief generation,
    // causing empty labeled placeholders in Notion paste.
    const sceneDefs = [
      { key: "scene",  label: "Scene",  imgKey: "visual_scene"  },
      { key: "hook_a", label: "Hook A", imgKey: "visual_hook_a" },
      { key: "hook_b", label: "Hook B", imgKey: "visual_hook_b" },
      { key: "hook_c", label: "Hook C", imgKey: "visual_hook_c" },
    ] as const;
    const renders = sceneDefs.map(({ key, label, imgKey }) => {
      const img = (key === "scene" ? ((c as any)[imgKey] || (c as any).visual_start) : (c as any)[imgKey]) as string | undefined;
      return img
        ? `<div style="text-align:center"><div style="font-size:9px;color:#8b949e;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">${label}</div><img src="${img}" style="width:100%;border-radius:6px;display:block" alt="${label}"/></div>`
        : `<div style="aspect-ratio:9/16;background:#161b22;border-radius:6px;display:flex;align-items:center;justify-content:center"><span style="font-size:10px;color:#484f58">${label}</span></div>`;
    });

    const scriptRows = Array.isArray(c.production_script) ? c.production_script.map((s:any,i:number) =>
      `<tr style="background:${i%2===0?"#ffffff":"#f9f9f9"}"><td style="padding:6px 10px;color:#1a56db;white-space:nowrap;vertical-align:top;font-size:11px;font-weight:500">${s.time||""}</td><td style="padding:6px 10px;font-size:11px;color:#111111">${s.action||""}</td><td style="padding:6px 10px;font-size:11px;color:#444444;font-style:italic">${s.visual_cue||""}</td><td style="padding:6px 10px;font-size:11px;color:#666666">${s.audio_cue||""}</td></tr>`
    ).join("") : "";

    const netAdapt = c.network_adaptations ? (["AppLovin","Facebook","Google","TikTok"] as const)
      .filter(n => c.network_adaptations?.[n])
      .map(n => `<div style="margin-bottom:6px"><span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;background:#eff6ff;color:#1a56db;margin-right:6px">${n}</span><span style="font-size:12px;color:#444444">${c.network_adaptations![n]}</span></div>`)
      .join("") : "";

    // Deploy J: reorder to match new UI flow. Top: header + hook + chain + lane. Then renders, script, hook_a/b/c.
    // Bottom: <details> collapsible with the context fields that moved below the fold in UI.
    return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#ffffff;color:#111111;padding:24px;max-width:900px;margin:0 auto">
<div style="border-bottom:1px solid #e0e0e0;padding-bottom:16px;margin-bottom:24px">
  <div style="font-size:11px;color:#666666;margin-bottom:4px">LEVELLY CREATIVE BRIEF · CONCEPT ${ci+1} · ${seg}</div>
  <div style="font-size:22px;font-weight:700;color:#111111;margin-bottom:6px">${c.title||""}</div>
  <div style="font-size:13px;color:#444444">${c.objective||""}</div>
</div>

${section("Hook", `<strong style="color:#1a56db">${(c as any).hook_type||"Challenge"} at ${(c as any).hook_timing_seconds??0}s</strong><br/>${c.hook_description||""}`)}
${chain ? section("Unit evolution chain", pill(chain)) : ""}
${c.lane_design ? section("Lane design", c.lane_design) : ""}

<div style="margin:18px 0 18px">
  <div style="font-size:10px;font-weight:700;color:#666666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Scene renders</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${renders.join("")}</div>
</div>

${scriptRows ? `<div style="margin:0 0 18px"><div style="font-size:10px;font-weight:700;color:#666666;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Production script</div><table style="width:100%;border-collapse:collapse;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden"><thead><tr style="background:#f5f5f5"><th style="padding:6px 10px;text-align:left;font-size:9px;color:#666666;font-weight:600;text-transform:uppercase">Time</th><th style="padding:6px 10px;text-align:left;font-size:9px;color:#666666;font-weight:600;text-transform:uppercase">Action</th><th style="padding:6px 10px;text-align:left;font-size:9px;color:#666666;font-weight:600;text-transform:uppercase">Visual cue</th><th style="padding:6px 10px;text-align:left;font-size:9px;color:#666666;font-weight:600;text-transform:uppercase">Audio cue</th></tr></thead><tbody>${scriptRows}</tbody></table></div>` : ""}

${c.hook_a_description ? section("Hook A — Gameplay Boss", c.hook_a_description) : ""}
${c.hook_b_description ? section("Hook B — UGC", c.hook_b_description) : ""}
${c.hook_c_description ? section("Hook C — Stopwatch/Viral", c.hook_c_description) : ""}

<details style="margin-top:10px;padding-top:10px;border-top:1px solid #e0e0e0">
<summary style="font-size:11px;color:#666;cursor:pointer;font-weight:600">More details (visual identity, upgrade triggers, tension, engagement, network adaptations)</summary>
<div style="margin-top:12px">
${(c as any).analysis?.strategy ? section("Strategy", (c as any).analysis.strategy) : ""}
${vi.environment ? section("Visual identity", [
  `Biome: <strong>${vi.environment}</strong>`,
  vi.lighting ? `Lighting: ${vi.lighting}` : "",
  vi.player_mob_color ? `Player mobs: ${vi.player_mob_color} · Enemy: ${vi.enemy_mob_color||"red"}` : "",
  vi.mood_notes ? `Mood: ${vi.mood_notes}` : ""
].filter(Boolean).join("<br/>")) : ""}
${(c.upgrade_triggers||[]).length ? section("Upgrade triggers", (c.upgrade_triggers||[]).map((t:string)=>`↑ ${t}`).join("<br/>")) : ""}
${(c.tension_moments||[]).length ? section("Tension moments", (c.tension_moments||[]).map((t:string)=>`⚡ ${t}`).join("<br/>")) : ""}
${c.engagement_hooks ? section("Engagement hooks", c.engagement_hooks) : ""}
${netAdapt ? section("Network adaptations", netAdapt) : ""}
</div>
</details>

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

    const handleRenderScene=async(ci: number,scene: "scene"|"hook_a"|"hook_b"|"hook_c", refinePrompt?: string, refineRef?: { base64: string; mimeType: string; name: string } | null)=>{
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
        // Deploy D fix: scan refine prompt for canonical champion names; inject matching ref images so Gemini doesn't invent
        const { mimeType, data } = parseDataURI(existingImg);
        const refineLower = refinePrompt.toLowerCase();
        const populatedRefs = MOC_REFERENCES.filter((r: any) => !r.base64.startsWith("REPLACE_") && r.category === "champion");
        const matchedRefs = populatedRefs.filter((r: any) => {
          const refLabel = (r.label || "").toLowerCase();
          const refKey = (r.key || "").toLowerCase().replace(/_/g, " ");
          return refineLower.includes(refKey) || (refLabel.split(" — ")[0] && refineLower.includes(refLabel.split(" — ")[0]));
        });
        const editParts: any[] = [{ inlineData: { mimeType, data } }];
        // Deploy F.1: USER ANNOTATION moves to FIRST position (right after source image) with MANDATORY framing.
        // Gemini weights earlier images more heavily — annotation at position 2 beats MOC champion refs at later positions.
        if (refineRef) {
          editParts.push({ text: `MANDATORY ANNOTATION from the user — this image marks the EXACT location and/or the intended result for the edit. The user drew/screenshotted this to tell you precisely what to change in the source image above. Study it carefully: circles/highlights mark regions to fix, arrows mark direction of movement, sketched shapes mark desired result. This annotation IS the spatial source of truth for the edit — it overrides any ambiguity in the text instruction. Apply the changes in/to the annotated regions specifically. DO NOT copy the annotation's visual style (it may be a rough sketch or screenshot markup) — extract its spatial intent only.` });
          editParts.push({ inlineData: { mimeType: refineRef.mimeType, data: refineRef.base64 } });
        }
        if (matchedRefs.length > 0) {
          editParts.push({ text: `MOC CHAMPION REFERENCE${matchedRefs.length>1?"S":""} for the new character${matchedRefs.length>1?"s":""} mentioned in the edit instruction — match ${matchedRefs.length>1?"these":"this"} appearance EXACTLY (same body shape, colours, proportions, expression):` });
          matchedRefs.forEach((r: any) => {
            editParts.push({ text: `[CHAMPION]: ${r.label}` });
            editParts.push({ inlineData: { mimeType: (r as any).mimeType || "image/png", data: r.base64 } });
          });
        }
        editParts.push({ text: `EDIT THIS IMAGE: ${refinePrompt}\n\nKeep everything else identical — same composition, camera angle, art style, road layout, and all unchanged elements. ${matchedRefs.length>0?"For any character swap or addition mentioned, USE THE MOC CHAMPION REFERENCE${matchedRefs.length>1?'S':''} above as the visual source — do NOT invent a new character design.":""}${refineRef?" The MANDATORY ANNOTATION image at the top of this prompt is the spatial source of truth for WHERE to apply this edit.":""} Output 9:16.` });
        const editBody = JSON.stringify({
          contents: [{ role: "user", parts: editParts }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: "9:16" } }
        });
        let url: string | null = null;
        // Deploy F.1: 3 attempts with exp backoff matching analysis.ts callImageDirect
        const editBackoffs = [1000, 2000, 4000];
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await fetch(GEMINI_IMAGE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: editBody });
          const text = await r.text();
          if (!r.ok) { if (attempt < 2 && (r.status === 503 || r.status === 429 || r.status === 500)) { await new Promise(res => setTimeout(res, editBackoffs[attempt])); continue; } throw new Error(`Image edit ${r.status}: ${text.slice(0, 500)}`); }
          const result = JSON.parse(text);
          const imgPart = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
          if (!imgPart) { if (attempt < 2) { await new Promise(res => setTimeout(res, editBackoffs[attempt])); continue; } throw new Error("No image returned from edit after 3 attempts"); }
          url = `data:${imgPart.inlineData.mimeType || "image/png"};base64,${imgPart.inlineData.data}`;
          break;
        }
        if (!url) throw new Error("Image edit failed after 3 attempts");
        setConcepts(p=>p.map((c,i)=>i===ci?{...c,[existingImgKey]:url}:c));
        return;
      }

      if (existingImg && !refinePrompt) {
        // ── FRESH RE-RENDER (no refine prompt — user clicked ↺ Re-render) ──
        // Fall through to fresh render mode below — regenerate from brief
      }

      // ── FRESH RENDER MODE ───────────────────────────────────────────────────
      const familyTag = (() => {
        const note = (concept as any).experimental_note || "";
        const m = note.match(/\[FAMILY:([^\]]+)\]/);
        return m ? m[1].trim() : undefined;
      })();
      const refParts=pickRelevantRefs(vi, unitAtScene, lib, scene==="scene"?"start":"hook", familyTag);
      const prevParts: any[]=[];

      const sceneRef = concept.visual_scene || concept.visual_start || null;
      if(scene !== "scene" && sceneRef){
        // Hook renders use the scene render as style anchor for visual consistency
        prevParts.push({text:"### LANE SCENE — match art style, cannon type, mob color, environment, biome EXACTLY. This is the visual reference for consistency:"});
        prevParts.push({inlineData:{mimeType:parseDataURI(sceneRef).mimeType,data:parseDataURI(sceneRef).data}});
      }

      // Deploy Z3: user_uploaded_ref pushed LAST so Gemini Image weights it most strongly.
      // Deploy BC2 P3: support multi-ref. Loop over user_uploaded_refs array (preferred) or fall back
      // to single user_uploaded_ref (backward compat). All refs pushed as separate Gemini Image parts.
      const userUploadedRefs: any[] = Array.isArray((concept as any).user_uploaded_refs) && (concept as any).user_uploaded_refs.length > 0
        ? (concept as any).user_uploaded_refs
        : ((concept as any).user_uploaded_ref ? [(concept as any).user_uploaded_ref] : []);
      const validRefs = userUploadedRefs.filter((r: any) => r && r.base64 && r.mimeType && !r.mimeType.startsWith("video/"));
      if (validRefs.length > 0 && scene !== "hook_b") {
        const refLabel = validRefs.length === 1
          ? "### PRIMARY USER REFERENCE — HIGHEST PRIORITY. The user uploaded this image as the structural blueprint for this concept. You MUST replicate the level layout, obstacle placement, mechanic, and spatial composition shown here. Translate ONLY the visual style into MOC vocabulary (cannon at bottom, mob blobs, gate panels, biome). The OBSTACLE TYPES, INTERACTION MECHANIC (lift/break/push/swarm), and REWARD POSITIONING from this image OVERRIDE any inferred layout from biome/scene anchors above. If this image shows a lift platform, the render MUST show a lift platform — NOT a static decoration:"
          : `### ${validRefs.length} USER REFERENCES — HIGHEST PRIORITY (combined blueprint). The user uploaded ${validRefs.length} reference images. SYNTHESIZE the structural elements (lane layout, obstacle types, interaction mechanics, reward placement) ACROSS these references into a SINGLE coherent MOC scene. Each reference contributes a piece — combine them, don't pick one. The OBSTACLE TYPES + INTERACTION MECHANICS + REWARD POSITIONING from these images OVERRIDE biome/scene anchors above. Translate visual style into MOC vocabulary (cannon at bottom, mob blobs, gate panels, biome):`;
        prevParts.push({ text: refLabel });
        for (const ref of validRefs) {
          prevParts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
        }
      }

      const continuityNote = undefined;

      const url=await callImageDirect(imagePromptFn(concept,scene,continuityNote),[...refParts,...prevParts]);
      setConcepts(p=>p.map((c,i)=>i===ci?{...c,[scene==="scene"?"visual_scene":`visual_${scene}`]:url}:c));
    } catch(err: any){ setConcepts(p=>p.map((c,i)=>i===ci?{...c,[`render_err_${scene}`]:(err as Error).message}:c)); }
    finally { setRenderingScene(p=>({...p,[k]:false})); }
  };

  // Deploy H: tier filtering (multi-select) + sort mode (newest/oldest/spend).
  // Tier filter: if libTiers is non-empty, keep only entries matching. Empty = no filter.
  // Sort: "newest" / "oldest" by added_at, "spend" keeps existing sortLib behaviour (fatigued last, spend tier desc).
  const sortedLib = (() => {
    const tierFiltered = libTiers.length > 0 ? lib.filter(d => libTiers.includes(d.tier)) : lib;
    if (libSortMode === "spend") return sortLib(tierFiltered, "all");
    const byTs = [...tierFiltered].sort((a, b) => {
      const ta = a.added_at ? new Date(a.added_at).getTime() : 0;
      const tb = b.added_at ? new Date(b.added_at).getTime() : 0;
      return libSortMode === "newest" ? tb - ta : ta - tb;
    });
    return byTs;
  })();
  // Deploy C: apply multi-filter + text search on top of sorted list
  const filteredSortedLib = (() => {
    let result: DNAEntry[] = sortedLib;
    if (libFilters.ad_types.length) result = result.filter((d: DNAEntry) => libFilters.ad_types.includes(d.ad_type));
    if (libFilters.statuses.length) result = result.filter((d: DNAEntry) => d.creative_status && libFilters.statuses.includes(d.creative_status));
    if (libFilters.spend_tiers.length) {
      // Deploy F Bug 2 fix: spend filter respects label semantics
      // sub100K (label "<$100K") = exact-match — it's a "less than" bucket, NOT a threshold
      // 100K, 300K, 500K, 1M (labels ">$X") = hierarchical — selecting ">$500K" includes 1M
      const exactSelected: string[] = libFilters.spend_tiers.filter((t: string) => t === "sub100K");
      const hierarchicalSelected: string[] = libFilters.spend_tiers.filter((t: string) => t !== "sub100K");
      result = result.filter((d: DNAEntry) => {
        if (!d.spend_tier) return false;
        // Exact match for sub100K bucket
        if (exactSelected.includes(d.spend_tier)) return true;
        // Hierarchical match for >X buckets — entry rank must be >= the LOWEST selected ">X" tier
        if (hierarchicalSelected.length > 0) {
          const minRank = Math.min(...hierarchicalSelected.map((t: string) => SPEND_RANK[t] || 0));
          const entryRank = SPEND_RANK[d.spend_tier] || 0;
          if (entryRank >= minRank) return true;
        }
        return false;
      });
    }
    if (libFilters.biomes.length) result = result.filter((d: DNAEntry) => libFilters.biomes.includes(d.biome));
    const q = libSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((d: DNAEntry) => {
        const haystack = [d.creative_id, d.title, d.hook_description, d.biome, d.core_fantasy, ...(d.champions_visible || [])].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }
    return result;
  })();
  const uniqueBiomes = Array.from(new Set(lib.map((d: DNAEntry) => d.biome).filter(Boolean))).sort();
  const uniqueSpendTiersInLib = Array.from(new Set(lib.map((d: DNAEntry) => d.spend_tier).filter(Boolean))).sort() as string[];
  const hasActiveFilters = libSearch.trim().length > 0 || libFilters.ad_types.length > 0 || libFilters.statuses.length > 0 || libFilters.spend_tiers.length > 0 || libFilters.biomes.length > 0;
  const toggleFilter = (group: keyof typeof libFilters, value: string) => setLibFilters(p => ({ ...p, [group]: p[group].includes(value) ? p[group].filter(v => v !== value) : [...p[group], value] }));
  const winners=lib.filter(d=>d.tier==="winner").length;
  const activeWinners=lib.filter(d=>d.tier==="winner"&&d.creative_status!=="fatigued").length;
  const topVel=lib.reduce((best,d)=>{ const v=velocityPerDay(d.spend_tier??"",d.spend_window_days); if(!v) return best; const num=parseInt(v.replace(/[^0-9]/g,"")); return num>best?num:best; },0);
  const networkSet=new Set(lib.flatMap(d=>d.spend_networks??[]));
  const cloudLabel={idle:"",saving:"Saving…",saved:"Saved ✓",error:"Save failed"}[cloudStatus];
  const cloudColor={idle:D.textDim,saving:D.blue,saved:D.green,error:D.red}[cloudStatus];
  const SB=48;

  return (
    <div style={{ background:D.bg,minHeight:"100vh",color:D.text,fontFamily:"system-ui,sans-serif",fontSize:13,position:"relative" }}>
      {showModal&&<UploadModal lib={lib} droppedFile={droppedFile} onConfirm={handleModalConfirm} onCancel={()=>{setShowModal(false);setDroppedFile(null);}} />}
      {/* Deploy O: bulk upload modal */}
      {showBulkModal && bulkFiles.length > 0 && (
        <BulkUploadModal
          files={bulkFiles}
          onClose={() => { setShowBulkModal(false); setBulkFiles([]); }}
          onProcessOne={handleBulkUploadOne}
        />
      )}
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

      {/* Deploy H: floating re-analyze banner — appears above modals (z-index 2500 > modal 2000) */}
      {reanalyzingEntry && libModalId && (() => {
        const entry = lib.find(e => e.id === reanalyzingEntry);
        if (!entry) return null;
        return (
          <div style={{ position:"fixed", top:12, left:"50%", transform:"translateX(-50%)", zIndex:2500, background:D.surface, border:`1.5px solid ${D.blueDark}`, borderRadius:12, padding:"10px 16px", display:"flex", alignItems:"center", gap:12, boxShadow:"0 4px 20px rgba(0,0,0,0.6)", minWidth:280, maxWidth:"90vw" }}>
            <div style={{ width:14, height:14, borderRadius:"50%", border:`2px solid rgba(88,166,255,0.2)`, borderTopColor:D.blue, flexShrink:0, animation:"spin .7s linear infinite" }} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:500, color:D.text }}>Re-analysing{entry.creative_id ? `: ${entry.creative_id}` : ""} ({analyzeStep || "working"}…)</div>
              <div style={{ fontSize:10, color:D.textMuted, marginTop:2, whiteSpace:"nowrap" as const, overflow:"hidden" as const, textOverflow:"ellipsis" as const }}>{entry.title}</div>
            </div>
          </div>
        );
      })()}

      {/* Sidebar */}
      <div style={{ position:"fixed",top:0,left:0,width:SB,height:"100vh",background:D.surface,borderRight:`0.5px solid ${D.border}`,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:12,gap:6,zIndex:200 }}>
        <div style={{ width:32,height:32,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",background:D.surface2,border:"none",color:D.text,cursor:"default" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 6.5L8 1l7 5.5V15H1V6.5zm1 .9V14h4v-3h4v3h4V7.4L8 2.5 2 7.4z"/></svg>
        </div>
        <div style={{ marginTop:"auto",marginBottom:12,width:28,height:28,borderRadius:7,background:"rgba(210,153,34,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,color:D.gold,cursor:"default",letterSpacing:"0.02em" }}>L</div>
      </div>

      {/* Main */}
      <div style={{ marginLeft:SB }}>
        {/* Deploy H.1: header soft-kill. Wordmark lives in content area now (LevellyLogo). Keep thin strip for cloudStatus. */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"flex-end",padding:"6px 20px",borderBottom:`0.5px solid ${D.border}`,background:D.bg,position:"sticky",top:0,zIndex:100,minHeight:16 }}>
          {cloudStatus!=="idle"&&<span style={{ fontSize:10,color:cloudColor }}>{cloudLabel}</span>}
        </div>

        <div style={{ padding:20,maxWidth:960,margin:"0 auto" }}>

          {/* ── #7 Analysis progress panel ── */}
          {(analyzing || (!analyzing && analyzeErr)) && (
            <AnalysisProgressPanel step={analyzeStep} fileName={analyzeFileName} error={analyzeErr} />
          )}

          {/* ── Re-analyze progress ── (inline on home) */}
          {reanalyzingEntry && !libModalId && (() => {
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

          {/* Deploy H: Levelly wordmark header */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-start", paddingBottom:16, marginBottom:8, borderBottom:`0.5px solid ${D.border}` }}>
            <LevellyLogo scale={1.2} variant="dark" />
          </div>

          {/* 3-column layout: Analyse + Brief (equal) + Library (narrow) */}
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 0.55fr",gap:12,marginBottom:12,alignItems:"stretch" }}>
            {/* Analyse card */}
            <div onClick={()=>{ setAnalysePanelOpen(p=>!p); setBriefPanelOpen(false); setLibPanelOpen(false); }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setHomeDropActive(true); }}
              onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setHomeDropActive(false); }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation(); setHomeDropActive(false);
                // Deploy O: support multi-file drop. 2+ video files → BulkUploadModal. 1 file → regular UploadModal.
                const allFiles = Array.from(e.dataTransfer.files || []);
                const videoFiles = allFiles.filter(f => f.type.startsWith("video/"));
                if (videoFiles.length === 0) return;
                setAnalysePanelOpen(false); setBriefPanelOpen(false); setLibPanelOpen(false);
                if (videoFiles.length >= 2) {
                  setBulkFiles(videoFiles);
                  setShowBulkModal(true);
                } else {
                  setDroppedFile(videoFiles[0]);
                  setShowModal(true);
                }
              }}
              style={{ background:homeDropActive?"rgba(63,185,80,0.12)":(analysePanelOpen?"#1a2130":D.surface),border:`0.5px solid ${homeDropActive?D.green:(analysePanelOpen?D.greenBdr:D.border2)}`,borderRadius:12,padding:20,cursor:"pointer",transition:"border-color .18s,background .18s,transform .12s" }}
              onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.transform="translateY(-1px)"; (e.currentTarget as HTMLDivElement).style.borderColor=D.greenBdr; }}
              onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.transform=""; (e.currentTarget as HTMLDivElement).style.borderColor=analysePanelOpen?D.greenBdr:D.border2; }}>
              <div style={{ width:38,height:38,borderRadius:10,background:D.greenBg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14 }}>
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="#3fb950" strokeWidth="1.5"/><line x1="9.5" y1="9.5" x2="14" y2="14" stroke="#3fb950" strokeWidth="1.5"/></svg>
              </div>
              <div style={{ marginBottom:10 }}><span style={{ fontSize:10,padding:"3px 10px",borderRadius:20,border:`1px solid ${D.greenBdr}`,color:D.green }}>Most used</span></div>
              <div style={{ fontSize:18,fontWeight:500,marginBottom:6 }}>Analyse creative</div>
              <div style={{ fontSize:12,color:D.textMuted,lineHeight:1.6,marginBottom:10 }}>Drop any video — MOC ad, competitor, or market reference. Extracts DNA: hook timing, gate patterns, emotional beats, cannon chain.</div>
              {/* Deploy H: upgraded drop-zone affordance */}
              <div style={{ marginTop:4,padding:"12px 10px",border:`1px dashed ${D.border2}`,borderRadius:8,background:"rgba(63,185,80,0.05)",display:"flex",alignItems:"center",gap:10,pointerEvents:"none" as const }}>
                <span style={{ fontSize:14,color:D.green }}>⇪</span>
                <div style={{ fontSize:11,color:D.textMuted,lineHeight:1.3 }}>
                  <div style={{ color:D.text,fontWeight:500,marginBottom:2 }}>Drag & drop a video</div>
                  <div>or click to browse</div>
                </div>
              </div>
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
              <div style={{ fontSize:18,fontWeight:500,marginBottom:6 }}>Generate brief</div>
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
                <div style={{ fontSize:18,fontWeight:500,marginBottom:8 }}>Library</div>
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
              {/* Deploy C: Search bar */}
              <div style={{ display:"flex",gap:8,padding:"10px 16px 6px",alignItems:"center",borderBottom:`0.5px solid ${D.border}` }}>
                <div style={{ position:"relative" as const,flex:1 }}>
                  <span style={{ position:"absolute" as const,left:10,top:"50%",transform:"translateY(-50%)",fontSize:12,color:D.textDim,pointerEvents:"none" as const }}>🔍</span>
                  <input type="text" value={libSearch} onChange={e=>setLibSearch(e.target.value)} onClick={e=>e.stopPropagation()} placeholder="Search by ID, title, hook, champion, biome…" style={{ width:"100%",boxSizing:"border-box" as const,padding:"6px 30px 6px 28px",fontSize:12,background:D.surface2,border:`0.5px solid ${D.border}`,borderRadius:6,color:D.text,outline:"none",fontFamily:"inherit" }} />
                  {libSearch && <button onClick={e=>{ e.stopPropagation(); setLibSearch(""); }} style={{ position:"absolute" as const,right:6,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:D.textMuted,cursor:"pointer",fontSize:14,padding:"2px 6px",lineHeight:1 }}>×</button>}
                  {/* Deploy H: sort-mode dropdown */}
                  <select value={libSortMode} onChange={e=>setLibSortMode(e.target.value as "newest"|"oldest"|"spend")} onClick={e=>e.stopPropagation()} style={{ marginLeft:8,fontSize:11,padding:"6px 8px",background:D.surface2,color:D.text,border:`0.5px solid ${D.border}`,borderRadius:6,outline:"none",fontFamily:"inherit",cursor:"pointer" }}>
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="spend">Top spend</option>
                  </select>
                </div>
                {hasActiveFilters && <button onClick={e=>{ e.stopPropagation(); setLibSearch(""); setLibFilters({ ad_types:[], statuses:[], spend_tiers:[], biomes:[] }); }} style={{ padding:"5px 10px",fontSize:10,borderRadius:6,cursor:"pointer",fontFamily:"inherit",border:`0.5px solid ${D.border2}`,background:"transparent",color:D.textMuted,whiteSpace:"nowrap" as const }}>Clear all</button>}
              </div>
              {/* Tier filter (existing, kept) */}
              <div style={{ display:"flex",gap:5,padding:"6px 16px",borderBottom:`0.5px solid ${D.border}`,flexWrap:"wrap" as const,alignItems:"center" }}>
                {/* Deploy H: multi-select tier pills matching other filters */}
                {(["winner","scalable","inspiration","failed"] as ("winner"|"scalable"|"inspiration"|"failed")[]).map(s=>(
                  <button key={s} onClick={e=>{ e.stopPropagation(); setLibTiers(p => p.includes(s) ? p.filter(v=>v!==s) : [...p, s]); }} style={{ padding:"3px 10px",fontSize:10,borderRadius:20,cursor:"pointer",fontFamily:"inherit",border:`0.5px solid ${libTiers.includes(s)?TIER_STYLE[s]?.border??D.border2:D.border2}`,background:libTiers.includes(s)?TIER_STYLE[s]?.bg??"transparent":"transparent",color:libTiers.includes(s)?TIER_STYLE[s]?.text??D.text:D.textMuted }}>
                    {s.charAt(0).toUpperCase()+s.slice(1)}
                  </button>
                ))}
                {libTiers.length > 0 && (
                  <button onClick={e=>{ e.stopPropagation(); setLibTiers([]); }} style={{ padding:"3px 10px",fontSize:10,borderRadius:20,cursor:"pointer",fontFamily:"inherit",border:`0.5px solid ${D.border2}`,background:"transparent",color:D.textDim }}>Clear</button>
                )}
                <span style={{ fontSize:10,color:D.textDim,marginLeft:"auto" }}>by spend · fatigued last</span>
              </div>
              {/* Deploy C: Multi-filter rows (ad_type, status, spend, biome) */}
              <div style={{ display:"flex",flexDirection:"column" as const,gap:4,padding:"6px 16px 8px",borderBottom:`0.5px solid ${D.border}`,background:D.surface2 }}>
                {/* ad_type */}
                <div style={{ display:"flex",gap:4,flexWrap:"wrap" as const,alignItems:"center" }}>
                  <span style={{ fontSize:9,color:D.textDim,marginRight:4,minWidth:40 }}>type</span>
                  {(["moc","competitor","compound"] as const).map(v => {
                    const active = libFilters.ad_types.includes(v);
                    return <button key={v} onClick={e=>{ e.stopPropagation(); toggleFilter("ad_types",v); }} style={{ padding:"2px 8px",fontSize:9,borderRadius:20,cursor:"pointer",fontFamily:"inherit",border:`0.5px solid ${active?D.purple:D.border2}`,background:active?D.purpleBg:"transparent",color:active?D.purple:D.textMuted }}>{v}</button>;
                  })}
                </div>
                {/* status */}
                <div style={{ display:"flex",gap:4,flexWrap:"wrap" as const,alignItems:"center" }}>
                  <span style={{ fontSize:9,color:D.textDim,marginRight:4,minWidth:40 }}>status</span>
                  {CREATIVE_STATUS.map(s => {
                    const active = libFilters.statuses.includes(s.value);
                    return <button key={s.value} onClick={e=>{ e.stopPropagation(); toggleFilter("statuses",s.value); }} style={{ padding:"2px 8px",fontSize:9,borderRadius:20,cursor:"pointer",fontFamily:"inherit",border:`0.5px solid ${active?s.border:D.border2}`,background:active?s.bg:"transparent",color:active?s.text:D.textMuted }}>{s.label}</button>;
                  })}
                </div>
                {/* spend_tier (only if any lib entries have a spend tier set) */}
                {uniqueSpendTiersInLib.length > 0 && (
                  <div style={{ display:"flex",gap:4,flexWrap:"wrap" as const,alignItems:"center" }}>
                    <span style={{ fontSize:9,color:D.textDim,marginRight:4,minWidth:40 }}>spend</span>
                    {uniqueSpendTiersInLib.map(v => {
                      const active = libFilters.spend_tiers.includes(v);
                      const tierStyle = SPEND_TIERS.find(t => t.value === v);
                      return <button key={v} onClick={e=>{ e.stopPropagation(); toggleFilter("spend_tiers",v); }} style={{ padding:"2px 8px",fontSize:9,borderRadius:20,cursor:"pointer",fontFamily:"inherit",border:`0.5px solid ${active?(tierStyle?.border??D.border2):D.border2}`,background:active?(tierStyle?.bg??"transparent"):"transparent",color:active?(tierStyle?.text??D.text):D.textMuted }}>{tierStyle?.label ?? v}</button>;
                    })}
                  </div>
                )}
                {/* biome */}
                {uniqueBiomes.length > 0 && (
                  <div style={{ display:"flex",gap:4,flexWrap:"wrap" as const,alignItems:"center" }}>
                    <span style={{ fontSize:9,color:D.textDim,marginRight:4,minWidth:40 }}>biome</span>
                    {uniqueBiomes.map(v => {
                      const active = libFilters.biomes.includes(v);
                      return <button key={v} onClick={e=>{ e.stopPropagation(); toggleFilter("biomes",v); }} style={{ padding:"2px 8px",fontSize:9,borderRadius:20,cursor:"pointer",fontFamily:"inherit",border:`0.5px solid ${active?D.green:D.border2}`,background:active?D.greenBg:"transparent",color:active?D.green:D.textMuted }}>{v}</button>;
                    })}
                  </div>
                )}
              </div>
              <div style={{ display:"flex",gap:6,padding:"8px 16px",borderBottom:`0.5px solid ${D.border}`,flexWrap:"wrap" as const }}>
                {/* Deploy H: removed Sync thumbnails (redundant post-G.3 — cloud_thumbnail auto-generated on save). Removed Clear button (landmine — use Export + manual deletion if needed). */}
                {/* Deploy P: re-added Sync Thumbnails — H's removal was wrong (cloud_thumbnail is NOT auto-generated for pre-Deploy-E entries; backfill needs explicit action). New flow fetches per-entry blobs from cloud, no IDB dependency. */}
                {/* Deploy T: cloud-sync banner — shows when entries are stuck in localStorage */}
                {pendingCloudSync.length > 0 && (
                  <div style={{ background: D.goldBg, border: `1px solid ${D.goldBdr}`, borderRadius: 6, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                    <span style={{ fontSize: 12, color: D.gold, fontWeight: 500 }}>
                      ⚠ {pendingCloudSync.length} entr{pendingCloudSync.length === 1 ? "y" : "ies"} not synced to cloud
                    </span>
                    <span style={{ fontSize: 11, color: D.textMuted, flex: 1 }}>
                      These uploads succeeded locally but cloud write failed. Click to retry.
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); handleRetryCloudSync(); }}
                      disabled={syncingPending || analyzing || reanalyzingAll}
                      style={{ ...btnPri, fontSize: 11 }}
                    >
                      {syncingPending ? "Syncing…" : "🔄 Sync to cloud"}
                    </button>
                  </div>
                )}
                {lib.length > 0 && (
                  <button
                    style={{ ...btnSec, fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); handleSyncThumbnails(); }}
                    disabled={syncingThumbs || analyzing || reanalyzingAll}
                  >
                    {syncingThumbs ? (syncProgress || "Syncing…") : "🖼 Sync thumbnails"}
                  </button>
                )}
                {/* Deploy AA3: IDB → cloud frame recovery */}
                {lib.length > 0 && (
                  <button
                    style={{ ...btnSec, fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); handleSyncFramesFromIDB(); }}
                    disabled={syncingIDBFrames || syncingThumbs || analyzing || reanalyzingAll}
                    title="Recover frames from IndexedDB to cloud for entries whose cloud frames were destroyed (e.g. by past re-analyze)"
                  >
                    {syncingIDBFrames ? (idbSyncProgress || "Recovering…") : "🔄 Recover frames"}
                  </button>
                )}
                {lib.length > 0 && (
                  <button
                    style={{ ...btnSec, fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); handleRepairIndex(); }}
                    disabled={syncingThumbs || analyzing || reanalyzingAll}
                    title="Rebuild library index from per-entry blobs. Run after Deploy P to populate spend_networks + spend_window_days fields in index. Safe — no entry data touched."
                  >
                    🔧 Repair index
                  </button>
                )}
                {/* Deploy S.1: diagnose + prune orphan entries (summaries in index without per-entry blob) */}
                {lib.length > 0 && (
                  <button
                    style={{ ...btnSec, fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); handleDiagnoseLibrary(); }}
                    disabled={syncingThumbs || analyzing || reanalyzingAll}
                    title="Find entries in library that show 404 errors when expanded (orphans from pre-Q bulk-upload race). Lists them, asks for confirmation, then removes from index."
                  >
                    🔍 Diagnose library
                  </button>
                )}
                {/* Deploy K: market intelligence indicator — replaces Deploy J's "not yet used" warning. */}
                {(() => {
                  const compCount = lib.filter(d=>d.ad_type==="competitor").length;
                  if (compCount === 0) return null;
                  const synced = marketIntel && typeof marketIntel === "object" ? marketIntel : null;
                  const syncedCount = synced?.competitor_count ?? 0;
                  const pendingDelta = compCount - syncedCount;
                  const syncedAt = synced?.synced_at ? new Date(synced.synced_at) : null;
                  const syncedAgeDays = syncedAt ? Math.round((Date.now() - syncedAt.getTime()) / (24*60*60*1000)) : null;
                  const statusColor = !synced ? D.gold : (pendingDelta >= 20 ? D.gold : D.green);
                  const statusBg = !synced ? D.goldBg : (pendingDelta >= 20 ? D.goldBg : D.greenBg);
                  const statusBdr = !synced ? D.goldBdr : (pendingDelta >= 20 ? D.goldBdr : D.greenBdr);
                  const label = marketIntelRefreshing
                    ? "Synthesising market intelligence…"
                    : !synced
                      ? `⚠ ${compCount} competitor${compCount===1?"":"s"} — not yet synthesized`
                      : pendingDelta >= 20
                        ? `⚠ ${compCount} competitors — ${pendingDelta} new since last sync`
                        : `✓ ${syncedCount} competitor${syncedCount===1?"":"s"} synthesized${syncedAgeDays!==null?` · ${syncedAgeDays===0?"today":syncedAgeDays===1?"1 day ago":`${syncedAgeDays} days ago`}`:""}`;
                  const tooltip = synced ? `Titles: ${(synced.titles_covered||[]).join(", ")||"unknown"}${synced.dominance_warning?` · ${synced.dominance_warning}`:""}` : "Click Refresh to synthesise patterns from competitor ads and inject them into brief generation.";
                  return (
                    <div style={{ display:"flex",alignItems:"center",gap:8,marginRight:"auto" }}>
                      <div style={{ fontSize:10,color:statusColor,background:statusBg,border:`0.5px solid ${statusBdr}`,borderRadius:6,padding:"5px 10px" }} title={tooltip}>
                        {label}
                      </div>
                      <button
                        style={{ ...btnSec,fontSize:10,padding:"4px 10px",opacity:marketIntelRefreshing?0.6:1,cursor:marketIntelRefreshing?"wait":"pointer" }}
                        onClick={e=>{ e.stopPropagation(); refreshMarketIntel(); }}
                        disabled={marketIntelRefreshing}
                        title="Re-synthesize market intelligence from current competitor library. Takes 10-30 seconds depending on competitor count."
                      >
                        {marketIntelRefreshing?"⏳":"🔄"} Refresh
                      </button>
                      {marketIntelError && (
                        <span style={{ fontSize:10,color:D.red,background:D.redBg,border:`0.5px solid #6e2020`,borderRadius:6,padding:"5px 10px" }} title={marketIntelError}>
                          ⚠ Refresh failed
                        </span>
                      )}
                    </div>
                  );
                })()}
                {lib.length>0&&(<><button style={btnSec} onClick={e=>{ e.stopPropagation(); handleReanalyzeAll(); }} disabled={reanalyzingAll||analyzing}>{reanalyzingAll?"Re-analyzing…":"Re-analyze all"}</button><button style={btnSec} onClick={e=>{ e.stopPropagation(); exportLibrary(); }}>Export</button></>)}
                <button style={btnSec} onClick={e=>{ e.stopPropagation(); importRef.current?.click(); }}>Import</button>
                <button style={btnPri} onClick={e=>{ e.stopPropagation(); setLibPanelOpen(false); setShowModal(true); }} disabled={analyzing||reanalyzingAll}>{analyzing?"Analyzing…":"+ Upload"}</button>
              </div>
              {reanalysisProgress&&<div style={{ fontSize:11,color:D.blue,background:D.blueBg,border:`0.5px solid ${D.blueDark}`,borderRadius:7,padding:"7px 12px",margin:"8px 16px" }}>{reanalysisProgress}</div>}
              {/* Deploy C: Grid of thumbnail cards */}
              <div style={{ maxHeight:640,overflowY:"auto" as const,padding:"12px 16px" }}>
                {lib.length===0&&!analyzing&&libraryLoaded&&<div style={{ padding:"2rem 16px",textAlign:"center" as const }}><p style={{ margin:0,fontSize:12,color:D.textMuted }}>Upload MOC ads to build your Creative DNA library.</p></div>}
                {lib.length>0 && filteredSortedLib.length===0 && (
                  <div style={{ padding:"2rem 16px",textAlign:"center" as const }}><p style={{ margin:0,fontSize:12,color:D.textMuted }}>No entries match your search / filters.</p></div>
                )}
                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:10 }}>
                  {filteredSortedLib.map((d, di) => (
                    <LibraryCardGrid key={d.id} d={d} index={di} onClick={() => setLibModalId(d.id)} />
                  ))}
                </div>
              </div>
              {/* Deploy C: Fullscreen modal for expanded library card */}
              {libModalId !== null && (() => {
                const entry = lib.find(e => e.id === libModalId);
                if (!entry) return null;
                const di = lib.indexOf(entry);
                // Deploy G.2: lazy-load full entry frames from cloud if missing (team-uploaded entries)
                // Deploy O.2: trigger lazy-load when EITHER frames OR full-entry fields are missing.
                // hasFullData uses hook_type as sentinel — it's set on every Gemini-analyzed entry but never
                // included in the thin /api/load-index summary, so its absence reliably indicates "needs hydration".
                const hasFrames = entry.auto_frames?.some(f => f.image_data);
                const hasFullData = (entry as any).hook_type !== undefined && (entry as any).hook_type !== null;
                if ((!hasFrames || !hasFullData) && !loadEntryLazy.loading.has(entry.id) && !loadEntryLazy.attempted.has(entry.id)) {
                  loadEntryLazy.loading.add(entry.id);
                  loadEntryLazy.attempted.add(entry.id);
                  fetch(`/api/load-entry?id=${entry.id}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(fullEntry => {
                      loadEntryLazy.loading.delete(entry.id);
                      // Deploy O.2: FULL ENTRY MERGE — fill in fields missing from index summary without ever
                      // overwriting local non-undefined values (preserves any in-session edits user just made).
                      if (fullEntry && typeof fullEntry === "object") {
                        setLib(currentLib => currentLib.map(e => {
                          if (e.id !== entry.id) return e;
                          const merged: any = { ...e };
                          for (const key of Object.keys(fullEntry)) {
                            const localVal = merged[key];
                            const cloudVal = (fullEntry as any)[key];
                            const localIsEmpty = localVal === undefined || localVal === null
                              || (Array.isArray(localVal) && localVal.length === 0)
                              || (typeof localVal === "string" && localVal === "");
                            const cloudHasValue = cloudVal !== undefined && cloudVal !== null
                              && !(Array.isArray(cloudVal) && cloudVal.length === 0);
                            // Deploy Z2: special-case auto_frames — if local has metadata-only frames
                            // (no image_data) and cloud has frames WITH image_data, replace local.
                            // Without this, re-analyzed entries get stuck with stripped frames forever.
                            if (key === "auto_frames" && Array.isArray(localVal) && Array.isArray(cloudVal)) {
                              const localHasImg = localVal.some((f: any) => f && f.image_data);
                              const cloudHasImg = cloudVal.some((f: any) => f && f.image_data);
                              if (!localHasImg && cloudHasImg) {
                                merged[key] = cloudVal;
                                continue;
                              }
                            }
                            if (localIsEmpty && cloudHasValue) {
                              merged[key] = cloudVal;
                            }
                          }
                          return merged;
                        }));
                        // Cache frames in IDB if cloud provided them
                        if (fullEntry.auto_frames?.some((f: any) => f.image_data)) {
                          saveFramesToIDB([{ ...entry, auto_frames: fullEntry.auto_frames }] as DNAEntry[]);
                        }
                      }
                    })
                    .catch(err => {
                      loadEntryLazy.loading.delete(entry.id);
                      console.warn(`[Levelly G.2] load-entry failed for ${entry.id}:`, err);
                    });
                }
                return (
                  <LibraryModal entry={entry} di={di} lib={lib} saveLib={saveLib}
                    expandedDNA={di} setExpandedDNA={setExpandedDNA}
                    reanalyzingIds={reanalyzingIds} handleReanalyzeSingle={handleReanalyzeSingle}
                    onZoomFrame={(src,list,idx)=>{ setZoomedFrame(src); setZoomedFrameList(list??[src]); setZoomedFrameIndex(idx??0); }}
                    isReanalyzing={reanalyzingEntry === entry.id} onReupload={handleReupload}
                    onClose={() => setLibModalId(null)} />
                );
              })()}
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
                <ReferenceDropZone onRef={setBriefRef} currentRef={briefRef} onClear={() => { setBriefRef(null); setLiftIntent(""); }} iterateFrom={iterateFrom} onIterateFrom={setIterateFrom} />
                {/* Deploy BC2 P3: multi-image-ref slot panel. Shows beneath primary drop zone whenever
                    primary is image OR additional refs exist OR room for more. Max 4 image refs total. */}
                {(() => {
                  const primaryIsImage = briefRef && !briefRef.mimeType.startsWith("video/");
                  const totalImageRefs = (primaryIsImage ? 1 : 0) + briefImageRefs.length;
                  const canAddMore = totalImageRefs < 4 && !(briefRef && briefRef.mimeType.startsWith("video/"));
                  if (briefImageRefs.length === 0 && !canAddMore) return null;
                  if (briefImageRefs.length === 0 && !primaryIsImage) return null;
                  return (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: D.surface, border: `0.5px solid ${D.border}`, borderRadius: 7 }}>
                      <div style={{ fontSize: 10, color: D.textDim, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600, marginBottom: 6 }}>
                        Image refs ({totalImageRefs}/4) — drop multiple to combine into one brief
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {briefImageRefs.map((r, idx) => (
                          <div key={idx} style={{ position: "relative", width: 56, height: 56, borderRadius: 6, overflow: "hidden", border: `0.5px solid ${D.border}` }}>
                            <img src={`data:${r.mimeType};base64,${r.base64}`} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button
                              onClick={() => setBriefImageRefs(prev => prev.filter((_, i) => i !== idx))}
                              title={`Remove ${r.name}`}
                              style={{ position: "absolute", top: 2, right: 2, width: 16, height: 16, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                            >×</button>
                          </div>
                        ))}
                        {canAddMore && (
                          <label style={{ width: 56, height: 56, borderRadius: 6, border: `1px dashed ${D.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: D.textDim, fontSize: 11 }}>
                            + add
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: "none" }}
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const result = reader.result as string;
                                  const m = result.match(/^data:([^;]+);base64,(.*)$/);
                                  if (m) setBriefImageRefs(prev => [...prev, { base64: m[2], mimeType: m[1], name: f.name }]);
                                };
                                reader.readAsDataURL(f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: D.textDim, marginTop: 6 }}>
                        Primary slot above + extras here. All refs combine into one structural blueprint for the brief renders.
                      </div>
                    </div>
                  );
                })()}
                {briefRef && briefRef.mimeType.startsWith("video/") && (
                  <div style={{ marginTop:8,padding:"8px 10px",background:D.purpleBg,border:`0.5px solid ${D.purpleBdr}`,borderRadius:7 }}>
                    {/* Deploy BC2 P4: ad_type toggle for video ref. Routes through MOC analyzer (richer DNA) vs competitor analyzer (universal vocab). */}
                    <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8,paddingBottom:8,borderBottom:`0.5px solid ${D.border}` }}>
                      <span style={{ fontSize:10,color:D.purple,textTransform:"uppercase",letterSpacing:".06em",fontWeight:600 }}>Video type</span>
                      <button
                        onClick={() => setBriefRefAdType("competitor")}
                        style={{ fontSize:11,padding:"3px 9px",borderRadius:5,border:`0.5px solid ${briefRefAdType==="competitor"?D.purple:D.border}`,background:briefRefAdType==="competitor"?D.purpleBg:"transparent",color:briefRefAdType==="competitor"?D.purple:D.textDim,cursor:"pointer",fontWeight:500 }}
                      >Competitor (other game)</button>
                      <button
                        onClick={() => setBriefRefAdType("moc")}
                        style={{ fontSize:11,padding:"3px 9px",borderRadius:5,border:`0.5px solid ${briefRefAdType==="moc"?D.blue:D.border}`,background:briefRefAdType==="moc"?D.blueBg:"transparent",color:briefRefAdType==="moc"?D.blue:D.textDim,cursor:"pointer",fontWeight:500 }}
                      >MOC ad (own clip)</button>
                    </div>
                    <div style={{ fontSize:10,color:D.purple,textTransform:"uppercase",letterSpacing:".06em",fontWeight:600,marginBottom:5 }}>What to lift from this ref</div>
                    <textarea
                      value={liftIntent}
                      onChange={e => setLiftIntent(e.target.value)}
                      placeholder="e.g. the escalating gate values — use 5, 50, 500 instead of static +1 / lift the boss kick hook / use the lane layout"
                      style={{ width:"100%",boxSizing:"border-box",fontSize:12,padding:"6px 8px",background:"transparent",border:`0.5px solid ${D.border}`,borderRadius:6,minHeight:42,resize:"vertical",outline:"none",fontFamily:"inherit",color:D.text,lineHeight:1.5 } as React.CSSProperties}
                    />
                    <div style={{ fontSize:10,color:D.textDim,marginTop:4 }}>Optional. If empty, Levelly uses the full competitor intelligence as general inspiration.</div>
                  </div>
                )}
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

          {/* Deploy L: "📊 Intel used" badge + click-to-view panel, shown when brief used market intel */}
          {(!libPanelOpen&&!analysePanelOpen)&&concepts.length>0&&briefIntelSnapshot&&(briefIntelSnapshot as any).digest&&(
            <div style={{ marginBottom:14,background:D.surface,border:`0.5px solid ${D.border}`,borderRadius:10,padding:"10px 14px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <span style={{ fontSize:11,fontWeight:600,color:D.blue,background:D.blueBg,border:`0.5px solid ${D.blueDark}`,borderRadius:6,padding:"3px 9px" }} title="This brief was generated with market intelligence from your competitor library.">📊 Intel used</span>
                <span style={{ fontSize:11,color:D.textMuted }}>
                  Synthesised from {(briefIntelSnapshot as any).competitor_count||0} competitor ad{(briefIntelSnapshot as any).competitor_count===1?"":"s"}
                  {(briefIntelSnapshot as any).synced_at?` · ${new Date((briefIntelSnapshot as any).synced_at).toLocaleDateString()}`:""}
                </span>
                <button onClick={e=>{ e.stopPropagation(); setShowIntelPanel(p=>!p); }} style={{ ...btnSec,fontSize:10,padding:"3px 10px",marginLeft:"auto" }}>
                  {showIntelPanel?"▲ Hide":"▼ Audit intel"}
                </button>
              </div>
              {showIntelPanel&&(() => {
                const d = (briefIntelSnapshot as any).digest || {};
                const axes = d.differentiation_axes || [];
                const outsiders = d.genre_outsiders || [];
                const ugcPat = d.ugc_hook_patterns || [];
                const legacyHook = d.top_hook_patterns || [];
                const legacyFantasy = d.top_core_fantasies || [];
                const legacyMech = d.transferable_mechanics || [];
                const isLegacy = axes.length === 0 && outsiders.length === 0 && (legacyHook.length > 0 || legacyFantasy.length > 0);
                return (
                  <div style={{ marginTop:10,paddingTop:10,borderTop:`0.5px solid ${D.border}`,fontSize:11,lineHeight:1.5,color:D.textMuted }}>
                    {isLegacy && <div style={{ marginBottom:8,padding:"6px 10px",background:D.goldBg,border:`0.5px solid ${D.goldBdr}`,borderRadius:6,color:D.gold,fontSize:10 }}>⚠ Legacy intel format. Click 🔄 Refresh in library panel for stronger differentiation signal.</div>}
                    {!isLegacy && axes.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:10,fontWeight:600,color:D.textDim,textTransform:"uppercase" as const,letterSpacing:"0.06em",marginBottom:4 }}>Differentiation axes</div>
                        {axes.map((a: any,i: number) => (
                          <div key={i} style={{ marginBottom:6,paddingLeft:8,borderLeft:`2px solid ${D.blueDark}` }}>
                            <div style={{ color:D.text,fontWeight:500 }}>{a.axis_name} <span style={{ color:D.textDim,fontSize:10 }}>[{a.confidence}]</span></div>
                            <div>{a.description}</div>
                            <div style={{ color:D.blue,marginTop:2,fontStyle:"italic" as const }}>💡 {a.differentiation_hypothesis}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!isLegacy && outsiders.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:10,fontWeight:600,color:D.textDim,textTransform:"uppercase" as const,letterSpacing:"0.06em",marginBottom:4 }}>Genre outsiders</div>
                        {outsiders.map((o: any,i: number) => (
                          <div key={i} style={{ marginBottom:6,paddingLeft:8,borderLeft:`2px solid ${D.gold}` }}>
                            <div style={{ color:D.text,fontWeight:500 }}>{o.entry_title} <span style={{ color:D.textDim,fontSize:10 }}>({o.genre})</span></div>
                            <div>{o.unique_element}</div>
                            <div style={{ color:D.gold,marginTop:2,fontStyle:"italic" as const }}>→ {o.moc_translation}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {isLegacy && legacyHook.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:10,fontWeight:600,color:D.textDim,textTransform:"uppercase" as const,letterSpacing:"0.06em",marginBottom:4 }}>Hook patterns (legacy)</div>
                        {legacyHook.slice(0,3).map((p: any,i: number) => (
                          <div key={i} style={{ marginBottom:4 }}>• {p.pattern_name}: {p.description}</div>
                        ))}
                      </div>
                    )}
                    {ugcPat.length > 0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:10,fontWeight:600,color:D.textDim,textTransform:"uppercase" as const,letterSpacing:"0.06em",marginBottom:4 }}>UGC hook patterns</div>
                        {ugcPat.map((u: any,i: number) => (
                          <div key={i} style={{ marginBottom:4 }}>• {u.archetype}: {u.opening_cue_pattern}</div>
                        ))}
                      </div>
                    )}
                    {axes.length === 0 && outsiders.length === 0 && legacyHook.length === 0 && ugcPat.length === 0 && (
                      <div style={{ color:D.textDim,fontStyle:"italic" as const }}>No actionable signal extracted (see library panel gaps). Add more diverse competitors and re-sync.</div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          {(!libPanelOpen&&!analysePanelOpen)&&lastCompetitorEntry&&concepts.length>0&&(
            <div style={{ background:D.surface,border:`1.5px solid ${D.purpleBdr}`,borderRadius:10,padding:"12px 16px",marginBottom:14 }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none" }} onClick={()=>setCompetitorExpanded(!competitorExpanded)}>
                <span style={{ fontSize:10,color:D.purple,textTransform:"uppercase",letterSpacing:".08em",fontWeight:600 }}>Competitor Inspiration</span>
                <span style={pill(D.purpleBg,D.purple,D.purpleBdr)}>{lastCompetitorEntry.core_fantasy||"competitor"}</span>
                <span style={{ flex:1 }} />
                <span style={{ fontSize:11,color:D.textDim }}>{competitorExpanded?"▾ Hide":"▸ Show"} details</span>
              </div>
              {competitorExpanded&&(
                <div style={{ marginTop:12,paddingTop:12,borderTop:`0.5px solid ${D.border}` }}>
                  <div style={{ fontSize:13,fontWeight:500,color:D.text,marginBottom:8 }}>{lastCompetitorEntry.title}</div>
                  {lastCompetitorEntry.moc_inspiration&&(
                    <div style={{ marginBottom:10 }}>
                      <span style={labelStyle}>MOC inspiration</span>
                      <p style={{ margin:0,fontSize:11,color:D.textMuted,lineHeight:1.6 }}>{lastCompetitorEntry.moc_inspiration}</p>
                    </div>
                  )}
                  {lastCompetitorEntry.transferable_elements&&lastCompetitorEntry.transferable_elements.length>0&&(
                    <div style={{ marginBottom:8 }}>
                      <span style={labelStyle}>Transferable elements</span>
                      <ul style={{ margin:"4px 0 0",paddingLeft:16,fontSize:11,color:D.textMuted,lineHeight:1.6 }}>
                        {lastCompetitorEntry.transferable_elements.map((el,i)=>(<li key={i} style={{ marginBottom:4 }}>{el}</li>))}
                      </ul>
                    </div>
                  )}
                  <div style={{ fontSize:10,color:D.textDim,marginTop:8 }}>Saved to library as inspiration/competitor</div>
                </div>
              )}
            </div>
          )}
          {(!libPanelOpen&&!analysePanelOpen)&&concepts.map((c,ci)=>(
            <div key={ci} style={{ background:expandedConcept===ci?"#161f2e":D.surface,border:`0.5px solid ${(c as any).is_experimental?"#9d174d":D.border}`,borderRadius:10,padding:0,marginBottom:10,overflow:"hidden",transition:"background .15s,box-shadow .15s,border-color .15s",boxShadow:expandedConcept===ci?`0 0 0 2px ${CONCEPT_ACCENTS[ci%CONCEPT_ACCENTS.length].bg}`:"none",borderLeft:`4px solid ${CONCEPT_ACCENTS[ci%CONCEPT_ACCENTS.length].text}`,animation:`slideIn .2s ease-out ${ci*0.05}s both` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",cursor:"pointer",padding:"14px 16px" }} onClick={()=>setExpandedConcept(expandedConcept===ci?null:ci)}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap" as const }}>
                    <span style={{ fontSize:9,fontWeight:700,color:D.textDim,letterSpacing:"0.1em" }}>CONCEPT {ci+1}</span>
                    {/* Deploy J: large concept number badge */}
                    <span style={{ display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:26,height:22,padding:"0 7px",borderRadius:6,fontSize:12,fontWeight:700,background:CONCEPT_ACCENTS[ci%CONCEPT_ACCENTS.length].bg,color:CONCEPT_ACCENTS[ci%CONCEPT_ACCENTS.length].text,border:`0.5px solid ${CONCEPT_ACCENTS[ci%CONCEPT_ACCENTS.length].border}`,letterSpacing:"0.03em",marginRight:2 }}>#{ci+1}</span>
                    {c.is_data_backed&&<span style={pill(D.goldBg,D.gold,D.goldBdr)}>Data-backed</span>}
                    {c.is_experimental&&<span style={pill("#2a1a2e","#f472b6","#9d174d")}>⚠ Experimental</span>}
                    {/* Deploy M: per-concept intel provenance — shows which differentiation axis or genre outsider this concept lifted from */}
                    {(c as any).intel_source && typeof (c as any).intel_source === "string" && ((c as any).intel_source as string).trim().length > 0 && (
                      <span style={pill(D.blueBg, D.blue, D.blueDark)} title={`This concept lifts from market intelligence source: ${(c as any).intel_source}`}>↗ Intel: {(c as any).intel_source}</span>
                    )}
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
                    {/* Deploy I: universal copy — pre-uploads renders as hosted URLs so Notion/Docs/Gmail/Slack all render images */}
                    <div onClick={async e=>{ e.stopPropagation();
                      // Deploy N: encode ci in sentinel so only THIS button shows "Uploading…", not all 4.
                      // UPLOADING_CI_OFFSET = 10. ci=0 → -10, ci=1 → -11, ci=2 → -12, ci=3 → -13.
                      setCopiedConcept(-(ci + 10)); // transient per-button "uploading" sentinel
                      try {
                        // Collect all data: URI renders for this concept and upload them to hosted URLs
                        const sceneUrls: Record<string, string> = {};
                        const sceneKeys = ["visual_scene","visual_start","visual_hook_a","visual_hook_b","visual_hook_c"] as const;
                        const base = window.location.origin;
                        const uploads: Promise<void>[] = [];
                        for (const k of sceneKeys) {
                          const dataUri = (c as any)[k] as string | undefined;
                          if (dataUri && dataUri.startsWith("data:")) {
                            uploads.push((async () => {
                              try {
                                const resp = await fetch("/api/upload-image", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ dataUri })
                                });
                                if (resp.ok) {
                                  const data = await resp.json();
                                  if (data?.url) sceneUrls[k] = base + data.url;
                                }
                              } catch (err) { console.warn("[Levelly I] image upload failed for "+k, err); }
                            })());
                          }
                        }
                        await Promise.all(uploads);

                        // Build concept with swapped URLs for HTML rendering
                        const conceptForHtml = { ...c } as any;
                        for (const k of sceneKeys) {
                          if (sceneUrls[k]) conceptForHtml[k] = sceneUrls[k];
                        }
                        const html = formatBriefAsHTML(conceptForHtml as Concept, ci);
                        await navigator.clipboard.write([new ClipboardItem({
                          "text/html": new Blob([html],{type:"text/html"}),
                          "text/plain": new Blob([c.title+(c.objective?"\n"+c.objective:"")],{type:"text/plain"})
                        })]);
                        setCopiedConcept(ci); setTimeout(()=>setCopiedConcept(null),2500);
                      } catch (err) {
                        console.warn("[Levelly I] copy failed, falling back to plain text:", err);
                        const lines=[c.title||"",c.objective||"",c.hook_description||"",c.lane_design||"",(c.unit_evolution_chain||[]).join(" → ")].filter(Boolean).join("\n");
                        try { await navigator.clipboard.writeText(lines); } catch {}
                        setCopiedConcept(ci); setTimeout(()=>setCopiedConcept(null),2500);
                      }
                    }} style={{ fontSize:11,padding:"4px 10px",borderRadius:6,background:copiedConcept===ci?D.greenBg:(copiedConcept===-(ci+10)?D.blueBg:D.blueBg),color:copiedConcept===ci?D.green:D.blue,border:`0.5px solid ${copiedConcept===ci?D.greenBdr:D.blueDark}`,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap" as const,transition:"background .2s,color .2s,border-color .2s" }}>{copiedConcept===-(ci+10)?"⏳ Uploading…":copiedConcept===ci?"✓ Copied!":"⎘ Copy brief"}</div>
                  </div>
                </div>
              </div>
              <div style={{ borderTop:`0.5px solid ${D.border}`,padding:"8px 16px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" as const,background:conceptVotes[ci]?D.surface2:"transparent" }} onClick={e=>e.stopPropagation()}>
                <span style={{ fontSize:10,color:D.textDim,letterSpacing:".05em",textTransform:"uppercase" as const }}>Rate:</span>
                <button
                  onClick={()=>{
                    const newVote: "up"|"down"|null = conceptVotes[ci]==="up" ? null : "up";
                    setConceptVotes(prev=>{ const n={...prev}; if(newVote) n[ci]=newVote; else delete n[ci]; return n; });
                    if(newVote) submitFeedback(ci, c.title, newVote, conceptNotes[ci]||"");
                  }}
                  style={{ fontSize:11,padding:"3px 10px",borderRadius:14,cursor:"pointer",border:`0.5px solid ${conceptVotes[ci]==="up"?D.greenBdr:D.border2}`,background:conceptVotes[ci]==="up"?D.greenBg:"transparent",color:conceptVotes[ci]==="up"?D.green:D.textMuted,fontFamily:"inherit",fontWeight:500,transition:"all .15s" }}
                  title="Good concept — would produce"
                >👍 Good</button>
                <button
                  onClick={()=>{
                    const newVote: "up"|"down"|null = conceptVotes[ci]==="down" ? null : "down";
                    setConceptVotes(prev=>{ const n={...prev}; if(newVote) n[ci]=newVote; else delete n[ci]; return n; });
                    if(newVote) submitFeedback(ci, c.title, newVote, conceptNotes[ci]||"");
                  }}
                  style={{ fontSize:11,padding:"3px 10px",borderRadius:14,cursor:"pointer",border:`0.5px solid ${conceptVotes[ci]==="down"?"#6e2020":D.border2}`,background:conceptVotes[ci]==="down"?D.redBg:"transparent",color:conceptVotes[ci]==="down"?D.red:D.textMuted,fontFamily:"inherit",fontWeight:500,transition:"all .15s" }}
                  title="Not good — skip this"
                >👎 Not quite</button>
                {conceptVotes[ci]&&(
                  <input
                    type="text"
                    placeholder="What's off? (optional)"
                    value={conceptNotes[ci]||""}
                    onChange={e=>setConceptNotes(prev=>({...prev,[ci]:e.target.value}))}
                    onBlur={()=>{ const v=conceptVotes[ci]; const n=conceptNotes[ci]||""; if(v&&n.trim()) submitFeedback(ci, c.title, v, n); }}
                    style={{ flex:1,minWidth:180,fontSize:11,padding:"3px 8px",borderRadius:5,border:`0.5px solid ${D.border2}`,background:D.surface,color:D.text,fontFamily:"inherit" }}
                  />
                )}
              </div>
              {expandedConcept===ci&&(
                <div style={{ padding:"0 16px 16px",borderTop:`0.5px solid ${D.border}`,paddingTop:16 }}>
                  {/* Deploy I: unit_evolution_chain + lane_design moved TO TOP (high signal). Other context fields moved into collapsible "More details" block below scene renders. */}
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
                  {/* Deploy I: low-signal blocks (9-step curve, upgrade triggers, tension moments, visual identity)
                      moved below production_script into a collapsible "More details" section — see below. */}

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
                        const sceneSubLabel={scene:"Top-down lane",hook_a:"Gameplay Boss",hook_b:"UGC",hook_c:"Stopwatch/Viral"}[scene]||"";
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
                      {/* Deploy F: Refine annotation drop zone — compact, sits above textarea */}
                      <RefineDropZone
                        currentRef={refineRefs[ci] || null}
                        onDrop={file => handleRefineRefDrop(ci, file)}
                        onClear={() => setRefineRefs(p => ({ ...p, [ci]: null }))}
                      />
                      <textarea
                        value={refineTexts[ci]||""}
                        onChange={e=>setRefineTexts(p=>({...p,[ci]:e.target.value}))}
                        placeholder={refineRefs[ci] ? "Describe what to change… (the dropped image will guide the edit)" : "Describe what to change… e.g. 'add more mobs', 'make the boss bigger', 'change biome to Desert'"}
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
                              // Deploy F: pass user annotation reference too if present (drag-drop screenshot for spatial guidance)
                              await handleRenderScene(ci,targetScene,prompt,refineRefs[ci]||null);
                              setRefineTexts(p=>({...p,[ci]:""}));
                              setRefineRefs(p=>({...p,[ci]:null})); // clear annotation on success
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

                  {/* Deploy I: "More details" collapsible — hook_timing, 9-step curve, upgrade triggers, tension moments, visual identity. Placed at the bottom so the high-signal content (unit chain, lane, renders, script) stays on top. */}
                  <div style={{ marginTop:12,paddingTop:12,borderTop:`0.5px solid ${D.border}` }}>
                    <button
                      onClick={e=>{ e.stopPropagation(); setBriefDetailsExpanded(p=>({...p,[ci]:!p[ci]})); }}
                      style={{ background:"transparent",border:"none",color:D.textMuted,fontSize:11,padding:"4px 0",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6 }}
                    >
                      <span style={{ fontSize:10,color:D.textDim }}>{briefDetailsExpanded[ci]?"▲":"▼"}</span>
                      {briefDetailsExpanded[ci]?"Hide details":"More details (hook timing, 9-step curve, upgrade triggers, tension, visual identity)"}
                    </button>
                    {briefDetailsExpanded[ci]&&(
                      <div style={{ marginTop:10 }}>
                        {(c as any).hook_timing_seconds!=null&&<div style={{ marginBottom:12,padding:"8px 12px",background:D.blueBg,borderRadius:8,fontSize:11,color:D.blue,border:`0.5px solid ${D.blueDark}` }}>Hook at <strong>{(c as any).hook_timing_seconds}s</strong> — {c.performance_hooks?.[0]?.type||"Challenge"}</div>}
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
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cardFadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes modalBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        * { box-sizing: border-box; }
        select option { background: #161b22; color: #e6edf3; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
      `}</style>
    </div>
  );
}
