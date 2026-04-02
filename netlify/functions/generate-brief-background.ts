import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

async function callClaude(system: string, prompt: string, apiKey: string, maxTokens: number): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Claude ${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.content?.find((b: any) => b.type === "text")?.text ?? "";
}

function repairJSON(raw: string): any {
  // First try direct parse
  try { return JSON.parse(raw); } catch {}

  // Find the outermost JSON object
  const match = raw.match(/\{[\s\S]*/);
  if (!match) throw new Error("No JSON object found in response");
  let str = match[0];

  // Try parsing as-is
  try { return JSON.parse(str); } catch {}

  // Multi-pass repair for truncated JSON
  // 1. Remove trailing incomplete tokens
  str = str
    .replace(/,\s*$/, "")                         // trailing comma
    .replace(/:\s*"[^"]*$/, ': ""')               // incomplete string value after key
    .replace(/"[^"]*$/, '"')                       // incomplete string anywhere (close it)
    .replace(/,\s*"[^"]*"\s*:\s*$/, "")           // incomplete key with no value
    .replace(/:\s*\[[^\]]*$/, ': []')             // incomplete array after key
    .replace(/:\s*\{[^}]*$/, ': {}');             // incomplete object after key

  // 2. Try after string repairs
  try { return JSON.parse(str + '}'); } catch {}
  try { return JSON.parse(str + '"}'); } catch {}

  // 3. Count and close all unclosed brackets using a stack
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of str) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  str += stack.reverse().join("");

  return JSON.parse(str);
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

    await store.set(`brief:${jobId}`, JSON.stringify({ status: "pending", concepts: [], analysis: null }));

    const concepts: any[] = [];
    let analysis: any = null;

    const conceptDefs = [
      {
        num: 1,
        maxTokens: 6000,
        prompt: `Generate concept 1: proven biome (Desert/Foggy Forest/Water/Bunker/Meadow), data-backed, is_experimental:false.
Return ONLY valid JSON (nothing before or after):
{"analysis":{"patterns_used":string,"dna_sources":[string],"strategy":string},"concepts":[{ONE complete concept object including production_script}]}`
      },
      {
        num: 2,
        maxTokens: 6000,
        prompt: `Generate concept 2: proven biome different from concept 1, data-backed, is_experimental:false.
Return ONLY valid JSON (nothing before or after, NO analysis block):
{"concepts":[{ONE complete concept object including production_script}]}`
      },
      {
        num: 3,
        maxTokens: 6000,
        prompt: `Generate concept 3: experimental biome (Cyber-City/Volcanic/Snow/Toxic), is_experimental:true.
Return ONLY valid JSON (nothing before or after, NO analysis block):
{"concepts":[{ONE complete concept object including production_script}]}`
      },
      {
        num: 4,
        maxTokens: 6000,
        prompt: `Generate concept 4: wildcard bold creative departure, is_experimental:true.
Return ONLY valid JSON (nothing before or after, NO analysis block):
{"concepts":[{ONE complete concept object including production_script}]}`
      },
    ];

    for (const def of conceptDefs) {
      try {
        console.log(`brief-background: generating concept ${def.num}`);
        const text = await callClaude(system, def.prompt, apiKey, def.maxTokens);
        console.log(`brief-background: concept ${def.num} raw length=${text.length}`);

        const result = repairJSON(text);
        console.log(`brief-background: concept ${def.num} parsed OK`);

        if (result.analysis && !analysis) analysis = result.analysis;
        if (Array.isArray(result.concepts) && result.concepts.length > 0) {
          concepts.push(result.concepts[0]);
        }

        await store.set(`brief:${jobId}`, JSON.stringify({
          status: concepts.length === 4 ? "done" : "partial",
          concepts,
          analysis,
        }));
        console.log(`brief-background: concept ${def.num} done, total=${concepts.length}`);
      } catch (err: any) {
        console.error(`concept ${def.num} FAILED: ${err.message}`);
      }
    }

    await store.set(`brief:${jobId}`, JSON.stringify({ status: "done", concepts, analysis }));
    console.log(`brief-background: ALL DONE concepts=${concepts.length}`);

    return { statusCode: 202, headers, body: JSON.stringify({ jobId }) };
  } catch (err: any) {
    console.error(`brief-background FATAL: ${err.message}`);
    if (jobId) {
      try { await store.set(`brief:${jobId}`, JSON.stringify({ status: "error", error: err.message })); } catch {}
    }
    return { statusCode: 202, headers, body: JSON.stringify({ error: err.message }) };
  }
};
