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

  try {
    const store = getStore("levelly-library");
    const data = await store.get("library", { type: "json" });

    if (!data) {
      return { statusCode: 200, headers, body: JSON.stringify([]) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  } catch (err: any) {
    console.error("load-library error:", err);
    // Return empty array on error so the UI still loads
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify([]),
    };
  }
};
