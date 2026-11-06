// Zero-network fake providers and sample subtitles for tests — plan.md Section 3.3 / Task T2.1.
import type { NewExtractedItem } from '../../db/interface.js';
import type { ExampleGenerationRequest, TextProvider } from '../../providers/text/interface.js';
import type {
  LegacyVoiceName,
  TTSProvider,
  TTSSynthesisOptions,
  TTSSynthesisOutput,
} from '../../providers/tts/interface.js';
import type {
  AccentCode,
  NewListeningDifficulty,
  NewListeningExample,
} from '../types/listening.js';
import { GOLDEN_PART2_ITEMS } from './fixtures/listeningDifficulties.fixture.js';
import { GOLDEN_B1_EXAMPLES_BY_CATEGORY } from './fixtures/listeningExamples.fixture.js';

/** 44-byte RIFF PCM header (24 kHz, 16-bit mono) + 64-byte payload encoding `tag`. */
export function createDeterministicTestWav(tag: string): Buffer {
  const payload = Buffer.alloc(64);
  payload.write(tag.slice(0, 64), 'utf-8');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + payload.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(24000, 24); // 24 kHz
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); // 16-bit
  header.write('data', 36);
  header.writeUInt32LE(payload.length, 40);
  return Buffer.concat([header, payload]);
}

// ---------------------------------------------------------------------------
// FakeTextProvider
// ---------------------------------------------------------------------------

export type FakeTextMethod = 'analyze' | 'analyzeListening' | 'generateListeningExamples';

export interface FakeTextProviderOptions {
  name?: string;
  analyzeResult?: NewExtractedItem[];
  listeningResult?: NewListeningDifficulty[];
  examplesResult?:
    | NewListeningExample[]
    | ((req: ExampleGenerationRequest) => NewListeningExample[]);
  errors?: Partial<Record<FakeTextMethod, Error>>;
}

const DEFAULT_EXTRACTED_ITEM: NewExtractedItem = {
  type: 'word',
  term: 'waltz in',
  meaning_en: 'to enter casually',
  meaning_zh: '大摇大摆地走进',
  phonetic: '',
  part_of_speech: 'phrasal verb',
  usage_scenarios_en: '',
  usage_scenarios_zh: '',
  examples_en: '',
  examples_zh: '',
  synonyms: '',
  frequency: 'Tier 2',
  level: 'B2',
};

export class FakeTextProvider implements TextProvider {
  readonly name: string;
  /** Incremented on every call, including calls that throw (so retry counts can be asserted). */
  readonly calls: Record<FakeTextMethod, number> = {
    analyze: 0,
    analyzeListening: 0,
    generateListeningExamples: 0,
  };
  /** Most recent argument per method, so tests can assert what was sent to the "LLM". */
  readonly lastInput: {
    analyze?: string;
    analyzeListening?: string;
    generateListeningExamples?: ExampleGenerationRequest;
  } = {};
  /** Set/clear at any time to inject a failure for a method. */
  errors: Partial<Record<FakeTextMethod, Error>>;
  private readonly options: FakeTextProviderOptions;

  constructor(options: FakeTextProviderOptions = {}) {
    this.name = options.name ?? 'fake';
    this.errors = { ...options.errors };
    this.options = options;
  }

  async analyze(rawText: string): Promise<NewExtractedItem[]> {
    this.lastInput.analyze = rawText;
    this.enter('analyze');
    return structuredClone(this.options.analyzeResult ?? [DEFAULT_EXTRACTED_ITEM]);
  }

  async analyzeListening(formattedCuesText: string): Promise<NewListeningDifficulty[]> {
    this.lastInput.analyzeListening = formattedCuesText;
    this.enter('analyzeListening');
    return structuredClone(this.options.listeningResult ?? GOLDEN_PART2_ITEMS);
  }

  async generateListeningExamples(req: ExampleGenerationRequest): Promise<NewListeningExample[]> {
    this.lastInput.generateListeningExamples = req;
    this.enter('generateListeningExamples');
    const configured = this.options.examplesResult;
    const result =
      typeof configured === 'function'
        ? configured(req)
        : (configured ?? GOLDEN_B1_EXAMPLES_BY_CATEGORY[req.category]);
    return structuredClone(result);
  }

