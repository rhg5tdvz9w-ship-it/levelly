// Image generation via Gemini + brief generation via Claude (1 concept per call)
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
      return { statusCode: 200, body: JSON.stringify({ result: await callGeminiImage(payload.prompt) }) };
    }
    if (task === "brief_concept") {
      var result = await callClaudeConcept(payload);
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) };
    }
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown task: " + task }) };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Unknown error" }) };
  }
};

async function callGeminiImage(prompt) {
  var r = await fetch(GEMINI_IMAGE_URL + "?key=" + GEMINI_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } })
  });
  if (!r.ok) throw new Error("Gemini image " + r.status + ": " + await r.text());
  var data = await r.json();
  var parts = data.candidates[0].content.parts;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].inlineData) return "data:image/png;base64," + parts[i].inlineData.data;
  }
  throw new Error("No image returned from Gemini");
}

async function callClaudeConcept(payload) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not configured in Netlify environment variables");

  var winners = payload.winners || [];
  var briefContext = payload.briefContext || "";
  var segment = payload.segment || "Whale";
  var iterateFrom = payload.iterateFrom || null;
  var conceptIndex = payload.conceptIndex || 0;
  var totalConcepts = payload.totalConcepts || 4;
  var analysisOnly = payload.analysisOnly || false;
  var isExperimental = conceptIndex >= 3;

  var refBlock = iterateFrom ? '\nITERATE FROM: "' + iterateFrom + '" — creative starting point, DNA rules are primary.\n' : "";

  var systemPrompt =
    "You are a World-Class Lead Creative Producer for Mob Control (MOC) by Voodoo.\n\n" +
    "WINNER DNA LIBRARY (" + winners.length + " entries):\n" +
    JSON.stringify(winners) + "\n\n" +
    "BRIEF: " + briefContext + " | SEGMENT: " + segment + refBlock + "\n\n" +
    "SEGMENTS: Whale(>$50/mo,45-59yo,Winning/Rankings) Dolphin($10-50,Winning+Fun) Minnow(<$10,Fun) NonPayer(Fun+Challenges)\n\n" +
    "PROVEN SWAP RULES (confirmed spend data):\n" +
    "- BIOME SWAP: CC21(beige/AppLovin $11K/d) → CB57(foggy forest/FB+Google $5.6K/d)\n" +
    "- COLOUR SWAP: CZ66($3.3K/d) → CZ65($7K+/d top-1 FB). Blue/red+desert=strongest FB signal.\n" +
    "- HOOK SWAP: CR86(skeleton/FB) → CR85(knight/AppLovin)\n" +
    "- CAMERA: Custom side cam→AppLovin/Google. Default cam→FB/TikTok.\n\n" +
    "NETWORK RULES:\n" +
    "- AppLovin: skeleton/knight hook+custom side cam+blue+3+evolution steps. Biomes:Desert,FoggyForest. Weight:CC21($11K/d),CT43($5.6K/d).\n" +
    "- Facebook: colour/biome swap+default cam+almost-win boss 1-5HP. Weight:CZ65($7K+/d),CB57($5.6K/d).\n" +
    "- Google: strong almost-win+foggy forest or water. Weight:CB57,CT43.\n\n" +
    "9-STEP CURVE: Pressure→Investment→Validate→Investment2→Payoff→FalseSafety→Pressure++→AlmostWin→Fail\n\n" +
    (isExperimental
      ? "CONCEPT TYPE: EXPERIMENTAL — use a NEW biome (Cyber-City,Volcanic,Snow,Toxic). Set is_experimental:true. experimental_note must explain no spend data exists for this biome.\n"
      : "CONCEPT TYPE: PROVEN — use ONLY biomes with spend data: Desert,FoggyForest,Water,Bunker,Meadow. Set is_experimental:false.\n") +
    "Generate concept " + (conceptIndex + 1) + " of " + totalConcepts + ". Make it distinct.\n\n" +
    "Return ONLY valid JSON, no markdown:\n" +
    (analysisOnly
      ? '{"analysis":{"patterns_used":string,"dna_sources":[string],"segment_insight":string,"strategy":string}}'
      : '{"title":string,"dna_source":string,"is_data_backed":boolean,"is_experimental":boolean,"experimental_note":string|null,"objective":string,"target_segment":string,"player_motivation":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"layout":string,"hook_timing_seconds":number,"unit_evolution_chain":[string],"network_adaptations":{"AppLovin":string,"Facebook":string,"Google":string},"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"performance_hooks":[{"type":string,"text":string}],"engagement_hooks":string,"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}');

  var r = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1800, system: systemPrompt, messages: [{ role: "user", content: "Generate the concept. Return only JSON." }] })
  });

  if (!r.ok) throw new Error("Claude API " + r.status + ": " + await r.text());

  var data = await r.json();
  var rawText = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : "{}";
  var cleaned = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
  var start = cleaned.indexOf("{");
  var end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in response: " + cleaned.slice(0, 200));

  var jsonStr = cleaned.slice(start, end + 1).replace(/[\u0000-\u001F\u007F]/g, function(c) {
    if (c === "\n") return "\\n";
    if (c === "\r") return "\\r";
    if (c === "\t") return "\\t";
    return "";
  });

  return JSON.parse(jsonStr);
}

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
    if (task === "brief_concept") {
      var result = await callClaudeSingleConcept(
        payload.winners,
        payload.briefContext,
        payload.segment,
        payload.iterateFrom,
        payload.conceptIndex,
        payload.totalConcepts,
        payload.analysisOnly
      );
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) };
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

