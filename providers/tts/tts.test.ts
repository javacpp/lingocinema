import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLiteDatabase } from '../../db/sqlite.js';
import { createApp } from '../../server.js';
import { createDeterministicTestWav, FakeTextProvider, FakeTTSProvider } from '../../src/test/fakes.js';
import {
  PLAYBACK_SPEED_RATES,
  type AccentCode,
  type PlaybackSpeedPreset,
} from '../../src/types/listening.js';
import { GeminiTTSProvider } from './gemini.js';
import { OpenAITTSProvider } from './openai.js';
import { PiperTTSProvider } from './piper.js';

const mockGeminiGenerateContent = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = {
        generateContent: mockGeminiGenerateContent,
      };
    },
  };
});

const mockSpawn = vi.fn();

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (...args: unknown[]) => mockSpawn(...args),
  };
});

describe('GeminiTTSProvider', () => {
  beforeEach(() => {
    mockGeminiGenerateContent.mockReset();
  });

  it('normalizes legacy capitalized "British" and "American" voices in synthesize()', async () => {
    const pcmBytes = Buffer.from('test-pcm-audio-data');
    mockGeminiGenerateContent.mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: pcmBytes.toString('base64') } }],
          },
        },
      ],
    });

    const provider = new GeminiTTSProvider('test-key', 'gemini-3.1-flash-tts-preview');

    const ukWav = await provider.synthesize('Would you mind?', 'British');
    expect(ukWav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    const ukCall = mockGeminiGenerateContent.mock.calls[0][0] as {
      config: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } };
    };
    expect(ukCall.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');

    await provider.synthesize('Would you mind?', 'American');
    const usCall = mockGeminiGenerateContent.mock.calls[1][0] as {
      config: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } };
    };
    expect(usCall.config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Zephyr');
  });

  it('synthesizeAdvanced uses resolved 5-accent voices, embeds director instructions, and flags nz as approximate', async () => {
    const pcmBytes = Buffer.from('kiwi-pcm-audio');
    mockGeminiGenerateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { data: pcmBytes.toString('base64') } }],
          },
        },
      ],
    });

    const provider = new GeminiTTSProvider('test-key', 'gemini-3.1-flash-tts-preview');
    const out = await provider.synthesizeAdvanced('Would you like coffee?', {
      accent: 'nz',
      instructions: 'Speak in a natural New Zealand English (en-NZ) accent.',
      phoneticCategory: 'assimilation',
      targetPhrase: 'Would you',
      simulatedPronunciation: 'woul-dja',
    });

    expect(out.voiceUsed).toBe('Aoede');
    expect(out.accent).toBe('nz');
    expect(out.isApproximate).toBe(true);
    expect(out.verificationStatus).toBe('instructed_unverified');
    expect(out.wavBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');

    const callArg = mockGeminiGenerateContent.mock.calls[0][0] as {
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(callArg.contents[0].parts[0].text).toContain('New Zealand English');
    expect(callArg.contents[0].parts[0].text).toContain('Would you like coffee?');
  });
});

