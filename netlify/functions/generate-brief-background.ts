import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Background functions have a 15-minute timeout — no more 26s ceiling
// Netlify detects background functions by the "-background" suffix in the filename
export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const body = event.body ?? "";
    if (!body) return { statusCode: 400, headers, body: JSON.stringify({ error: "Empty body" }) };

    const { system, prompt, jobId, max_tokens } = JSON.parse(body);
    if (!system || !prompt || !jobId) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing system, prompt, or jobId" }) };

    console.log(`brief-background: jobId=${jobId} system=${system.length} chars`);

    const store = getStore("levelly");

    // Mark job as in-progress
    await store.set(`brief:${jobId}`, JSON.stringify({ status: "pending" }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: max_tokens ?? 3000,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      await store.set(`brief:${jobId}`, JSON.stringify({ status: "error", error: JSON.stringify(data) }));
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data }) };
    }

    const text = data.content?.find((b: any) => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await store.set(`brief:${jobId}`, JSON.stringify({ status: "error", error: "No JSON in response" }));
      return { statusCode: 500, headers, body: JSON.stringify({ error: "No JSON in response" }) };
    }

    const result = JSON.parse(jsonMatch[0]);
    await store.set(`brief:${jobId}`, JSON.stringify({ status: "done", result }));

    return { statusCode: 202, headers, body: JSON.stringify({ jobId, status: "done" }) };
  } catch (err: any) {
    console.error("brief-background error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};