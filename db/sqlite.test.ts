import { describe, it, expect } from 'vitest';
import { SQLiteDatabase } from './sqlite.js';

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
