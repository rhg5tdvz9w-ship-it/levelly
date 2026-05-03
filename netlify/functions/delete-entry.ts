import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Deploy G.1: Single-entry delete. Removes entry-<id> blob + updates library-index.
// DELETE /api/delete-entry?id=<id>  OR  POST /api/delete-entry with {id}
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "DELETE" && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    let id: string | undefined;
    if (event.httpMethod === "DELETE") {
      id = event.queryStringParameters?.id;
    } else {
      const body = JSON.parse(event.body ?? "{}");
      id = body.id ? String(body.id) : undefined;
    }
    if (!id) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing id" }) };
    }
    const store = getStore("levelly");

    // Delete the entry blob (idempotent — OK if it doesn't exist)
    try { await store.delete(`entry-${id}`); } catch { /* idempotent */ }

    // Remove from library-index
    // Deploy BC2.1: switch to string comparison. JS Number precision was breaking deletes for
    // long-decimal IDs like 1774952860023.358 — parseFloat returned slightly-off value, e.id !== idNum
    // returned true even when "equal", so .filter() KEPT the entry. Caused chronic orphan accumulation
    // (entries with deleted blob but stale index summary). String compare bypasses precision entirely.
    try {
      const existingIndex = await store.get("library-index");
      if (existingIndex) {
        const index = JSON.parse(existingIndex);
        const filtered = index.filter((e: any) => String(e.id) !== id);
        await store.set("library-index", JSON.stringify(filtered));
      }
    } catch { /* fail open — index may self-heal on next save */ }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, id }),
    };
  } catch (err: any) {
    console.error("delete-entry error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
