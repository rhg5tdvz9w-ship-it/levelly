import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const store = getStore("levelly");
    // Load index first
    const indexRaw = await store.get("index");
    if (indexRaw) {
      const ids: string[] = JSON.parse(indexRaw);
      const entries = await Promise.all(
        ids.map(async (id: string) => {
          try { const raw = await store.get(`entry:${id}`); return raw ? JSON.parse(raw) : null; }
          catch { return null; }
        })
      );
      const data = entries.filter(Boolean);
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
    }
    // Fallback: old single-blob format
    const legacy = await store.get("library");
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: legacy ?? "[]" };
  } catch (err: any) {
    console.error("load-library error:", err);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: "[]" };
  }
};
