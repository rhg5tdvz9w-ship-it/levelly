import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const library = JSON.parse(event.body ?? "[]");
    if (!Array.isArray(library)) throw new Error("Expected array");
    const store = getStore("levelly");
    // Save each entry individually to keep payloads small (frames included)
    await Promise.all(library.map((entry: any) =>
      store.set(`entry:${entry.id}`, JSON.stringify(entry))
    ));
    // Save index of all entry IDs for load-library to reconstruct
    await store.set("index", JSON.stringify(library.map((e: any) => e.id)));
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err: any) {
    console.error("save-library error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
