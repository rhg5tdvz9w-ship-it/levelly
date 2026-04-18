import type { Handler } from "@netlify/functions";
import { connectLambda, getStore } from "@netlify/blobs";

// ─── Claude call with per-call timeout (90s) ────────────────────────────────
async function callClaudeWithTimeout(
  system: string,
  prompt: string,
  apiKey: string,
  maxTokens: number,
  timeoutMs: number
): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
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
      signal: ctrl.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`CLAUDE_${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return data.content?.find((b: any) => b.type === "text")?.text ?? "";
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error(`TIMEOUT: exceeded ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(to);
  }
}

// ─── JSON repair (unchanged from deployed) ──────────────────────────────────
function repairJSON(raw: string): any {
  try { return JSON.parse(raw); } catch {}

  const match = raw.match(/\{[\s\S]*/);
  if (!match) throw new Error("No JSON object found in response");
  let str = match[0];

  try { return JSON.parse(str); } catch {}

  str = str
    .replace(/,\s*$/, "")
    .replace(/:\s*"[^"]*$/, ': ""')
    .replace(/"[^"]*$/, '"')
    .replace(/,\s*"[^"]*"\s*:\s*$/, "")
    .replace(/:\s*\[[^\]]*$/, ': []')
    .replace(/:\s*\{[^}]*$/, ': {}');

  try { return JSON.parse(str + '}'); } catch {}
  try { return JSON.parse(str + '"}'); } catch {}

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── One concept with retry ─────────────────────────────────────────────────
// Retries ONLY on PARSE_FAIL / EMPTY_RESPONSE / VALIDATION_FAIL.
// TIMEOUT and CLAUDE_5xx / 4xx are NOT retried (saves wall-clock budget).
async function generateConceptWithRetry(
  def: { num: number; maxTokens: number; prompt: string },
  system: string,
  apiKey: string,
  attempt: number = 1
): Promise<{ concept?: any; analysis?: any; failure?: { concept_num: number; reason: string; attempts: number; head?: string; tail?: string } }> {
  const startTime = Date.now();
  let rawText = "";
  try {
    rawText = await callClaudeWithTimeout(system, def.prompt, apiKey, def.maxTokens, 200_000);
    const elapsed = Date.now() - startTime;
    console.log(`brief-background: concept ${def.num} attempt ${attempt} — got ${rawText.length} chars in ${elapsed}ms`);

    if (!rawText || rawText.length < 50) {
      throw new Error(`EMPTY_RESPONSE: got ${rawText.length} chars`);
    }

    let result: any;
    try {
      result = repairJSON(rawText);
    } catch (e: any) {
      throw new Error(`PARSE_FAIL: ${e.message}`);
    }

    const concept = Array.isArray(result.concepts) ? result.concepts[0] : null;
    if (!concept) {
      throw new Error(`VALIDATION_FAIL: concepts array missing or empty`);
    }
    if (!concept.title || typeof concept.title !== "string") {
      throw new Error(`VALIDATION_FAIL: missing/invalid title`);
    }
    if (!Array.isArray(concept.production_script) || concept.production_script.length === 0) {
      throw new Error(`VALIDATION_FAIL: missing/empty production_script`);
    }

    console.log(`brief-background: concept ${def.num} attempt ${attempt} — OK, title="${concept.title.slice(0, 60)}"`);
    return { concept, analysis: result.analysis };
  } catch (err: any) {
    const msg = err.message || String(err);
    const head = rawText.slice(0, 150).replace(/\s+/g, " ");
    const tail = rawText.slice(-150).replace(/\s+/g, " ");
    console.error(`brief-background: concept ${def.num} attempt ${attempt} FAILED — ${msg}`);
    if (rawText) {
      console.error(`brief-background: concept ${def.num} raw head: ${head}`);
      console.error(`brief-background: concept ${def.num} raw tail: ${tail}`);
    }

    const isRetryable =
      msg.startsWith("PARSE_FAIL") ||
      msg.startsWith("EMPTY_RESPONSE") ||
      msg.startsWith("VALIDATION_FAIL");

    if (attempt === 1 && isRetryable) {
      console.log(`brief-background: concept ${def.num} — retrying in 3s (reason: ${msg.split(":")[0]})`);
      await sleep(3000);
      return generateConceptWithRetry(def, system, apiKey, 2);
    }

    return {
      failure: {
        concept_num: def.num,
        reason: msg,
        attempts: attempt,
        head: rawText ? head : undefined,
        tail: rawText ? tail : undefined,
      },
    };
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────
export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  connectLambda(event);
  const store = getStore("levelly");

  let jobId = "";
  try {
    const body = event.body ?? "";
    if (!body) return { statusCode: 400, headers, body: JSON.stringify({ error: "Empty body" }) };

    const parsed = JSON.parse(body);
    jobId = parsed.jobId ?? "";
    const { system } = parsed;
    if (!system || !jobId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing fields" }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    console.log(`brief-background: jobId=${jobId} apiKey=${apiKey ? "set" : "MISSING"}`);

    // Dedup guard: if job already done, skip. If pending but actively being written, don't overwrite.
    const existingRaw = await store.get(`brief:${jobId}`);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        if (existing.status === "done" && Array.isArray(existing.concepts) && existing.concepts.length === 4) {
          console.log(`brief-background: jobId=${jobId} already complete (4/4) — skipping`);
          return { statusCode: 202, headers, body: JSON.stringify({ jobId, skipped: true }) };
        }
      } catch {}
    }

    await store.set(`brief:${jobId}`, JSON.stringify({ status: "pending", concepts: [], analysis: null, failures: [] }));

    const concepts: any[] = [];
    const failures: any[] = [];
    let analysis: any = null;

    const conceptDefs = [
      {
        num: 1,
        maxTokens: 8000,
        prompt: `Generate concept 1: PROVEN biome (Desert/Foggy Forest/Water/Bunker/Meadow), data-backed, network-optimized, is_experimental:false.
Return ONLY valid JSON (nothing before or after):
{"analysis":{"patterns_used":string,"dna_sources":[string],"strategy":string},"concepts":[{ONE complete concept object including production_script}]}`,
      },
      {
        num: 2,
        maxTokens: 8000,
        prompt: `Generate concept 2: PROVEN biome different from concept 1, data-backed, network-optimized, is_experimental:false.
Return ONLY valid JSON (nothing before or after, NO analysis block):
{"concepts":[{ONE complete concept object including production_script}]}`,
      },
      {
        num: 3,
        maxTokens: 8000,
        prompt: `Generate concept 3: ADJACENT biome — take a proven biome and twist it into something fresh (e.g. "Desert at Night", "Flooded Bunker", "Autumn Forest", "Foggy Forest in Rain", "Snow Meadow"). Still grounded in proven visual language but visually distinct. is_experimental:true, include experimental_note explaining the twist and which proven biome it builds on.
Return ONLY valid JSON (nothing before or after, NO analysis block):
{"concepts":[{ONE complete concept object including production_script}]}`,
      },
      {
        num: 4,
        maxTokens: 8000,
        prompt: `Generate concept 4: WILD CARD — pick a completely original biome from this pool (choose ONE, do NOT repeat any biome from concepts 1-3): Underwater Ruins, Crystal Caverns, Overgrown City, Floating Islands, Ancient Temple, Frozen Tundra, Swamp, Cloud Kingdom, Bamboo Forest, Canyon, Underground Mine, Coral Reef, Haunted Castle, Sky Bridge, Shipwreck Bay, Glacier, Jungle Canopy, Sandstorm, Mushroom Grove, Clockwork Factory. Must feel genuinely different from all other concepts. is_experimental:true, include experimental_note.
Return ONLY valid JSON (nothing before or after, NO analysis block):
{"concepts":[{ONE complete concept object including production_script}]}`,
      },
    ];

    const jobStartTime = Date.now();
    for (const def of conceptDefs) {
      console.log(`brief-background: >>> starting concept ${def.num} (elapsed: ${Math.floor((Date.now() - jobStartTime) / 1000)}s)`);

      const result = await generateConceptWithRetry(def, system, apiKey);
      if (result.concept) {
        concepts.push(result.concept);
        if (result.analysis && !analysis) analysis = result.analysis;
      } else if (result.failure) {
        failures.push(result.failure);
      }

      await store.set(
        `brief:${jobId}`,
        JSON.stringify({
          status: concepts.length === 4 ? "done" : "partial",
          concepts,
          analysis,
          failures,
        })
      );
      console.log(`brief-background: <<< after concept ${def.num} — total=${concepts.length}/4, failures=${failures.length}`);
    }

    await store.set(
      `brief:${jobId}`,
      JSON.stringify({ status: "done", concepts, analysis, failures })
    );
    const totalElapsed = Math.floor((Date.now() - jobStartTime) / 1000);
    console.log(`brief-background: ALL DONE jobId=${jobId} concepts=${concepts.length}/4 failures=${failures.length} total_elapsed=${totalElapsed}s`);

    return { statusCode: 202, headers, body: JSON.stringify({ jobId }) };
  } catch (err: any) {
    console.error(`brief-background FATAL: ${err.message}`);
    if (jobId) {
      try {
        await store.set(`brief:${jobId}`, JSON.stringify({ status: "error", error: err.message }));
      } catch {}
    }
    return { statusCode: 202, headers, body: JSON.stringify({ error: err.message }) };
  }
};
