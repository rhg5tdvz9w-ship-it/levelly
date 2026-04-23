import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy K: Market intelligence refresh endpoint.
// Reads competitor entries from levelly store, calls Gemini synthesis, caches result in levelly-market-intel store.
// POST /api/refresh-market-intel  (body optional)
// Response: { ok: true, digest, envelope } OR { ok: false, error }

const GEMINI_KEY = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || "";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

// Inlined synthesis prompt (ES modules don't bundle src/ into functions by default).
// If you change prompts.ts:competitorSynthesisSystem, mirror changes here.
function buildSynthesisPrompt(competitors: any[]): string {
  return `You are a creative strategist analyzing a collection of competitor mobile-game ad entries. Your job is to extract cross-ad patterns that could inform new Mob Control (MOC) ad concepts.

ABSOLUTE RULE #1 — EVIDENCE-BASED, NO HALLUCINATION:
Every pattern you emit MUST be supported by specific entries in the data below. Cite example creative_ids or titles. If a pattern exists in only one entry, either omit it entirely OR include it with "confidence":"low". Do NOT invent patterns that are not directly observable in the data.

COMPETITOR ENTRIES (${competitors.length} total):
${JSON.stringify(competitors, null, 2)}

OUTPUT SCHEMA: return ONLY valid JSON. No markdown. No prose preamble.
{
  "top_hook_patterns": [{"pattern_name":string,"description":string,"example_entries":[string],"confidence":"high"|"medium"|"low","moc_transfer_note":string}],
  "top_core_fantasies": [{"fantasy":string,"description":string,"example_entries":[string],"confidence":"high"|"medium"|"low","moc_biome_fit":string}],
  "ugc_hook_patterns": [{"archetype":string,"persona_profile":string,"shot_setup_commonalities":string,"opening_cue_pattern":string,"example_entries":[string],"confidence":"high"|"medium"|"low"}],
  "transferable_mechanics": [{"mechanic":string,"description":string,"example_entries":[string],"confidence":"high"|"medium"|"low"}],
  "gaps_noted": [string]
}

QUANTITY: hook_patterns 3-5, core_fantasies 2-4, ugc_patterns 0-4 (empty OK), transferable_mechanics 3-5, gaps_noted 0-5.
THRESHOLD: if competitors.length < 3, return empty arrays + gaps_noted ["thin_sample"]. If 3-5, allow "confidence":"low" single-example. If ≥6, require ≥2 example_entries per pattern.
gaps_noted enum: "thin_sample","no_ugc_observed","single_title_dominance","no_stopwatch_hooks","no_escalation_mechanic","no_ragebait_hooks","no_before_after_hooks","no_biome_diversity"
QUALITY: no generic patterns. Concrete and quotable labels. Tight descriptions.`;
}

async function callGeminiSynthesis(prompt: string): Promise<any> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(GEMINI_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const text = await r.text();
    if (!r.ok) {
      if (attempt === 0 && (r.status === 503 || r.status === 429)) { await new Promise(res => setTimeout(res, 3000)); continue; }
      throw new Error(`Gemini synthesis ${r.status}: ${text.slice(0, 500)}`);
    }
    const data = JSON.parse(text);
    const jsonText = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || "";
    try {
      return JSON.parse(jsonText.replace(/^\`\`\`json\s*/, "").replace(/\`\`\`\s*$/, ""));
    } catch (e) {
      if (attempt === 0) { await new Promise(res => setTimeout(res, 2000)); continue; }
      throw new Error(`Malformed JSON from Gemini synthesis: ${jsonText.slice(0, 300)}`);
    }
  }
  throw new Error("Synthesis failed after 2 attempts");
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  if (!GEMINI_KEY) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "GEMINI_KEY env var missing" }) };
  }
  try {
    // Load all entries from library-index
    const libStore = getStore("levelly");
    const indexRaw = await libStore.get("library-index");
    const lib: any[] = indexRaw ? JSON.parse(indexRaw) : [];
    const competitors = lib.filter(e => e && e.ad_type === "competitor");

    // Compute code-side derived fields
    const titles = Array.from(new Set(competitors.map(c => c.title).filter(Boolean)));
    const titleCounts: Record<string, number> = {};
    competitors.forEach(c => { if (c.title) titleCounts[c.title] = (titleCounts[c.title] || 0) + 1; });
    let dominanceWarning: string | null = null;
    if (competitors.length >= 5) {
      const maxCount = Math.max(0, ...Object.values(titleCounts));
      const maxPct = maxCount / competitors.length;
      if (maxPct > 0.7) {
        const dominantTitle = Object.entries(titleCounts).find(([_, n]) => n === maxCount)?.[0] || "(unknown)";
        dominanceWarning = `${Math.round(maxPct * 100)}% of competitor entries are from "${dominantTitle}"`;
      }
    }

    // If no competitors at all, write empty digest
    let digest: any;
    if (competitors.length === 0) {
      digest = { top_hook_patterns: [], top_core_fantasies: [], ugc_hook_patterns: [], transferable_mechanics: [], gaps_noted: ["thin_sample"] };
    } else {
      // Trim each entry to fields useful for synthesis (avoid sending frame data)
      const trimmed = competitors.map(c => ({
        creative_id: c.creative_id || null,
        title: c.title || null,
        core_fantasy: c.core_fantasy || null,
        moc_inspiration: c.moc_inspiration || null,
        transferable_elements: c.transferable_elements || [],
        hook_type: c.hook_type || null,
        hook_description: c.hook_description || null,
        hook_timing_seconds: c.hook_timing_seconds || null,
        biome: c.biome || null,
        key_mechanic: c.key_mechanic || null,
        gate_escalation: c.gate_escalation || null,
        unit_evolution_chain: c.unit_evolution_chain || [],
        why_it_works: c.why_it_works || null,
      }));
      const prompt = buildSynthesisPrompt(trimmed);
      digest = await callGeminiSynthesis(prompt);
    }

    // Build envelope (code-computed fields + LLM digest)
    const envelope = {
      synced_at: new Date().toISOString(),
      competitor_count: competitors.length,
      titles_covered: titles,
      dominance_warning: dominanceWarning,
      digest,
    };

    // Cache in levelly-market-intel blob store
    const intelStore = getStore("levelly-market-intel");
    await intelStore.set("current", JSON.stringify(envelope));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, ...envelope }),
    };
  } catch (err: any) {
    console.error("refresh-market-intel error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message || "Unknown error" }),
    };
  }
};
