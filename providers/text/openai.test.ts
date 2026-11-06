import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleTextProvider } from './openai.js';
import { GOLDEN_PART2_ITEMS } from '../../src/test/fixtures/listeningDifficulties.fixture.js';
import {
  GOLDEN_B1_EXAMPLES_BY_CATEGORY,
  INVALID_B1_EXAMPLE_BATCH,
} from '../../src/test/fixtures/listeningExamples.fixture.js';

describe('OpenAICompatibleTextProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('analyzeListening parses valid JSON and wrapped object payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ items: GOLDEN_PART2_ITEMS }),
            },
          },
        ],
      }),
    });

    const provider = new OpenAICompatibleTextProvider(
      'openai',
      'https://api.openai.com',
      'gpt-4o',
      'sk-test'
    );
    const items = await provider.analyzeListening(
      '[#12 00:01:14,200 -> 00:01:17,050] It is in and out.'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(GOLDEN_PART2_ITEMS.length);
    expect(items[0].phrase).toBe('in and out');
    expect(items[2].tts_sentence).toBe('maybe a good next step is to take your jacket off.');
  });

  it('analyzeListening recovers from <think> blocks and truncated JSON output on local models', async () => {
    const firstTwo = GOLDEN_PART2_ITEMS.slice(0, 2);
    const truncated = `<think>Analyzing phonetics...</think>\n\`\`\`json\n[${JSON.stringify(
      firstTwo[0]
    )},${JSON.stringify(firstTwo[1])},{"category":"elision","phrase":"next`;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: truncated,
            },
          },
        ],
      }),
    });

    const provider = new OpenAICompatibleTextProvider(
      'ollama',
      'http://localhost:11434',
      'llama3'
    );
    const items = await provider.analyzeListening('[#1] test');

    expect(items).toHaveLength(2);
    expect(items[0].category).toBe('catenation');
    expect(items[1].category).toBe('assimilation');
  });

  it('analyzeListening retries once for local models when first response has 0 valid items', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Sorry, I cannot output JSON.' } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(GOLDEN_PART2_ITEMS.slice(0, 2)) } }],
        }),
      });

    const provider = new OpenAICompatibleTextProvider(
      'ollama',
      'http://localhost:11434',
      'llama3'
    );
    const items = await provider.analyzeListening('[#1] test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(items).toHaveLength(2);
  });

  it('generateListeningExamples validates B1 examples and retries once with feedback on validation failure', async () => {
    const validBatch = GOLDEN_B1_EXAMPLES_BY_CATEGORY.weak_forms;

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(INVALID_B1_EXAMPLE_BATCH) } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(validBatch) } }],
        }),
      });

    const provider = new OpenAICompatibleTextProvider(
      'openai',
      'https://api.openai.com',
      'gpt-4o',
      'sk-test'
    );

    const examples = await provider.generateListeningExamples({
      category: 'weak_forms',
      phrase: 'could have',
      spokenPhrase: 'could have',
      simulatedPronunciation: 'could-a',
      originalSentence: "Anybody could have waltzed in, that's all I'm saying.",
      explanationZh: '弱化为央元音',
      explanationEn: 'Auxiliary have reduces to schwa.',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallInit = fetchMock.mock.calls[1][1] as { body: string };
    const parsedBody = JSON.parse(secondCallInit.body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMsg = parsedBody.messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userMsg).toContain('PREVIOUS ATTEMPT FAILED VALIDATION');
    expect(examples).toHaveLength(3);
    expect(examples[0].target_phrase_in_sentence).toBe('could have');
  });
});
