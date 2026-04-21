import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy G.1: Single-entry load by id. Returns full DNAEntry including frames.
// GET /api/load-entry?id=<id>
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const id = event.queryStringParameters?.id;
    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing ?id parameter" }) };
    }
    const store = getStore("levelly");
    const data = await store.get(`entry-${id}`);
    if (!data) {
      return { statusCode: 404, body: JSON.stringify({ error: "Entry not found", id }) };
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: data,
    };
  } catch (err: any) {
    console.error("load-entry error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
