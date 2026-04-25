import type { DNAEntry, UploadConfig, FrameExtraction, Concept, ScriptStep } from "./types";
import { buildReferenceContext } from "./refImages";

// ─── Deploy A: Diversity constants + shuffle helper ─────────────────────────
// Canonical MOC champion roster. Concepts 1-2 default to these (soft rule);
// concepts 3-4 may invent. Mobs (Caveman, Alien, Chicken, Bat, etc.) are a
// separate looser concept captured via player_mob_color / enemy_mob_color —
// no canonical mob list enforced.
export const MOC_CANONICAL_CHAMPIONS = [
  "Yellow Normie", "Mobzilla", "Captain Kaboom", "Kraken", "Nexus",
  "Skeleton", "Knight", "Femme Zombie", "Red Hulk"
];

// Wild-card biome pool for concept 4. Shuffled per-generation to kill LLM
// position bias (previously "Clockwork Factory" won ~every time as last item).
export const WILD_BIOMES = [
  "Space", "Tunnel", "Underwater Ruins", "Crystal Caverns", "Overgrown City",
  "Floating Islands", "Ancient Temple", "Frozen Tundra", "Swamp", "Cloud Kingdom",
  "Bamboo Forest", "Canyon", "Underground Mine", "Coral Reef", "Haunted Castle",
  "Sky Bridge", "Shipwreck Bay", "Glacier", "Jungle Canopy", "Sandstorm",
  "Mushroom Grove", "Steampunk Refinery", "Volcano Cavern"
];
// Note: "Clockwork Factory" deliberately removed — became an LLM attractor and was selected for ~every brief regardless of shuffle. Replaced with two adjacent options.

// Hook type taxonomy — shuffled per-generation. Rule: 4 concepts = 4 different types.
export const HOOK_TYPES = ["Challenge", "Satisfying", "Loss Aversion", "Story", "FOMO", "Tutorial"];

// Deploy J: UGC archetype menu expanded to 3-part shot descriptions (SHOT SETUP / PERSONA ACTION / CAPTION HINT).
// Gives Gemini concrete visual anchors — camera distance, body language, facial beat, caption — so the render feels
// like a real TikTok moment rather than generic "person with phone". Four different assigned across concepts.
export const UGC_ARCHETYPES = [
  "POV reaction — SHOT SETUP: medium close-up, front-facing camera held at arm's length, warm indoor lighting from above, phone screen glow on face. PERSONA ACTION: mouth slightly open, eyes wide, leaning BACK not forward (genuine shock not performed). CAPTION HINT: 'POV: you just discovered the most addictive cannon game'",
  "Stopwatch challenge — SHOT SETUP: medium shot, side camera on tripod or propped, visible wall clock or watch on wrist, clean bright daylight. PERSONA ACTION: jaw clenched, eyes locked forward, other hand gripping knee or couch armrest. CAPTION HINT: 'can you beat this boss in 30 seconds'",
  "Rage / relatable — SHOT SETUP: close crop on upper body, handheld shaky-cam feel, natural indoor light, phone briefly visible then slammed down. PERSONA ACTION: hands thrown up mid-air, head tipped back in comic frustration, visible face-palm or groan. CAPTION HINT: 'when the boss is at 1HP and I still lose'",
  "Before / after — SHOT SETUP: split-frame or cut between two identical angles, same couch same shirt same lighting, only facial state differs. PERSONA ACTION: LEFT tired slumped defeated, RIGHT alert upright focused. CAPTION HINT: 'day 1 vs day 30 playing this game'",
  "Discovery / duet — SHOT SETUP: close-up, person looking slightly off-camera at phone in their hand, indoor natural light, shallow depth of field. PERSONA ACTION: finger pointing at phone, eyebrows raised, mouth open mid-sentence, leaning slightly into frame. CAPTION HINT: 'you HAVE to try this'",
  "Pro tip / tutorial — SHOT SETUP: medium shot facing camera, person slightly leaned forward, hands in frame, warm home-office lighting. PERSONA ACTION: one hand gesturing palm-up like explaining, other hand touching phone, eye contact directly with camera. CAPTION HINT: 'the trick that changed everything'"
];

// UGC persona menu (hook_b). Grounded in MOC audience portrait:
// Whale 45-59 M USA relaxation/completionist, Dolphin 35-44 M USA competitive/completionist (85.7% of revenue).
// Shuffled independently of archetypes; Claude assigns 4 different personas across 4 concepts.
export const UGC_PERSONAS = [
  "Relaxed completionist — man 45-59, casual shirt, home setting (couch or armchair), evening/warm light, calm focused face. Matches Whale relaxation profile.",
  "Focused competitor — man 35-44, bright daylight, home office or gaming chair, alert intensity, casual t-shirt. Matches Dolphin competitive profile.",
  "Analytical optimizer — man 30-55, neutral indoor setting, thoughtful body language, maybe second screen or notebook visible in frame. Works-out-the-pattern vibe.",
  "Surprised discoverer — any adult 30-55, any gender, close-up as first-timer, leaning toward camera, wide eyes and raised brows, natural light. Entry-point energy.",
  "Social / couch companion — man 40-60 with partner or family visible in the background, casual evening living-room setting. 'Even my wife wants a turn' social-proof framing.",
  "Wife / partner / spouse — woman 30-55, casual home setting (kitchen, couch, bedroom), phone in hand, playful or focused expression. Off-target-but-relatable, classic 'your wife will play this too' angle."
];

// Fisher-Yates shuffle. Pure, creates a new array. Used for per-generation randomization.
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
export const BIOME_GUIDE = `BIOMES: Foggy Forest(grey/white atmospheric fog,dark pines,grey road—NOT snow), Desert(tan sand,blue sky), Water(grey bridge over blue water), Bunker(grey concrete tunnel,pipes,industrial), Cyber-City(grey metal,orange/blue neon), Volcanic(red/orange lava,black rocks), Snow(white snow ground), Toxic(purple paths,green slime), Meadow(green hills,grey brick bridge)`;
export const CHAMPION_GUIDE = `BOSSES: Track by appearance order — Boss 1, Boss 2, etc. If user names them in GROUND TRUTH (e.g. "Yellow Normie"), use those names. Otherwise use generic labels. Enemy tower = red/grey fortified block structure with HP number. Count boss appearances, damage thresholds, and kills — don't try to identify which character model it is. When a boss flashes different colours (white, blue, red) while being hit, it's the SAME boss with hit VFX, not a new boss.`;
export const MOC_EVENTS_GUIDE = `MOC-SPECIFIC EVENTS TO HUNT FOR (timestamp ALL of these if present):
- CONTAINER DESTRUCTION: The MOB SWARM destroys a breakable container/obstacle. Report it with HP number visible. CRITICAL — containers have two types:
  * UPGRADE CONTAINER: Has a cannon/unit icon visible ON TOP of the container. Destroying this one upgrades the cannon tier. Use: "Upgrade container (HP:20, cannon icon) destroyed — cannon upgrades to next tier".
  * EMPTY CONTAINER: Has NO icon on top — just a health number. Destroying this does NOT upgrade the cannon. Use: "Empty container (HP:184) destroyed — no upgrade"
  * If you cannot see whether there is an icon, look at what happens to the cannon IMMEDIATELY after destruction. If the cannon visually changes shape/size, it was an upgrade container. If the cannon looks the same, it was empty.
  * NEVER assume every container = upgrade. Most containers in a video are empty health obstacles.
  * CONSISTENCY RULE: Every upgrade event MUST have an upgrade container destruction visible at or just before that timestamp. If you see the cannon visually change shape but missed the container, add: "Upgrade container destroyed (icon not clearly visible) — cannon tier advanced".
  * +1 VFX IS NOT AN UPGRADE: When the mob swarm passes through a +N gate, a floating "+1" animation appears near the cannon — this is the cannon COUNT increasing. The cannon MODEL/TIER does NOT change. Simple Cannon stays Simple Cannon. ONLY a container destruction (with cannon icon on top) changes Simple→Double→Triple→Tank.
- GIANT/BOSS DEATH: Large enemy giant or boss character defeated. ALWAYS timestamp — key emotional payoff. REQUIRED: every boss death MUST appear in the giant_kills array with timestamp, name (e.g. "Yellow Normie"), and a note on how it died. ALSO REQUIRED: the auto_frames description for that timestamp MUST start with "GIANT KILL:" followed by the giant name and HP reaching zero. Example: "GIANT KILL: Yellow Normie (HP:0) defeated — overwhelmed by mob swarm". If a giant disappears from screen or its HP bar vanishes, it is dead — timestamp and document it even if the defeat animation is brief.
  HP CONTINUITY RULE: A giant's HP should generally decrease over time as it takes damage. If you see HP jump dramatically UP (e.g. HP:86 → HP:7777), this is either (a) a second giant spawn explicitly stated in context, or (b) a misread of the HP number. Never interpret an HP jump as "a new giant appears" — write "Giant HP bar visible: [X]" without inventing a new entity. HP going DOWN = normal damage. HP going UP dramatically = misread or second giant from context only.
- X GATE PASS: The MOB SWARM passes through a multiplication gate (xN). Report gate value and timestamp for EACH pass.
- + GATE PASS: The MOB SWARM passes through an addition gate (+N), which adds more cannons to the firing lineup (not more mobs). Report gate value and timestamp.
- ALMOST-FAIL MOMENT: Player mob count drops to dangerously low level (near wipeout) but survives. Use significance "almost_fail".
- ALMOST-WIN MOMENT: Player mobs reach the enemy tower with its HP bar nearly empty (sliver remaining) — player almost wins before being wiped. Use significance "almost_win". Description: "Enemy tower HP critical ([X] remaining) — almost-win moment".
- ENEMY TOWER HP: When the enemy tower HP bar drops to 25% or less, timestamp it with significance "almost_win". The enemy tower is the red/grey fortified structure at the top of the lane.
- SWARM PEAK: Maximum mob count on screen. Use significance "swarm".
- FINAL FAIL/DEFEAT: Last mob destroyed, FAILED screen appears.
- GREEN PIPE: Shortcut tunnel that sends mobs directly to the enemy tower or boss area — skipping part of the level.
- RED BLOCK: Red pushable/breakable obstacle that physically blocks access to valuable elements (gates, upgrades). Player must smash through it.
- CHAMPION RELEASE: Sniper cannon charging bar fills up and releases a champion unit onto the field.
- MOB/TROOP TYPE CHANGE: If the mob visual type changes mid-video (different shape, size, or sustained colour shift that is not a hit VFX flash), timestamp it with significance "transition". Description: "Mob type changes to [description]". Relevant for market analysis of competitor ads. In MOC ads this is rare — only flag if clearly sustained, not a momentary flash.

CANNON UPGRADE TIERS — exactly 4 valid names:
1. Simple Cannon — single barrel, compact
2. Double Cannon — two barrels side-by-side
3. Triple Cannon — three barrels, wider
4. Tank — military tank with turret
No other names are valid. A floating "+1" animation near the cannon = cannon count increase, not a tier upgrade.

UPGRADE RULE: If PRE-LOCKED unit_evolution_chain is in GROUND TRUTH, use it exactly — it defines how many upgrades happened and which tiers. Do not count icons and override the locked chain. Find upgrade events in the frames to match the locked count, even if the container icon is not clearly visible.
If NO locked chain: count upgrade containers WITH A CANNON ICON destroyed — that count = chain length minus 1. Empty containers (no icon) do NOT trigger upgrades.

CANNON COUNT vs CANNON TIER: +N gates add more cannons FIRING (count goes up). The cannon MODEL does not change. "Cannon count +1" is not an upgrade.`;

