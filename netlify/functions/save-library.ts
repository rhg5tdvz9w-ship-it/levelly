import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const data = JSON.parse(event.body ?? "[]");
    if (!Array.isArray(data)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Expected array" }) };

    const store = getStore("levelly");

    // Store each entry individually by ID — eliminates the 4MB single-value ceiling
    const ids: string[] = [];
    await Promise.all(data.map(async (entry: any) => {
      const key = `entry:${entry.id}`;
      ids.push(key);
      // Strip image_data before storing — kept in localStorage only
      const clean = {
        ...entry,
        auto_frames: entry.auto_frames?.map((f: any) => ({
          timestamp_seconds: f.timestamp_seconds,
          description: f.description,
          significance: f.significance,
        })),
      };
      await store.set(key, JSON.stringify(clean));
    }));

    // Store the index of current entry keys
    await store.set("index", JSON.stringify(ids));

    // Clean up deleted entries best-effort
    try {
      const { blobs } = await store.list({ prefix: "entry:" });
      const toDelete = blobs.filter(b => !ids.includes(b.key));
      await Promise.all(toDelete.map(b => store.delete(b.key)));
    } catch { /* best-effort */ }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: data.length }) };
  } catch (err: any) {
    console.error("save-library error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
