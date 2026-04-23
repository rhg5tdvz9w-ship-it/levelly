import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy I: serves images previously uploaded via /api/upload-image.
// GET /api/serve-image?key=<key>
// Returns raw image bytes with proper Content-Type + cache headers.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const key = event.queryStringParameters?.key;
    if (!key) {
      return { statusCode: 400, body: "Missing ?key parameter" };
    }
    const store = getStore("levelly-images");
    const raw = await store.get(key);
    if (!raw) {
      return { statusCode: 404, body: "Image not found" };
    }
    let envelope: { mimeType: string; base64: string };
    try {
      envelope = JSON.parse(raw);
    } catch {
      return { statusCode: 500, body: "Malformed image envelope" };
    }
    return {
      statusCode: 200,
      headers: {
        "Content-Type": envelope.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: envelope.base64,
      isBase64Encoded: true,
    };
  } catch (err: any) {
    console.error("serve-image error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
