import { describe, it, expect, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteDatabase } from './sqlite.js';
import type { NewExtractedItem } from './interface.js';
import type {
  NewListeningDifficulty,
  NewListeningExample,
  TTSCacheEntryRecord,
} from '../src/types/listening.js';

describe('SQLiteDatabase ordering and filtering', () => {
  it('returns extracted items ordered chronologically by insertion order (id ASC)', () => {
    const db = new SQLiteDatabase(':memory:');
    const subtitleId = db.insertSubtitle('test.srt', '1\n00:00:00,000 --> 00:00:02,000\nHello');

    db.bulkInsertItems(subtitleId, [
      {
        type: 'word',
        term: 'first_word',
        meaning_en: 'first',
        meaning_zh: '第一',
        phonetic: '',
        part_of_speech: '',
        usage_scenarios_en: '',
        usage_scenarios_zh: '',
        examples_en: '',
        examples_zh: '',
        synonyms: '',
        frequency: 'Tier 3',
        level: 'B1',
      },
      {
        type: 'idiom',
        term: 'second_word',
        meaning_en: 'second',
        meaning_zh: '第二',
        phonetic: '',
        part_of_speech: '',
        usage_scenarios_en: '',
        usage_scenarios_zh: '',
        examples_en: '',
        examples_zh: '',
        synonyms: '',
        frequency: 'Tier 1',
        level: 'B2',
      },
      {
        type: 'word',
        term: 'third_word',
        meaning_en: 'third',
        meaning_zh: '第三',
        phonetic: '',
        part_of_speech: '',
        usage_scenarios_en: '',
        usage_scenarios_zh: '',
        examples_en: '',
        examples_zh: '',
        synonyms: '',
        frequency: 'Tier 2',
        level: 'C1',
      },
    ]);

    const items = db.getItemsBySubtitleId(subtitleId);
    expect(items.length).toBe(3);
    expect(items[0].term).toBe('first_word');
    expect(items[1].term).toBe('second_word');
    expect(items[2].term).toBe('third_word');
    expect(items[0].id).toBeLessThan(items[1].id);
    expect(items[1].id).toBeLessThan(items[2].id);
  });

  it('filters by level while preserving chronological order', () => {
    const db = new SQLiteDatabase(':memory:');
    const subtitleId = db.insertSubtitle('test.srt', 'content');

    db.bulkInsertItems(subtitleId, [
      {
        type: 'word',
        term: 'w1',
        meaning_en: '',
        meaning_zh: '',
        phonetic: '',
        part_of_speech: '',
        usage_scenarios_en: '',
        usage_scenarios_zh: '',
        examples_en: '',
        examples_zh: '',
        synonyms: '',
        frequency: 'Tier 1',
        level: 'A1',
      },
      {
        type: 'word',
        term: 'w2',
        meaning_en: '',
        meaning_zh: '',
        phonetic: '',
        part_of_speech: '',
        usage_scenarios_en: '',
        usage_scenarios_zh: '',
        examples_en: '',
        examples_zh: '',
        synonyms: '',
        frequency: 'Tier 1',
        level: 'B2',
      },
      {
        type: 'word',
        term: 'w3',
        meaning_en: '',
        meaning_zh: '',
        phonetic: '',
        part_of_speech: '',
        usage_scenarios_en: '',
        usage_scenarios_zh: '',
        examples_en: '',
        examples_zh: '',
        synonyms: '',
        frequency: 'Tier 1',
        level: 'B2',
      },
    ]);

    const items = db.getItemsBySubtitleId(subtitleId, ['B2']);
    expect(items.map(i => i.term)).toEqual(['w2', 'w3']);
  });
});