describe('OpenAITTSProvider', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes legacy capitalized "British" and "American" voices in synthesize()', async () => {
    const fakeWav = createDeterministicTestWav('openai-legacy');
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        fakeWav.buffer.slice(fakeWav.byteOffset, fakeWav.byteOffset + fakeWav.byteLength),
    });

    const provider = new OpenAITTSProvider('sk-test', 'https://api.openai.com', 'tts-1', 'alloy');

    await provider.synthesize('Hello there', 'British');
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      voice: string;
    };
    expect(firstBody.voice).toBe('fable');

    await provider.synthesize('Hello there', 'American');
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body) as {
      voice: string;
    };
    expect(secondBody.voice).toBe('alloy');
  });

  it('synthesizeAdvanced sends instructions for gpt-4o-mini-tts and omits instructions for tts-1', async () => {
    const fakeWav = createDeterministicTestWav('openai-adv');
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        fakeWav.buffer.slice(fakeWav.byteOffset, fakeWav.byteOffset + fakeWav.byteLength),
    });

    const miniProvider = new OpenAITTSProvider(
      'sk-test',
      'https://api.openai.com',
      'gpt-4o-mini-tts',
      'alloy'
    );
    const auOut = await miniProvider.synthesizeAdvanced('Good on you', {
      accent: 'au',
      instructions: 'Speak in Australian English.',
    });

    expect(auOut.voiceUsed).toBe('coral');
    expect(auOut.isApproximate).toBe(false);
    expect(auOut.verificationStatus).toBe('instructed_unverified');
    const miniBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      instructions?: string;
      voice: string;
    };
    expect(miniBody.instructions).toBe('Speak in Australian English.');

    const tts1Provider = new OpenAITTSProvider(
      'sk-test',
      'https://api.openai.com',
      'tts-1',
      'alloy'
    );
    const tts1Out = await tts1Provider.synthesizeAdvanced('Good on you', {
      accent: 'au',
      instructions: 'Speak in Australian English.',
    });

    expect(tts1Out.voiceUsed).toBe('nova');
    expect(tts1Out.isApproximate).toBe(true);
    expect(tts1Out.verificationStatus).toBe('orthographic_approx');
    const tts1Body = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body) as {
      instructions?: string;
    };
    expect(tts1Body.instructions).toBeUndefined();
  });

  it('synthesizeAdvanced retries once without instructions when custom endpoint rejects instructions with HTTP 400', async () => {
    const fakeWav = createDeterministicTestWav('openai-fallback');
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Unknown parameter: instructions',
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () =>
          fakeWav.buffer.slice(fakeWav.byteOffset, fakeWav.byteOffset + fakeWav.byteLength),
      });

    const provider = new OpenAITTSProvider(
      'sk-test',
      'https://custom.endpoint.local',
      'gpt-4o-mini-tts',
      'alloy'
    );
    const out = await provider.synthesizeAdvanced('Would you mind?', {
      accent: 'uk',
      instructions: 'Speak in UK English.',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body) as {
      instructions?: string;
    };
    expect(retryBody.instructions).toBeUndefined();
    expect(out.verificationStatus).toBe('orthographic_approx');
  });
});

describe('PiperTTSProvider', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('synthesizeAdvanced resolves per-accent .onnx model paths, passes --length_scale when speedMultiplier is set, and marks missing locale models as approximate', async () => {
    mockSpawn.mockImplementation((_bin: string, args: string[]) => {
      const outIdx = args.indexOf('--output_file');
      const outFile = outIdx !== -1 ? args[outIdx + 1] : '';
      const proc = new EventEmitter() as EventEmitter & {
        stdin: { write: (chunk: string) => void; end: () => void };
        stderr: EventEmitter;
      };
      proc.stderr = new EventEmitter();
      proc.stdin = {
        write: () => {},
        end: () => {
          if (outFile) {
            fs.writeFileSync(outFile, createDeterministicTestWav(`piper:${args.join(' ')}`));
          }
          setImmediate(() => proc.emit('close', 0));
        },
      };
      return proc;
    });

    const provider = new PiperTTSProvider('piper', 'en_GB-alan-medium.onnx', {
      us: 'en_US-amy-medium.onnx',
    });

    // 1. US accent has explicit model -> isApproximate: false
    const usOut = await provider.synthesizeAdvanced('Going to go', {
      accent: 'us',
      speedMultiplier: 1.22,
    });
    expect(usOut.voiceUsed).toBe('en_US-amy-medium.onnx');
    expect(usOut.isApproximate).toBe(false);
    const usArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(usArgs).toContain('--length_scale');

    // 2. AU accent has no explicit model -> falls back to default en_GB-alan-medium.onnx with isApproximate: true
    const auOut = await provider.synthesizeAdvanced('Going to go', {
      accent: 'au',
    });
    expect(auOut.voiceUsed).toBe('en_GB-alan-medium.onnx');
    expect(auOut.isApproximate).toBe(true);
    expect(auOut.verificationStatus).toBe('orthographic_approx');
  });
});

