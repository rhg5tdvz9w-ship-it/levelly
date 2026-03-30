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
      id: d.title,
      hook: d.hook_type,
      hook_s: d.hook_timing_seconds,
      gates: (d.gate_sequence || []).slice(0, 4),
      units: (d.unit_evolution_chain || []).slice(0, 4),
      mechanic: (d.key_mechanic || "").slice(0, 80),
      biome: d.biome,
      loss: d.loss_event_type,
      spend: d.spend_tier || null,
      networks: d.spend_networks || [],
      replicate: (d.replication_instructions || "").slice(0, 120)
    };
  });

  var refBlock = iterateFrom ? ' ITERATE_FROM:"' + iterateFrom + '"(starting point only, DNA primary).' : "";

  var systemPrompt = [
    "You are a Lead Creative Producer for Mob Control (MOC) by Voodoo.",
    "Generate 3 ad concepts grounded ONLY in the winner DNA below. Never invent gates or mechanics not in the data.",
    "",
    "WINNERS:" + JSON.stringify(winners),
    "",
    "BRIEF:" + briefContext + " SEGMENT:" + segment + refBlock,
    "SEGMENTS: Whale(>$50/mo,Winning/Rankings) Dolphin($10-50,Winning+Fun) Minnow(<$10,Fun) NonPayer(Fun+Challenges)",
    "BIOMES: Desert,FoggyForest,Water,Bunker,CyberCity,Volcanic,Snow,Toxic,Meadow",
    "CURVE: Pressure>Investment>Validate>Payoff>FalseSafety>Pressure++>AlmostWin>Fail",
    "NETWORKS: AppLovin=skeletonHook+sideCam+bluePalette Facebook=blueRedSwap+desert+defaultCam Google=almostWin1HP+foggyForest",
    "WEIGHT by spend velocity. CT43=$5.6K/day = highest weight.",
    "Hook timing never 0. Replicate exact gate sequences from winners.",
    "",
    'Return ONLY JSON: {"analysis":{"patterns_used":string,"dna_sources":[string],"segment_insight":string,"strategy":string},"concepts":[{"title":string,"dna_source":string,"is_data_backed":boolean,"objective":string,"target_segment":string,"player_motivation":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"layout":string,"hook_timing_seconds":number,"unit_evolution_chain":[string],"network_adaptations":{"AppLovin":string,"Facebook":string,"Google":string},"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"performance_hooks":[{"type":string,"text":string}],"engagement_hooks":string,"quality_score":{"pattern_fidelity":number,"moc_dna":number,"emotional_arc":number,"visual_clarity":number,"segment_fit":number,"overall":number,"notes":string}}]}'
  ].join("\n");

  var r = await fetch(CLAUDE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2500,
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
