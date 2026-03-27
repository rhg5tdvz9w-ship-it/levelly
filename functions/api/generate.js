export async function onRequestPost(context) {
  const env = context.env;
  const GEMINI_KEY = env.GEMINI_API_KEY || "";
  const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY || "";

  const GEMINI_TEXT_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";
  const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

  let task, payload;
  try {
    const body = await context.request.json();
    task = body.task;
    payload = body.payload;
  } catch(e) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  try {
    if (task === "analyze" || task === "brief") {
      const result = ANTHROPIC_KEY
        ? await callClaude(ANTHROPIC_KEY, ANTHROPIC_URL, payload.system, payload.messages)
        : await callGeminiText(GEMINI_KEY, GEMINI_TEXT_URL, payload.system, payload.messages);
      return new Response(JSON.stringify({ result }), { status: 200 });
    }

    if (task === "image") {
      const result = await callGeminiImage(GEMINI_KEY, GEMINI_IMAGE_URL, payload.prompt);
      return new Response(JSON.stringify({ result }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: "Unknown task: " + task }), { status: 400 });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), { status: 500 });
  }
}

async function callClaude(key, url, system, messages) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model: "claude-opus-4-20250514", max_tokens: 4000, system, messages })
  });
  if (!r.ok) throw new Error("Claude " + r.status + ": " + await r.text());
  const data = await r.json();
  const text = (data.content || []).find(b => b.type === "text")?.text || "{}";
  return parseJSON(text);
}

async function callGeminiText(key, url, system, messages) {
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: Array.isArray(m.content)
      ? m.content.map(c => {
          if (c.type === "text") return { text: c.text };
          if (c.type === "file_uri") return { file_data: { mime_type: c.mimeType, file_uri: c.fileUri } };
          if (c.type === "image" || c.type === "document") return { inline_data: { mime_type: c.source.media_type, data: c.source.data } };
          return { text: JSON.stringify(c) };
        })
      : [{ text: m.content }]
  }));

  const r = await fetch(url + "?key=" + key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { response_mime_type: "application/json" }
    })
  });
  if (!r.ok) throw new Error("Gemini text " + r.status + ": " + await r.text());
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return parseJSON(text);
}

async function callGeminiImage(key, url, prompt) {
  const r = await fetch(url + "?key=" + key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
    })
  });
  if (!r.ok) throw new Error("Gemini image " + r.status + ": " + await r.text());
  const data = await r.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.inlineData) return "data:image/png;base64," + part.inlineData.data;
  }
  throw new Error("No image returned from Gemini");
}

function parseJSON(text) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found: " + cleaned.slice(0, 200));
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch(e) {
    throw new Error("JSON parse failed: " + e.message);
  }
}