export const GATE_GUIDE = `GATES — CRITICAL: passing through ANY gate NEVER upgrades the cannon model. Gates only affect mob COUNT.
- Multiplication gate (x value, e.g. x3): multiplies the NUMBER OF MOBS in the lane. x3 = triple the mobs. ONLY this changes mob count.
- Addition gate (+ value, e.g. +3): when the mob swarm passes through, it adds +N more CANNONS to the firing lineup (the cannon count grows). Does NOT multiply mobs. Does NOT change the cannon MODEL/TIER.
- Death gate (RED rect + SKULL): instantly kills ALL mobs in the swarm.
- Dynamic gate: activates when nearby structures are broken.

CANNON UPGRADE RULE — ABSOLUTE: The cannon model (Simple/Double/Triple/Tank) ONLY changes when the MOB SWARM physically DESTROYS a breakable obstacle/container on the road. This is a separate event from any gate pass. NEVER write "cannon upgrades after passing a gate". If you see a cannon change and a gate in the same second, the upgrade came from a container that was also destroyed at that moment, NOT from the gate.
Report EVERY gate with its exact value. If unclear: "x?" or "+?".
GATE DESTRUCTION: Gates CAN be physically destroyed by giants/bosses walking through them. ABSOLUTE VISUAL RULE: You MUST have TWO CONSECUTIVE frames — frame N shows the gate PRESENT, frame N+1 shows the gate COMPLETELY ABSENT. You must be able to state the exact timestamps of both frames. WITHOUT these two frames, DO NOT report any gate as destroyed. FORBIDDEN INFERENCES: do NOT report gate destruction based on (a) giant proximity to a gate, (b) "the giant was there around that time", (c) any frame where the gate is still visible. BAD EXAMPLE (NEVER DO): "x4 destroyed at 8s because the giant was walking near gates at 8s" — this is forbidden. GOOD EXAMPLE: "x3 destroyed at 9s — gate visible at 8s frame, gone at 9s frame". When confirmed with TWO consecutive frames: timestamp it, significance "gate", note "Gate destroyed by [giant name]", include in gate_sequence as "xN destroyed by giant at Xs". If you are not 100% certain from consecutive frames — omit it entirely.
cannon_count_log: track cannon count as a running string showing only +N gate changes: "1 cannon start → +1 gate at 3s: 2 cannons → +1 gate at 9s: 3 cannons". x-gates do NOT appear here (they affect mobs, not cannons). IMPORTANT: Even single +1 gates must be tracked — each +1 gate adds exactly 1 more cannon to the firing lineup.
gate_sequence FIELD: Include ALL gate passes — both xN gates AND +N gates. Format each as "x3 at 2s", "+1 at 3s", "x4 at 8s" etc. Do NOT omit +N gates from gate_sequence just because they are tracked in cannon_count_log. They must appear in BOTH.
gate_escalation FIELD (Deploy H): Detect whether the video shows an ESCALATING xN gate sequence — the SAME mob multiplier mechanic where xN values increase across multiple gates in one run (example: x2 → x6 → x60, or x3 → x10 → x100). This is a specific and powerful mechanic that produces massive visual payoff. Rules: (a) Requires AT LEAST 2 xN gates with STRICTLY INCREASING values in gate_sequence. (b) A single xN gate is NOT escalation — leave gate_escalation null. (c) Two xN gates with the same value (x3, x3) is NOT escalation. (d) xN followed by smaller xN is NOT escalation. (e) When escalation IS detected, populate gate_escalation as a short summary string: "xA → xB → xC (Ns span, approx +X00% mob count)". (f) When no escalation, set gate_escalation to null. Example with escalation: "x2 → x6 → x60 (13s span, ~+3000% mob count)". Example without: null.
+N GATE FRAME DESCRIPTION RULE: Every auto_frames entry where a blue +N gate is passed MUST include "Cannon count +[N]" in the description.`;
export const HOOK_GUIDE = `HOOK: EXACT SECOND thumb stops scrolling. NEVER 0 unless frame-0 drama. hook_timing_seconds=REAL SECOND (2,4,8) NEVER fraction.`;
export const TIMESTAMP_RULES = `TIMESTAMPS: Real seconds only (0,2,5,8,14,22). NEVER fractions (0.03,0.28). 30s video midpoint=15.`;

export const UNIVERSAL_EVENTS_GUIDE = `UNIVERSAL KEY EVENTS (for any mobile game ad):
- HOOK: First dramatic visual that stops scrolling (boss, danger, impressive moment)
- POWER UP: Player gets stronger — unit merge, upgrade, ability unlock, army grows
- ENEMY APPEAR: New threat visible — boss, enemy wave, obstacle
- ENEMY DAMAGE: Enemy takes significant damage (HP thresholds: 75%, 50%, 25%, near-zero)
- ENEMY DEFEAT: Enemy/boss destroyed or defeated
- PEAK ACTION: Maximum intensity — largest army, most units on screen, biggest explosion
- NEAR LOSS: Player almost fails — army nearly wiped, health critical
- LOSS/WIN: Final outcome — defeat screen, victory screen
- TRANSITION: Scene change, camera shift, new level segment
Track each event with timestamp and brief description of what happened. Focus on PROGRESSION: what changed from the previous state.`;

export const frameExtractionSystem = (adType: string = "moc") => `Precise video timestamp analyst for ${adType === "competitor" ? "mobile game ads (any game)" : "Mob Control ads"}.

YOUR ONLY JOB: identify WHICH SECONDS contain a performance-relevant visual event. Extract dense coverage (18-24 timestamps) but EVERY timestamp must have a real reason — do not add timestamps where nothing changes.

WHAT COUNTS AS A TIMESTAMP (include all of these):
- Gate pass (xN or +N) — every single one, with exact value
- Container destruction (upgrade or empty)
- Cannon shape change (tier upgrade)
- Giant/boss appearing, taking damage, dying
- Almost-fail moment (mob count critically low)
- Swarm peak (maximum mobs on screen)
- Final defeat / LOST screen
- Hook moment (first dramatic visual)
- Any second where something visually changes that affects the player's state

WHAT DOES NOT GET A TIMESTAMP:
- Seconds where the scene looks identical to the previous timestamp
- "Filler" frames just to fill a gap — if nothing happened between 10s and 18s, timestamp 10s and 18s only, not 11-17s
- Gaps ARE allowed — an 8-second gap with no events is fine if nothing happened

GIANT DEATH — HIGHEST PRIORITY:
- If HP bar shows "0" or giant body completely absent from frame → significance "boss_death"
- HP bar appearing empty or giant flashing white = NOT sufficient
- NEVER skip a confirmed boss_death

GIANT HP — ONLY TIMESTAMP THESE MOMENTS:
- First appearance of a giant HP bar
- HP crosses a major threshold: ~75%, ~50%, ~25%, ~10%, or near-zero
- HP reaches 0 (boss_death)
- Do NOT timestamp every HP tick

GATE DESTRUCTION: ONLY timestamp if gate is present in one frame and completely absent in the next. No inference from proximity.

+N GATE: always timestamp. Description: "+[N] gate: cannon count +[N]".

BOSS NAMING: Label bosses by appearance order (Boss 1, Boss 2). If user names them in context, use those names. Same boss flashing colours = hit VFX, still same boss.

CANNON UPGRADES: Only timestamp if cannon shape visually changes. Floating "+1" near cannon = count increase, NOT tier upgrade.

${TIMESTAMP_RULES}

Return ONLY JSON: {"duration_seconds":number,"frames":[{"timestamp_seconds":number,"description":string,"significance":"hook|gate|power_up|boss_death|boss_damage|obstacle|peak|almost_fail|almost_win|loss|win|fail|transition|filler"}]}`;
export const hookDetectionSystem = () => `Expert mobile ad hook analyst for Mob Control mobile game ads.
You will receive extracted frame images and their timestamps. Identify the HOOK — the exact second a thumb would stop scrolling.

RULES:
- The hook is the first moment of visual drama, tension, or curiosity (boss visible, dangerous gate choice, almost-fail, impressive swarm).
- hook_timing_seconds MUST be one of the provided frame timestamps. Do NOT invent a timestamp.
- NEVER return 0 unless frame 0 has clear dramatic action. Idle cannon at 0s is NOT a hook.
- Hook is usually between 1s and 8s. Use real seconds only, never fractions.

Return ONLY JSON: {"hook_timing_seconds":number,"hook_type":"Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial","hook_description":string}`;

