// ─── Types ────────────────────────────────────────────────────────────────────
export interface EmotionalBeat { timestamp_seconds: number; event: string; emotion: string; }
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
  id: number;
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor" | "compound";
  upload_context: string; file_name: string; added_at: string;
  reanalyzed?: boolean; iteration_of?: string; strategic_notes?: string;
  parent_id?: string; creative_id?: string;
  creative_status?: "briefed" | "produced" | "running" | "scaling" | "fatigued";
  spend_tier?: string; spend_window_days?: number | null;
  spend_networks?: string[]; spend_notes?: string; spend_data_source?: string;
  title: string; hook_type: string; hook_timing_seconds: number | null;
  hook_description: string; gate_sequence: string[];
  swarm_peak_moment_seconds: number | null; loss_event_type: string;
  loss_event_timing_seconds: number | null; unit_evolution_chain: string[];
  emotional_arc: string; emotional_beats: EmotionalBeat[]; biome: string;
  biome_visual_notes: string; champions_visible: string[]; pacing: string;
  key_mechanic: string; why_it_works: string; why_it_fails: string | null;
  creative_gaps: string | null;
  creative_gaps_structured?: { hook_strength: string; mechanic_clarity: string; emotional_payoff: string; tension_arc?: string; rewatch_factor?: string; };
  frame_extraction_gaps: string | null; replication_instructions: string;
  auto_frames?: FrameExtraction[]; manual_frames?: string[];
  is_compound?: boolean; segments?: DNASegment[]; transition_type?: string;
  moc_inspiration?: string;
}
export interface FrameExtraction { timestamp_seconds: number; description: string; significance: string; image_data?: string; }
export interface UploadConfig {
  tier: "winner" | "scalable" | "failed" | "inspiration";
  ad_type: "moc" | "competitor" | "compound";
  context: string; manual_frames: File[];
  creative_id?: string; parent_id?: string;
}
export interface VisualIdentity { environment: string; lighting: string; player_champion: string; enemy_champion: string; player_mob_color: string; enemy_mob_color: string; gate_values: string[]; cannon_type: string; mood_notes: string; }
export interface ScriptStep { time: string; action: string; visual_cue: string; audio_cue: string; }
export interface PerformanceHook { type: string; text: string; }
export interface QualityScore { pattern_fidelity: number; moc_dna: number; emotional_arc: number; visual_clarity: number; segment_fit: number; overall: number; notes: string; }
export interface NetworkAdaptations { AppLovin?: string; Facebook?: string; Google?: string; TikTok?: string; }
export interface Concept {
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
  engagement_hooks: string; quality_score: QualityScore;
  network_adaptations?: NetworkAdaptations;
  visual_scene?: string; visual_start?: string; // visual_start kept for backward compat
  visual_hook_a?: string; visual_hook_b?: string; visual_hook_c?: string;
  hook_a_description?: string; hook_b_description?: string; hook_c_description?: string;
  visual_middle?: string; visual_end?: string; visual_hook?: string; // legacy — hidden in UI
}
export interface BriefAnalysis { patterns_used: string; segment_insight: string; strategy: string; dna_sources?: string[]; }
export type SortMode = "all" | "winner" | "scalable" | "inspiration" | "failed";
