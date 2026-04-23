import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy I: image hosting for copy-to-Notion/Docs/Gmail compatibility.
// Notion and some other rich-text targets strip data: URIs from pasted HTML.
// POST body: { dataUri: "data:image/png;base64,..." }
// Response: { url: "/api/serve-image?key=abc123" }
// Images are stored permanently. Blobs live in store "levelly-images" (separate from main library data).
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const body = JSON.parse(event.body ?? "{}");
    const dataUri: string | undefined = body.dataUri;
    if (!dataUri || !dataUri.startsWith("data:")) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing or invalid dataUri (must be data: URI)" }) };
    }
    // Parse data URI: "data:image/png;base64,<data>"
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return { statusCode: 400, body: JSON.stringify({ error: "Could not parse data URI" }) };
    }
    const mimeType = match[1];
    const base64 = match[2];

    // Generate a random short key
    const key = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

    const store = getStore("levelly-images");
    // Store as JSON envelope so we keep mime type alongside bytes
    await store.set(key, JSON.stringify({ mimeType, base64 }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, url: `/api/serve-image?key=${key}` }),
    };
  } catch (err: any) {
    console.error("upload-image error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
