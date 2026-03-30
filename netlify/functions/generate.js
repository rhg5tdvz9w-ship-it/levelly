// This function now handles ONLY image generation.
// All analysis calls go directly from browser to Gemini API.
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

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
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown task: " + task }) };
  } catch(err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Unknown error" }) };
  }
};

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
