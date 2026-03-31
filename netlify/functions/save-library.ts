import { getStore } from "@netlify/blobs";
import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = event.body ?? "";
    const data = JSON.parse(body);

    if (!Array.isArray(data)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Expected array" }) };
    }

    const store = getStore("levelly-library");
    await store.setJSON("library", data);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, count: data.length }),
    };
  } catch (err: any) {
    console.error("save-library error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message ?? "Unknown error" }),
    };
  }
};
