import Database from 'better-sqlite3';
import { IDatabase, Subtitle, ExtractedItem, NewExtractedItem } from './interface.js';
import {
  LISTENING_SCHEMA_VERSION,
  type AudioVerificationStatus,
  type ListeningDifficultyRecord,
  type ListeningExampleRecord,
  type NewListeningDifficulty,
  type NewListeningExample,
  type PhoneticCategory,
  type TTSCacheEntryRecord,
} from '../src/types/listening.js';

/** Raw row shapes: SQLite stores booleans as 0/1 integers. */
type DifficultyRow = Omit<ListeningDifficultyRecord, 'is_subtitle_error' | 'is_mastered'> & {
  is_subtitle_error: number;
  is_mastered: number;
};
type ExampleRow = Omit<ListeningExampleRecord, 'is_validated'> & { is_validated: number };
type CacheRow = Omit<TTSCacheEntryRecord, 'is_approximate'> & { is_approximate: number };

const CURRENT_SCHEMA_VERSION = 1;

const DIFFICULTY_SELECT = `
  SELECT d.*, (SELECT COUNT(*) FROM listening_examples e WHERE e.difficulty_id = d.id) AS examples_count
  FROM listening_difficulties d`;

/** Dedup key per design 4.1: lowercase, trimmed. */
function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase();
}

/**
 * Millisecond-precision UTC timestamp in SQLite DATETIME format ('YYYY-MM-DD HH:MM:SS.sss').
 * Generated in JS (not CURRENT_TIMESTAMP) so LRU ordering has sub-second resolution and is
 * controllable in tests.
 */
function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function toDifficulty(row: DifficultyRow): ListeningDifficultyRecord {
  return { ...row, is_subtitle_error: row.is_subtitle_error === 1, is_mastered: row.is_mastered === 1 };
}

function toExample(row: ExampleRow): ListeningExampleRecord {
  return { ...row, is_validated: row.is_validated === 1 };
}

function toCacheEntry(row: CacheRow): TTSCacheEntryRecord {
  return { ...row, is_approximate: row.is_approximate === 1 };
}

export class SQLiteDatabase implements IDatabase {
  private db: Database.Database;

  constructor(dbPath: string = 'lingocinema.db') {
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.init();
    this.runMigrations();
  }

