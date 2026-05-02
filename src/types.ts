// ─── Types ────────────────────────────────────────────────────────────────────
export interface EmotionalBeat { timestamp_seconds: number; event: string; emotion: string; }
export interface GiantKill { timestamp_seconds: number; giant_name: string; note: string; }
export interface DNASegment {
  segment_index: number; biome: string; biome_visual_notes: string;
  start_seconds: number; end_seconds: number; hook_type: string;
  hook_timing_seconds: number; hook_description: string; gate_sequence: string[];
  swarm_peak_moment_seconds: number | null; loss_event_type: string;
  loss_event_timing_seconds: number | null; unit_evolution_chain: string[];
  champions_visible: string[]; key_mechanic: string; emotional_beats: EmotionalBeat[];
  why_it_works: string; why_it_fails: string | null;
}
export interface DNAEntry {
  /** Deploy H: detected escalating xN gate sequence within a single video (e.g. "x2 → x6 → x60 (13s span)"). null when no escalation detected. */
  gate_escalation?: string | null;
  id: number;
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor" | "compound";
  upload_context: string; file_name: string; added_at: string;
  reanalyzed?: boolean; iteration_of?: string; strategic_notes?: string;
  parent_id?: string; creative_id?: string;
  creative_status?: "briefed" | "produced" | "running" | "scaling" | "fatigued";
  spend_tier?: string; spend_window_days?: number | null;
  spend_networks?: string[]; spend_notes?: string; spend_data_source?: string;
  /** Deploy N: game/app title of the source (e.g. "Last War", "Gold & Goblins"). Separate from ad-description title. User-entered on upload OR Gemini-extracted from branding. Used by market intel synthesis to group by source game. */
  game_title?: string;
  title: string; hook_type: string; hook_timing_seconds: number | null;
  hook_description: string; gate_sequence: string[];
  swarm_peak_moment_seconds: number | null; loss_event_type: string;
  loss_event_timing_seconds: number | null; unit_evolution_chain: string[];
  giant_kills?: GiantKill[];
  emotional_arc: string; emotional_beats: EmotionalBeat[]; biome: string;
  biome_visual_notes: string; champions_visible: string[];
  /** Deploy BB: champions Gemini saw as candidates but did NOT verify with ≥2 frames + distinctive feature. Surface for producer review, do NOT treat as confirmed presence. */
  champions_unverified?: string[];
  pacing: string;
  key_mechanic: string; why_it_works: string; why_it_fails: string | null;
  creative_gaps: string | null;
  creative_gaps_structured?: { hook_strength: string; mechanic_clarity: string; emotional_payoff: string; tension_arc?: string; rewatch_factor?: string; };
  frame_extraction_gaps: string | null; replication_instructions: string;
  auto_frames?: FrameExtraction[]; manual_frames?: string[];
  cloud_thumbnail?: string; // Deploy E: 150px @ q65 base64 JPEG, synced to cloud for cross-browser thumbnail visibility
  is_compound?: boolean; segments?: DNASegment[]; transition_type?: string;
  moc_inspiration?: string;
  core_fantasy?: string;
  transferable_elements?: string[];
  levelly_brief_title?: string;
}
export interface FrameExtraction { timestamp_seconds: number; description: string; significance: string; image_data?: string; }
export interface UploadConfig {
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor" | "compound";
  context: string; manual_frames: File[];
  creative_id?: string; parent_id?: string;
  levelly_brief_title?: string;
}
export interface VisualIdentity { environment: string; lighting: string; player_champion: string; enemy_champion: string; player_mob_color: string; enemy_mob_color: string; gate_values: string[]; cannon_type: string; mood_notes: string; }
export interface ScriptStep { time: string; action: string; visual_cue: string; audio_cue: string; }
export interface PerformanceHook { type: string; text: string; }
export interface QualityScore { pattern_fidelity: number; moc_dna: number; emotional_arc: number; visual_clarity: number; segment_fit: number; overall: number; notes: string; }
export interface NetworkAdaptations { AppLovin?: string; Facebook?: string; Google?: string; TikTok?: string; }
export interface Concept {
  /** Deploy M: when concept lifts from competitor market intelligence, this names the axis or outsider source (e.g. "Passive vs Active Opener" or "Gold & Goblins"). Empty/undefined when concept is MOC-DNA-only. */
  intel_source?: string;
  title: string; is_data_backed: boolean; is_experimental?: boolean; experimental_note?: string;
  objective: string; target_segment: string; player_motivation: string;
  hook_description?: string;
  unit_evolution_chain?: string[];
  cannon_count_progression?: string;
  lane_design?: string;
  upgrade_triggers?: string[];
  tension_moments?: string[];
  visual_identity: VisualIdentity; layout: string;
  production_script: ScriptStep[]; performance_hooks: PerformanceHook[];
  engagement_hooks: string;
  quality_score?: QualityScore; // Deploy A: optional — no longer generated, kept for graceful handling of legacy in-session briefs
  network_adaptations?: NetworkAdaptations;
  visual_scene?: string; visual_start?: string; // visual_start kept for backward compat
  visual_hook_a?: string; visual_hook_b?: string; visual_hook_c?: string;
  hook_a_description?: string; hook_b_description?: string; hook_c_description?: string;
  visual_middle?: string; visual_end?: string; visual_hook?: string; // legacy — hidden in UI
  /** Deploy BB: outsider concepts (concept 4 with [OUTSIDER:...] tag) self-report whether they're shippable with existing MOC assets + max 1 new modification. "fail" → regenerate. null/undefined for non-outsider concepts. */
  producibility_check?: "pass" | "fail" | null;
}
export interface BriefAnalysis { patterns_used: string; segment_insight: string; strategy: string; dna_sources?: string[]; }
export type SortMode = "all" | "winner" | "scalable" | "inspiration" | "failed";
