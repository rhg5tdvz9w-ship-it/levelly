const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_TEXT_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent";
const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

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
    if (task === "analyze" || task === "brief") {
      var result;
      if (ANTHROPIC_KEY) {
        result = await callClaude(payload.system, payload.messages);
      } else {
        result = await callGeminiText(payload.system, payload.messages);
      }
      return { statusCode: 200, body: JSON.stringify({ result: result }) };
    }

    if (task === "image") {
      var imgResult = await callGeminiImage(payload.prompt);
      return { statusCode: 200, body: JSON.stringify({ result: imgResult }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Unknown task: " + task }) };

  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Unknown error" }) };
  }
};

async function callClaude(system, messages) {
  var r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250514",
      max_tokens: 4000,
      system: system,
      messages: messages
    })
  });
  if (!r.ok) {
    throw new Error("Claude " + r.status + ": " + await r.text());
  }
  var data = await r.json();
  var text = "";
  for (var i = 0; i < data.content.length; i++) {
    if (data.content[i].type === "text") {
      text = data.content[i].text;
      break;
    }
  }
  return parseJSON(text || "{}");
}

async function callGeminiText(system, messages) {
  var contents = [];
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var parts = [];
    if (Array.isArray(m.content)) {
      for (var j = 0; j < m.content.length; j++) {
        var c = m.content[j];
        if (c.type === "text") {
          parts.push({ text: c.text });
        } else if (c.type === "file_uri") {
          parts.push({ file_data: { mime_type: c.mimeType, file_uri: c.fileUri } });
        } else if (c.type === "image" || c.type === "document") {
          parts.push({ inline_data: { mime_type: c.source.media_type, data: c.source.data } });
        }
      }
    } else {
      parts.push({ text: m.content });
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: parts
    });
  }

  var r = await fetch(GEMINI_TEXT_URL + "?key=" + GEMINI_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: contents,
      generationConfig: { response_mime_type: "application/json" }
    })
  });
  if (!r.ok) {
    throw new Error("Gemini text " + r.status + ": " + await r.text());
  }
  var data = await r.json();
  var text = data.candidates[0].content.parts[0].text || "{}";
  return parseJSON(text);
}

async function callGeminiImage(prompt) {
  var r = await fetch(GEMINI_IMAGE_URL + "?key=" + GEMINI_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] }
    })
  });
  if (!r.ok) {
    throw new Error("Gemini image " + r.status + ": " + await r.text());
  }
  var data = await r.json();
  var parts = data.candidates[0].content.parts;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].inlineData) {
      return "data:image/png;base64," + parts[i].inlineData.data;
    }
  }
  throw new Error("No image returned from Gemini");
}

function parseJSON(text) {
  var cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  // Find the first { and last } to extract just the JSON object
  var start = cleaned.indexOf("{");
  var end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in response: " + cleaned.slice(0, 200));
  }
  var jsonOnly = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(jsonOnly);
  } catch(e) {
    throw new Error("JSON parse failed: " + e.message + " | Text: " + jsonOnly.slice(0, 200));
  }
}