// Parse user context text to extract structured facts that should be locked
// PRIORITY: arrow notation (Simple→Double→Triple) wins over individual mentions.
// LAST match wins — user corrections override earlier auto-parsed notes.
export function parseContextFacts(context: string): { chain?: string[]; giantNames?: string[]; hookSeconds?: number; giantSurvives?: true | string[]; giantKillSeconds?: number; giantKillCount?: number; upgradeSeconds?: number } {
  const result: { chain?: string[]; giantNames?: string[]; hookSeconds?: number; giantSurvives?: true | string[]; giantKillSeconds?: number; giantKillCount?: number; upgradeSeconds?: number } = {};
  if (!context) return result;
  const lc = context.toLowerCase();
  const abbrevMap: Record<string,string> = {simple:"Simple Cannon",double:"Double Cannon",triple:"Triple Cannon",tank:"Tank","golden jet":"Golden Jet"};

  // ── EVOLUTION CHAIN ──
  // Priority 0: "X upgrades to Y" pairs — most specific pattern, chains pairs together
  const upgradePairPattern = /(simple|double|triple|tank)\s*(?:cannon\s*)?upgrades?\s+to\s+(simple|double|triple|tank)/gi;
  const upgradePairs = [...context.matchAll(upgradePairPattern)].map(m => [abbrevMap[m[1].toLowerCase()], abbrevMap[m[2].toLowerCase()]]);
  if (upgradePairs.length > 0) {
    const chain = [upgradePairs[0][0]];
    for (const pair of upgradePairs) {
      if (chain[chain.length - 1] === pair[0]) chain.push(pair[1]);
      else if (!chain.includes(pair[1])) chain.push(pair[1]);
    }
    if (chain.length >= 2) result.chain = chain;
  }

  // Priority 1: Arrow notation (only if Priority 0 found nothing)
  if (!result.chain) {
  // Arrow notation (Simple→Double→Triple) — take the LAST one found (user correction wins)
  const arrowPattern = /\b(simple|double|triple|tank|golden jet)\s*(?:cannon\s*)?(?:\u2192|->|>|to)\s*(?:cannon\s*)?(simple|double|triple|tank|golden jet)(?:\s*(?:cannon\s*)?(?:\u2192|->|>|to)\s*(?:cannon\s*)?(simple|double|triple|tank|golden jet))?(?:\s*(?:cannon\s*)?(?:\u2192|->|>|to)\s*(?:cannon\s*)?(simple|double|triple|tank|golden jet))?/gi;
  const arrowMatches = [...context.matchAll(arrowPattern)];
  if (arrowMatches.length > 0) {
    const lastMatch = arrowMatches[arrowMatches.length - 1];
    const chain = [lastMatch[1], lastMatch[2], lastMatch[3], lastMatch[4]]
      .filter(Boolean)
      .map(p => abbrevMap[p.trim().toLowerCase()])
      .filter(Boolean);
    if (chain.length >= 2) result.chain = chain;
  }
  }

  // Priority 2: Full cannon tier names in left-to-right order (only if no arrow chain)
  if (!result.chain) {
    const tierNames = ["simple cannon", "double cannon", "triple cannon", "tank", "golden jet"];
    const foundTiers: string[] = [];
    let searchPos = 0;
    while (searchPos < lc.length) {
      let nextTier = -1, nextTierName = "";
      for (const tier of tierNames) {
        const pos = lc.indexOf(tier, searchPos);
        if (pos !== -1 && (nextTier === -1 || pos < nextTier)) {
          nextTier = pos;
          nextTierName = tier;
        }
      }
      if (nextTier === -1) break;
      const canonical = nextTierName.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
      const preceding = lc.slice(Math.max(0, nextTier - 8), nextTier);
      const negated = /\bno\s+$|\bnot\s+$|\bnever\s+/.test(preceding);
      if (!negated && !foundTiers.includes(canonical)) foundTiers.push(canonical);
      searchPos = nextTier + nextTierName.length;
    }
    if (foundTiers.length >= 2) result.chain = foundTiers;
  }

  // Priority 3: Upgrade count ("2 upgrades") — only if no chain found
  if (!result.chain) {
    const upgradeMatch = lc.match(/(\d+|one|two|three|four)\s+(?:cannon\s+)?upgrades?/);
    if (upgradeMatch) {
      const n = ({"one":1,"two":2,"three":3,"four":4} as Record<string,number>)[upgradeMatch[1]] ?? parseInt(upgradeMatch[1]);
      const defaultChain = ["Simple Cannon","Double Cannon","Triple Cannon","Tank","Golden Jet"];
      if (n >= 1 && n <= 4) result.chain = defaultChain.slice(0, n + 1);
    }
  }

  // ── GIANT NAMES ──
  const giantPattern = /(yellow normie|red giant|skeleton|knight|captain kaboom|gold golem|mobzilla|hulk)/gi;
  const giants = [...context.matchAll(giantPattern)].map(m => m[0].split(" ").map((w:string) => w[0].toUpperCase() + w.slice(1)).join(" "));
  if (giants.length) result.giantNames = [...new Set(giants)];

  // ── HOOK TIMING — supports "hook at 1s", "hook at 1-2s", "hook at 1-2 sec" ──
  const hookMatch = lc.match(/hook\s+(?:at\s+)?(\d+)(?:\s*-\s*\d+)?\s*s(?:ec)?/);
  if (hookMatch) result.hookSeconds = parseInt(hookMatch[1]);

  // ── UPGRADE TIMING — takes LAST match (user correction wins) ──
  const upgradeTimes: number[] = [];
  const upTimingA = /upgrade\S*\s+(?:to\s+\w+\s+(?:cannon\s+)?)?(?:at\s+)?(?:the\s+)?(\d+)(?:th|st|nd|rd)?\s*s(?:ec)?/gi;
  for (const m of context.matchAll(upTimingA)) upgradeTimes.push(parseInt(m[1]));
  const upTimingB = /(?:at\s+)?(?:the\s+)?(\d+)(?:th|st|nd|rd)?\s*s(?:ec)?[^.]*upgrade/gi;
  for (const m of context.matchAll(upTimingB)) { const t = parseInt(m[1]); if (!upgradeTimes.includes(t)) upgradeTimes.push(t); }
  if (upgradeTimes.length > 0) result.upgradeSeconds = upgradeTimes[upgradeTimes.length - 1];

  // ── GIANT KILL TIMING — "giant killed at 10th sec", "giant kill moment at 32nd sec" ──
  const giantKillTimingMatch = context.match(/(?:giant|boss|normie)\s+(?:is\s+)?killed\s+at\s+(?:the\s+)?(\d+)(?:th|st|nd|rd)?\s*s(?:ec)?/i)
    || context.match(/(?:killed|dies?|defeated)\s+at\s+(?:the\s+)?(\d+)(?:th|st|nd|rd)?\s*s(?:ec)?/i)
    || context.match(/(?:giant|boss)\s+kill\s+(?:moment\s+)?at\s+(?:the\s+)?(\d+)(?:th|st|nd|rd)?\s*s(?:ec)?/i);
  if (giantKillTimingMatch) result.giantKillSeconds = parseInt(giantKillTimingMatch[1]);

  // ── GIANT KILL COUNT ──
  const giantKillCountMatch = context.match(/(?:only\s+)?(\d+|one|two|three)\s+giants?\s+(?:is\s+|are\s+)?killed/i)
    || context.match(/(\d+|one|two|three)\s+(?:boss|giant)\s+(?:kill|death)/i);
  if (giantKillCountMatch) {
    const countMap: Record<string,number> = {one:1,two:2,three:3};
    result.giantKillCount = countMap[giantKillCountMatch[1].toLowerCase()] ?? parseInt(giantKillCountMatch[1]);
  }

  // ── GIANT SURVIVAL ──
  const qualifiedSurvival = /\b(?:final|last|second|2nd)\s+(?:giant|boss|normie)\s+(?:survives?|does(?:n.t| not) die|is not killed|stays alive)/i;
  const generalSurvival = /\b(?:yellow normie|giant|boss|normie)\s+(?:survives?|does(?:n.t| not) die|is not killed|stays alive)/i;
  const noKillPattern = /\bno\s+(?:giant|boss)\s+(?:kill|death|dying)/i;
  if (qualifiedSurvival.test(context)) {
    result.giantSurvives = ["last"] as any;
  } else if (generalSurvival.test(context) || noKillPattern.test(context)) {
    result.giantSurvives = true;
  }

  return result;
}

export const analyzeSystem = (lib: DNAEntry[], config: UploadConfig, frames: FrameExtraction[], duration: number, hasFrameImages: boolean, hasRefs: boolean) =>
  `${(() => {
    const facts = config.ad_type !== "competitor" ? parseContextFacts(config.context || "") : ({} as ReturnType<typeof parseContextFacts>);
    const lockedFields: string[] = [];
    if (facts.chain) {
      const chain = facts.chain;
      const phaseMap = chain.map((tier, i) => {
        if (i === 0) return `Before 1st upgrade container: cannon = "${tier}"`;
        if (i === 1) return `After 1st upgrade container destroyed: cannon = "${tier}"`;
        if (i === 2) return `After 2nd upgrade container destroyed: cannon = "${tier}"`;
        return `After ${i}th upgrade container destroyed: cannon = "${tier}"`;
      }).join('; ');
      lockedFields.push(`LOCKED unit_evolution_chain: ${JSON.stringify(chain)} — use exactly these tier names in this exact order. There ${chain.length - 1 === 1 ? 'is 1 upgrade' : `are ${chain.length - 1} upgrades`} in this video. The chain goes from ${chain[0]} to ${chain[chain.length-1]} — never the reverse. Do NOT add extra tiers beyond what is listed here.`);
    }
    if (facts.giantNames) {
      lockedFields.push(`LOCKED champions_visible: ${JSON.stringify(facts.giantNames)} — ONLY these giants appear in the entire ad. There are exactly ${facts.giantNames.length} giant(s). Do NOT invent additional giants based on HP changes or visual assumptions.`);
      if (facts.giantNames.length === 1) {
        lockedFields.push(`GIANT NAMES LOCKED: The only named giant in this video is ${facts.giantNames[0]}. If a second large HP bar appears after ${facts.giantNames[0]} is killed, call it "Unknown" — do NOT use colour-based names like "Red Normie" or "White Normie". ${facts.giantNames[0]} is the ONLY giant with a real name in this video.`);
      }
    }
    if (facts.hookSeconds != null) lockedFields.push(`LOCKED hook_timing_seconds: ${facts.hookSeconds}`);
    if (facts.upgradeSeconds != null) {
      lockedFields.push(`LOCKED cannon upgrade timing: The cannon upgrade happens at approximately ${facts.upgradeSeconds}s. The upgrade event (container destroyed + cannon changes shape) MUST appear within 1-2 seconds of ${facts.upgradeSeconds}s in the frame descriptions. Do not place it at any other timestamp.`);
    }
    if (facts.giantKillSeconds != null) {
      lockedFields.push(`LOCKED giant kill timing: The giant/boss is killed at approximately ${facts.giantKillSeconds}s. Do NOT report a GIANT KILL event at any other timestamp. The GIANT KILL description must appear at or within 1-2 seconds of ${facts.giantKillSeconds}s.`);
    }
    if (facts.giantKillCount != null) {
      lockedFields.push(`LOCKED total giant kills: EXACTLY ${facts.giantKillCount} giant(s) ${facts.giantKillCount === 1 ? 'is' : 'are'} killed in this entire ad. The giant_kills array must have EXACTLY ${facts.giantKillCount} ${facts.giantKillCount === 1 ? 'entry' : 'entries'}. After the ${facts.giantKillCount === 1 ? 'first' : `${facts.giantKillCount}th`} GIANT KILL is written, NO further GIANT KILL events are permitted — even if you see HP reach zero. Any subsequent HP:0 is a misread or the giant respawning. Do NOT write a second GIANT KILL.`);
    }
    if (facts.giantSurvives === true) {
      lockedFields.push(`LOCKED: ALL giants/bosses SURVIVE to the end — do NOT add any entry to giant_kills array.`);
    } else if (Array.isArray(facts.giantSurvives)) {
      lockedFields.push(`LOCKED: The FINAL giant (the last one visible before the player loses) survives — its HP does NOT reach zero. Even if you see its HP very low, it does not die. Do NOT add this giant to giant_kills. Do NOT write "GIANT KILL" for the final giant. The player loses to this giant, not the other way around.`);
    }
    if (config.context || lockedFields.length) {
      return `GROUND TRUTH — USER-PROVIDED FACTS (ABSOLUTE PRIORITY — these override everything you see in the frames):
