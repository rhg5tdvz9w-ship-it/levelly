import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  // connectLambda MUST be called before getStore in Lambda compatibility mode
  connectLambda(event);
  try {
    const library = event.body ?? "[]";
    JSON.parse(library); // validate JSON before saving
    const store = getStore("levelly");
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
