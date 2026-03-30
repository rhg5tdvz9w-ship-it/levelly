const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";
const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-6";

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  var task, payload;
  try {
    var body = JSON.parse(event.body || "{}");
    task = body.task;
    payload = body.payload;
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  try {
    if (task === "image") {
      var result = await callGeminiImage(payload.prompt);
      return { statusCode: 200, body: JSON.stringify({ result: result }) };
    }

    if (task === "brief") {
      var result = await callClaudeBrief(payload.library, payload.briefContext, payload.segment, payload.iterateFrom);
      return { statusCode: 200, body: JSON.stringify(result) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Unknown task: " + task }) };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Unknown error" }) };
  }
};

// ── Gemini image (unchanged) ──────────────────────────────────────────────────
async function callGeminiImage(prompt) {
  var r = await fetch(GEMINI_IMAGE_URL + "?key=" + GEMINI_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
    })
  });
  if (!r.ok) throw new Error("Gemini image " + r.status + ": " + await r.text());
  var data = await r.json();
  var parts = data.candidates[0].content.parts;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].inlineData) return "data:image/png;base64," + parts[i].inlineData.data;
  }
  throw new Error("No image returned from Gemini");
}

// ── Claude brief ──────────────────────────────────────────────────────────────
async function callClaudeBrief(library, briefContext, segment, iterateFrom) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  var winners = (library || []).filter(function(d) { return d.tier === "winner"; }).map(function(d) {
    return {
      title: d.title,
      hook_type: d.hook_type,
      hook_timing_seconds: d.hook_timing_seconds,
      gate_sequence: (d.gate_sequence || []).slice(0, 6),
      unit_evolution_chain: (d.unit_evolution_chain || []),
      key_mechanic: d.key_mechanic,
      biome: d.biome,
      loss_event_type: d.loss_event_type,
      spend_tier: d.spend_tier || null,
      spend_networks: d.spend_networks || [],
      replication_instructions: (d.replication_instructions || "").slice(0, 200)
    };
  });

  var refBlock = iterateFrom
    ? '\nITERATE FROM: "' + iterateFrom + '" — this is the creative starting point. Study its patterns from the DNA library if it exists there. MOC DNA rules below are still the PRIMARY output driver — the ref tells you WHERE TO START, not where to end up.\n'
    : "";

  var systemPrompt = 'You are a World-Class Lead Creative Producer for Mob Control (MOC), a mobile game by Voodoo.\n\nGround EVERY concept in specific proven patterns from the DNA library below. Never invent mechanics, hooks, or gate sequences that are not represented in winning data.\n\nWINNER DNA LIBRARY (' + winners.length + ' entries):\n' + JSON.stringify(winners.map(function(d) {
    return {
      title: d.title,
      hook_type: d.hook_type,
      hook_timing_seconds: d.hook_timing_seconds,
      gate_sequence: (d.gate_sequence || []).slice(0, 6),
      unit_evolution_chain: d.unit_evolution_chain,
      key_mechanic: d.key_mechanic,
      biome: d.biome,
      loss_event_type: d.loss_event_type,
      spend_tier: d.spend_tier || null,
      spend_networks: d.spend_networks || [],
      replication_instructions: (d.replication_instructions || "").slice(0, 250)
    };
  }), null, 2) + '\n\nBRIEF: ' + briefContext + '\nTARGET SEGMENT: ' + segment + refBlock + '\n\nSEGMENT DATA:\n- Whale (>$50/mo, 45-59yo): Motivation = Winning / Rankings\n- Dolphin ($10-50/mo): Motivation = Winning + Fun\n- Minnow (<$10/mo): Motivation = Fun + Winning\n- Non-Payer: Motivation = Fun + Challenges\n\nMOC BIOMES: Desert, Foggy Forest, Water, Bunker, Cyber-City, Volcanic, Snow, Toxic, Meadow\n9-STEP EMOTIONAL CURVE: Pressure → Investment → Validate → Investment2 → Payoff → False Safety → Pressure++ → Almost Win → Fail\n\nNETWORK RULES (apply per network):\n- AppLovin: skeleton/challenge hooks, custom side camera, blue palette, CT43 formula strongest at $5.6K/day\n- Facebook: blue/red color swap, desert biome, default MOC camera, CZ65 pattern (top-1 FB)\n- Google: strengthen almost-win to boss at 1HP, CB57 pattern, foggy forest worth testing\n- TikTok: fast pacing, strong hook in first 2s\n\nSPEND WEIGHTING: Weight patterns by spend velocity. CT43 ($5.6K/day) should be weighted ~5x over a $1.1K/day entry.\n\nINSTRUCTIONS:\n- Cite which DNA library entry each concept is based on (dna_source field)\n- Replicate exact gate sequences and unit evolution chains from winners — do not invent new ones\n- Hook timing must NOT be 0 — must be a real second (e.g. 2, 4, 8)\n- For network_adaptations: give one specific actionable sentence per network\n- Quality scores must be honest — a 91 means genuinely exceptional pattern fidelity\n\nReturn ONLY valid JSON, no markdown fences, no preamble:\n{"analysis":{"patterns_used":string,"dna_sources":[string],"segment_insight":string,"strategy":string},"concepts":[{"title":string,"dna_source":string,"is_data_backed":boolean,"objective":string,"target_segment":string,"player_motivation":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"layout":string,"hook_timing_seconds":number,"unit_evolution_chain":[string],"network_adaptations":{"AppLovin":string,"Facebook":string,"Google":string},"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"performance_hooks":[{"type":string,"text":string}],"engagement_hooks":string,"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}]}';

  var r = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: "Generate 3 MOC ad concepts grounded in the DNA library. Return only JSON." }]
    })
  });

  if (!r.ok) {
    var errText = await r.text();
    throw new Error("Claude API " + r.status + ": " + errText);
  }

  var data = await r.json();
  var rawText = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : "{}";

  var cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
  var start = cleaned.indexOf("{");
  var end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Claude returned non-JSON: " + cleaned.slice(0, 200));

  return JSON.parse(cleaned.slice(start, end + 1));
}