${config.context ? config.context + "\n" : ""}${lockedFields.length ? "\nPRE-LOCKED FIELDS (copy these values exactly into your JSON output — do not modify):\n" + lockedFields.join("\n") : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    }
    return `DEFAULT ASSUMPTIONS (no user context provided — apply when analyzing):
- Assume 1 giant/boss exists unless frames clearly show a second distinct giant appearing AFTER first is confirmed dead at HP:0
- All HP bars showing the same giant model = same giant throughout the video
- Under-report rather than hallucinate — if genuinely unsure about an event, omit it
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
  })()}World-Class Creative Intelligence Analyst for Mob Control ads.

━━ CRITICAL RULES — READ THESE FIRST, THEY OVERRIDE EVERYTHING ELSE ━━

RULE 1 — GIANT KILLS (most commonly hallucinated event):
A GIANT KILL requires ONE of these two conditions visible IN A FRAME IMAGE:
(a) The giant's HP bar shows the NUMBER "0" or "0%" visibly rendered — not an empty bar, not a flashing giant, not the bar disappearing off-screen
(b) The giant's body is completely absent from the frame AND was visible in the previous frame
"The giant must have died between frames" = NOT valid. Giant flashing white/blue = hit VFX on Yellow Normie, NOT a new boss, NOT a kill.
NEVER report a giant kill without one of (a) or (b) confirmed in a specific frame.

RULE 2 — CANNON UPGRADES (second most hallucinated):
The cannon chain ONLY grows when a container WITH A CANNON ICON ON TOP is physically destroyed AND the cannon visually changes shape in the next frame. BOTH must be visible. A floating "+1" animation = cannon COUNT increase, NOT a tier upgrade. If you cannot point to a specific frame showing the cannon shape change — the chain has zero upgrades.

RULE 3 — GATE DESTRUCTION:
Only report if you have frame N (gate present) + frame N+1 (gate completely absent). Giant proximity = NOT evidence. If uncertain — omit entirely.

RULE 4 — BOSS TRACKING:
Track bosses by appearance order: Boss 1, Boss 2, etc. If GROUND TRUTH names them, use those names. Otherwise use generic labels. A boss flashing different colours when hit = same boss (hit VFX), not a new boss. If HP suddenly jumps UP dramatically, a second boss spawned — label it Boss 2. Two HP bars in one frame = two different bosses.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ANALYSIS — TWO STEPS IN ONE OUTPUT:

STEP 1 — OBSERVE: Scan all frames and list 8-12 KEY EVENTS only. Each event must be visible in at least one frame.
KEY EVENT TYPES: hook (first dramatic visual), gate (checkpoint/multiplier pass with value), power_up (unit upgrade/evolution/ability gained), boss_appear (antagonist first visible with HP), boss_damage (HP crosses 75%/50%/25%/near-zero), boss_death (HP:0 visible or body absent), obstacle (destructible barrier/container destroyed), peak (maximum scale — most units/mobs/power on screen), almost_fail (player critical), almost_win (objective nearly complete), loss (FAIL/LOST screen).
DO NOT add events you cannot see in a frame. If unsure — omit. 8-12 events total, not one per second.

STEP 2 — BUILD DNA: Derive every field FROM your key_events. If no key_event supports a value, leave it empty/null.
- unit_evolution_chain: ONLY from upgrade key_events. No upgrade events = ["Simple Cannon"].
- gate_sequence: ONLY from gate key_events.
- giant_kills: ONLY from boss_death key_events.
- hook_timing_seconds: from the hook key_event.
- loss_event_timing_seconds: from the loss key_event.

CONSISTENCY CHECK: Every upgrade in unit_evolution_chain must have a matching upgrade key_event. Every giant_kills entry must have a matching boss_death key_event. gate_sequence must only contain gates from gate key_events. If a DNA field contradicts your key_events — fix the DNA field, not the events.

AD TYPE:${config.ad_type} TIER:${config.tier} DURATION:${duration}s
${hasRefs?buildReferenceContext():""}
${!hasFrameImages?`TIMESTAMP MAP (significance tags only):\n${frames.length>0?frames.map(f=>`[${f.timestamp_seconds}s] (${f.significance})`).join("\n"):"none"}`:"FRAME IMAGES PROVIDED — primary source of truth. Use frame images only."}
${TIMESTAMP_RULES}
${HOOK_GUIDE}
${config.ad_type==="moc"?`CANNON TIERS: Count upgrade events and map to standard MOC names: starting cannon = Simple Cannon, after 1st upgrade = Double Cannon, after 2nd = Triple Cannon, after 3rd = Tank. Always use these exact names in unit_evolution_chain. If GROUND TRUTH provides a chain, use it exactly.
UNIT EVOLUTION CHAIN: If PRE-LOCKED — use exactly. If not locked: ONLY add a tier when a frame shows (a) upgrade container with cannon icon destroyed AND (b) cannon shape change in next frame. Default: ["Simple Cannon"].
${GATE_GUIDE}
${MOC_EVENTS_GUIDE}
${BIOME_GUIDE}
${CHAMPION_GUIDE}`:`${UNIVERSAL_EVENTS_GUIDE}`}
${config.ad_type==="compound"?"COMPOUND: is_compound:true, segments array required.":""}
${config.ad_type==="competitor"?"COMPETITOR MODE: Strip ALL MOC-specific vocabulary (Yellow Normie, Tank/Simple/Double/Triple Cannon, named Mob Control champions, MOC-specific biomes). Describe units generically: small unit, large unit, boss 1, boss 2. Use universal event tags only (hook, gate, power_up, obstacle, peak, etc). REQUIRED competitor-only fields — fill all FOUR precisely: (1) core_fantasy: the emotional or mechanical fantasy this ad sells in 3-8 words (e.g. idle reward compounding, delayed gratification payoff, progress wipeout anxiety). (2) transferable_elements: array of 3-5 concrete testable hypotheses for MOC — each must be ACTIONABLE (what to change/add in MOC and what it tests). Bad example: use bigger numbers. Good example: Escalating +N gate values (5 → 50 → 500 → 5000) instead of static +1/+3 — tests whether numerical progression itself drives engagement independent of power gain. (3) moc_inspiration: 1-2 sentence high-level summary of how this ad maps to MOC strategy. (4) game_title: the NAME OF THE GAME/APP (NOT a description of the ad content). Extract from visible branding — app logo, game name in splash, watermark, UI text. Examples: 'Last War', 'Gold & Goblins', 'Whiteout Survival', 'Kingshot'. If the game_title is PROVIDED in upload_context by the user, use that exact value. If unclear and no user context, return null — do not invent.":""}
Return ONLY JSON — key_events FIRST, then DNA fields:
{"key_events":[{"timestamp_seconds":number,"event_type":"hook|gate|power_up|boss_appear|boss_damage|boss_death|obstacle|peak|almost_fail|almost_win|loss","description":string,"frame_evidence":string}],"title":string,"is_compound":boolean,"transition_type":string|null,"segments":[]|null,"hook_type":"Challenge|Satisfying|Loss Aversion|Story|FOMO|Tutorial","hook_timing_seconds":number,"hook_description":string,"gate_sequence":[string],"gate_escalation":string|null,"swarm_peak_moment_seconds":number|null,"loss_event_type":"Wrong Gate|Boss Overwhelm|Obstacle Hit|Death Gate|Enemy Overwhelm|None","loss_event_timing_seconds":number|null,"unit_evolution_chain":[string],"cannon_count_log":string,"emotional_arc":string,"biome":"Desert|Cyber-City|Forest|Volcanic|Snow|Toxic|Water|Bunker|Meadow|Unknown","biome_visual_notes":string,"champions_visible":[string],"giant_kills":[{"timestamp_seconds":number,"giant_name":string,"note":string}],"pacing":"Fast|Medium|Slow","key_mechanic":string,"why_it_works":string,"creative_gaps_structured":{"hook_strength":string,"mechanic_clarity":string,"emotional_payoff":string,"tension_arc":string,"rewatch_factor":string},"frame_extraction_gaps":string${config.ad_type==="competitor"?",\"moc_inspiration\":string,\"core_fantasy\":string,\"transferable_elements\":[string],\"game_title\":string|null":""}}`;
// Field groups for surgical refinement — each group maps to specific concept fields
export const REFINE_FIELD_GROUPS = {
  visual: ["visual_identity","biome_visual_notes"],
  evolution: ["unit_evolution_chain","cannon_count_progression","upgrade_triggers"],
  hook: ["hook_description","hook_timing_seconds","engagement_hooks"],
  lane: ["lane_design"],
  tension: ["tension_moments"],
  strategy: ["objective","title"],
} as const;

export const refinementSystem = (fields: Partial<Concept>, userPrompt: string, fieldNames: string[], subFieldHints?: string[]) =>
  `You are making a surgical edit to a Mob Control ad brief. Apply ONLY the specific change requested.

CURRENT VALUES OF FIELDS YOU MAY EDIT:
${JSON.stringify(fields, null, 2)}

USER REQUEST: ${userPrompt}

STRICT RULES:
- Return a JSON object containing ONLY the fields listed: ${fieldNames.join(", ")}
${subFieldHints && subFieldHints.length > 0 ? `- Within visual_identity, change ONLY these sub-fields: ${subFieldHints.join(", ")}. Leave all other sub-fields (lighting, player_mob_color, enemy_mob_color, mood_notes, cannon_type, gate_values) EXACTLY as they are.` : ""}
- Do NOT change any sub-field that the user did not mention.
- Do NOT infer related changes (e.g. if user says "change biome to Desert", do NOT change lighting or mood — only change environment and biome_visual_notes).
- For unit_evolution_chain: use ONLY exact tier names — Simple Cannon, Double Cannon, Triple Cannon, Tank.
- Be maximally conservative — change the minimum necessary to satisfy the request.
- Return ONLY valid JSON matching the exact field names above. No explanation. No markdown.`;

export const reanalysisSystem = (entry: DNAEntry) =>
  `Re-analyze Mob Control ad. Fix errors in the existing analysis.
EXISTING:${JSON.stringify(entry,null,2)}
FIX THESE SPECIFIC ISSUES:
1. hook_timing fractions → real seconds (0,2,5,8 etc)
2. timestamps → real seconds only
3. gate type confusion: + gates = cannon firing count, x gates = mob multiplier
4. unit_evolution_chain — count only UPGRADE CONTAINERS (with cannon icon on top) destroyed. REMOVE tiers beyond what containers justify. Most ads: 1-2 upgrades.
5. giant_kills — add any missed boss deaths as [{timestamp_seconds, giant_name, note}]
6. If compound ad: fill segments array
${GATE_GUIDE}
${BIOME_GUIDE}
${CHAMPION_GUIDE}
Return CORRECTED full JSON with all original fields.`;

// Deploy K: Market Research synthesis prompt.
// Extracts cross-ad patterns from competitor library entries. Output is a structured JSON digest
// that gets cached in Netlify Blobs and injected into briefSystem at brief generation time.
//
// DESIGN NOTES:
// - Temperature should be low (0.3) for consistency. Called from refresh-market-intel.ts.
// - Code-side computes: competitor_count, titles_covered, dominance_warning (no LLM math).
// - LLM only emits patterns + example creative_ids. Frequency derivable from examples.length in code.
// - Evidence-based, no invented patterns (first rule, most prominent).
// - Adaptive threshold: <3 returns empty digest; 3-5 allows single-example patterns with low-confidence flag; ≥6 requires ≥2 examples.
export const competitorSynthesisSystem = (competitors: any[]) => `You are a creative strategist helping improve Mob Control (MOC) ads by learning from competitors. MOC is a top-down lane game where a cannon shoots mob swarms at multiplier gates (xN) and accumulator gates (+N) to grow the army, then crashes it into a boss at the end.

ABSOLUTE RULE #1 — EVIDENCE-BASED, NO HALLUCINATION:
Every observation you emit MUST be supported by specific entries in the data below. Cite example creative_ids or titles. Do NOT invent observations not directly present in the data.

ABSOLUTE RULE #2 — DIFFERENTIATION, NOT DESCRIPTION:
Surface what competitors do DIFFERENTLY from MOC. If a pattern is ALSO what MOC does, SKIP IT.
GOOD example: "Gold & Goblins opens with passive wealth accumulation — MOC could test a passive-gains opener before cannon reveal"
Only emit observations where the competitor does something MOC does NOT.

COMPETITOR ENTRIES (${competitors.length} total):
${JSON.stringify(competitors, null, 2)}

OUTPUT: a compact JSON object with the following schema. Return ONLY valid JSON, no markdown, no prose.

{
  "differentiation_axes": [
    {
      "axis_name": "2-5 word label describing the differentiation dimension (e.g. 'Passive vs Active Opener', 'Non-HP Stakes', 'Delayed Gratification')",
      "description": "1-2 sentences on what competitors do that MOC doesn't on this axis",
      "example_entries": ["creative_id or title", ...],
      "confidence": "high" | "medium" | "low",
      "differentiation_hypothesis": "a concrete MOC ad concept idea that tests this differentiation. Must be ACTIONABLE — suggest a specific scene or mechanic change, not just 'try doing X'. 1-2 sentences."
    }
  ],

  "genre_outsiders": [
    {
      "entry_title": "creative_id or title of a competitor that is NOT in the same genre as MOC (e.g. clicker, idle, tycoon, builder, puzzle, card game — anything non-lane non-runner non-battle)",
      "genre": "short genre label",
      "unique_element": "1 sentence: the single thing this outsider ad does that's worth lifting into an MOC concept",
      "moc_translation": "1-2 sentences: how to translate that element into MOC's lane/cannon/gate/boss vocabulary"
    }
  ],

  "ugc_hook_patterns": [
    {
      "archetype": "short label (e.g. 'skeptic-turned-believer')",
      "persona_profile": "age range, gender balance, setting observed across examples",
      "shot_setup_commonalities": "camera distance, lighting, composition patterns",
      "opening_cue_pattern": "common dialogue/caption opener",
      "example_entries": ["creative_id or title", ...],
      "confidence": "high" | "medium" | "low"
    }
  ],   // MAY BE EMPTY — only populate when ≥2 competitor UGC hooks are observable. Most competitor libraries won't have UGC hooks; that's fine.

  "format_gaps": ["gap_code", ...]   // constrained enum, describe FORMATS missing from your competitor library. Codes:
  // "thin_sample" (library has <6 entries)
  // "no_ugc_observed"
  // "no_stopwatch_hooks"
  // "no_escalation_mechanic"
  // "no_ragebait_hooks"
  // "no_before_after_hooks"
  // "no_non_combat_openers" (all competitor ads start with combat)
  // "no_outsider_genres" (all competitors are lane/battle/multiplier games — no outside-genre inspiration)
  // "single_title_dominance"
  // "no_biome_diversity"
}

QUANTITY:
- differentiation_axes: 2-3 entries (fewer is FINE if competitor pool is homogeneous — quality over quantity; if you can only find 2 genuine differentiation points, return 2)
- genre_outsiders: 0-2 entries (empty is FINE if all competitors are same-genre; that's actually what "no_outsider_genres" signals)
- ugc_hook_patterns: 0-3 entries (empty OK)
- format_gaps: 0-6 codes from the enum

THRESHOLD:
- If competitors.length < 3, return all arrays empty and format_gaps = ["thin_sample"].
- If 3 ≤ competitors.length < 6, allow single-example axes marked "confidence":"low".
- If competitors.length ≥ 6, require ≥2 example_entries per axis.

QUALITY BAR — CRITICAL:
- Keep every description field under 150 characters. Keep differentiation_hypothesis under 220 characters.
- If your axis describes something BOTH competitor and MOC do, SKIP it entirely. Empty output > MOC-describes-itself.
- differentiation_hypothesis must be CONCRETE (specific scene/mechanic change), not vague.
- Axis names: specific and quotable. "Passive vs Active Opener" good. "Gameplay Dynamics" bad.
- Genre outsiders: ONLY from genres OUTSIDE lane/battle/multiplier/army (clickers, tycoons, puzzles, simulators, card games).
- Homogeneous library: say so via format_gaps ("no_outsider_genres"), return fewer axes. Do not pad.

Return ONLY the JSON object. No preamble, no markdown fences, no explanation.`;

