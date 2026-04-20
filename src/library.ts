import type { DNAEntry, SortMode } from "./types";

export const SPEND_RANK: Record<string, number> = { "1M": 5, "500K": 4, "300K": 3, "100K": 2, "sub100K": 1 };


export function velocityPerDay(tier: string, days: number | null | undefined): string | null {
  if (!tier || !days || tier === "sub100K") return null;
  const amounts: Record<string, number> = { "100K": 100000, "300K": 300000, "500K": 500000, "1M": 1000000 };
  const v = amounts[tier]; if (!v) return null;
  return `~$${Math.round(v / days).toLocaleString()}/day`;
}

// Ensure all array fields on a raw DNA response are actually arrays — prevents "e is not iterable"
export function sanitizeDNA(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  const ARRAY_FIELDS = ["emotional_beats","gate_sequence","unit_evolution_chain","champions_visible","auto_frames","manual_frames","spend_networks","segments","production_script","performance_hooks","upgrade_triggers","tension_moments","frame_emotions","giant_kills"];
  const out = { ...raw };
  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(out[field])) out[field] = out[field] ? [out[field]] : [];
  }
  // Also sanitize array fields inside each segment
  if (Array.isArray(out.segments)) {
    out.segments = out.segments.map((seg: any) => {
      if (!seg || typeof seg !== "object") return seg;
      const s = { ...seg };
      for (const f of ["gate_sequence","unit_evolution_chain","champions_visible","emotional_beats"]) {
        if (!Array.isArray(s[f])) s[f] = s[f] ? [s[f]] : [];
      }
      return s;
    });
  }
  return out;
}

// ─── Dynamic lineage chain builder ───────────────────────────────────────────
export function buildLineageChain(entry: DNAEntry, lib: DNAEntry[]): string[] | null {
  try {
    const id = entry.creative_id?.trim();
    if (!id) return null;
    const visited = new Set<string>();
    const chain: string[] = [];
    let current: DNAEntry | undefined = entry;
    while (current) {
      const cid = current.creative_id?.trim();
      if (!cid || visited.has(cid)) break;
      visited.add(cid);
      chain.unshift(cid);
      const pid = current.parent_id?.trim();
      if (!pid) break;
      current = lib.find(e => { const ecid = e.creative_id?.trim(); return ecid && ecid !== "" && ecid === pid; });
    }
    const seen = new Set(chain);
    let tip = id; let found = true; let safety = 0;
    while (found && safety++ < 50) {
      found = false;
      const child = lib.find(e => { const epid = e.parent_id?.trim(); const ecid = e.creative_id?.trim(); return epid && epid !== "" && epid === tip && ecid && !seen.has(ecid); });
      if (child?.creative_id) { const cid = child.creative_id.trim(); seen.add(cid); chain.push(cid); tip = cid; found = true; }
    }
    return chain.length > 1 ? chain : null;
  } catch { return null; }
}

// ─── Parent ID validator ──────────────────────────────────────────────────────
export function parentValidation(parentId: string, currentId: string, lib: DNAEntry[]) {
  const pid = parentId.trim();
  if (!pid) return null;
  const found = lib.find(e => e.creative_id?.trim() === pid && e.creative_id?.trim() !== currentId.trim());
  if (found) return { color: "#3fb950", border: "#238636", bg: "#1a2a1a", msg: `✓ Found: ${found.creative_id}` };
  return { color: "#f0c53a", border: "#9e6a03", bg: "#2a1a0a", msg: `⚠ Not found in library` };
}

// ─── Sorted library helper ────────────────────────────────────────────────────
export function sortLib(lib: DNAEntry[], mode: SortMode): DNAEntry[] {
  const filtered = mode === "all" ? lib : lib.filter(d => d.tier === mode);
  const active = filtered.filter(d => d.creative_status !== "fatigued");
  const fatigued = filtered.filter(d => d.creative_status === "fatigued");
  const now = Date.now();
  const bySpendThenNewest = (a: DNAEntry, b: DNAEntry) => {
    const aNew = !a.spend_tier && (now - new Date(a.added_at).getTime()) < 48 * 60 * 60 * 1000;
    const bNew = !b.spend_tier && (now - new Date(b.added_at).getTime()) < 48 * 60 * 60 * 1000;
    // Untagged entries added in last 48h float to top
    if (aNew && !bNew) return -1;
    if (bNew && !aNew) return 1;
    const spendDiff = (SPEND_RANK[b.spend_tier??""]??0) - (SPEND_RANK[a.spend_tier??""]??0);
    if (spendDiff !== 0) return spendDiff;
    return new Date(b.added_at).getTime() - new Date(a.added_at).getTime();
  };
  return [...active.sort(bySpendThenNewest), ...fatigued.sort(bySpendThenNewest)];
}