// ── Claude single concept ─────────────────────────────────────────────────────
async function callClaudeSingleConcept(winners, briefContext, segment, iterateFrom, conceptIndex, totalConcepts, analysisOnly) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not configured in Netlify environment variables");

  var isExperimental = conceptIndex >= 3;
  var refBlock = iterateFrom ? '\nITERATE FROM: "' + iterateFrom + '" — use as creative starting point. DNA rules are primary.\n' : "";

  var systemPrompt = 'You are a World-Class Lead Creative Producer for Mob Control (MOC) by Voodoo.\n\n' +
    'WINNER DNA LIBRARY (' + winners.length + ' entries):\n' +
    JSON.stringify(winners, null, 2) + '\n\n' +
    'BRIEF: ' + briefContext + ' | SEGMENT: ' + segment + refBlock + '\n\n' +
    'SEGMENT DATA:\n' +
    '- Whale (>$50/mo, 45-59yo): Motivation = Winning / Rankings\n' +
    '- Dolphin ($10-50/mo): Motivation = Winning + Fun\n' +
    '- Minnow (<$10/mo): Motivation = Fun + Winning\n' +
    '- Non-Payer: Motivation = Fun + Challenges\n\n' +
    'PROVEN SWAP RULES (confirmed by spend data):\n' +
    '- BIOME SWAP: CC21 (beige/AppLovin $11K/d) → CB57 (foggy forest/Facebook+Google $5.6K/d)\n' +
    '- COLOUR SWAP: CZ66 ($3.3K/d) → CZ65 ($7K+/d top-1 FB). Blue/red + desert = strongest FB signal.\n' +
    '- HOOK SWAP: CR86 (skeleton/Facebook) → CR85 (knight/AppLovin)\n' +
    '- CAMERA RULE: Custom side cam → AppLovin/Google. Default cam → Facebook/TikTok.\n\n' +
    'NETWORK DECISION TREE:\n' +
    '- AppLovin: skeleton/knight hook + custom side cam + blue palette + 3+ evolution steps. Biomes: Desert, Foggy Forest. Weight: CC21 ($11K/d), CT43 ($5.6K/d).\n' +
    '- Facebook: colour/biome swap + default cam + almost-win boss 1-5HP. Weight: CZ65 ($7K+/d), CB57 ($5.6K/d).\n' +
    '- Google: strong almost-win + foggy forest or water. Weight: CB57, CT43.\n\n' +
    '9-STEP CURVE: Pressure→Investment→Validate→Investment2→Payoff→False Safety→Pressure++→Almost Win→Fail\n\n' +
    (isExperimental
      ? 'CONCEPT TYPE: EXPERIMENTAL — use a NEW biome (Cyber-City, Volcanic, Snow, or Toxic). Set is_experimental: true. Include experimental_note explaining there is no spend data for this biome.\n'
      : 'CONCEPT TYPE: PROVEN — use ONLY proven biomes with spend data: Desert, Foggy Forest, Water, Bunker, or Meadow. Set is_experimental: false.\n') +
    '\nGenerate concept number ' + (conceptIndex + 1) + ' of ' + totalConcepts + '. Make it distinct from previous concepts.\n\n' +
    'Return ONLY valid JSON with NO markdown fences:\n' +
    (analysisOnly
      ? '{"analysis":{"patterns_used":string,"dna_sources":[string],"segment_insight":string,"strategy":string}}'
      : '{"title":string,"dna_source":string,"is_data_backed":boolean,"is_experimental":boolean,"experimental_note":string|null,"objective":string,"target_segment":string,"player_motivation":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"layout":string,"hook_timing_seconds":number,"unit_evolution_chain":[string],"network_adaptations":{"AppLovin":string,"Facebook":string,"Google":string},"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"performance_hooks":[{"type":string,"text":string}],"engagement_hooks":string,"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}');

  var r = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1800,
      system: systemPrompt,
      messages: [{ role: "user", content: "Generate the concept. Return only JSON." }]
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

  // Sanitize control characters
  var jsonStr = cleaned.slice(start, end + 1);
  jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F]/g, function(c) {
    if (c === "\n") return "\\n";
    if (c === "\r") return "\\r";
    if (c === "\t") return "\\t";
    return "";
  });

  return JSON.parse(jsonStr);
}