describe('5 Accents × 3 Speeds End-to-End Matrix Test (POST /api/tts)', () => {
  const ACCENTS: AccentCode[] = ['uk', 'us', 'au', 'nz', 'in'];
  const SPEEDS: PlaybackSpeedPreset[] = ['slow', 'normal', 'fast'];

  it('verifies all 15 (5 accents × 3 speeds) combinations return valid RIFF WAV, accurate X-TTS-* headers, and share 1 cached WAV per accent across client playback speeds', async () => {
    const db = new SQLiteDatabase(':memory:');
    const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-matrix-'));
    const fakeText = new FakeTextProvider();
    const fakeTTS = new FakeTTSProvider({ name: 'gemini', model: 'gemini-3.1-flash-tts-preview' });

    const app = createApp({
      db,
      getTextProvider: () => fakeText,
      getTTSProvider: () => fakeTTS,
      config: {
        ttsProvider: 'gemini',
        geminiTtsModel: 'gemini-3.1-flash-tts-preview',
      },
      cacheDir: tmpCacheDir,
    });

    const expectedVoices: Record<AccentCode, string> = {
      uk: 'Kore',
      us: 'Zephyr',
      au: 'Puck',
      nz: 'Aoede',
      in: 'Charon',
    };

    try {
      for (const accent of ACCENTS) {
        let firstCacheKeyForAccent = '';

        for (let sIdx = 0; sIdx < SPEEDS.length; sIdx++) {
          const speedPreset = SPEEDS[sIdx];
          const clientPlaybackRate = PLAYBACK_SPEED_RATES[speedPreset];
          expect(clientPlaybackRate).toBeGreaterThan(0);

          const res = await request(app)
            .post('/api/tts')
            .send({
              text: '[muffled] Would you have come if he did?',
              accent,
              speedMode: 'normal', // Client-side playbackRate (0.78x / 1.0x / 1.22x) shares 'normal' server synthesis
              category: 'assimilation',
              targetPhrase: 'Would you',
              simulatedPronunciation: 'Woul-dja',
            })
            .buffer(true)
            .parse((resStream, callback) => {
              const chunks: Buffer[] = [];
              resStream.on('data', (chunk: Buffer) => chunks.push(chunk));
              resStream.on('end', () => callback(null, Buffer.concat(chunks)));
            });

          expect(res.status).toBe(200);
          expect(res.headers['content-type']).toMatch(/audio\/wav/);
          expect(res.headers['x-tts-accent']).toBe(accent);
          expect(res.headers['x-tts-voice']).toBe(expectedVoices[accent]);
          expect(res.headers['x-tts-approximate']).toBe(accent === 'nz' ? 'true' : 'false');
          expect(res.headers['x-tts-verification']).toBe('instructed_unverified');

          const wavBuf = res.body as Buffer;
          expect(wavBuf.subarray(0, 4).toString('ascii')).toBe('RIFF');
          expect(wavBuf.subarray(8, 12).toString('ascii')).toBe('WAVE');

          if (sIdx === 0) {
            expect(res.headers['x-tts-cache']).toBe('MISS');
            firstCacheKeyForAccent = res.headers['x-tts-cache-key'];
            expect(firstCacheKeyForAccent).toMatch(/^[a-f0-9]{64}$/);
          } else {
            // 2nd and 3rd speeds ('normal' 1.0x and 'fast' 1.22x) must HIT the exact same cache entry
            expect(res.headers['x-tts-cache']).toBe('HIT');
            expect(res.headers['x-tts-cache-key']).toBe(firstCacheKeyForAccent);
          }
        }
      }

      // 5 accents × 3 speeds = 15 requests, but only 5 provider synthesis calls!
      expect(fakeTTS.calls.synthesizeAdvanced).toBe(5);
    } finally {
      db.close();
      fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    }
  });
});