export const briefSystem = (lib: any[], ctx: string, seg: string, iterateFrom?: string, refNote?: string, competitorContext?: { core_fantasy?: string; moc_inspiration?: string; transferable_elements?: string[]; title?: string; lift_intent?: string }, marketIntel?: any) => {
  // Deploy H: Extract gate_escalation signal from winner/scalable entries.
  // When a meaningful fraction of high-performers use escalation, surface it so brief can propose it.
  const highPerf = Array.isArray(lib) ? lib.filter((e: any) => e && (e.tier === "winner" || e.tier === "scalable")) : [];
  const withEscalation = highPerf.filter((e: any) => typeof e.gate_escalation === "string" && e.gate_escalation.trim().length > 0);
  const escalationSignal = (highPerf.length >= 3 && withEscalation.length >= 2)
    ? `\n\nGATE UPGRADE SIGNAL (from library): ${withEscalation.length} of ${highPerf.length} winner/scalable entries use UPGRADING xN gate sequences (e.g. x2 → x6 → x60). Examples from library: ${withEscalation.slice(0, 3).map((e: any) => `"${e.title || e.creative_id}" → ${e.gate_escalation}`).join("; ")}. When proposing concepts, consider xN gate upgrade as a HIGH-VALUE MECHANIC for 1-2 of the concepts. Mark those as is_experimental: false (gate upgrade is proven). In visual_identity.gate_values, list the full upgrade sequence (["x2","x6","x60"]). In lane_design, describe how the upgrading gates are spatially arranged. In tension_moments, anchor the peak to the final xN gate pass where the mob count explodes. Use the term "gate upgrade" (not "escalation") in concept narrative text.`
    : "";

  const refBlock = iterateFrom ? `\nITERATE FROM: "${iterateFrom}" — creative starting point.\n` : "";
  const visualRefBlock = refNote ? `\nVISUAL REF: ${refNote}. Inspiration only — DNA is primary.\n` : "";
  const _escSignal = escalationSignal; // Deploy H: appended to prompt body below

  const competitorBlock = competitorContext ? `\nCOMPETITOR INSPIRATION — the user uploaded a competitor ad and wants you to lift specific elements:\n- Source: ${competitorContext.title || "competitor ad"}\n- Core fantasy: ${competitorContext.core_fantasy || "unspecified"}\n- High-level MOC mapping: ${competitorContext.moc_inspiration || "unspecified"}\n- Transferable elements: ${(competitorContext.transferable_elements || []).map((e, i) => `\n  ${i+1}. ${e}`).join("")}\n${competitorContext.lift_intent ? `- USER LIFT INTENT (PRIMARY SIGNAL — lift THIS specifically): ${competitorContext.lift_intent}\n` : ""}\nAPPLICATION RULES:\n1. Apply competitor inspiration to 1-2 concepts only. Remaining concepts stay pure MOC-native.\n2. For each competitor-inspired concept: is_experimental:true, experimental_note explains which element was lifted and how it translates to MOC mechanics.\n3. CRITICAL — lift intent must flow to render-visible fields, not just narrative text:\n   - If user lift intent mentions "lane" / "level design" / "layout" / "structure" → TRANSCRIBE the competitor s lane structure directly into concept.lane_design (describe the lane layout in concrete MOC terms: where +N gates sit, where xN gates sit, where upgrade obstacles sit, what creates the tension).\n   - If lift intent mentions "biome" / "environment" / "visuals" / "art" → set concept.visual_identity.environment to reflect competitor s biome (translated into a MOC-compatible biome name — e.g. competitor s "crystal cavern" → MOC "Cyber-City" or "Toxic").\n   - If lift intent mentions "gates" / "multipliers" / "numbers" / "escalation" → transcribe competitor s numerical progression into concept.visual_identity.gate_values array.\n   - If lift intent mentions "hook" / "opening" / "start" → mirror competitor s hook mechanic in concept.hook_description and hook_a_description.\n4. NEVER copy competitor VISUALS directly (no competitor art style, no competitor characters). Translate the MECHANIC only, in MOC vocabulary.\n` : "";
  return `MOC Lead Creative Producer. Ground concepts in proven spend data.

DNA LIBRARY (${lib.length} winners):
${JSON.stringify(lib, null, 2)}

BRIEF: ${ctx} | SEGMENT: ${seg}
AUDIENCE PROFILE:
${seg==="Whale"?"Whale: Age 45-59 (68%), male, USA. Completionist mindset — #1 motivation is unlocking all elements. Opens game to RELAX (46%). 217 avg active days. Almost-win hook = incompleteness anxiety (so close to unlocking), not competitive pressure.":"Dolphin: Age 35-44, male, USA. Mix of completionist + competitive. 170 avg active days. Responds to clear progression path and almost-win tension."}${refBlock}${visualRefBlock}${competitorBlock}

MOC MECHANICS TO UNDERSTAND BEFORE GENERATING:
MOC MECHANICS — READ CAREFULLY, THESE ARE EXACT RULES:
- CANNON EVOLUTION: Destroying a breakable obstacle on the road upgrades the cannon tier. Exact chain: Simple Cannon → Double Cannon → Triple Cannon → Tank. Obstacle appearance varies by biome: Forest/Foggy=blue wooden crate, Desert=sandstone block, Bunker=metal ammo box, Volcanic=obsidian rock, Snow=ice block, Cyber-City=tech console. Each upgrade container has a CANNON ICON drawn on its face. STOP AT TANK.
- +N GATES (Investment path): Multiply the NUMBER OF CANNONS firing. +3 means 3 more cannons added. This is the ONLY way cannon count grows. cannon_count_progression must only show +gate changes. Example: "1 → 3 (via +2 gate) → 8 (via +5 gate) → 14 (via +6 gate)"
- xN GATES (Danger zone): Multiply the NUMBER OF MOBS already flowing in the lane. x3 triples the mobs currently passing through. Cannon count is UNAFFECTED by xN gates. NEVER write "cannons multiply via x gate". xN gates are dangerous because enemy mobs also surge in.
- LANE ARCHITECTURE: Every MOC ad has 3 structural elements arranged spatially on the road so ALL are visible simultaneously from the top-down camera: (1) INVESTMENT PATH — +N gate panels that grow cannon count; (2) UPGRADE PATH — breakable obstacles (red block, barrel, crate, turret cluster) that trigger cannon tier upgrade when destroyed; (3) DANGER ZONE — xN gates + enemy mobs that multiply mob count with risk. DEFAULT spatial arrangement: +N gates on LEFT sub-lane, xN danger zone in CENTER main lane, upgrade obstacle on RIGHT. Lanes CAN swap — specify the exact arrangement in lane_design if different. The lane_design field must describe: (a) which element is on which side, (b) what obstacle or mechanic blocks access to each element, (c) what tension this creates for the player. This description will be used directly to generate scene renders.
- PHYSICAL MOVEMENT: The cannon does move forward along the road in some ads, but the structural lane elements (investment/upgrade/danger) must ALWAYS be described and shown. Movement does not remove structure.
- CAMERA FRAMING (pick one per concept — note the choice in production_script opening action):
  * FRAMING A (cannon-moves-forward): cannon drives forward UP the lane, world is static behind it. Rarer in ads but cinematic. Lean this way for AppLovin / Google / custom-side-cam / skeleton-knight hook concepts.
  * FRAMING B (world-scrolls-down): cannon fixed at bottom, slides LEFT/RIGHT horizontally to dodge/align. Enemies and lane content scroll DOWN toward cannon. More common in ads. Lean this way for Facebook / TikTok / default-cam concepts.
  * Structural lane elements (+N / upgrade / xN) described and rendered identically in both framings — only the camera behaviour differs.
- CHAMPIONS (SOFT RULE — producer context always wins):
  * CANONICAL MOC ROSTER: ${MOC_CANONICAL_CHAMPIONS.join(", ")}. Use for player_champion and enemy_champion in DATA-BACKED concepts (1-2) by default — these are the characters that actually exist in the game.
  * CONCEPTS 3-4 (is_experimental:true) MAY INVENT new champions. Invention is encouraged for experimental slots — describe the invented champion vividly in the concept.
  * Enemy Tower = the standard red/grey fortified tower with HP bar. Use "Enemy Tower" for the final enemy base unless a named boss is specified.
  * If the producer context names a non-canonical champion explicitly (e.g. "use skeleton as hook"), respect that — producer intent overrides the canonical default.
  * Mobs (small blob creatures like Caveman, Alien, Chicken, Bat) are a separate concept from champions — captured via player_mob_color / enemy_mob_color fields. Do not list mobs in champions_visible.
  * NEVER use removed/non-existent names: "Gold Golem", "Boss Golem", "Stone Guardian", "Iron Guardian".

NETWORK RULES: AppLovin=custom side cam+skeleton/knight hook+blue+3+ evolution steps. Facebook=default cam+almost-win 1-5HP+colour/biome swap. Google=almost-win+foggy forest/water.
HOOK CHARACTERS: The skeleton and knight are ENEMY boss hook characters that appear at 0s. The SKELETON is a large realistic human skeleton (bone-white, full ribcage, skull head) that physically blocks or kicks the cannon. The KNIGHT is a large armored enemy boss that challenges the cannon. They are NOT player avatars, NOT champions — they are the antagonist hook. Do not confuse them with player units.
PLAYER UNIT TERMINOLOGY — CRITICAL:
- CANNON = the wheeled vehicle at the bottom of the screen (Simple Cannon, Double Cannon, etc). This is the player's main unit. It moves up the lane. It does NOT pass through gates.
- MOBS = the small round blob creatures that flow ahead of and around the cannon. They are projectiles/followers. MOBS pass through gates. MOBS destroy containers (by swarming them). MOBS fight enemy mobs.
- NEVER say "player mobs pass through a +1 gate" — +1 gates change how many CANNONS are firing (cannon count), not mob count. The cannon count grows when mobs flow through +N gates.
- NEVER say "player mobs pass through a xN gate" — xN gates multiply the MOB count, not cannon count.
- CORRECT language: "Mob swarm passes through x4 gate, multiplying from 6 to 24 mobs" / "Swarm passes through +1 gate, adding 1 more firing cannon (now 2 cannons)"
- The "player_mob_color" field = the colour of the small blob mobs (e.g. blue). The cannon is always blue/grey.
BIOME SELECTION: If user specifies a biome in their prompt, use EXACTLY that biome for data-backed concepts. Do NOT substitute. Desert+Facebook = CZ65 ($7K/d top-1) + CT43 as primary DNA. Foggy Forest+Facebook = CB57+CR17. Water = CZ94+CV73. Biome directly determines network fit — match the user's stated target.
9-STEP CURVE (required for every concept — map each beat to a specific timestamp/mechanic):
Pressure(0-2s: threat visible) → Investment(2-6s: +N gates, cannon count grows) → Validate(6-8s: first upgrade, swarm power up) → Investment2(8-12s: more +N gates, mob multiply) → Payoff(12-15s: giant defeated or upgrade complete) → FalseSafety(15-18s: second threat appears) → Pressure++(18-22s: almost-fail, mobs depleted) → AlmostWin(22-24s: final push, last few mobs) → Fail(24-26s: BATTLE FAILED screen)
Each concept MUST fill the nine_step_curve JSON field with a 1-sentence description of what happens at that beat for that specific concept.
CHAMPION DIVERSITY (concept 4 wild card rule):
- Concepts 1-3 MAY use the same canonical champion across concepts (consistency is OK).
- Concept 4 MUST use a DIFFERENT canonical champion from concepts 1-3 (wild card slot — different boss creates differentiation in the brief).
- If concepts 1-3 all use Red Hulk, concept 4 must NOT use Red Hulk — pick another from the canonical roster.

${_escSignal}
${(() => {
  // Deploy K/L: inject cached market intelligence from competitor library.
  // Deploy L reframed synthesis output — axes (differentiation) + outsiders, not generic patterns.
  // Handles both new schema (differentiation_axes/genre_outsiders) and legacy schema (top_hook_patterns) gracefully.
  if (!marketIntel || typeof marketIntel !== "object") return "";
  const mi = marketIntel as any;
  const digest = mi.digest;
  if (!digest) return "";

  // New schema (Deploy L)
  const axes = (digest.differentiation_axes || []).slice(0, 4);
  const outsiders = (digest.genre_outsiders || []).slice(0, 3);
  const ugcPat = (digest.ugc_hook_patterns || []).slice(0, 3);

  // Legacy schema fallback (Deploy K) — if intel was synthesized before L prompt reframe
  const legacyHook = (digest.top_hook_patterns || []).slice(0, 3);
  const legacyFantasy = (digest.top_core_fantasies || []).slice(0, 2);
  const legacyMech = (digest.transferable_mechanics || []).slice(0, 3);
  const usingLegacy = axes.length === 0 && outsiders.length === 0 && (legacyHook.length > 0 || legacyFantasy.length > 0);

  if (axes.length === 0 && outsiders.length === 0 && ugcPat.length === 0 && !usingLegacy) return "";

  const dom = mi.dominance_warning ? `\n⚠ DOMINANCE WARNING: ${mi.dominance_warning}. Intelligence below may not generalize.` : "";
  const syncedAgo = mi.synced_at ? `(synthesized from ${mi.competitor_count} competitor ads across ${(mi.titles_covered || []).length} ad descriptions)` : "";

  let body = "";
  if (usingLegacy) {
    // Legacy format — keep existing injection form. Weaker signal but backward-compatible.
    const hookStr = legacyHook.map((p: any) => `- ${p.pattern_name}: ${p.description}`).join("\n");
    const fantasyStr = legacyFantasy.map((f: any) => `- ${f.fantasy}: ${f.description}`).join("\n");
    const mechStr = legacyMech.map((m: any) => `- ${m.mechanic}: ${m.description}`).join("\n");
    body = `TOP COMPETITOR PATTERNS (legacy — re-sync market intel for stronger differentiation signal):
${hookStr}
${fantasyStr}
${mechStr}`;
  } else {
    // New schema — differentiation-first framing
    const axisStr = axes.map((a: any, i: number) => `${i+1}. ${a.axis_name} [${a.confidence||"?"}]: ${a.description}
   HYPOTHESIS: ${a.differentiation_hypothesis}
   evidence: ${(a.example_entries||[]).join(", ")}`).join("\n\n");
    const outsiderStr = outsiders.length > 0
      ? `\n\nGENRE OUTSIDERS (competitors from non-lane non-battle genres — strongest learning source):
${outsiders.map((o: any) => `- ${o.entry_title} (${o.genre}): ${o.unique_element}
  MOC translation: ${o.moc_translation}`).join("\n")}`
      : "";
    const ugcStr = ugcPat.length > 0
      ? `\n\nUGC HOOK PATTERNS (inform hook_b_description):
${ugcPat.map((u: any) => `- ${u.archetype}: persona ${u.persona_profile}, setup ${u.shot_setup_commonalities}, opener ${u.opening_cue_pattern}`).join("\n")}`
      : "";
    body = `DIFFERENTIATION AXES (things competitors do that MOC currently does NOT):
${axisStr || "(none — competitor library is too homogeneous with MOC for differentiation signal)"}${outsiderStr}${ugcStr}`;
  }

  return `\n\nMARKET INTELLIGENCE ${syncedAgo}:${dom}

${body}

USE THIS INTELLIGENCE — CRITICAL:
You must allocate 1-2 of your 4 concepts to lift from a differentiation axis or genre outsider listed above.
For those concepts — THESE FIELDS ARE MANDATORY, NOT OPTIONAL:

  "intel_source": <must be EXACT copy of axis_name OR genre_outsider entry_title from intel block>
  "experimental_note": <must mention which axis/outsider was lifted>
  "is_experimental": true

CONCRETE EXAMPLE — a brief with 3 concepts:

  Concept 1 (lifts intel):
    "is_experimental": true,
    "experimental_note": "Lifts Multi-Boss & Sequential Challenges axis — tests whether twin-boss bridge improves retention",
    "intel_source": "Multi-Boss & Sequential Challenges"   ← EXACT axis_name

  Concept 2 (lifts outsider):
    "is_experimental": true,
    "experimental_note": "Lifts Gold & Goblins passive-opener mechanic",
    "intel_source": "Gold and Goblins"   ← EXACT entry_title from genre_outsiders

  Concept 3 (pure MOC, no intel):
    "is_experimental": false,
    "experimental_note": null,
    "intel_source": null   ← explicitly null, not missing

Do NOT copy competitor visuals — translate to MOC's lane/cannon/gate/boss vocabulary. Do NOT invent axes that weren't in the intel block above.`;
})()}

BIOME TIERS:
- Concepts 1-2: PROVEN biomes (Desert, Foggy Forest, Water, Bunker, Meadow), is_experimental:false.
- BIOME OVERRIDE (user intent rule): If the producer's brief context above EXPLICITLY names a non-proven biome by keyword (Snow, Volcanic, Cyber-City, Toxic, Mushroom, Steampunk, Volcano, Jungle, Underwater, or similar recognizable biome name), use that biome for CONCEPT 1 even though it's not on the PROVEN list. Concept 2 stays PROVEN for statistical safety. Concept 3 stays ADJACENT, concept 4 stays WILD. Only trigger the override on an explicit biome name — NOT on vague atmospheric words like "cold", "dark", "fun", "intense" (those don't commit the user to a specific biome).
- Concept 3: ADJACENT biome — creative twist on a proven biome (e.g. "Desert at Night", "Flooded Bunker", "Autumn Forest", "Foggy Forest in Rain", "Snow Meadow"), is_experimental:true with experimental_note explaining the twist.
- Concept 4: WILD CARD — pick ONE from this RANDOMIZED shortlist (changes every brief): ${shuffle(WILD_BIOMES).slice(0, 8).join(", ")}. is_experimental:true. Do NOT default to "Clockwork Factory" — rotate.
- Each concept MUST use a different biome — never repeat across the 4.

HOOK TYPE DIVERSITY: The 4 concepts in this brief MUST pick 4 DIFFERENT hook_type values (never repeat across concepts). Pick from this RANDOMIZED shortlist (order changes every brief — vary your selection over time): ${shuffle(HOOK_TYPES).join(", ")}.

THREE HOOK CONCEPTS — every concept must generate all three. Each becomes a rendered image using the lane scene as visual reference:
hook_a_description: GAMEPLAY BOSS HOOK — cinematic, thumb-stopping, boss-forward. Describe: which enemy boss (pick from canonical roster for concepts 1-2; concepts 3-4 MAY invent), what threat they pose at first frame, how the player cannon appears dwarfed/threatened, exact composition (boss fills 60-70% of frame, cannon tiny at bottom with 4-6 player mobs in front of it streaming forward). Enemy mobs OK in this hook (unlike scene render) — they reinforce the threat alongside the boss. Must feel HIGH STAKES. Be specific enough to generate a great image. Different boss/scenario from other concepts.
hook_b_description: UGC HOOK (TikTok-native photo-realistic shot of a real person, NOT MOC art style). Two RANDOMIZED shortlists per generation — assign one archetype + one persona to each concept, all 4 different:
UGC ARCHETYPES (shuffle, assign first 4 — one per concept, all different):
${shuffle(UGC_ARCHETYPES).slice(0, 4).map((a, i) => `  ${i+1}. ${a}`).join("\n")}
UGC PERSONAS (shuffle, assign first 4 — one per concept, all different):
${shuffle(UGC_PERSONAS).slice(0, 4).map((p, i) => `  ${i+1}. ${p}`).join("\n")}
Describe the hook_b_description as a CONCRETE UGC SHOT: specify persona (age/setting/lighting/body-language from the assigned persona), archetype framing (POV/stopwatch/rage/etc from the assigned archetype). The UGC shot is about the PERSON — the MOC game itself is NOT rendered (phone may appear but screen content is not described). The hook should still feel RELEVANT to the concept's gameplay (e.g. stopwatch archetype + time-pressure concept). Never reuse archetype or persona across concepts in the same brief.
CRITICAL — DO NOT include any caption or text overlay in hook_b_description. The visual description is for the IMAGE renderer; captions go in a SEPARATE field hook_b_caption (one short TikTok-style line, 5-10 words, lowercase or sentence-case, no quotation marks). The renderer never sees hook_b_caption — this prevents Gemini from rendering the caption AND the producer adding it again, causing duplication.
hook_c_description: STOPWATCH / VIRAL / COMPETITOR-INFORMED HOOK — urgency-driven stylized tension hook, 9:16 MOC cartoon 3D art style.
${competitorContext ? `COMPETITOR SOURCING (ACTIVE — use this as primary inspiration for hook_c): This concept has access to competitor intelligence above. When writing hook_c_description for this concept, lift the competitor hook mechanic and translate it into MOC visual vocabulary. Specifically: (a) if competitor uses a stopwatch/timer/countdown mechanic → show MOC cannon with a visible countdown overlay or ticking visual tension; (b) if competitor uses a number-escalation mechanic → show MOC gate values exploding upward (1 → 10 → 100 → 1000); (c) if competitor uses a dramatic reveal → show an MOC equivalent reveal (tiny mobs facing massive boss, or a sudden gate multiplier); (d) otherwise translate the CORE FANTASY into an MOC visual. Reference the specific lifted mechanic in this concept's experimental_note. This applies only to the competitor-inspired concept(s) — other concepts use the fallback below.` : ""}
Default (no competitor active, or for non-competitor-inspired concepts): Based on the highest-tension moment in THIS concept's 9-step curve (typically AlmostWin or Pressure++) — describe a stylized visual that screams "I need to see what happens next." Common patterns: tiny mob count facing massive boss, massive swarm about to crush a giant, cannon on 1HP with huge enemy closing. Must be visually distinct from hook_a (different composition, different tension type).

Return ONLY valid JSON — be concise, no padding or elaboration:
{"analysis":{"patterns_used":string,"dna_sources":[string],"strategy":string},"concepts":[{"title":string,"dna_source":string,"is_data_backed":boolean,"is_experimental":boolean,"experimental_note":string|null,"intel_source":string|null,"objective":string,"visual_identity":{"environment":string,"lighting":string,"player_champion":string,"enemy_champion":string,"player_mob_color":string,"enemy_mob_color":string,"gate_values":[string],"cannon_type":string,"mood_notes":string},"hook_timing_seconds":number,"hook_description":string,"hook_a_description":string,"hook_b_description":string,"hook_c_description":string,"unit_evolution_chain":[string],"cannon_count_progression":string,"lane_design":string,"upgrade_triggers":[string],"tension_moments":[string],"network_adaptations":{"AppLovin":string,"Facebook":string,"Google":string},"engagement_hooks":string,"production_script":[{"time":string,"action":string,"visual_cue":string,"audio_cue":string}],"nine_step_curve":{"Pressure":string,"Investment":string,"Validate":string,"Investment2":string,"Payoff":string,"FalseSafety":string,"PressurePlus":string,"AlmostWin":string,"Fail":string},"hook_b_caption":string}]}`;
};

export const CANNON_VISUALS: Record<string, string> = {
  "Simple Cannon": "Simple Cannon: single blue barrel, round blue body, 4 black wheels — compact, small",
  "Double Cannon": "Double Cannon: two blue barrels side-by-side, slightly wider body than Simple Cannon, same wheel style",
  "Triple Cannon": "Triple Cannon: THREE blue barrels side-by-side on a wider body, brown/orange roller wheels — see reference image for exact appearance",
  "Tank": "Tank: blue military tank body with rotating turret/radar dish on top, wide tracked treads, yellow-green accent ring — see reference image",
  "Golden Jet": "Golden Jet: a GROUND CANNON with gold plating and jet engine aesthetic — still on wheeled base on the road. NOT used as cannon evolution in ads. NOT an airplane. Only shown as aspirational eye-catcher on a platform.",
};

export const imagePromptFn = (concept: Concept, scene: "hook"|"start"|"middle"|"end"|"scene"|"hook_a"|"hook_b"|"hook_c", continuityNote?: string) => {
  const vi = concept.visual_identity;
  const chain: string[] = concept.unit_evolution_chain || (concept as any).unit_evolution_chain || [];
  const hookDesc = concept.hook_description || "";
  const sceneKey = (scene as string);
  const laneDesign = concept.lane_design || "";
  const cannonCount = concept.cannon_count_progression || "";
  const tensionMoments = concept.tension_moments || [];
  const upgradeTriggers = concept.upgrade_triggers || [];
  // Summarise production_script for hook_a context (first 3 steps)
  const scriptSummary = Array.isArray(concept.production_script) && concept.production_script.length > 0
    ? concept.production_script.slice(0,3).map((s:ScriptStep) => `${s.time}: ${s.action}`).join(" | ")
    : "";

  const unitAtScene = {
    hook:   chain[0] || "Simple Cannon",
    start:  chain[0] || "Simple Cannon",
    middle: chain.length >= 2 ? chain[Math.floor(chain.length / 2)] : (chain[0] || "Simple Cannon"),
    end:    chain[chain.length - 1] || chain[0] || "Simple Cannon",
  }[scene];

  const cannonVisual = CANNON_VISUALS[unitAtScene] || `${unitAtScene}: a ground-mounted cannon on a wheeled base, NOT a vehicle`;

  const cannonCountAtScene = {
    hook: "1 cannon",
    start: "1 cannon",
    middle: cannonCount ? `cannon count: ${cannonCount.split("→")[1]?.trim() || "multiple cannons"}` : "3-4 cannons firing",
    end: cannonCount ? `final count: ${cannonCount.split("→").pop()?.trim() || "maximum cannons"}` : "maximum cannons",
  }[scene];

  const sceneDesc = {
    scene: laneDesign
      ? `OPENING SCENE — 3/4 top-down view of the full lane from above:
- Single ${unitAtScene} cannon at BOTTOM CENTER. ${CANNON_VISUALS[unitAtScene]||unitAtScene}. NOT a military tank, NOT a truck.
- ABSOLUTE NO ENEMY MOBS RULE (CRITICAL — read carefully): Render ZERO red enemy mobs anywhere on the road or in the lane. The reference frames provided to you DO show enemy mobs (because they were screenshots of older real ads) — IGNORE the enemy mobs in the references and render an EMPTY lane with no red mob figures. The boss/tower at the top is the ONLY threat in the frame. If you render even one red enemy mob in the lane, the output is wrong.
- PLAYER MOBS (sparse): 4-6 ${vi.player_mob_color} blob mobs in a small cone directly IN FRONT of the cannon. They appear as projectiles streaming upward from the cannon mouth. NEVER behind, NEVER beside the cannon. Keep them sparse — the level structure is the hero, not the mob count.
- LANE DESIGN (SOURCE OF TRUTH — respect this exactly; 1-lane, 2-lane, or asymmetric layouts are all valid — do NOT force 3 sub-lanes if lane_design says otherwise): ${laneDesign}
- Gate values to use: ${(vi.gate_values||[]).join(", ") || "+1 gates and x3 gates"}
- Enemy tower at very TOP of lane: visibly large and impending (not a distant speck), with a 100% red health bar above it. Keep the boss/tower as the dominant threat — looming, threatening, but not distracting from the lane mechanics below.
- ALLOWED gameplay UI in scene: HP bars on tower/boss, gate value numbers (+1, x3, x100), upgrade icons on containers — these are all acceptable gameplay elements.
- FORBIDDEN: marketing text overlays, CTAs ("Download now", "Can you survive?", "99% fail"), promotional captions, watermarks, app store badges, brand logos. The scene is a CLEAN gameplay frame; producer adds CTAs in post.
- Production script opening: ${Array.isArray(concept.production_script)&&concept.production_script[0] ? concept.production_script[0].visual_cue || concept.production_script[0].action : ""}
- Biome environment fills both sides of the road`
      : `OPENING SCENE — 3/4 top-down view of the full lane from above:
- Single ${unitAtScene} cannon at BOTTOM CENTER. Cannon looks EXACTLY like the reference images: small rounded barrel body on 4 small black wheels. Cartoon 3D. Blue/grey color. NOT a military tank, NOT a truck, NOT a realistic vehicle.
- ABSOLUTE NO ENEMY MOBS RULE (CRITICAL — read carefully): Render ZERO red enemy mobs anywhere on the road. Reference frames provided DO show enemy mobs in lanes — IGNORE them and render an EMPTY lane. The boss/tower at the top is the ONLY threat. Any rendered red enemy mob is a deploy failure.
- PLAYER MOBS (sparse): 4-6 ${vi.player_mob_color} blob mobs in a small cone directly IN FRONT of the cannon. NEVER behind, NEVER beside.
- DEFAULT LANE STRUCTURE (used when concept.lane_design is empty — loose default, not mandate): road shows distinct zones — +N gates on LEFT (2-4 panels with VARIETY in values, mixing ${(vi.gate_values||[]).filter(g=>g.startsWith("+")).join(", ")||"+1, +2"} rather than identical repetition), xN gate in CENTER (purple/pink), breakable upgrade containers on RIGHT (${upgradeTriggers.length > 0 ? upgradeTriggers[0] : `3-4 stacked containers, cannon icon on top, biome-matched material like ${{"Foggy Forest":"blue wooden crate","Desert":"sandstone block","Bunker":"metal ammo crate","Volcanic":"obsidian rock","Snow":"ice block","Cyber-City":"tech console","Meadow":"wooden box"}[vi.environment||"Foggy Forest"]||"blue wooden crate"}`}). Asymmetric layouts (1-lane, 2-lane) are valid if scene reads clearly.
- Enemy tower at very TOP: visibly large and impending, 100% red HP bar. Boss/tower is the dominant threat.
- ALLOWED gameplay UI: HP bars, gate numbers (+1, x3), upgrade icons on containers.
- FORBIDDEN: CTAs ("Download now", "Can you survive?"), promotional text, captions, watermarks, app badges, logos. Producer adds CTAs in post.
- Biome environment fills both sides of the road`,

    hook_a: `GAMEPLAY BOSS HOOK — 9:16 cinematic close-up, NOT top-down gameplay:
${concept.hook_a_description || "Enemy boss dominates the frame, threatening the player cannon"}
${scriptSummary ? `PRODUCTION SCRIPT CONTEXT (first moments of the ad): ${scriptSummary}` : ""}
COMPOSITION RULES:
- Enemy boss fills 60-70% of frame — looming, menacing, facing the viewer
- Player cannon visible at bottom: small, dwarfed, threatened — creates asymmetric tension
- Cinematic lighting: dramatic shadows, boss lit from below or side for menace
- NO TEXT OVERLAYS of any kind — no UI, no numbers, no speech bubbles. Pure visual only.
- GOAL: make a viewer's thumb stop scrolling in the first 0.5 seconds
CRITICAL ART STYLE — THIS IS A CASUAL MOBILE GAME:
- Use the EXACT same 3D cartoon art style as the reference images. Low-poly, bright saturated colours, simple rounded shapes.
- DO NOT create a realistic, photorealistic, or cinematic version of this champion. NO realistic skin textures, NO cinematic lighting rigs, NO hyper-detailed anatomy.
- The champion must look like it came from the same game as the cannon reference image — simple, cartoonish, friendly-threatening.
- If a champion reference image is provided above, match its appearance EXACTLY — same body shape, colours, proportions, style.
- If NO champion reference image is provided above (e.g. producer context named a non-canonical character or the ref is missing), DO NOT invent a specific creature design. Render a GENERIC MOC-style cartoon boss that visually matches the game's established art language: low-poly 3D, bright saturated colours, rounded cartoonish shapes, friendly-menacing proportions matching the cannon and gate reference style. Err on the side of visual consistency with the MOC aesthetic rather than creative invention — an off-brand creature breaks immersion worse than a generic canonical shape.`,

    hook_b: `UGC HOOK — native TikTok-style photo-realistic shot of a real person, 9:16 vertical:
${concept.hook_b_description || "Real person reacting to a mobile game moment"}
COMPOSITION RULES:
- PHOTO-REALISTIC phone-cam aesthetic — NOT cartoon, NOT low-poly, NOT MOC art style
- Vertical 9:16 frame, natural everyday home setting (couch, bedroom, kitchen, home office)
- Natural or practical lighting — window light, lamp, phone-screen glow on face
- Real human subject: age, appearance, setting, and body language EXACTLY as specified in the description above (persona is pre-assigned, do not swap it)
- Archetype framing (POV / stopwatch / rage / before-after / discovery / pro-tip) ALSO as specified in the description above
- The MOC game is NOT rendered. A phone may appear in frame but its screen content is out of focus, glare, or angled away from camera.
- Authentic TikTok/Reels amateur feel — slight imperfection is a feature (natural framing, candid pose)
- NO text, captions, numbers, timers, buttons, labels, logos, or UI overlays ANYWHERE in the frame — not on phone screens, not on watches, not on monitors, not on apps, not on notifications. Any screen visible in the frame MUST be: blank, powered OFF, covered by glare/reflection, angled away from camera, or shown at low enough contrast to be unreadable. Gemini hallucinates garbled text when asked to render readable UI — so simply don't render any readable surface.
- HAND QUALITY GUARD: avoid tight close-ups of fingers holding objects. If a phone is shown, hold it at arm's length or rest it on a surface — do NOT do extreme finger close-ups (Gemini renders finger count and detail unreliably at close range). Prefer medium shots where hands are in natural positions.
- GOAL: look and feel like organic user-generated content on TikTok — stop the scroll because it feels HUMAN, not because it looks marketed. Text-free + clean hands = no hallucination tell-tales.
CRITICAL — THIS HOOK DOES NOT USE MOC CARTOON STYLE:
- Do NOT reference the MOC lane scene for style, lighting, or colour palette. UGC is a completely separate visual register.
- Do NOT draw cannons, mobs, champions, or any MOC characters in the frame.
- Do NOT apply 3D cartoon rendering. Use photographic realism throughout.`,

    hook_c: `STOPWATCH/VIRAL HOOK — urgency and tension composition, 9:16:
${concept.hook_c_description || "Maximum tension moment — player nearly losing, giant nearly dead, critical decision"}
COMPOSITION RULES:
- Composition creates maximum "I NEED to see what happens" feeling
- Show the highest-stakes moment: near-fail OR near-win — either works for urgency
- Can show: tiny mob count facing massive boss, or massive swarm about to crush a giant
- Extreme contrast: overwhelming threat vs tiny hope, OR overwhelming force vs tiny enemy
- MOC cartoon 3D art style — same visual language as the lane scene reference
- Match biome colors and environment from the lane scene reference
- NO TEXT OVERLAYS — urgency from pure visual composition only
- GOAL: viewer MUST see what happens next. Maximum hook rate.
NOTE: This slot will be enhanced with competitor market analysis data once the market research feature launches.`,

    middle: `MID-BATTLE SCENE — 3/4 top-down view, peak tension:
- ${unitAtScene} cannon — SAME cartoon style as reference images. Small wheeled barrel. NOT a tank or vehicle. ${cannonCountAtScene}
- Large ${vi.player_mob_color} swarm fills 40-55% of lane
- LANE STRUCTURE still present on road (follow this lane design: ${laneDesign ? laneDesign.split(".")[0] : "default 3-lane"}):
  * LEFT: +N blue gate (cannon count grew from investment)
  * CENTER: purple xN gate (${(vi.gate_values||["x3"]).find((g:string) => g.startsWith("x")) || "x3"}) — red enemy mobs surging
  * RIGHT: ${upgradeTriggers[0] ? `"${upgradeTriggers[0]}" — partially destroyed, debris visible` : "upgrade container just destroyed — rubble on road"}
- ALMOST-FAIL: ${tensionMoments[0] || "mob stream thin and critical near enemy — near wipeout moment"}
- Enemy base: 50% health bar
- NO TEXT OVERLAYS`,

    end: `END / ALMOST-WIN SCENE — 3/4 top-down view:
- ${unitAtScene} cannon at bottom — same cartoon style, small wheeled barrel body. ${cannonCountAtScene}
- CRITICAL TENSION: Only 3-5 ${vi.player_mob_color} blobs remain near enemy base, tiny cluster
- All gates passed, road structure behind cannon
- Enemy base: health bar paper-thin sliver (1-3HP), cracks visible on structure
- ${tensionMoments[tensionMoments.length-1] || "army nearly wiped, boss on last HP — maximum tension"}
- NO TEXT OVERLAYS, NO speech bubbles, NO UI text`,
  }[scene];

  const biomeRules: Record<string, string> = {
    "Bunker": "ENVIRONMENT: Grey concrete walls both sides, industrial pipes ceiling, fluorescent strips, dark tunnel. NO lava, NO neon, NO sky, NO trees, NO sand.",
    "Desert": "ENVIRONMENT: Tan/beige sand dunes both sides, bright sunlight, blue sky, sparse brush. NO concrete, NO neon, NO fog, NO lava, NO snow.",
    "Foggy Forest": "ENVIRONMENT: Dense grey/white atmospheric fog, dark pine trees barely visible, grey asphalt road. This is FOG not snow. NO lava, NO neon, NO desert.",
    "Volcanic": "ENVIRONMENT: Red/orange lava rivers both sides, black cracked basalt rocks, strong orange glow from below. NO concrete, NO neon, NO trees, NO desert sand.",
    "Water": "ENVIRONMENT: Grey elevated bridge/path over clear blue water both sides. NO lava, NO neon, NO concrete walls, NO sand.",
    "Cyber-City": "ENVIRONMENT: Grey metal industrial path, orange and blue neon tech structures both sides. NO lava, NO sand, NO trees, NO desert.",
    "Meadow": "ENVIRONMENT: Rolling green hills both sides, scattered leafy trees, grey brick path, bright blue sky. NO lava, NO neon, NO concrete, NO desert.",
    "Snow": "ENVIRONMENT: White snow-covered ground, icy frozen structures, blue-white cold lighting. NO lava, NO neon, NO sand, NO desert.",
    "Toxic": "ENVIRONMENT: Purple crystalline ground paths, green glowing slime pools, luminescent toxic crystals. NO lava, NO concrete, NO desert.",
  };
  const biomeRule = scene !== "scene"
    ? `ENVIRONMENT: Match ${vi.environment} biome from the scene reference image above — same colors, atmosphere, trees/rocks, lighting.`
    : (biomeRules[vi.environment] || `ENVIRONMENT: ${vi.environment} setting.`);

  const cannonNote = scene !== "scene"
    ? `PLAYER CANNON: Match the cannon appearance from the lane scene reference above — small wheeled cannon, cartoonish 3D style. NOT a car, NOT a military vehicle.`
    : `PLAYER CANNON: The cannon MUST look like the reference images above — a small wheeled cannon on the road, cartoonish 3D. ${cannonVisual}. Positioned at bottom center. NOT a car, NOT a military vehicle, NOT a truck.`;

  const gateNote = scene === "scene"
    ? `GATES: ${(vi.gate_values||[]).join(", ")} — FLAT rectangular panels spanning the full road width. +N gates are BRIGHT BLUE with bold white text. xN gates are PURPLE/PINK with bold white text. Large multipliers (x100+) are YELLOW/GOLD. They have a frame border and slight 3D panel depth but are essentially flat signs. See gate reference images for exact appearance.`
    : "";

  const compositionRule = scene !== "scene"
    ? "COMPOSITION: NOT the standard top-down lane view. Cinematic framing that serves the hook type. NO HUD, NO score UI, NO text overlays of any kind."
    : "COMPOSITION: 3/4 cinematic top-down angle. Cannon at bottom center. Lane runs up center. NO HUD, NO score counter, NO hearts, NO text overlays, NO watermarks, NO speech bubbles.";

  const chainNote = chain.length > 0 && scene === "scene"
    ? `UNIT EVOLUTION CHAIN FOR THIS CREATIVE: ${chain.join(" → ")}. At THIS scene (${scene}), the cannon is: ${unitAtScene}. ${cannonVisual}. The cannon model MUST match this tier exactly — if it's Double Cannon, show 2 barrels. If Triple Cannon, show 3 barrels. If Tank, show tank with turret. Do NOT use a different cannon model.${scriptSummary ? `\nPRODUCTION SCRIPT — first moments: ${scriptSummary}` : ""}`
    : "";

  return [
    "Mob Control mobile game screenshot. MATCH the MOC reference images above EXACTLY in art style, 3D render quality, colour palette, and cartoon aesthetic.",
    chainNote,
    "", sceneDesc, "", biomeRule, "",
    cannonNote,
    scene === "scene" ? `ENEMY BOSS: ${vi.enemy_champion||"generic boss tower"} at top of lane.${vi.enemy_champion==="Yellow Normie"?" Yellow Normie is a LARGE HUMANOID figure with bright yellow skin, bald round cartoon head, chunky upright body, red HP bar above. NOT a blob or sphere — a standing yellow humanoid giant.":vi.enemy_champion==="White Giant"?" White Giant is a large pale humanoid with a round bald head, white skin, simple blocky body, standing upright.":""}` : "",
    scene === "scene" ? `PLAYER MOBS: ${vi.player_mob_color} small round blob creatures, cartoonish 3D style.` : "",
    scene === "scene" ? `ENEMY MOBS: ${vi.enemy_mob_color} round blob creatures near the top of the lane.` : "",
    gateNote,
    `LIGHTING: ${vi.lighting} | MOOD: ${vi.mood_notes}`,
    continuityNote ? `CONTINUITY: ${continuityNote}` : "",
    "", compositionRule,
    "ART STYLE: Exact 3D cartoon render matching the reference images — same colour saturation, same mob blob shape, same flat gate rectangle style. Match references precisely.",
  ].filter(Boolean).join("\n");
};

