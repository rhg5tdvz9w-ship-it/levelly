export const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
export const GEMINI_TEXT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
export const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GEMINI_KEY}`;

// ─── API calls ────────────────────────────────────────────────────────────────
export async function callGeminiDirect(systemPrompt: string, contentParts: any[]): Promise<any> {
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

export function parseJSON(text: string): any {
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


export function parseDataURI(uri: string): { mimeType: string; data: string } {
  const m = uri.match(/^data:([^;]+);base64,(.+)$/s);
  return m ? { mimeType: m[1], data: m[2] } : { mimeType: "image/png", data: uri };
}

export async function callImageDirect(prompt: string, refParts: any[]): Promise<string> {
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

export async function uploadToGeminiFileAPI(file: File, onStatus: (m: string) => void): Promise<{ fileUri: string; mimeType: string }> {
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

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
}

// ─── Canvas frame extraction ──────────────────────────────────────────────────
// Extracts frames from a video file at given timestamps using HTML5 canvas.
// Returns inlineData parts ready to pass to Gemini. Fully non-blocking —
// if anything fails the returned array is empty and analysis runs as before.
export async function extractFramesFromVideo(
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
      .slice(0, 25); // hard cap — matches increased frameExtractionSystem max

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

