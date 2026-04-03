import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  connectLambda(event);
  try {
    const store = getStore("levelly");
    const data = await store.get("library");
    if (!data) {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: "[]" };
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: data };
  } catch (err: any) {
    console.error("load-library error:", err);
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: "[]" };
  }
};
