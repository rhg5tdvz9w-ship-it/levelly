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
    // Per-entry storage — image_data already stripped by client before POST
    await Promise.all(library.map((entry: any) =>
      store.set(`entry:${String(entry.id)}`, JSON.stringify(entry))
    ));
    await store.set("index", JSON.stringify(library.map((e: any) => String(e.id))));
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ success: true }) };
  } catch (err: any) {
    console.error("save-library error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
