import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    const store = getStore("levelly");

    // Try new per-entry format first (index + individual entry keys)
    const indexRaw = await store.get("index");
    if (indexRaw) {
      const ids: string[] = JSON.parse(indexRaw);
      const entries = await Promise.all(
        ids.map(async (key) => {
          try {
            const raw = await store.get(key);
            return raw ? JSON.parse(raw) : null;
          } catch { return null; }
        })
      );
      const data = entries.filter(Boolean);
      return { statusCode: 200, headers, body: JSON.stringify(data) };
    }

    // Fallback: old single-key format (migration path)
    const existing = await store.get("library");
    const data = JSON.parse(existing ?? "[]");
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (err: any) {
    console.error("load-library error:", err);
    return { statusCode: 200, headers, body: JSON.stringify([]) };
  }
};
