import { describe, it, expect } from 'vitest';
import type { TextProvider } from '../../providers/text/interface.js';
import type { TTSProvider } from '../../providers/tts/interface.js';
import type { PhoneticCategory } from '../types/listening.js';
import {
  createDeterministicTestWav,
  FakeRateLimitError,
  FakeTextProvider,
  FakeTTSProvider,
  SAMPLE_SRT,
  SAMPLE_VTT,
} from './fakes.js';
import { GOLDEN_PART2_ITEMS } from './fixtures/listeningDifficulties.fixture.js';
import {
  GOLDEN_B1_EXAMPLES_BY_CATEGORY,
  INVALID_B1_EXAMPLE_BATCH,
  TRUNCATED_JSON_RESPONSE,
} from './fixtures/listeningExamples.fixture.js';

const ALL_CATEGORIES: PhoneticCategory[] = [
  'catenation',
  'assimilation',
  'elision',
  'weak_forms',
  'h_dropping',
  'contractions',
  'confusion',
];

describe('createDeterministicTestWav', () => {
  it('produces a valid 24 kHz 16-bit mono RIFF/WAVE buffer', () => {
    const wav = createDeterministicTestWav('gemini:uk:Kore:hello');
    expect(wav.length).toBe(44 + 64);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt32LE(40)).toBe(64);
  });

  it('is deterministic per tag and distinct across tags (cache-hit tests rely on this)', () => {
    expect(createDeterministicTestWav('a').equals(createDeterministicTestWav('a'))).toBe(true);
    expect(createDeterministicTestWav('a').equals(createDeterministicTestWav('b'))).toBe(false);
  });
});

