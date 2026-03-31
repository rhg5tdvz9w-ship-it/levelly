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
    const existing = await store.get("library");
    const data = JSON.parse(existing ?? "[]");

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err: any) {
    console.error("load-library error:", err);
    // Return empty array so UI still loads
    return { statusCode: 200, headers, body: JSON.stringify([]) };
  }
};
