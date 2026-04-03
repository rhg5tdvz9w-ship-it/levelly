import type { Handler, HandlerContext } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async (event, context: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  try {
    const library = event.body ?? "[]";
    JSON.parse(library); // validate JSON before saving
    const store = getStore({ name: "levelly", context });
    await store.set("library", library);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err: any) {
    console.error("save-library error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