describe('golden fixtures', () => {
  it('covers all 7 phonetic categories exactly once', () => {
    expect(GOLDEN_PART2_ITEMS.map((i) => i.category).sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it('includes the stage-direction strip and the Magna Carta subtitle-error trap', () => {
    const elision = GOLDEN_PART2_ITEMS.find((i) => i.category === 'elision');
    expect(elision?.original_sentence).toContain('[muffled]');
    expect(elision?.tts_sentence).not.toContain('[muffled]');

    const confusion = GOLDEN_PART2_ITEMS.find((i) => i.category === 'confusion');
    expect(confusion).toMatchObject({
      phrase: 'Magma Cara',
      spoken_phrase: 'Magna Carta',
      is_subtitle_error: true,
    });
    expect(confusion?.tts_sentence).toContain('Magna Carta');
  });

  it('has 3 valid B1 examples per category, each containing its target phrase', () => {
    for (const category of ALL_CATEGORIES) {
      const batch = GOLDEN_B1_EXAMPLES_BY_CATEGORY[category];
      expect(batch, category).toHaveLength(3);
      for (const ex of batch) {
        expect(ex.sentence, category).toContain(ex.target_phrase_in_sentence);
        expect(ex.lexile_level).toBe('B1');
      }
    }
  });

  it('provides invalid inputs that a validator must reject', () => {
    expect(() => JSON.parse(TRUNCATED_JSON_RESPONSE)).toThrow();
    const missingTarget = INVALID_B1_EXAMPLE_BATCH.some(
      (ex) => !ex.sentence.includes(ex.target_phrase_in_sentence)
    );
    expect(missingTarget).toBe(true);
    expect(INVALID_B1_EXAMPLE_BATCH.some((ex) => ex.sentence.includes('epistemological'))).toBe(
      true
    );
  });

  it('sample .srt and .vtt contain every golden sentence at its cue index and timing', () => {
    for (const item of GOLDEN_PART2_ITEMS) {
      const srtCue = `${item.cue_index}\n${item.cue_start_time} --> ${item.cue_end_time}\n${item.original_sentence}`;
      expect(SAMPLE_SRT).toContain(srtCue);
      const vttStart = item.cue_start_time?.replace(',', '.');
      const vttEnd = item.cue_end_time?.replace(',', '.');
      expect(SAMPLE_VTT).toContain(`${item.cue_index}\n${vttStart} --> ${vttEnd}\n`);
    }
    expect(SAMPLE_VTT.startsWith('WEBVTT')).toBe(true);
  });
});

describe('FakeTextProvider', () => {
  it('satisfies TextProvider and returns golden data by default without network', async () => {
    const fake = new FakeTextProvider();
    const provider: TextProvider = fake;

    const items = await provider.analyzeListening?.('cues');
    expect(items).toEqual(GOLDEN_PART2_ITEMS);

    const examples = await provider.generateListeningExamples?.({
      category: 'weak_forms',
      phrase: 'could have',
      spokenPhrase: 'could have',
      simulatedPronunciation: 'could-a',
      originalSentence: 'x',
      explanationZh: 'y',
    });
    expect(examples).toEqual(GOLDEN_B1_EXAMPLES_BY_CATEGORY.weak_forms);

    await provider.analyze('raw');
    expect(fake.calls).toEqual({ analyze: 1, analyzeListening: 1, generateListeningExamples: 1 });
    expect(fake.lastInput.analyzeListening).toBe('cues');
    expect(fake.lastInput.analyze).toBe('raw');
    expect(fake.lastInput.generateListeningExamples?.category).toBe('weak_forms');
  });

  it('returns copies so a test mutating results cannot corrupt the shared fixtures', async () => {
    const fake = new FakeTextProvider();
    const items = await fake.analyzeListening('cues');
    items[0].phrase = 'MUTATED';
    expect(GOLDEN_PART2_ITEMS[0].phrase).not.toBe('MUTATED');
  });

  it('supports configurable responses and failure injection', async () => {
    const fake = new FakeTextProvider({ listeningResult: [] });
    expect(await fake.analyzeListening('cues')).toEqual([]);

    fake.errors.generateListeningExamples = new Error('LLM down');
    await expect(
      fake.generateListeningExamples({
        category: 'elision',
        phrase: 'p',
        spokenPhrase: 'p',
        simulatedPronunciation: 'p',
        originalSentence: 'p',
        explanationZh: 'p',
      })
    ).rejects.toThrow('LLM down');
    // Failed calls still count, so retry logic can be asserted.
    expect(fake.calls.generateListeningExamples).toBe(1);
  });
});

describe('FakeTTSProvider', () => {
  it('satisfies TTSProvider; legacy synthesize returns a WAV encoding provider/accent/voice/text', async () => {
    const fake = new FakeTTSProvider();
    const provider: TTSProvider = fake;

    const wav = await provider.synthesize('hello', 'British');
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.subarray(44).toString('utf-8')).toContain('fake:uk:British:hello');

    const us = await provider.synthesize('hello', 'american');
    expect(us.subarray(44).toString('utf-8')).toContain('fake:us:american:hello');
  });

  it('synthesizeAdvanced returns metadata and a deterministic WAV', async () => {
    const fake = new FakeTTSProvider();
    const out = await fake.synthesizeAdvanced('Would you?', { accent: 'nz', voiceName: 'Kore' });
    expect(out).toMatchObject({
      provider: 'fake',
      model: 'fake-tts-1',
      voiceUsed: 'Kore',
      accent: 'nz',
      isApproximate: false,
      verificationStatus: 'instructed_unverified',
    });
    expect(out.wavBuffer.equals(createDeterministicTestWav('fake:nz:Kore:Would you?'))).toBe(true);
    expect(fake.calls).toEqual({ synthesize: 0, synthesizeAdvanced: 1 });
  });

  it('simulates N initial 429 rate-limit failures, then succeeds', async () => {
    const fake = new FakeTTSProvider({ rateLimitFailures: 1 });
    const first = fake.synthesizeAdvanced('hi', { accent: 'uk' });
    await expect(first).rejects.toBeInstanceOf(FakeRateLimitError);
    await expect(fake.synthesizeAdvanced('hi', { accent: 'uk' })).resolves.toMatchObject({
      accent: 'uk',
    });
    expect(fake.calls.synthesizeAdvanced).toBe(2);
    expect(new FakeRateLimitError().status).toBe(429);
  });
});
