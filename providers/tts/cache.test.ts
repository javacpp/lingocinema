import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLiteDatabase } from '../../db/sqlite.js';
import { FakeRateLimitError, FakeTTSProvider } from '../../src/test/fakes.js';
import { AudioCacheService, computeTTSCacheKey } from './cache.js';

describe('AudioCacheService & computeTTSCacheKey', () => {
  let db: SQLiteDatabase;
  let tempCacheDir: string;

  beforeEach(() => {
    db = new SQLiteDatabase(':memory:');
    tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingocinema-tts-cache-test-'));
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
    fs.rmSync(tempCacheDir, { recursive: true, force: true });
  });

  it('computes deterministic SHA-256 cache keys and isolates by accent, provider, model, voice, speedMode, and instructions', () => {
    const baseKey = computeTTSCacheKey({
      provider: 'gemini',
      model: 'gemini-3.1-flash-tts-preview',
      voice: 'Kore',
      accent: 'uk',
      speedMode: 'normal',
      category: 'assimilation',
      normalizedTtsText: 'would you have come if he did?',
      instructions: 'Speak in a British accent.',
    });

    expect(baseKey).toMatch(/^[a-f0-9]{64}$/);

    // Same input -> identical key
    const sameKey = computeTTSCacheKey({
      provider: 'gemini',
      model: 'gemini-3.1-flash-tts-preview',
      voice: 'Kore',
      accent: 'uk',
      speedMode: 'normal',
      category: 'assimilation',
      normalizedTtsText: 'would you have come if he did?',
      instructions: 'Speak in a British accent.',
    });
    expect(sameKey).toBe(baseKey);

    // Changing accent, provider, model, voice, or speedMode produces distinct keys
    expect(
      computeTTSCacheKey({
        provider: 'gemini',
        model: 'gemini-3.1-flash-tts-preview',
        voice: 'Kore',
        accent: 'us',
        speedMode: 'normal',
        category: 'assimilation',
        normalizedTtsText: 'would you have come if he did?',
        instructions: 'Speak in a British accent.',
      })
    ).not.toBe(baseKey);

    expect(
      computeTTSCacheKey({
        provider: 'openai',
        model: 'gemini-3.1-flash-tts-preview',
        voice: 'Kore',
        accent: 'uk',
        speedMode: 'normal',
        category: 'assimilation',
        normalizedTtsText: 'would you have come if he did?',
        instructions: 'Speak in a British accent.',
      })
    ).not.toBe(baseKey);

    expect(
      computeTTSCacheKey({
        provider: 'gemini',
        model: 'gpt-4o-mini-tts',
        voice: 'Kore',
        accent: 'uk',
        speedMode: 'normal',
        category: 'assimilation',
        normalizedTtsText: 'would you have come if he did?',
        instructions: 'Speak in a British accent.',
      })
    ).not.toBe(baseKey);

    expect(
      computeTTSCacheKey({
        provider: 'gemini',
        model: 'gemini-3.1-flash-tts-preview',
        voice: 'Zephyr',
        accent: 'uk',
        speedMode: 'normal',
        category: 'assimilation',
        normalizedTtsText: 'would you have come if he did?',
        instructions: 'Speak in a British accent.',
      })
    ).not.toBe(baseKey);
  });

  it('synthesizes on cache miss, writes WAV to disk + SQLite metadata, increments daily usage, and serves subsequent hits from disk', async () => {
    const fakeProvider = new FakeTTSProvider({
      name: 'gemini',
      model: 'gemini-3.1-flash-tts-preview',
    });
    const cache = new AudioCacheService({
      db,
      cacheDir: tempCacheDir,
      maxCacheBytes: 10 * 1024 * 1024,
      dailyWarnLimit: 5,
    });

    const first = await cache.getOrSynthesizeAudio({
      provider: fakeProvider,
      spokenText: 'Would you have come if he did?',
      normalizedTextForCache: 'would you have come if he did?',
      accent: 'uk',
      voice: 'Kore',
      model: 'gemini-3.1-flash-tts-preview',
      speedMode: 'normal',
      category: 'assimilation',
      instructions: 'Speak in UK accent.',
      isApproximate: false,
      verificationStatus: 'instructed_unverified',
    });

    expect(first.cacheHit).toBe(false);
    expect(first.wavBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(fakeProvider.calls.synthesizeAdvanced).toBe(1);

    // Verify SQLite metadata row and disk file exist
    const dbEntry = db.getTTSCacheEntry(first.cacheKey);
    expect(dbEntry).toBeDefined();
    expect(dbEntry?.byte_size).toBe(first.wavBuffer.byteLength);
    expect(dbEntry?.accent).toBe('uk');
    expect(dbEntry?.voice).toBe('Kore');
    expect(fs.existsSync(path.join(tempCacheDir, dbEntry!.file_path))).toBe(true);

    // Daily usage incremented once
    const statsAfterMiss = cache.getCacheStats();
    expect(statsAfterMiss.entryCount).toBe(1);
    expect(statsAfterMiss.totalBytes).toBe(first.wavBuffer.byteLength);
    expect(statsAfterMiss.todaySynthesizedCount).toBe(1);

    // Second call with identical parameters -> Cache HIT without calling provider
    const second = await cache.getOrSynthesizeAudio({
      provider: fakeProvider,
      spokenText: 'Would you have come if he did?',
      normalizedTextForCache: 'would you have come if he did?',
      accent: 'uk',
      voice: 'Kore',
      model: 'gemini-3.1-flash-tts-preview',
      speedMode: 'normal',
      category: 'assimilation',
      instructions: 'Speak in UK accent.',
      isApproximate: false,
      verificationStatus: 'instructed_unverified',
    });

    expect(second.cacheHit).toBe(true);
    expect(second.cacheKey).toBe(first.cacheKey);
    expect(second.wavBuffer.equals(first.wavBuffer)).toBe(true);
    expect(fakeProvider.calls.synthesizeAdvanced).toBe(1);
    expect(cache.getCacheStats().todaySynthesizedCount).toBe(1);
  });

  it('evicts least-recently-used entries from both disk and SQLite when maxCacheBytes is exceeded', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T00:00:00.000Z'));

    const fakeProvider = new FakeTTSProvider({
      name: 'gemini',
      model: 'gemini-3.1-flash-tts-preview',
    });
    // Each FakeTTSProvider WAV is 44 header + 64 payload = 108 bytes.
    // Setting maxCacheBytes = 250 allows at most 2 entries (216 bytes) and forces eviction on the 3rd (324 bytes).
    const cache = new AudioCacheService({
      db,
      cacheDir: tempCacheDir,
      maxCacheBytes: 250,
    });

    const r1 = await cache.getOrSynthesizeAudio({
      provider: fakeProvider,
      spokenText: 'Sentence one',
      normalizedTextForCache: 'sentence one',
      accent: 'uk',
      voice: 'Kore',
      model: 'gemini-3.1-flash-tts-preview',
    });

    vi.advanceTimersByTime(50);

    const r2 = await cache.getOrSynthesizeAudio({
      provider: fakeProvider,
      spokenText: 'Sentence two',
      normalizedTextForCache: 'sentence two',
      accent: 'uk',
      voice: 'Kore',
      model: 'gemini-3.1-flash-tts-preview',
    });

    vi.advanceTimersByTime(50);

    // Touch r1 via a cache hit so r2 becomes the least-recently-used entry
    const r1Hit = await cache.getOrSynthesizeAudio({
      provider: fakeProvider,
      spokenText: 'Sentence one',
      normalizedTextForCache: 'sentence one',
      accent: 'uk',
      voice: 'Kore',
      model: 'gemini-3.1-flash-tts-preview',
    });
    expect(r1Hit.cacheHit).toBe(true);

    const r2EntryBefore = db.getTTSCacheEntry(r2.cacheKey)!;
    const r2DiskPath = path.join(tempCacheDir, r2EntryBefore.file_path);
    expect(fs.existsSync(r2DiskPath)).toBe(true);

    vi.advanceTimersByTime(50);

    // Adding r3 exceeds 250 bytes -> should evict r2 (oldest last_accessed_at) and keep r1 + r3
    const r3 = await cache.getOrSynthesizeAudio({
      provider: fakeProvider,
      spokenText: 'Sentence three',
      normalizedTextForCache: 'sentence three',
      accent: 'uk',
      voice: 'Kore',
      model: 'gemini-3.1-flash-tts-preview',
    });

    expect(db.getTTSCacheEntry(r2.cacheKey)).toBeUndefined();
    expect(fs.existsSync(r2DiskPath)).toBe(false);

    expect(db.getTTSCacheEntry(r1.cacheKey)).toBeDefined();
    expect(db.getTTSCacheEntry(r3.cacheKey)).toBeDefined();
    expect(cache.getCacheStats().totalBytes).toBeLessThanOrEqual(250);
  });

  it('retries once with backoff when the TTS provider throws HTTP 429 Rate Limit on attempt 1', async () => {
    const fakeProvider = new FakeTTSProvider({
      name: 'gemini',
      model: 'gemini-3.1-flash-tts-preview',
      rateLimitFailures: 1,
    });
    const cache = new AudioCacheService({
      db,
      cacheDir: tempCacheDir,
      retryBaseDelayMs: 5,
    });

    const result = await cache.getOrSynthesizeAudio({
      provider: fakeProvider,
      spokenText: 'It is in and out.',
      normalizedTextForCache: 'it is in and out.',
      accent: 'us',
      voice: 'Zephyr',
      model: 'gemini-3.1-flash-tts-preview',
    });

    expect(result.cacheHit).toBe(false);
    expect(fakeProvider.calls.synthesizeAdvanced).toBe(2);
    expect(result.wavBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
  });

  it('propagates 429 error when rate limit persists past the retry limit', async () => {
    const fakeProvider = new FakeTTSProvider({
      name: 'gemini',
      model: 'gemini-3.1-flash-tts-preview',
      rateLimitFailures: 3,
    });
    const cache = new AudioCacheService({
      db,
      cacheDir: tempCacheDir,
      retryBaseDelayMs: 5,
    });

    await expect(
      cache.getOrSynthesizeAudio({
        provider: fakeProvider,
        spokenText: 'Persistent rate limit.',
        normalizedTextForCache: 'persistent rate limit.',
        accent: 'us',
        voice: 'Zephyr',
        model: 'gemini-3.1-flash-tts-preview',
      })
    ).rejects.toBeInstanceOf(FakeRateLimitError);

    expect(fakeProvider.calls.synthesizeAdvanced).toBe(2);
  });

  it('clears all cached WAV files from disk and removes all rows from SQLite on clearCache()', async () => {
    const fakeProvider = new FakeTTSProvider({ name: 'openai', model: 'gpt-4o-mini-tts' });
    const cache = new AudioCacheService({
      db,
      cacheDir: tempCacheDir,
    });

    const a = await cache.getOrSynthesizeAudio({
      provider: fakeProvider,
      spokenText: 'Clip A',
      normalizedTextForCache: 'clip a',
      accent: 'au',
      voice: 'coral',
      model: 'gpt-4o-mini-tts',
    });
    const b = await cache.getOrSynthesizeAudio({
      provider: fakeProvider,
      spokenText: 'Clip B',
      normalizedTextForCache: 'clip b',
      accent: 'nz',
      voice: 'sage',
      model: 'gpt-4o-mini-tts',
    });

    expect(cache.getCacheStats().entryCount).toBe(2);

    const cleared = await cache.clearCache();
    expect(cleared.deletedFiles).toBe(2);
    expect(cleared.freedBytes).toBe(a.wavBuffer.byteLength + b.wavBuffer.byteLength);
    expect(cache.getCacheStats().entryCount).toBe(0);
    expect(cache.getCacheStats().totalBytes).toBe(0);
    expect(db.getTTSCacheEntry(a.cacheKey)).toBeUndefined();
    expect(db.getTTSCacheEntry(b.cacheKey)).toBeUndefined();
  });
});
