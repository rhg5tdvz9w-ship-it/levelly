import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy K: Load cached market intelligence envelope.
// GET /api/load-market-intel
// Returns the envelope written by refresh-market-intel, or null if never synthesized.
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const store = getStore("levelly-market-intel");
    const data = await store.get("current");
    if (!data) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: "null" };
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: data };
  } catch (err: any) {
    console.error("load-market-intel error:", err);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: "null" };
  }
};
