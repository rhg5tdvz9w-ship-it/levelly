import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  // Required for Lambda compatibility mode
  connectLambda(event);

  try {
    const jobId = event.queryStringParameters?.id;
    if (!jobId) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id" }) };

    const store = getStore("levelly");

    let raw: string | null = null;
    try { raw = await store.get(`brief:${jobId}`); } catch { /* key not found yet */ }

    if (!raw) return { statusCode: 200, headers, body: JSON.stringify({ status: "pending" }) };

    return { statusCode: 200, headers, body: raw };
  } catch (err: any) {
    console.error("brief-result error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
