import { describe, it, expect, vi, beforeEach } from 'vitest';
import { estimateExtractionTarget, GeminiTextProvider } from './gemini.js';
import { GOLDEN_PART2_ITEMS } from '../../src/test/fixtures/listeningDifficulties.fixture.js';
import {
  GOLDEN_B1_EXAMPLES_BY_CATEGORY,
  INVALID_B1_EXAMPLE_BATCH,
} from '../../src/test/fixtures/listeningExamples.fixture.js';
import { createDeterministicTestWav } from '../../src/test/fakes.js';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

describe('estimateExtractionTarget', () => {
  it('correctly calculates target for ~45 min TV episode using subtitle context header', () => {
    const text = '[SUBTITLE CONTEXT: cues=850, duration=00:45:00,000]\n\nHello there...';
    const result = estimateExtractionTarget(text);

    expect(result.durationMinutes).toBe(45);
    expect(result.minTarget).toBe(80);
    expect(result.maxTarget).toBe(100);
  });

  it('correctly scales target for ~120 min movie using subtitle context header', () => {
    const text = '[SUBTITLE CONTEXT: cues=2100, duration=02:00:00,000]\n\nThis is a long movie dialogue...';
    const result = estimateExtractionTarget(text);

    expect(result.durationMinutes).toBe(120);
    expect(result.minTarget).toBeGreaterThanOrEqual(200);
    expect(result.maxTarget).toBeGreaterThanOrEqual(250);
  });

  it('correctly scales target for ~90 min movie', () => {
    const text = '[SUBTITLE CONTEXT: cues=1600, duration=01:30:00,000]\n\nMovie dialogue...';
    const result = estimateExtractionTarget(text);

    expect(result.durationMinutes).toBe(90);
    expect(result.minTarget).toBe(160);
    expect(result.maxTarget).toBe(200);
  });

  it('falls back to character-length estimation when no subtitle context header is present', () => {
    // 31,500 chars / 700 chars per min ≈ 45 min
    const fake45MinText = 'a'.repeat(31500);
    const result = estimateExtractionTarget(fake45MinText);

    expect(result.durationMinutes).toBe(45);
    expect(result.minTarget).toBe(80);
    expect(result.maxTarget).toBe(100);
  });

  it('enforces reasonable minimum floor for very short texts', () => {
    const shortText = 'Brief line of text';
    const result = estimateExtractionTarget(shortText);

    expect(result.minTarget).toBeGreaterThanOrEqual(80);
    expect(result.maxTarget).toBeGreaterThanOrEqual(100);
  });
});

describe('GeminiTextProvider Part 2 & B1 Examples', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  it('analyzeListening parses and validates golden Part 2 items', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(GOLDEN_PART2_ITEMS),
    });

    const provider = new GeminiTextProvider('test-key', 'gemini-3.8-flash');
    const items = await provider.analyzeListening('[#12 00:01:14,200 -> 00:01:17,050] It is in and out.');

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(GOLDEN_PART2_ITEMS.length);
    expect(items[0].category).toBe('catenation');
    expect(items[2].tts_sentence).toBe('maybe a good next step is to take your jacket off.');
    expect(items[6].is_subtitle_error).toBe(true);
    expect(items[6].spoken_phrase).toBe('Magna Carta');
  });

  it('analyzeListening recovers valid items from a truncated JSON response', async () => {
    const firstTwo = GOLDEN_PART2_ITEMS.slice(0, 2);
    const truncated = `[${JSON.stringify(firstTwo[0])},${JSON.stringify(firstTwo[1])},{"category":"elision","phrase":"nex`;

    mockGenerateContent.mockResolvedValueOnce({
      text: `\`\`\`json\n${truncated}`,
    });

    const provider = new GeminiTextProvider('test-key');
    const items = await provider.analyzeListening('[#12 00:01:14,200 -> 00:01:17,050] Dialogue');

    expect(items).toHaveLength(2);
    expect(items[0].phrase).toBe('in and out');
    expect(items[1].phrase).toBe('Would you');
  });

  it('analyzeListening throws when no valid listening items can be parsed', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'not valid json at all',
    });

    const provider = new GeminiTextProvider('test-key');
    await expect(provider.analyzeListening('[#1] test')).rejects.toThrow(
      /unparseable/i
    );
  });

  it('generateListeningExamples returns validated B1 examples on the first attempt', async () => {
    const validBatch = GOLDEN_B1_EXAMPLES_BY_CATEGORY.assimilation;
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validBatch),
    });

    const provider = new GeminiTextProvider('test-key');
    const examples = await provider.generateListeningExamples({
      category: 'assimilation',
      phrase: 'Would you',
      spokenPhrase: 'Would you',
      simulatedPronunciation: 'woul-dja',
      originalSentence: 'Would you have come if he did?',
      explanationZh: '同化音变',
      explanationEn: 'Yod-coalescence',
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(examples).toHaveLength(3);
    expect(examples[0].target_phrase_in_sentence).toBe('Would you');
  });

  it('generateListeningExamples automatically retries once with validation feedback when attempt 1 fails B1/phenomenon check', async () => {
    const validBatch = GOLDEN_B1_EXAMPLES_BY_CATEGORY.assimilation;
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify(INVALID_B1_EXAMPLE_BATCH),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify(validBatch),
      });

    const provider = new GeminiTextProvider('test-key');
    const examples = await provider.generateListeningExamples({
      category: 'assimilation',
      phrase: 'Would you',
      spokenPhrase: 'Would you',
      simulatedPronunciation: 'woul-dja',
      originalSentence: 'Would you have come if he did?',
      explanationZh: '同化音变',
      explanationEn: 'Yod-coalescence',
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    const secondCallArg = mockGenerateContent.mock.calls[1][0] as { contents: string };
    expect(secondCallArg.contents).toContain('PREVIOUS ATTEMPT FAILED VALIDATION');
    expect(examples).toHaveLength(3);
    expect(examples[0].sentence).toBe(validBatch[0].sentence);
  });

  it('verifyConnectedSpeechAudio sends inline audio/wav and returns verified or failed_check', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        heardPhrase: 'woul-dja',
        exhibitsReduction: true,
        confidence: 'high',
        note: 'Clear yod-coalescence on would you.',
      }),
    });

    const provider = new GeminiTextProvider('test-key');
    const wav = createDeterministicTestWav('gemini:uk:Kore:Would you');
    const res = await provider.verifyConnectedSpeechAudio(wav, {
      targetPhrase: 'Would you',
      simulatedPronunciation: 'woul-dja',
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(res.status).toBe('verified');
    expect(res.note).toContain('Clear yod-coalescence');
  });
});