export const ENHANCE_UPLOAD_SYSTEM = `You are a Mob Control creative analyst helping structure upload notes for Gemini DNA analysis.

RULES — follow strictly:
- PRESERVE every fact, detail, and observation the user wrote. Do not change, remove, or contradict anything they said.
- ONLY add: MOC-specific terminology where appropriate (biome name, hook type label, gate type clarification), and structure for clarity.
- Do NOT invent new creative directions, mechanics, or details not mentioned by the user.
- Output: plain text, max 4 sentences, no bullet points.

Your job is to make the user's note more precise for Gemini — not to rewrite it.`;

export const ENHANCE_REFINE_SYSTEM = `You are a Mob Control creative producer refining a specific brief concept. RULES: PRESERVE exact intent. EXPAND vague requests into specific MOC field changes — e.g. "more tension" becomes a specific tension_moment addition. Name cannon tiers exactly: Simple Cannon / Double Cannon / Triple Cannon / Tank. Mention which scene (scene/hook_a/hook_b/hook_c) for visual changes. "Scene" is the top-down lane reference render. Output: plain text, max 4 sentences, no bullets. Make it specific and actionable.`;

export const ENHANCE_BRIEF_SYSTEM = `You are a Mob Control creative producer helping structure brief prompts for generation.

RULES — follow strictly:
- PRESERVE the user's exact creative intent, all specific details, unit names, mechanics, and preferences. Do not change or replace anything they said.
- ONLY add: the specific biome name if mentioned vaguely, target network if implied, MOC gate terminology (+N = cannon upgrade, xN = mob multiplier) if gates are mentioned.
- Do NOT invent new biomes, hooks, champions, mechanics, camera rules, or creative directions not mentioned by the user.
- Do NOT expand the scope, add cinematic language, or make it more elaborate than the user intended.
- Output: plain text, max 5 sentences, no bullet points.

Your job is to clarify and structure the user's idea — not to creatively reimagine it.`;
