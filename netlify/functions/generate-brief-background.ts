import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

const conceptDefs = [
  { num: 1, instruction: "proven biome (Desert/Foggy Forest/Water/Bunker/Meadow), data-backed, is_experimental:false. Include analysis block." },
  { num: 2, instruction: "proven biome different from concept 1, data-backed, is_experimental:false. No analysis block." },
  { num: 3, instruction: "experimental biome (Cyber-City/Volcanic/Snow/Toxic), is_experimental:true. No analysis block." },
  { num: 4, instruction: "wildcard bold creative departure, is_experimental:true. No analysis block." },
];

async function callClaude(system: string, prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Claude ${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.content?.find((b: any) => b.type === "text")?.text ?? "";
}

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  connectLambda(event);
  const store = getStore("levelly");

  let jobId = "";
  try {
    const body = event.body ?? "";
    if (!body) return { statusCode: 400, headers, body: JSON.stringify({ error: "Empty body" }) };

    const parsed = JSON.parse(body);
    jobId = parsed.jobId ?? "";
    const { system } = parsed;
    if (!system || !jobId) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing fields" }) };

    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    console.log(`brief-background: jobId=${jobId} apiKey=${apiKey ? "set" : "MISSING"}`);

    // Mark as in progress
    await store.set(`brief:${jobId}`, JSON.stringify({ status: "pending", concepts: [], analysis: null }));

    const concepts: any[] = [];
    let analysis: any = null;

    // Generate each concept sequentially — each call ~1500-1800 tokens, well within 26s
    for (const def of conceptDefs) {
      try {
        const prompt = def.num === 1
          ? `Generate concept ${def.num}: ${def.instruction} Return JSON: {"analysis":{...},"concepts":[{one concept with full production_script}]}`
          : `Generate concept ${def.num}: ${def.instruction} Return JSON: {"concepts":[{one concept with full production_script}]}`;

        console.log(`brief-background: generating concept ${def.num}`);
        const text = await callClaude(system, prompt, apiKey);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { console.error(`concept ${def.num}: no JSON found`); continue; }

        const result = JSON.parse(jsonMatch[0]);
        if (result.analysis && !analysis) analysis = result.analysis;
        if (Array.isArray(result.concepts)) concepts.push(...result.concepts);

        // Write partial results after each concept so user sees progress
        await store.set(`brief:${jobId}`, JSON.stringify({
          status: concepts.length === conceptDefs.length ? "done" : "partial",
          concepts,
          analysis,
        }));
        console.log(`brief-background: concept ${def.num} done, total=${concepts.length}`);
      } catch (err: any) {
        console.error(`concept ${def.num} error: ${err.message}`);
        // Continue to next concept even if one fails
      }
    }

    // Final write
    await store.set(`brief:${jobId}`, JSON.stringify({ status: "done", concepts, analysis }));
    console.log(`brief-background: jobId=${jobId} ALL DONE concepts=${concepts.length}`);

    return { statusCode: 202, headers, body: JSON.stringify({ jobId }) };
  } catch (err: any) {
    console.error(`brief-background FATAL: ${err.message}`);
    if (jobId) {
      try { await store.set(`brief:${jobId}`, JSON.stringify({ status: "error", error: err.message })); } catch {}
    }
    return { statusCode: 202, headers, body: JSON.stringify({ error: err.message }) };
  }
};
