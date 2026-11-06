// Shared Part 2 (Listening Difficulties) contracts — see design.md Section 4.2.

export const LISTENING_SCHEMA_VERSION = 1 as const;
export const TTS_PIPELINE_VERSION = 1 as const;

export type PhoneticCategory =
  | 'catenation' // 1. Catenation (consonant-vowel linking)
  | 'assimilation' // 2. Assimilation / yod-coalescence
  | 'elision' // 3. Elision & consonant-cluster simplification
  | 'weak_forms' // 4. Weak forms & perfect-modal reduction
  | 'h_dropping' // 5. H-dropping in pronouns
  | 'contractions' // 6. Colloquial contractions
  | 'confusion'; // 7. Phonemic & visual confusion / mishearing / subtitle traps

export type AccentCode = 'uk' | 'us' | 'au' | 'nz' | 'in';

export type PlaybackSpeedPreset = 'slow' | 'normal' | 'fast';

export const PLAYBACK_SPEED_RATES: Record<PlaybackSpeedPreset, number> = {
  slow: 0.78,
  normal: 1.0,
  fast: 1.22,
};

export type DifficultyPriority = 'high' | 'medium' | 'core';

export type AudioVerificationStatus =
  | 'verified'
  | 'instructed_unverified'
  | 'orthographic_approx'
  | 'failed_check';

export interface NewListeningDifficulty {
  schema_version?: number;
  category: PhoneticCategory;
  phrase: string;
  spoken_phrase: string;
  simulated_pronunciation: string;
  original_sentence: string;
  tts_sentence: string;
  cue_index: number | null;
  cue_start_time: string | null;
  cue_end_time: string | null;
  explanation_zh: string;
  explanation_en: string;
  difficulty_level: DifficultyPriority;
  is_subtitle_error: boolean;
  subtitle_error_note: string;
}

export interface ListeningDifficultyRecord extends NewListeningDifficulty {
  id: number;
  subtitle_id: number;
  schema_version: number;
  normalized_phrase: string;
  is_mastered: boolean;
  examples_count: number;
  created_at: string;
}

export interface NewListeningExample {
  sentence: string;
  tts_sentence: string;
  target_phrase_in_sentence: string;
  simulated_pronunciation: string;
  phonetic_note_zh: string;
  phonetic_note_en: string;
  lexile_level: 'A2' | 'B1';
  is_validated: boolean;
}

export interface ListeningExampleRecord extends NewListeningExample {
  id: number;
  difficulty_id: number;
  created_at: string;
}

export interface TTSCacheEntryRecord {
  cache_key: string;
  file_path: string;
  byte_size: number;
  text_hash: string;
  accent: AccentCode;
  provider: string;
  model: string;
  voice: string;
  speed_mode: 'normal' | 'slow_native' | 'fast_native';
  pipeline_version: number;
  is_approximate: boolean;
  verification_status: AudioVerificationStatus;
  verification_note: string;
  created_at: string;
  last_accessed_at: string;
}

export interface TTSCacheStats {
  entryCount: number;
  totalBytes: number;
  maxBytes: number;
  todaySynthesizedCount: number;
  dailyWarnLimit: number;
}
