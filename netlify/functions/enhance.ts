import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { system, text } = JSON.parse(event.body ?? "{}");
    if (!system || !text) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing system or text" }) };

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system,
        messages: [{ role: "user", content: text }],
      }),
    });

    const data = await r.json();
    if (!r.ok) return { statusCode: r.status, headers, body: JSON.stringify({ error: data }) };

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
