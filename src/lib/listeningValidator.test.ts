import { describe, expect, it } from 'vitest';
import { GOLDEN_PART2_ITEMS } from '../test/fixtures/listeningDifficulties.fixture.js';
import {
  GOLDEN_B1_EXAMPLES_BY_CATEGORY,
  INVALID_B1_EXAMPLE_BATCH,
  TRUNCATED_JSON_RESPONSE,
} from '../test/fixtures/listeningExamples.fixture.js';
import type { PhoneticCategory } from '../types/listening.js';
import {
  normalizePhraseKey,
  parseAndRepairJsonArray,
  stripStageDirections,
  validateExampleBatch,
  validateListeningExtractResponse,
} from './listeningValidator.js';

describe('listeningValidator', () => {
  describe('normalizePhraseKey', () => {
    it('trims, lowercases, and collapses internal whitespace', () => {
      expect(normalizePhraseKey('  Would   You ')).toBe('would you');
      expect(normalizePhraseKey('In and Out')).toBe('in and out');
    });
  });

  describe('stripStageDirections', () => {
    it('removes bracketed and parenthetical stage directions and collapses extra spaces', () => {
      expect(
        stripStageDirections('[muffled] ...maybe a good next step is to take your jacket off.')
      ).toBe('maybe a good next step is to take your jacket off.');

      expect(stripStageDirections('(sighs) I could have [clears throat] told him.')).toBe(
        'I could have told him.'
      );

      expect(stripStageDirections('  <i>Would you</i> (groans) come in?  ')).toBe(
        'Would you come in?'
      );
    });
  });

  describe('parseAndRepairJsonArray', () => {
    it('strips <think> blocks and markdown code fences before parsing JSON arrays', () => {
      const wrapped = `<think>
Let me analyze the subtitle cues for phonetic traps...
</think>
\`\`\`json
[
  {"category": "assimilation", "phrase": "did you", "spoken_phrase": "did you", "simulated_pronunciation": "di-dja"}
]
\`\`\``;

      const parsed = parseAndRepairJsonArray(wrapped);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({
        category: 'assimilation',
        phrase: 'did you',
      });
    });

    it('recovers complete objects from a truncated JSON array response', () => {
      const parsed = parseAndRepairJsonArray(TRUNCATED_JSON_RESPONSE);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        category: 'assimilation',
        phrase: 'did you',
        spoken_phrase: 'did you',
        simulated_pronunciation: 'di-dja',
      });
    });

    it('falls back to brace-depth object extraction when array structure is corrupted', () => {
      const corrupted = `Here are the items:
{"category":"catenation","phrase":"in and out","spoken_phrase":"in and out","simulated_pronunciation":"i-nan-dout"}
some stray text
{"category":"elision","phrase":"next step","spoken_phrase":"next step","simulated_pronunciation":"nex-step"}
{"broken": "unclosed`;

      const parsed = parseAndRepairJsonArray(corrupted);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toMatchObject({ category: 'catenation', phrase: 'in and out' });
      expect(parsed[1]).toMatchObject({ category: 'elision', phrase: 'next step' });
    });

    it('unwraps top-level object wrappers containing an array property', () => {
      const wrappedObj = JSON.stringify({ items: GOLDEN_PART2_ITEMS.slice(0, 2) });
      const parsed = parseAndRepairJsonArray(wrappedObj);
      expect(parsed).toHaveLength(2);
    });
  });

  describe('validateListeningExtractResponse', () => {
    it('validates all 7 golden Part 2 items, sets normalized_phrase, and cleans tts_sentence', () => {
      const rawWithUncleanTts = GOLDEN_PART2_ITEMS.map((item) =>
        item.category === 'elision'
          ? {
              ...item,
              tts_sentence: '[muffled] ...maybe a good next step is to take your jacket off.',
            }
          : item
      );

      const validated = validateListeningExtractResponse(rawWithUncleanTts);
      expect(validated).toHaveLength(7);

      expect(validated[0].normalized_phrase).toBe('in and out');
      expect(validated[1].normalized_phrase).toBe('would you');
      expect(validated[2].tts_sentence).toBe('maybe a good next step is to take your jacket off.');
      expect(validated[6].is_subtitle_error).toBe(true);
      expect(validated[6].spoken_phrase).toBe('Magna Carta');
    });

    it('filters out invalid categories and deduplicates by (category, normalized_phrase)', () => {
      const raw = [
        GOLDEN_PART2_ITEMS[1], // assimilation: "Would you"
        {
          ...GOLDEN_PART2_ITEMS[1],
          phrase: '  would YOU ',
          explanation_en: 'Duplicate item with different casing',
        },
        {
          ...GOLDEN_PART2_ITEMS[0],
          category: 'unknown_category',
        },
        {
          category: 'elision',
          phrase: '',
          simulated_pronunciation: 'empty-phrase',
        },
      ];

      const validated = validateListeningExtractResponse(raw);
      expect(validated).toHaveLength(1);
      expect(validated[0].category).toBe('assimilation');
      expect(validated[0].normalized_phrase).toBe('would you');
      expect(validated[0].explanation_en).toBe(GOLDEN_PART2_ITEMS[1].explanation_en);
    });

    it('accepts a truncated JSON string directly and validates recovered items', () => {
      const validated = validateListeningExtractResponse(TRUNCATED_JSON_RESPONSE);
      expect(validated).toHaveLength(1);
      expect(validated[0]).toMatchObject({
        category: 'assimilation',
        phrase: 'did you',
        normalized_phrase: 'did you',
        spoken_phrase: 'did you',
        simulated_pronunciation: 'di-dja',
      });
    });
  });

  describe('validateExampleBatch', () => {
    it('accepts all golden B1 example batches across all 7 phonetic categories', () => {
      const categories: PhoneticCategory[] = [
        'catenation',
        'assimilation',
        'elision',
        'weak_forms',
        'h_dropping',
        'contractions',
        'confusion',
      ];

      for (const category of categories) {
        const target = GOLDEN_PART2_ITEMS.find((item) => item.category === category)!;
        const batch = GOLDEN_B1_EXAMPLES_BY_CATEGORY[category];
        const result = validateExampleBatch(batch, target);

        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.items).toHaveLength(3);
      }
    });

    it('rejects INVALID_B1_EXAMPLE_BATCH with structured feedback for missing target phrase and >B1 vocabulary', () => {
      const target = {
        ...GOLDEN_PART2_ITEMS[1],
        phrase: 'did you',
        spoken_phrase: 'did you',
        simulated_pronunciation: 'di-dja',
      };

      const result = validateExampleBatch(INVALID_B1_EXAMPLE_BATCH, target);

      expect(result.valid).toBe(false);
      // Only the 3rd sentence ("Did you see the film?") is valid
      expect(result.items).toHaveLength(1);
      expect(result.items[0].sentence).toBe('Did you see the film?');
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.feedback).toContain('did you');
      expect(result.feedback).toMatch(/B1|vocabulary|word/i);
    });

    it('rejects examples whose target_phrase_in_sentence does not match the category phenomenon', () => {
      const hDroppingTarget = GOLDEN_PART2_ITEMS.find((i) => i.category === 'h_dropping')!;
      const badExamples = [
        {
          sentence: 'I went to the park yesterday afternoon.',
          tts_sentence: 'I went to the park yesterday afternoon.',
          target_phrase_in_sentence: 'went to',
          simulated_pronunciation: 'wen-to',
          phonetic_note_zh: '错误类别',
          phonetic_note_en: 'Wrong phenomenon',
          lexile_level: 'B1',
        },
      ];

      const result = validateExampleBatch(badExamples, hDroppingTarget);
      expect(result.valid).toBe(false);
      expect(result.items).toHaveLength(0);
      expect(result.feedback).toMatch(/h_dropping|phenomenon|pronoun/i);
    });
  });
});
