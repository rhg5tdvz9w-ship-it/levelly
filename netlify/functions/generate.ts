import type { Handler, HandlerEvent } from "@netlify/functions";

const GEMINI_KEY      = process.env.GEMINI_API_KEY ?? "";
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY ?? "";

const GEMINI_TEXT_URL  = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent";
const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent";
const ANTHROPIC_URL    = "https://api.anthropic.com/v1/messages";

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { task, payload } = JSON.parse(event.body ?? "{}");

  try {
    if (task === "analyze" || task === "brief") {
      const result = ANTHROPIC_KEY
        ? await callClaude(payload.system, payload.messages)
        : await callGeminiText(payload.system, payload.messages);
      return { statusCode: 200, body: JSON.stringify({ result }) };
    }

    if (task === "image") {
      const result = await callGeminiImage(payload.prompt);
      return { statusCode: 200, body: JSON.stringify({ result }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Unknown task" }) };
  } catch (err: any) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message ?? "Unknown error" }) };
  }
};

async function callClaude(system: string, messages: any[]) {
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250514",
      max_tokens: 4000,
      system,
      messages,
    }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = data.content?.find((b: any) => b.type === "text")?.text ?? "{}";
  return parseJSON(text);
}

async function callGeminiText(system: string, messages: any[]) {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: Array.isArray(m.content)
      ? m.content.map((c: any) => {
          if (c.type === "text") return { text: c.text };
          if (c.type === "image") return { inlineData: { mimeType: c.source.media_type, data: c.source.data } };
          if (c.type === "document") {
            // Videos and docs — use inlineData for small files, warn for large
            return { inlineData: { mimeType: c.source.media_type, data: c.source.data } };
          }
          return { text: JSON.stringify(c) };
        })
      : [{ text: m.content }],
  }));

  const r = await fetch(`${GEMINI_TEXT_URL}?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 1,
      },
    }),
  });
  if (!r.ok) throw new Error(`Gemini text ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return parseJSON(text);
}

async function callGeminiImage(prompt: string) {
  const r = await fetch(`${GEMINI_IMAGE_URL}?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    }),
  });
  if (!r.ok) throw new Error(`Gemini image ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const imgPart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!imgPart) throw new Error("No image returned — safety filter may have triggered");
  return `data:image/png;base64,${imgPart.inlineData.data}`;
}

function parseJSON(text: string) {
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Model returned invalid JSON: " + text.slice(0, 200));
  }
}
