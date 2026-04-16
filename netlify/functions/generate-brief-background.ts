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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateConceptWithRetry(
  system: string,
  prompt: string,
  apiKey: string,
  maxTokens: number,
  conceptNum: number,
): Promise<{ concept: any; analysis?: any } | null> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const label = attempt === 1 ? "" : ` (retry)`;
      console.log(`brief-background: generating concept ${conceptNum}${label}`);

      const text = await callClaude(system, prompt, apiKey, maxTokens);
      console.log(`brief-background: concept ${conceptNum} raw length=${text.length}`);

      const result = repairJSON(text);

      // Validate that we got a real concept, not an empty shell from JSON repair
      const concept = Array.isArray(result.concepts) && result.concepts.length > 0
        ? result.concepts[0]
        : null;

      if (!concept || !concept.title || !concept.production_script) {
        throw new Error("Parsed OK but concept is empty or missing required fields (no title or production_script)");
      }

      console.log(`brief-background: concept ${conceptNum} parsed OK`);
      return { concept, analysis: result.analysis ?? undefined };
    } catch (err: any) {
      console.error(`concept ${conceptNum} attempt ${attempt} FAILED: ${err.message}`);

      if (attempt < MAX_ATTEMPTS) {
        console.log(`brief-background: waiting 3s before retry...`);
        await sleep(3000);
      }
    }
  }

  // Both attempts failed
  return null;
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

    // Dedup guard: if this job is already in progress, don't start a second one
    try {
      const existing = await store.get(`brief:${jobId}`);
      if (existing) {
        const existingJob = JSON.parse(existing);
        if (existingJob.status === "partial" || existingJob.status === "done") {
          console.log(`brief-background: jobId=${jobId} already ${existingJob.status}, skipping`);
          return { statusCode: 200, headers, body: JSON.stringify({ jobId, deduplicated: true }) };
        }
      }
    } catch { /* key doesn't exist yet — good, proceed */ }

    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    console.log(`brief-background: jobId=${jobId} apiKey=${apiKey ? "set" : "MISSING"}`);

    await store.set(`brief:${jobId}`, JSON.stringify({ status: "pending", concepts: [], analysis: null }));

    const concepts: any[] = [];
    const failures: string[] = [];
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
      const result = await generateConceptWithRetry(system, def.prompt, apiKey, def.maxTokens, def.num);

      if (result) {
        if (result.analysis && !analysis) analysis = result.analysis;
        concepts.push(result.concept);
      } else {
        failures.push(`concept_${def.num}`);
      }

      // Write progress after each concept (success or fail)
      await store.set(`brief:${jobId}`, JSON.stringify({
        status: "partial",
        concepts,
        analysis,
        failures: failures.length > 0 ? failures : undefined,
      }));
      console.log(`brief-background: concept ${def.num} ${result ? "done" : "FAILED (2 attempts)"}, total=${concepts.length}`);
    }

    // Final write with done status
    await store.set(`brief:${jobId}`, JSON.stringify({
      status: "done",
      concepts,
      analysis,
      failures: failures.length > 0 ? failures : undefined,
    }));
    console.log(`brief-background: ALL DONE concepts=${concepts.length} failures=${failures.length}`);

    return { statusCode: 202, headers, body: JSON.stringify({ jobId }) };
  } catch (err: any) {
    console.error(`brief-background FATAL: ${err.message}`);
    if (jobId) {
      try { await store.set(`brief:${jobId}`, JSON.stringify({ status: "error", error: err.message })); } catch {}
    }
    return { statusCode: 202, headers, body: JSON.stringify({ error: err.message }) };
  }
};
