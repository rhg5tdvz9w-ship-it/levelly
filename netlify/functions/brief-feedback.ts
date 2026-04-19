import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// Single-key append-only log. Low write volume (~20/day peak) → RMW is safe.
const LOG_KEY = "brief_feedback_log";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface FeedbackEntry {
  id: string;
  timestamp: string;
  session_id: string;
  concept_index: number;
  concept_title: string;
  vote: "up" | "down";
  note?: string;
  segment?: string;
  iterate_from?: string;
}

export const handler: Handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  connectLambda(event);

  try {
    const store = getStore("levelly");

    if (event.httpMethod === "GET") {
      // Retrieve all feedback entries (for terminal analytics)
      const raw = await store.get(LOG_KEY);
      const entries: FeedbackEntry[] = raw ? JSON.parse(raw) : [];
      // Most recent first
      entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          total: entries.length,
          entries,
        }, null, 2),
      };
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body ?? "{}");

      // Minimal validation — reject obviously malformed
      if (!payload.session_id || typeof payload.concept_index !== "number" || !payload.vote) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Missing required fields: session_id, concept_index, vote" }),
        };
      }
      if (payload.vote !== "up" && payload.vote !== "down") {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "vote must be 'up' or 'down'" }),
        };
      }

      const entry: FeedbackEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        timestamp: new Date().toISOString(),
        session_id: String(payload.session_id),
        concept_index: payload.concept_index,
        concept_title: String(payload.concept_title ?? ""),
        vote: payload.vote,
        note: payload.note ? String(payload.note).slice(0, 500) : undefined,
        segment: payload.segment ? String(payload.segment) : undefined,
        iterate_from: payload.iterate_from ? String(payload.iterate_from) : undefined,
      };

      const raw = await store.get(LOG_KEY);
      const existing: FeedbackEntry[] = raw ? JSON.parse(raw) : [];
      existing.push(entry);
      await store.set(LOG_KEY, JSON.stringify(existing));

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, id: entry.id, total: existing.length }),
      };
    }

    return { statusCode: 405, headers: CORS_HEADERS, body: "Method not allowed" };
  } catch (err: any) {
    console.error("brief-feedback error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
