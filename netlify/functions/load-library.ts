import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const store = getStore("levelly");
    const data = await store.get("library");
    if (!data) {
      return { statusCode: 200, headers, body: "[]" };
    }
    return { statusCode: 200, headers, body: data };
  } catch (err: any) {
    console.error("load-library error:", err);
    return { statusCode: 200, headers, body: "[]" };
  }
};
