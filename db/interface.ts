import type {
  AudioVerificationStatus,
  ListeningDifficultyRecord,
  ListeningExampleRecord,
  NewListeningDifficulty,
  NewListeningExample,
  PhoneticCategory,
  TTSCacheEntryRecord,
} from '../src/types/listening.js';

export interface Subtitle {
  id: number;
  filename: string;
  content: string;
  created_at: string;
}

export interface NewExtractedItem {
  type: string;
  term: string;
  meaning_en: string;
  meaning_zh: string;
  phonetic: string;
  part_of_speech: string;
  usage_scenarios_en: string;
  usage_scenarios_zh: string;
  examples_en: string;
  examples_zh: string;
  synonyms: string;
  frequency: string;
  level: string;
}

export interface ExtractedItem extends NewExtractedItem {
  id: number;
  subtitle_id: number;
}

export interface IDatabase {
  getSubtitles(): Subtitle[];
  getSubtitleById(id: number): Subtitle | undefined;
  insertSubtitle(filename: string, content: string): number;
  deleteSubtitle(id: number): void;
  getItemsBySubtitleId(subtitleId: number, levels?: string[]): ExtractedItem[];
  bulkInsertItems(subtitleId: number, items: NewExtractedItem[]): void;

  // --- Part 2 Listening Difficulties ---
  getSchemaVersion(): number;
  getListeningDifficultiesBySubtitleId(
    subtitleId: number,
    filters?: { category?: PhoneticCategory; includeMastered?: boolean }
  ): ListeningDifficultyRecord[];
  getListeningDifficultyById(id: number): ListeningDifficultyRecord | undefined;
  replaceListeningDifficulties(
    subtitleId: number,
    items: NewListeningDifficulty[]
  ): ListeningDifficultyRecord[];
  updateListeningDifficultyMastery(id: number, isMastered: boolean): boolean;

  // --- Example Sentences ---
  getListeningExamplesByDifficultyId(difficultyId: number): ListeningExampleRecord[];
  replaceListeningExamples(
    difficultyId: number,
    examples: NewListeningExample[]
  ): ListeningExampleRecord[];

  // --- TTS Cache & Usage ---
  getTTSCacheEntry(cacheKey: string): TTSCacheEntryRecord | undefined;
  upsertTTSCacheEntry(entry: Omit<TTSCacheEntryRecord, 'created_at' | 'last_accessed_at'>): void;
  touchTTSCacheEntry(cacheKey: string): void;
  updateTTSCacheVerification(cacheKey: string, status: AudioVerificationStatus, note: string): void;
  listLeastRecentlyUsedTTSCacheEntries(limit: number): TTSCacheEntryRecord[];
  deleteTTSCacheEntries(cacheKeys: string[]): void;
  clearAllTTSCacheEntries(): TTSCacheEntryRecord[];
  getTTSCacheTotalBytes(): { entryCount: number; totalBytes: number };
  incrementDailyTTSUsage(
    dateUtc: string,
    byteSize: number
  ): { synthesizedCount: number; synthesizedBytes: number };
  getDailyTTSUsage(dateUtc: string): { synthesizedCount: number; synthesizedBytes: number };
}