describe('SQLiteDatabase Part 2 migration (PRAGMA user_version = 1)', () => {
  it('sets schema version to 1 on a fresh database', () => {
    const db = new SQLiteDatabase(':memory:');
    expect(db.getSchemaVersion()).toBe(1);
  });

  it('upgrades a legacy v0 database without losing Part 1 data, and re-opening is a no-op', () => {
    // Why: real users already have lingocinema.db files created before Part 2 existed.
    const dir = mkdtempSync(join(tmpdir(), 'lingo-db-'));
    const dbPath = join(dir, 'legacy.db');
    try {
      const legacy = new Database(dbPath);
      legacy.exec(`
        CREATE TABLE subtitles (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, content TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE extracted_items (id INTEGER PRIMARY KEY AUTOINCREMENT, subtitle_id INTEGER, type TEXT,
          term TEXT, meaning_en TEXT, meaning_zh TEXT, phonetic TEXT, part_of_speech TEXT,
          usage_scenarios_en TEXT, usage_scenarios_zh TEXT, examples_en TEXT, examples_zh TEXT,
          synonyms TEXT, frequency TEXT, level TEXT, FOREIGN KEY (subtitle_id) REFERENCES subtitles(id));
        INSERT INTO subtitles (filename, content) VALUES ('old.srt', 'old content');
        INSERT INTO extracted_items (subtitle_id, type, term, level) VALUES (1, 'word', 'legacy_term', 'B2');
      `);
      expect(legacy.pragma('user_version', { simple: true })).toBe(0);
      legacy.close();

      const upgraded = new SQLiteDatabase(dbPath);
      expect(upgraded.getSchemaVersion()).toBe(1);
      expect(upgraded.getSubtitles().map((s) => s.filename)).toEqual(['old.srt']);
      expect(upgraded.getItemsBySubtitleId(1).map((i) => i.term)).toEqual(['legacy_term']);
      const diffs = upgraded.replaceListeningDifficulties(1, [makeDifficulty()]);
      upgraded.close();

      // Second open must not re-run the migration (which would drop/duplicate rows).
      const reopened = new SQLiteDatabase(dbPath);
      expect(reopened.getSchemaVersion()).toBe(1);
      expect(reopened.getItemsBySubtitleId(1).map((i) => i.term)).toEqual(['legacy_term']);
      expect(reopened.getListeningDifficultiesBySubtitleId(1).map((d) => d.id)).toEqual([diffs[0].id]);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('SQLiteDatabase listening difficulties CRUD', () => {
  it('deduplicates by (normalized_phrase, category), keeping the first occurrence', () => {
    const db = new SQLiteDatabase(':memory:');
    const subId = db.insertSubtitle('ep.srt', 'content');

    const saved = db.replaceListeningDifficulties(subId, [
      makeDifficulty({ phrase: 'Would you', category: 'assimilation', explanation_en: 'first' }),
      makeDifficulty({ phrase: '  would YOU ', category: 'assimilation', explanation_en: 'dup' }),
      // Same phrase, different category is a distinct trap and must be kept.
      makeDifficulty({ phrase: 'would you', category: 'catenation' }),
    ]);

    expect(saved).toHaveLength(2);
    expect(saved[0].normalized_phrase).toBe('would you');
    expect(saved[0].explanation_en).toBe('first');
    expect(saved.map((d) => d.category)).toEqual(['assimilation', 'catenation']);
    expect(saved[0].is_subtitle_error).toBe(false);
    expect(saved[0].is_mastered).toBe(false);
    expect(saved[0].examples_count).toBe(0);
    expect(saved[0].schema_version).toBe(1);
  });

  it('replaces (not appends) existing difficulties for the same subtitle only', () => {
    const db = new SQLiteDatabase(':memory:');
    const subA = db.insertSubtitle('a.srt', 'a');
    const subB = db.insertSubtitle('b.srt', 'b');
    db.replaceListeningDifficulties(subA, [makeDifficulty({ phrase: 'old one' })]);
    db.replaceListeningDifficulties(subB, [makeDifficulty({ phrase: 'other subtitle' })]);

    db.replaceListeningDifficulties(subA, [makeDifficulty({ phrase: 'new one' })]);

    expect(db.getListeningDifficultiesBySubtitleId(subA).map((d) => d.phrase)).toEqual(['new one']);
    expect(db.getListeningDifficultiesBySubtitleId(subB).map((d) => d.phrase)).toEqual(['other subtitle']);
  });

  it('filters by category and includeMastered, and updates mastery', () => {
    const db = new SQLiteDatabase(':memory:');
    const subId = db.insertSubtitle('ep.srt', 'content');
    const [a, b] = db.replaceListeningDifficulties(subId, [
      makeDifficulty({ phrase: 'gonna', category: 'contractions' }),
      makeDifficulty({ phrase: 'told him', category: 'h_dropping', is_subtitle_error: true }),
    ]);

    expect(db.updateListeningDifficultyMastery(a.id, true)).toBe(true);
    expect(db.updateListeningDifficultyMastery(999999, true)).toBe(false);

    expect(db.getListeningDifficultyById(a.id)?.is_mastered).toBe(true);
    expect(db.getListeningDifficultyById(b.id)?.is_subtitle_error).toBe(true);
    expect(db.getListeningDifficultyById(999999)).toBeUndefined();

    expect(db.getListeningDifficultiesBySubtitleId(subId)).toHaveLength(2);
    expect(
      db.getListeningDifficultiesBySubtitleId(subId, { includeMastered: false }).map((d) => d.id)
    ).toEqual([b.id]);
    expect(
      db.getListeningDifficultiesBySubtitleId(subId, { category: 'contractions' }).map((d) => d.id)
    ).toEqual([a.id]);
  });
});

describe('SQLiteDatabase listening examples & cascade delete', () => {
  it('replaces examples for a difficulty and reports examples_count', () => {
    const db = new SQLiteDatabase(':memory:');
    const subId = db.insertSubtitle('ep.srt', 'content');
    const [diff] = db.replaceListeningDifficulties(subId, [makeDifficulty()]);

    db.replaceListeningExamples(diff.id, [makeExample({ sentence: 'old sentence' })]);
    const saved = db.replaceListeningExamples(diff.id, [
      makeExample({ sentence: 'Did you eat?' }),
      makeExample({ sentence: 'Would you help?', is_validated: false }),
    ]);

    expect(saved.map((e) => e.sentence)).toEqual(['Did you eat?', 'Would you help?']);
    expect(saved[0].difficulty_id).toBe(diff.id);
    expect(saved[1].is_validated).toBe(false);
    expect(db.getListeningExamplesByDifficultyId(diff.id)).toEqual(saved);
    expect(db.getListeningDifficultyById(diff.id)?.examples_count).toBe(2);
  });

  it('deleteSubtitle removes Part 1 items, Part 2 difficulties, and examples', () => {
    const db = new SQLiteDatabase(':memory:');
    const subId = db.insertSubtitle('ep.srt', 'content');
    const keepId = db.insertSubtitle('keep.srt', 'content');
    db.bulkInsertItems(subId, [makeItem()]);
    const [diff] = db.replaceListeningDifficulties(subId, [makeDifficulty()]);
    db.replaceListeningExamples(diff.id, [makeExample()]);
    const [keepDiff] = db.replaceListeningDifficulties(keepId, [makeDifficulty()]);
    db.replaceListeningExamples(keepDiff.id, [makeExample()]);

    db.deleteSubtitle(subId);

    expect(db.getSubtitleById(subId)).toBeUndefined();
    expect(db.getItemsBySubtitleId(subId)).toEqual([]);
    expect(db.getListeningDifficultiesBySubtitleId(subId)).toEqual([]);
    expect(db.getListeningExamplesByDifficultyId(diff.id)).toEqual([]);
    expect(db.getListeningExamplesByDifficultyId(keepDiff.id)).toHaveLength(1);
  });
});

describe('SQLiteDatabase TTS cache metadata & daily usage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('upserts, reads, and updates verification of cache entries', () => {
    const db = new SQLiteDatabase(':memory:');
    db.upsertTTSCacheEntry(makeCacheEntry('k1', 100));
    expect(db.getTTSCacheEntry('k1')).toMatchObject({
      cache_key: 'k1',
      byte_size: 100,
      accent: 'uk',
      is_approximate: false,
      verification_status: 'instructed_unverified',
    });
    expect(db.getTTSCacheEntry('missing')).toBeUndefined();

    // Re-synthesis of the same key overwrites metadata instead of failing on the PK.
    db.upsertTTSCacheEntry({ ...makeCacheEntry('k1', 250), is_approximate: true });
    expect(db.getTTSCacheEntry('k1')).toMatchObject({ byte_size: 250, is_approximate: true });
    expect(db.getTTSCacheTotalBytes()).toEqual({ entryCount: 1, totalBytes: 250 });

    db.updateTTSCacheVerification('k1', 'verified', 'checked by ear');
    expect(db.getTTSCacheEntry('k1')).toMatchObject({
      verification_status: 'verified',
      verification_note: 'checked by ear',
    });
  });

  it('orders LRU candidates by last access so touched entries are evicted last', () => {
    vi.useFakeTimers();
    const db = new SQLiteDatabase(':memory:');
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    db.upsertTTSCacheEntry(makeCacheEntry('a', 10));
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    db.upsertTTSCacheEntry(makeCacheEntry('b', 20));
    vi.setSystemTime(new Date('2026-01-01T00:00:02.000Z'));
    db.upsertTTSCacheEntry(makeCacheEntry('c', 30));

    vi.setSystemTime(new Date('2026-01-01T00:00:03.000Z'));
    db.touchTTSCacheEntry('a');

    expect(db.listLeastRecentlyUsedTTSCacheEntries(2).map((e) => e.cache_key)).toEqual(['b', 'c']);
    expect(db.getTTSCacheEntry('a')?.created_at).toBe('2026-01-01 00:00:00.000');
    expect(db.getTTSCacheEntry('a')?.last_accessed_at).toBe('2026-01-01 00:00:03.000');

    db.deleteTTSCacheEntries(['b']);
    db.deleteTTSCacheEntries([]);
    expect(db.getTTSCacheTotalBytes()).toEqual({ entryCount: 2, totalBytes: 40 });

    const cleared = db.clearAllTTSCacheEntries();
    // Caller needs the removed rows to delete the WAV files on disk.
    expect(cleared.map((e) => e.file_path).sort()).toEqual(['a/a.wav', 'c/c.wav']);
    expect(db.getTTSCacheTotalBytes()).toEqual({ entryCount: 0, totalBytes: 0 });
  });

  it('increments daily usage per UTC date', () => {
    const db = new SQLiteDatabase(':memory:');
    expect(db.getDailyTTSUsage('2026-11-03')).toEqual({ synthesizedCount: 0, synthesizedBytes: 0 });
    expect(db.incrementDailyTTSUsage('2026-11-03', 100)).toEqual({ synthesizedCount: 1, synthesizedBytes: 100 });
    expect(db.incrementDailyTTSUsage('2026-11-03', 50)).toEqual({ synthesizedCount: 2, synthesizedBytes: 150 });
    expect(db.getDailyTTSUsage('2026-11-04')).toEqual({ synthesizedCount: 0, synthesizedBytes: 0 });
  });
});

function makeDifficulty(overrides: Partial<NewListeningDifficulty> = {}): NewListeningDifficulty {
  return {
    category: 'assimilation',
    phrase: 'would you',
    spoken_phrase: 'would you',
    simulated_pronunciation: 'woul-dja',
    original_sentence: 'Would you like some tea?',
    tts_sentence: 'Would you like some tea?',
    cue_index: 1,
    cue_start_time: '00:00:01,000',
    cue_end_time: '00:00:03,000',
    explanation_zh: '解释',
    explanation_en: 'explanation',
    difficulty_level: 'medium',
    is_subtitle_error: false,
    subtitle_error_note: '',
    ...overrides,
  };
}

function makeExample(overrides: Partial<NewListeningExample> = {}): NewListeningExample {
  return {
    sentence: 'Did you see it?',
    tts_sentence: 'Did you see it?',
    target_phrase_in_sentence: 'Did you',
    simulated_pronunciation: 'di-dja',
    phonetic_note_zh: '注释',
    phonetic_note_en: 'note',
    lexile_level: 'B1',
    is_validated: true,
    ...overrides,
  };
}

function makeItem(): NewExtractedItem {
  return {
    type: 'word', term: 't', meaning_en: '', meaning_zh: '', phonetic: '', part_of_speech: '',
    usage_scenarios_en: '', usage_scenarios_zh: '', examples_en: '', examples_zh: '',
    synonyms: '', frequency: 'Tier 1', level: 'B1',
  };
}

function makeCacheEntry(
  key: string,
  byteSize: number
): Omit<TTSCacheEntryRecord, 'created_at' | 'last_accessed_at'> {
  return {
    cache_key: key,
    file_path: `${key}/${key}.wav`,
    byte_size: byteSize,
    text_hash: `hash-${key}`,
    accent: 'uk',
    provider: 'gemini',
    model: 'm',
    voice: 'v',
    speed_mode: 'normal',
    pipeline_version: 1,
    is_approximate: false,
    verification_status: 'instructed_unverified',
    verification_note: '',
  };
}
