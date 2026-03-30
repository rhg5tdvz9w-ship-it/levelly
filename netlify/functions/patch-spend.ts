import type { Handler } from "@netlify/functions";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_REPO  = process.env.GITHUB_REPO!;
const FILE_PATH    = "library/library.json";
const BRANCH       = "main";
const API          = "https://api.github.com";

// ── Spend data from Miro table — all 19 entries ──────────────────────────────
// Keyed by file_name to match against library entries
const SPEND_PATCH: Record<string, object> = {
  "Mob Control-CN28 polished version_Video 02.mp4": {
    spend_tier: "1M", spend_window_days: 90,
    spend_networks: ["AppLovin", "Voodoo Ads"],
    spend_notes: "⚠ Proxy data — spend from CN28 original, no independent perf data on polished version",
    spend_data_source: "CN28_original", iteration_of: "CN28",
  },
  "CT43.mp4": {
    spend_tier: "500K", spend_window_days: 90,
    spend_networks: ["AppLovin", "Google"],
    spend_notes: "Custom side cam. Base creative for skeleton kick hook. Not FB/TT.",
    iteration_of: "CR86 (cam)",
  },
  "MOC_9876_CY38-CT43_1080x1920_EN.mp4": {
    spend_tier: "sub100K", spend_window_days: null,
    spend_networks: ["AppLovin"],
    spend_notes: "Side cam iteration of CX18. Barely spending. Custom cam hurt performance vs default cam here.",
    iteration_of: "CX18 (cam)",
  },
  "MOC_10218_DA01-CX25_1080x1920_EN.mp4": {
    spend_tier: "100K", spend_window_days: 30,
    spend_networks: ["AppLovin", "Voodoo Ads", "TikTok"],
    spend_notes: "Mix of femme zombie hook (DA01/CX25) + CT43 gameplay. Multi-network performer.",
    iteration_of: "CT43 + CX18 hook",
  },
  "CZ94.mp4": {
    spend_tier: "100K", spend_window_days: 30,
    spend_networks: ["Facebook", "Google", "TikTok"],
    spend_notes: "Social only. RET significantly lower vs channel avg.",
  },
  "DB24.mp4": {
    spend_tier: "100K", spend_window_days: 30,
    spend_networks: ["AppLovin", "Voodoo Ads"],
    spend_notes: "Dynamic column gate mechanic. AppLovin + Voodoo Ads.",
  },
  "CZ66.mp4": {
    spend_tier: "100K", spend_window_days: 30,
    spend_networks: ["Facebook", "TikTok"],
    spend_notes: "Black/white/green palette, foggy forest. Desert+blue/red variant (CZ65) now top-1 FB.",
  },
  "CR17.mp4": {
    spend_tier: "500K", spend_window_days: 90,
    spend_networks: ["AppLovin", "Unity"],
    spend_notes: "3 containers vs 2 in CN28p. Strong AppLovin performer.",
    iteration_of: "CN28p",
  },
  "CV73.mp4": {
    spend_tier: "100K", spend_window_days: 90,
    spend_networks: ["Google"],
    spend_notes: "Google only. +1→+3 gate upgrade mechanic.",
  },
  "MOC_8810_CJ10-CJ23_1080x1920_EN.mp4": {
    spend_tier: "1M", spend_window_days: 90,
    spend_networks: ["AppLovin"],
    spend_notes: "Old performer. AppLovin only. 2min mixes performed on Unity.",
  },
  "CC21.mp4": {
    spend_tier: "1M", spend_window_days: 90,
    spend_networks: ["AppLovin"],
    spend_notes: "Beige biome, pink/black palette. AppLovin. FF variant (CB57) → FB+Google.",
  },
  "MOC_10324_DA01-CX25-CR17_1080x1920_EN.mp4": {
    spend_tier: "100K", spend_window_days: 30,
    spend_networks: ["AppLovin"],
    spend_notes: "Mix of 2 AppLovin performers. AppLovin only.",
    iteration_of: "10218 + CR17",
  },
  "CR86.mp4": {
    spend_tier: "100K", spend_window_days: 90,
    spend_networks: ["Facebook", "TikTok"],
    spend_notes: "Default cam vs CT43 custom cam. 5x lower velocity. Hook variant → AppLovin.",
    iteration_of: "CT43 (cam)",
  },
  "MOC_8924_CJ77_1080x1920_EN.mp4": {
    spend_tier: "100K", spend_window_days: 180,
    spend_networks: ["Facebook", "TikTok"],
    spend_notes: "Slow burn. Meadow platform mechanic + CC21 compound.",
  },
  "CX18.mp4": {
    spend_tier: "100K", spend_window_days: 30,
    spend_networks: ["Facebook", "Google", "TikTok", "Voodoo Ads"],
    spend_notes: "Widest network reach of all entries. Default MOC cam.",
    iteration_of: "9876 (cam)",
  },
  "CZ65.mp4": {
    spend_tier: "100K", spend_window_days: 14,
    spend_networks: ["Facebook"],
    spend_notes: "Desert + classic blue/red. Currently top-1 FB (last 2 weeks). Total spend still < CZ66 cumulative.",
    iteration_of: "CZ66",
  },
  "CR85.mp4": {
    spend_tier: "100K", spend_window_days: 60,
    spend_networks: ["AppLovin"],
    spend_notes: "Knight boss hook instead of skeleton. CR85 → AppLovin, CR86 → Facebook. Hook determines network.",
    iteration_of: "CR86",
  },
  "CB57.mp4": {
    spend_tier: "1M", spend_window_days: 180,
    spend_networks: ["Facebook", "Google"],
    spend_notes: "Foggy forest biome vs CC21 beige. Better almost-win (4HP). Biome determines network.",
    iteration_of: "CC21",
  },
};

async function ghGet(path: string) {
  const res = await fetch(`${API}/repos/${GITHUB_REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status}`);
  return res.json();
}

async function ghPut(path: string, content: string, sha: string) {
  const res = await fetch(`${API}/repos/${GITHUB_REPO}/contents/${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `chore: patch spend data ${new Date().toISOString()}`,
      content: Buffer.from(content).toString("base64"),
      sha, branch: BRANCH,
    }),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${path}: ${res.status} ${await res.text()}`);
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  try {
    // Fetch current library from GitHub
    const file   = await ghGet(FILE_PATH);
    const sha    = file.sha as string;
    const decoded = Buffer.from(file.content as string, "base64").toString("utf-8");
    const library: any[] = JSON.parse(decoded);

    let patched = 0;
    const updated = library.map(entry => {
      const patch = SPEND_PATCH[entry.file_name];
      if (!patch) return entry;
      patched++;
      return { ...entry, ...patch };
    });

    await ghPut(FILE_PATH, JSON.stringify(updated, null, 2), sha);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, patched, total: library.length }),
    };
  } catch (err: any) {
    console.error("Patch spend error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
