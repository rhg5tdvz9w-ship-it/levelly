import { ENHANCE_UPLOAD_SYSTEM, ENHANCE_REFINE_SYSTEM, ENHANCE_BRIEF_SYSTEM } from "./prompts";

// ─── AI text enhancement (Claude via Netlify) ─────────────────────────────────
// Deploy BC2.2: enhance now ref-aware. When called from brief panel with attached refs,
// the user's text might reference "this video / these images" — without context, Claude
// would respond "I don't see any attached video." Now: append a refs preamble describing
// what the user has dropped (filenames + types + DNA if video already analyzed).
export interface EnhanceContext {
  refs?: { name: string; mimeType: string }[];
  videoDna?: { title?: string; key_mechanic?: string; biome?: string; hook_type?: string };
}
export async function enhanceText(raw: string, mode: "upload" | "brief" | "refine", context?: EnhanceContext): Promise<string> {
  const systemPrompt = mode === "upload" ? ENHANCE_UPLOAD_SYSTEM : mode === "refine" ? ENHANCE_REFINE_SYSTEM : ENHANCE_BRIEF_SYSTEM;
  let userText = raw;
  if (mode === "brief" && context?.refs && context.refs.length > 0) {
    const videoRefs = context.refs.filter(r => r.mimeType.startsWith("video/"));
    const imageRefs = context.refs.filter(r => r.mimeType.startsWith("image/"));
    const refsPreamble = `[CONTEXT — refs attached to this brief panel: ${
      videoRefs.length > 0 ? `${videoRefs.length} video (${videoRefs.map(r => r.name).join(", ")})` : ""
    }${videoRefs.length > 0 && imageRefs.length > 0 ? ", " : ""}${
      imageRefs.length > 0 ? `${imageRefs.length} image${imageRefs.length > 1 ? "s" : ""} (${imageRefs.map(r => r.name).join(", ")})` : ""
    }${context.videoDna ? `. Video DNA: ${context.videoDna.title || ""}, mechanic: ${context.videoDna.key_mechanic || ""}, biome: ${context.videoDna.biome || ""}, hook: ${context.videoDna.hook_type || ""}` : ""}]\n\nUser brief text to enhance:\n${raw}\n\nThe user is writing the brief context referring to the attached refs above. Don't ask "I don't see refs" — they're listed. Enhance the text per system rules, treating ref mentions ("this video", "this image", "ref above") as valid pointers to the attached files. Don't invent ref content not in the DNA above.`;
    userText = refsPreamble;
  }
  const r = await fetch("/api/enhance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: systemPrompt, text: userText }),
  });
  if (!r.ok) throw new Error(`Enhance failed: ${r.status}`);
  const data = await r.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("No response from Claude");
  return text.trim();
}
