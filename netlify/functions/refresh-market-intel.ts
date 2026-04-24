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
  // Deploy L: DIFFERENTIATION reframe — mirrors prompts.ts:competitorSynthesisSystem.
  // Asks what competitors do DIFFERENTLY from MOC, not what patterns exist.
  return `You are a creative strategist helping improve Mob Control (MOC) ads by learning from competitors. MOC is a top-down lane game where a cannon shoots mob swarms at multiplier gates (xN) and accumulator gates (+N) to grow the army, then crashes it into a boss at the end.

ABSOLUTE RULE #1 — EVIDENCE-BASED, NO HALLUCINATION:
Every observation you emit MUST be supported by specific entries in the data below. Cite example creative_ids or titles.

ABSOLUTE RULE #2 — DIFFERENTIATION, NOT DESCRIPTION:
Surface what competitors do DIFFERENTLY from MOC. If a pattern is ALSO what MOC does, SKIP IT.
GOOD example: "Gold & Goblins opens with passive wealth accumulation — MOC could test a passive-gains opener before cannon reveal"
Only emit observations where the competitor does something MOC does NOT.

COMPETITOR ENTRIES (${competitors.length} total):
${JSON.stringify(competitors, null, 2)}

OUTPUT SCHEMA — return ONLY valid JSON. No markdown. No prose.
{
  "differentiation_axes": [{"axis_name":string,"description":string,"example_entries":[string],"confidence":"high"|"medium"|"low","differentiation_hypothesis":string}],
  "genre_outsiders": [{"entry_title":string,"genre":string,"unique_element":string,"moc_translation":string}],
  "ugc_hook_patterns": [{"archetype":string,"persona_profile":string,"shot_setup_commonalities":string,"opening_cue_pattern":string,"example_entries":[string],"confidence":"high"|"medium"|"low"}],
  "format_gaps": [string]
}

QUANTITY: differentiation_axes 2-5 (quality over quantity — if only 2 are genuine, return 2), genre_outsiders 0-4, ugc_hook_patterns 0-4, format_gaps 0-6.
THRESHOLD: if competitors.length < 3 → empty arrays + format_gaps ["thin_sample"]. If 3-5 → allow confidence:low. If ≥6 → require ≥2 example_entries per axis.
format_gaps enum: "thin_sample","no_ugc_observed","no_stopwatch_hooks","no_escalation_mechanic","no_ragebait_hooks","no_before_after_hooks","no_non_combat_openers","no_outsider_genres","single_title_dominance","no_biome_diversity"

QUALITY BAR — CRITICAL:
- Keep every description field under 180 characters. Keep differentiation_hypothesis under 250 characters. This is intelligence for a strategist, not a report.
- If your axis describes something MOC ALSO does, SKIP it. Empty output > MOC-describes-itself.
- differentiation_hypothesis must be CONCRETE (specific scene/mechanic change), not vague ("try X").
- Genre outsiders: ONLY from genres OUTSIDE lane/battle/multiplier/army.
- Homogeneous library: say so via format_gaps ("no_outsider_genres"), return fewer axes. Do not pad.`;
}

async function callGeminiSynthesis(prompt: string): Promise<any> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    // Deploy M: maxOutputTokens hard cap keeps Flash from over-generating on the DIFFERENTIATION prompt.
    // Deploy L's prompt made Gemini reason harder per-entry, pushing synthesis past 30s. Output cap bounds it.
    generationConfig: { temperature: 0.3, responseMimeType: "application/json", maxOutputTokens: 2048 },
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
    // Deploy M: cap synthesis input at 30 most recent competitors. Prevents prompt bloat + slow generation
    // once library scales to 100+ entries. Sort by added_at desc (fall back to id numeric desc), take top 30.
    const allCompetitors = lib.filter(e => e && e.ad_type === "competitor");
    const SYNTHESIS_INPUT_CAP = 30;
    const sorted = [...allCompetitors].sort((a, b) => {
      const ta = a.added_at ? new Date(a.added_at).getTime() : 0;
      const tb = b.added_at ? new Date(b.added_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return (b.id || 0) - (a.id || 0);
    });
    const competitors = sorted.slice(0, SYNTHESIS_INPUT_CAP);
    if (allCompetitors.length > SYNTHESIS_INPUT_CAP) {
      console.log(`[refresh-market-intel] Capping synthesis input at ${SYNTHESIS_INPUT_CAP} most recent competitors (library has ${allCompetitors.length}).`);
    }

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
