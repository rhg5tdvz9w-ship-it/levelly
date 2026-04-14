import { ENHANCE_UPLOAD_SYSTEM, ENHANCE_REFINE_SYSTEM, ENHANCE_BRIEF_SYSTEM } from "./prompts";

// ─── AI text enhancement (Claude via Netlify) ─────────────────────────────────
export async function enhanceText(raw: string, mode: "upload" | "brief" | "refine"): Promise<string> {
  const systemPrompt = mode === "upload" ? ENHANCE_UPLOAD_SYSTEM : mode === "refine" ? ENHANCE_REFINE_SYSTEM : ENHANCE_BRIEF_SYSTEM;
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
