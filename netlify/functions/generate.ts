// Legacy function - kept to prevent 405 errors from old cached requests
// All functionality moved to: generate-brief-background.ts, enhance.ts
import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  // Accept any method gracefully to prevent cached requests from crashing the app
  if (event.httpMethod === "GET" || event.httpMethod === "HEAD") {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  }
  return { statusCode: 410, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "This endpoint is deprecated. Use /api/generate-brief-background instead." }) };
};