  /** Closes the underlying connection (used by tests that reopen file databases). */
  close(): void {
    this.db.close();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subtitles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS extracted_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subtitle_id INTEGER,
        type TEXT,
        term TEXT,
        meaning_en TEXT,
        meaning_zh TEXT,
        phonetic TEXT,
        part_of_speech TEXT,
        usage_scenarios_en TEXT,
        usage_scenarios_zh TEXT,
        examples_en TEXT,
        examples_zh TEXT,
        synonyms TEXT,
        frequency TEXT,
        level TEXT,
        FOREIGN KEY (subtitle_id) REFERENCES subtitles(id)
      );
    `);
  }

  private runMigrations(): void {
    if (this.getSchemaVersion() < 1) {
      this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS listening_difficulties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subtitle_id INTEGER NOT NULL,
            schema_version INTEGER NOT NULL DEFAULT 1,
            category TEXT NOT NULL,
            phrase TEXT NOT NULL,
            normalized_phrase TEXT NOT NULL,
            spoken_phrase TEXT NOT NULL,
            simulated_pronunciation TEXT NOT NULL,
            original_sentence TEXT NOT NULL,
            tts_sentence TEXT NOT NULL,
            cue_index INTEGER,
            cue_start_time TEXT,
            cue_end_time TEXT,
            explanation_zh TEXT NOT NULL,
            explanation_en TEXT NOT NULL,
            difficulty_level TEXT NOT NULL DEFAULT 'medium',
            is_subtitle_error INTEGER NOT NULL DEFAULT 0,
            subtitle_error_note TEXT NOT NULL DEFAULT '',
            is_mastered INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subtitle_id) REFERENCES subtitles (id) ON DELETE CASCADE,
            UNIQUE (subtitle_id, normalized_phrase, category)
          );

          CREATE INDEX IF NOT EXISTS idx_listening_diff_subtitle
            ON listening_difficulties (subtitle_id, category);

          CREATE TABLE IF NOT EXISTS listening_examples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            difficulty_id INTEGER NOT NULL,
            sentence TEXT NOT NULL,
            tts_sentence TEXT NOT NULL,
            target_phrase_in_sentence TEXT NOT NULL,
            simulated_pronunciation TEXT NOT NULL,
            phonetic_note_zh TEXT NOT NULL,
            phonetic_note_en TEXT NOT NULL,
            lexile_level TEXT NOT NULL DEFAULT 'B1',
            is_validated INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (difficulty_id) REFERENCES listening_difficulties (id) ON DELETE CASCADE
          );

          CREATE INDEX IF NOT EXISTS idx_listening_examples_diff
            ON listening_examples (difficulty_id);

          CREATE TABLE IF NOT EXISTS tts_cache_entries (
            cache_key TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            text_hash TEXT NOT NULL,
            accent TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            voice TEXT NOT NULL,
            speed_mode TEXT NOT NULL DEFAULT 'normal',
            pipeline_version INTEGER NOT NULL DEFAULT 1,
            is_approximate INTEGER NOT NULL DEFAULT 0,
            verification_status TEXT NOT NULL DEFAULT 'instructed_unverified',
            verification_note TEXT NOT NULL DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_tts_cache_lru
            ON tts_cache_entries (last_accessed_at ASC);

          CREATE TABLE IF NOT EXISTS tts_daily_usage (
            usage_date TEXT PRIMARY KEY,
            synthesized_count INTEGER NOT NULL DEFAULT 0,
            synthesized_bytes INTEGER NOT NULL DEFAULT 0
          );
        `);
        // PRAGMA cannot take bound parameters; value is a compile-time constant.
        this.db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
      })();
    }
  }

  getSchemaVersion(): number {
    return this.db.pragma('user_version', { simple: true }) as number;
  }

  getSubtitles(): Subtitle[] {
    return this.db.prepare('SELECT * FROM subtitles ORDER BY created_at DESC').all() as Subtitle[];
  }

  getSubtitleById(id: number): Subtitle | undefined {
    return this.db.prepare('SELECT * FROM subtitles WHERE id = ?').get(id) as Subtitle | undefined;
  }

  insertSubtitle(filename: string, content: string): number {
    const info = this.db.prepare('INSERT INTO subtitles (filename, content) VALUES (?, ?)').run(filename, content);
    return info.lastInsertRowid as number;
  }

  deleteSubtitle(id: number): void {
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          'DELETE FROM listening_examples WHERE difficulty_id IN (SELECT id FROM listening_difficulties WHERE subtitle_id = ?)'
        )
        .run(id);
      this.db.prepare('DELETE FROM listening_difficulties WHERE subtitle_id = ?').run(id);
      this.db.prepare('DELETE FROM extracted_items WHERE subtitle_id = ?').run(id);
      this.db.prepare('DELETE FROM subtitles WHERE id = ?').run(id);
    });
    transaction();
  }

  getItemsBySubtitleId(subtitleId: number, levels?: string[]): ExtractedItem[] {
    let query = 'SELECT * FROM extracted_items WHERE subtitle_id = ?';
    const params: (number | string)[] = [subtitleId];

    if (levels && levels.length > 0) {
      const placeholders = levels.map(() => '?').join(',');
      query += ` AND level IN (${placeholders})`;
      params.push(...levels);
    }

    query += ' ORDER BY id ASC';

    return this.db.prepare(query).all(...params) as ExtractedItem[];
  }

  bulkInsertItems(subtitleId: number, items: NewExtractedItem[]): void {
    const insert = this.db.prepare(`
      INSERT INTO extracted_items (
        subtitle_id, type, term, meaning_en, meaning_zh, phonetic, 
        part_of_speech, usage_scenarios_en, usage_scenarios_zh, 
        examples_en, examples_zh, synonyms, frequency, level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((items: NewExtractedItem[]) => {
      for (const item of items) {
        insert.run(
          subtitleId,
          item.type,
          item.term,
          item.meaning_en,
          item.meaning_zh,
          item.phonetic || '',
          item.part_of_speech || '',
          item.usage_scenarios_en || '',
          item.usage_scenarios_zh || '',
          item.examples_en || '',
          item.examples_zh || '',
          item.synonyms || '',
          item.frequency || '',
          item.level || 'B1'
        );
      }
    });

    transaction(items);
  }

  // --- Part 2 Listening Difficulties ---

  getListeningDifficultiesBySubtitleId(
    subtitleId: number,
    filters?: { category?: PhoneticCategory; includeMastered?: boolean }
  ): ListeningDifficultyRecord[] {
    let query = `${DIFFICULTY_SELECT} WHERE d.subtitle_id = ?`;
    const params: (number | string)[] = [subtitleId];
    if (filters?.category) {
      query += ' AND d.category = ?';
      params.push(filters.category);
    }
    if (filters?.includeMastered === false) {
      query += ' AND d.is_mastered = 0';
    }
    query += ' ORDER BY d.id ASC';
    return (this.db.prepare(query).all(...params) as DifficultyRow[]).map(toDifficulty);
  }

  getListeningDifficultyById(id: number): ListeningDifficultyRecord | undefined {
    const row = this.db.prepare(`${DIFFICULTY_SELECT} WHERE d.id = ?`).get(id) as
      | DifficultyRow
      | undefined;
    return row ? toDifficulty(row) : undefined;
  }

  replaceListeningDifficulties(
    subtitleId: number,
    items: NewListeningDifficulty[]
  ): ListeningDifficultyRecord[] {
    const insert = this.db.prepare(`
      INSERT INTO listening_difficulties (
        subtitle_id, schema_version, category, phrase, normalized_phrase, spoken_phrase,
        simulated_pronunciation, original_sentence, tts_sentence, cue_index, cue_start_time,
        cue_end_time, explanation_zh, explanation_en, difficulty_level, is_subtitle_error,
        subtitle_error_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      this.db
        .prepare(
          'DELETE FROM listening_examples WHERE difficulty_id IN (SELECT id FROM listening_difficulties WHERE subtitle_id = ?)'
        )
        .run(subtitleId);
      this.db.prepare('DELETE FROM listening_difficulties WHERE subtitle_id = ?').run(subtitleId);

      const seen = new Set<string>();
      for (const item of items) {
        const normalized = normalizePhrase(item.phrase);
        const key = `${item.category}\u0000${normalized}`;
        if (seen.has(key)) continue; // first occurrence wins
        seen.add(key);
        insert.run(
          subtitleId,
          item.schema_version ?? LISTENING_SCHEMA_VERSION,
          item.category,
          item.phrase,
          normalized,
          item.spoken_phrase,
          item.simulated_pronunciation,
          item.original_sentence,
          item.tts_sentence,
          item.cue_index,
          item.cue_start_time,
          item.cue_end_time,
          item.explanation_zh,
          item.explanation_en,
          item.difficulty_level,
          item.is_subtitle_error ? 1 : 0,
          item.subtitle_error_note
        );
      }
    })();

    return this.getListeningDifficultiesBySubtitleId(subtitleId);
  }

  updateListeningDifficultyMastery(id: number, isMastered: boolean): boolean {
    const info = this.db
      .prepare('UPDATE listening_difficulties SET is_mastered = ? WHERE id = ?')
      .run(isMastered ? 1 : 0, id);
    return info.changes > 0;
  }

  // --- Example Sentences ---

  getListeningExamplesByDifficultyId(difficultyId: number): ListeningExampleRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM listening_examples WHERE difficulty_id = ? ORDER BY id ASC')
      .all(difficultyId) as ExampleRow[];
    return rows.map(toExample);
  }

  replaceListeningExamples(
    difficultyId: number,
    examples: NewListeningExample[]
  ): ListeningExampleRecord[] {
    const insert = this.db.prepare(`
      INSERT INTO listening_examples (
        difficulty_id, sentence, tts_sentence, target_phrase_in_sentence, simulated_pronunciation,
        phonetic_note_zh, phonetic_note_en, lexile_level, is_validated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM listening_examples WHERE difficulty_id = ?').run(difficultyId);
      for (const ex of examples) {
        insert.run(
          difficultyId,
          ex.sentence,
          ex.tts_sentence,
          ex.target_phrase_in_sentence,
          ex.simulated_pronunciation,
          ex.phonetic_note_zh,
          ex.phonetic_note_en,
          ex.lexile_level,
          ex.is_validated ? 1 : 0
        );
      }
    })();

    return this.getListeningExamplesByDifficultyId(difficultyId);
  }

  // --- TTS Cache & Usage ---

  getTTSCacheEntry(cacheKey: string): TTSCacheEntryRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM tts_cache_entries WHERE cache_key = ?')
      .get(cacheKey) as CacheRow | undefined;
    return row ? toCacheEntry(row) : undefined;
  }

  upsertTTSCacheEntry(entry: Omit<TTSCacheEntryRecord, 'created_at' | 'last_accessed_at'>): void {
    const now = nowTimestamp();
    this.db
      .prepare(
        `INSERT INTO tts_cache_entries (
          cache_key, file_path, byte_size, text_hash, accent, provider, model, voice, speed_mode,
          pipeline_version, is_approximate, verification_status, verification_note,
          created_at, last_accessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          file_path = excluded.file_path,
          byte_size = excluded.byte_size,
          text_hash = excluded.text_hash,
          accent = excluded.accent,
          provider = excluded.provider,
          model = excluded.model,
          voice = excluded.voice,
          speed_mode = excluded.speed_mode,
          pipeline_version = excluded.pipeline_version,
          is_approximate = excluded.is_approximate,
          verification_status = excluded.verification_status,
          verification_note = excluded.verification_note,
          last_accessed_at = excluded.last_accessed_at`
      )
      .run(
        entry.cache_key,
        entry.file_path,
        entry.byte_size,
        entry.text_hash,
        entry.accent,
        entry.provider,
        entry.model,
        entry.voice,
        entry.speed_mode,
        entry.pipeline_version,
        entry.is_approximate ? 1 : 0,
        entry.verification_status,
        entry.verification_note,
        now,
        now
      );
  }

  touchTTSCacheEntry(cacheKey: string): void {
    this.db
      .prepare('UPDATE tts_cache_entries SET last_accessed_at = ? WHERE cache_key = ?')
      .run(nowTimestamp(), cacheKey);
  }

  updateTTSCacheVerification(
    cacheKey: string,
    status: AudioVerificationStatus,
    note: string
  ): void {
    this.db
      .prepare(
        'UPDATE tts_cache_entries SET verification_status = ?, verification_note = ? WHERE cache_key = ?'
      )
      .run(status, note, cacheKey);
  }

  listLeastRecentlyUsedTTSCacheEntries(limit: number): TTSCacheEntryRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM tts_cache_entries ORDER BY last_accessed_at ASC, rowid ASC LIMIT ?')
      .all(limit) as CacheRow[];
    return rows.map(toCacheEntry);
  }

  deleteTTSCacheEntries(cacheKeys: string[]): void {
    if (cacheKeys.length === 0) return;
    const del = this.db.prepare('DELETE FROM tts_cache_entries WHERE cache_key = ?');
    this.db.transaction((keys: string[]) => {
      for (const key of keys) del.run(key);
    })(cacheKeys);
  }

  clearAllTTSCacheEntries(): TTSCacheEntryRecord[] {
    return this.db.transaction(() => {
      const rows = this.db.prepare('SELECT * FROM tts_cache_entries').all() as CacheRow[];
      this.db.prepare('DELETE FROM tts_cache_entries').run();
      return rows.map(toCacheEntry);
    })();
  }

  getTTSCacheTotalBytes(): { entryCount: number; totalBytes: number } {
    return this.db
      .prepare(
        'SELECT COUNT(*) AS entryCount, COALESCE(SUM(byte_size), 0) AS totalBytes FROM tts_cache_entries'
      )
      .get() as { entryCount: number; totalBytes: number };
  }

  incrementDailyTTSUsage(
    dateUtc: string,
    byteSize: number
  ): { synthesizedCount: number; synthesizedBytes: number } {
    this.db
      .prepare(
        `INSERT INTO tts_daily_usage (usage_date, synthesized_count, synthesized_bytes)
         VALUES (?, 1, ?)
         ON CONFLICT(usage_date) DO UPDATE SET
           synthesized_count = synthesized_count + 1,
           synthesized_bytes = synthesized_bytes + excluded.synthesized_bytes`
      )
      .run(dateUtc, byteSize);
    return this.getDailyTTSUsage(dateUtc);
  }

  getDailyTTSUsage(dateUtc: string): { synthesizedCount: number; synthesizedBytes: number } {
    const row = this.db
      .prepare(
        'SELECT synthesized_count AS synthesizedCount, synthesized_bytes AS synthesizedBytes FROM tts_daily_usage WHERE usage_date = ?'
      )
      .get(dateUtc) as { synthesizedCount: number; synthesizedBytes: number } | undefined;
    return row ?? { synthesizedCount: 0, synthesizedBytes: 0 };
  }
}
