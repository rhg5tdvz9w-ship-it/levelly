import type { Handler } from "@netlify/functions";

// Deploy W: extracts structured description from a single uploaded image (or array of images).
// Two-stage extraction:
//   1. Describe what's IN the image in its OWN terms (no MOC vocabulary forced).
//   2. MOC translation note — short suggestion of how it could map to MOC. Honest if not applicable.
// POST /api/analyze-image-ref  body: { images: [{ base64, mimeType }] }
//   → { ok: true, description: <structured object>, moc_translation_note: string }
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "GEMINI_API_KEY env var missing" }) };
  }
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const images: Array<{ base64: string; mimeType: string }> = Array.isArray(body.images) ? body.images : [];
    if (images.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, error: "No images provided" }) };
    }

    const systemPrompt = `You analyze a user-uploaded reference image (or multiple images) and produce a structured description for downstream brief generation.

CRITICAL: describe what IS in the image. Do NOT force MOC vocabulary onto the reference. If the reference has no lanes, do not say "lane structure". If it's an idle game screenshot with no road, describe what it actually shows.

Return JSON with exactly these fields:

{
  "spatial_layout": "describe the camera angle and spatial structure — e.g. 'top-down map view', 'side-scrolling lane', 'single road from bottom to top', 'isometric base view', 'no clear spatial structure (UI screen)'. Be honest about what you see.",
  "visible_elements": [
    "list each notable element with its function if obvious — e.g. 'breakable wooden wall blocking the path at center', 'lifting platform on left side', '+99 gates stacked behind a barrier', 'mining drill on right', '3-lane fork in middle ground'. Use everyday vocabulary."
  ],
  "numbers_and_text_visible": "any gate values, counters, progress numbers, level numbers, currency amounts, or text overlays. e.g. '+1, +1, x100, x4' or 'level 25, 327 score'. Empty string if none.",
  "biome_and_aesthetic": "biome / setting / color palette / mood — e.g. 'arctic snow with red enemies', 'desert sand with crimson sunset', 'wood/stone medieval base', 'futuristic neon UI'. Free text.",
  "characters_and_units": "describe the player and enemy characters or units, if any. Mention scale relationship and positioning. e.g. 'tiny blue cannon at bottom, giant green dragon at top, scale ~1:20', 'small builder character bottom-left, no visible enemies', 'massive red mob army at top fills 40% of frame'. Empty string if no characters.",
  "the_interaction": "what the player or units APPEAR to be doing right now. e.g. 'cannon shooting at platform pillar to lift it', 'mobs swarming a barrel', 'character idle, decorative', 'mid-action: barrel breaking, gates revealing behind'. Be specific about the moment captured.",
  "visual_juice": "any explosion, impact, scale dynamic, particle effects, or other visual satisfaction notes. e.g. 'massive wood-shatter particles, screen shake implied', 'glowing reward halo on platform', 'static — no motion'. Empty string if none.",
  "moc_translation_note": "1-3 sentences. How could this map to MOC (Mob Control) vocabulary if applicable? MOC has cannons, mob swarms, +N/xN gates, biomes, boss towers. If the reference is non-applicable (UI screen, abstract art, totally different genre), say so honestly here — e.g. 'Non-applicable: this is a UI settings screen with no gameplay structure'. If applicable, give the concrete mapping — e.g. 'The breakable wall here corresponds to a destructible obstacle blocking +N gates in MOC. Variant V1 (break to unlock).'"
}

If multiple images are provided, treat them as views of the same reference (different angles/beats) and produce ONE combined description that synthesizes across them.

Return ONLY the JSON object, no preamble or explanation.`;

    // Build Gemini request — multimodal input
    const parts: any[] = [{ text: systemPrompt }];
    for (const img of images) {
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json", maxOutputTokens: 2048 },
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ ok: false, error: `Gemini ${resp.status}: ${JSON.stringify(data).slice(0, 300)}` }) };
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Gemini returned no text" }) };
    }
    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch { return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Gemini returned non-JSON: " + text.slice(0, 200) }) }; }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, description: parsed }),
    };
  } catch (err: any) {
    console.error("analyze-image-ref error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message || String(err) }) };
  }
};
