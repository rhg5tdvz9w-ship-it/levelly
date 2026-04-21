import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy G.3: Lightweight library index — summary fields only, no frames.
// ~5KB response for 100 entries vs 1MB+ for full /api/load-library.
// GET /api/load-index
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const store = getStore("levelly");
    const data = await store.get("library-index");
    if (!data) {
      // No index yet — migration may not have run, or lib is empty.
      // Return 200 with empty array so client can fall back to /api/load-library.
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: "[]",
      };
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: data,
    };
  } catch (err: any) {
    console.error("load-index error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: "[]",
    };
  }
};
