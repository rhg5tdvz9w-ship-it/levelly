import type { Handler } from "@netlify/functions";
import { getDeployStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  try {
    const store = getDeployStore("levelly");
    const data = await store.get("library");
    if (!data) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: "[]" };
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: data };
  } catch (err: any) {
    console.error("load-library error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