  private enter(method: FakeTextMethod): void {
    this.calls[method] += 1;
    const err = this.errors[method];
    if (err) throw err;
  }
}

// ---------------------------------------------------------------------------
// FakeTTSProvider
// ---------------------------------------------------------------------------

/**
 * Mirrors the `status: 429` property exposed by the Gemini/OpenAI SDK errors, which is what
 * rate-limit retry logic is expected to inspect.
 */
export class FakeRateLimitError extends Error {
  readonly status = 429;
  constructor(message = 'Fake provider rate limit (429)') {
    super(message);
    this.name = 'FakeRateLimitError';
  }
}

export type FakeTTSMethod = 'synthesize' | 'synthesizeAdvanced';

export interface FakeTTSProviderOptions {
  name?: string;
  model?: string;
  /** Number of initial calls (across both methods) that throw FakeRateLimitError. */
  rateLimitFailures?: number;
}

export class FakeTTSProvider implements TTSProvider {
  readonly name: string;
  readonly model: string;
  readonly calls: Record<FakeTTSMethod, number> = { synthesize: 0, synthesizeAdvanced: 0 };
  /** Remaining calls that will throw a 429; can be changed mid-test. */
  rateLimitFailuresRemaining: number;

  constructor(options: FakeTTSProviderOptions = {}) {
    this.name = options.name ?? 'fake';
    this.model = options.model ?? 'fake-tts-1';
    this.rateLimitFailuresRemaining = options.rateLimitFailures ?? 0;
  }

  async synthesize(text: string, voice: LegacyVoiceName): Promise<Buffer> {
    this.enter('synthesize');
    const accent: AccentCode = voice.toLowerCase() === 'british' ? 'uk' : 'us';
    return createDeterministicTestWav(`${this.name}:${accent}:${voice}:${text}`);
  }

  async synthesizeAdvanced(
    text: string,
    options: TTSSynthesisOptions
  ): Promise<TTSSynthesisOutput> {
    this.enter('synthesizeAdvanced');
    const accent = options.accent ?? 'us';
    const voice = options.voiceName ?? `fake-${accent}`;
    return {
      wavBuffer: createDeterministicTestWav(`${this.name}:${accent}:${voice}:${text}`),
      provider: this.name,
      model: this.model,
      voiceUsed: voice,
      accent,
      isApproximate: false,
      verificationStatus: 'instructed_unverified',
    };
  }

  private enter(method: FakeTTSMethod): void {
    this.calls[method] += 1;
    if (this.rateLimitFailuresRemaining > 0) {
      this.rateLimitFailuresRemaining -= 1;
      throw new FakeRateLimitError();
    }
  }
}

// ---------------------------------------------------------------------------
// Sample subtitles — cues match GOLDEN_PART2_ITEMS (index, timing, original_sentence).
// ---------------------------------------------------------------------------

export const SAMPLE_SRT = `12
00:01:14,200 --> 00:01:17,050
It's nothing. It's easy. It is in and out.

45
00:04:02,100 --> 00:04:04,500
Would you have come if he did?

78
00:08:19,000 --> 00:08:22,400
[muffled] ...maybe a good next step is to take your jacket off.

103
00:11:40,000 --> 00:11:43,100
Anybody could have waltzed in, that's all I'm saying.

130
00:14:05,800 --> 00:14:08,200
He knows him better than anybody else.

155
00:17:30,000 --> 00:17:33,000
It's going to involve you having to leave the house.

210
00:24:11,000 --> 00:24:14,500
It was signed like the Magma Cara in 1215.
`;

export const SAMPLE_VTT = `WEBVTT

12
00:01:14.200 --> 00:01:17.050
It's nothing. It's easy. It is in and out.

45
00:04:02.100 --> 00:04:04.500
Would you have come if he did?

78
00:08:19.000 --> 00:08:22.400
[muffled] ...maybe a good next step is to take your jacket off.

103
00:11:40.000 --> 00:11:43.100
Anybody could have waltzed in, that's all I'm saying.

130
00:14:05.800 --> 00:14:08.200
He knows him better than anybody else.

155
00:17:30.000 --> 00:17:33.000
It's going to involve you having to leave the house.

210
00:24:11.000 --> 00:24:14.500
It was signed like the Magma Cara in 1215.
`;
