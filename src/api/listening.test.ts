import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyzeSubtitleListening,
  clearTTSCache,
  fetchDifficultyExamples,
  fetchListeningDifficulties,
  fetchTTSCacheStats,
  ListeningApiError,
  regenerateDifficultyExamples,
  synthesizeSentenceAudio,
  updateDifficultyMastery,
  verifySentenceAudio,
} from './listening.js';

describe('src/api/listening.ts API client wrappers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches listening difficulties with query params and unpacks { data } envelope', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          subtitleId: 5,
          countsByCategory: {
            catenation: 1,
            assimilation: 2,
            elision: 0,
            weak_forms: 0,
            h_dropping: 0,
            contractions: 0,
            confusion: 0,
          },
          items: [],
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await fetchListeningDifficulties(5, {
      category: 'assimilation',
      includeMastered: false,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/listening/5?category=assimilation&includeMastered=false'
    );
    expect(res.subtitleId).toBe(5);
    expect(res.countsByCategory.assimilation).toBe(2);
  });

  it('parses X-TTS-* response headers on synthesizeSentenceAudio', async () => {
    const fakeWavBytes = new Uint8Array([82, 73, 70, 70]);
    const headers = new Headers({
      'Content-Type': 'audio/wav',
      'X-TTS-Cache': 'HIT',
      'X-TTS-Cache-Key': 'abc123def456',
      'X-TTS-Accent': 'nz',
      'X-TTS-Voice': 'Aoede',
      'X-TTS-Approximate': 'true',
      'X-TTS-Approximate-Reason': 'Prompt-steered NZ accent',
      'X-TTS-Verification': 'instructed_unverified',
      'X-TTS-Daily-Warning': 'false',
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers,
      blob: async () => new Blob([fakeWavBytes], { type: 'audio/wav' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await synthesizeSentenceAudio({
      text: 'Would you have come if he did?',
      accent: 'nz',
      category: 'assimilation',
      targetPhrase: 'Would you',
      simulatedPronunciation: 'Woul-dja',
    });

    expect(result.cacheHit).toBe(true);
    expect(result.cacheKey).toBe('abc123def456');
    expect(result.accent).toBe('nz');
    expect(result.voice).toBe('Aoede');
    expect(result.isApproximate).toBe(true);
    expect(result.approximateReason).toBe('Prompt-steered NZ accent');
    expect(result.verificationStatus).toBe('instructed_unverified');
    expect(result.dailyWarning).toBe(false);
    expect(result.audioBlob.size).toBe(4);
  });

  it('throws ListeningApiError with status and structured code when response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: 'TTS rate limit exceeded',
        code: 'RATE_LIMITED',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      synthesizeSentenceAudio({
        text: 'Hello',
        accent: 'uk',
      })
    ).rejects.toMatchObject({
      name: 'ListeningApiError',
      message: 'TTS rate limit exceeded',
      status: 429,
      code: 'RATE_LIMITED',
    } satisfies Partial<ListeningApiError>);
  });

  it('calls analyze, mastery, examples, verify, and cache endpoints with correct HTTP methods', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          subtitleId: 1,
          itemCount: 0,
          items: [],
          id: 10,
          isMastered: true,
          difficultyId: 10,
          examples: [],
          generatedNow: true,
          cacheKey: 'k1',
          verificationStatus: 'verified',
          verificationNote: 'ok',
          entryCount: 2,
          totalBytes: 216,
          maxBytes: 200000,
          todaySynthesizedCount: 2,
          dailyWarnLimit: 200,
          deletedFiles: 2,
          freedBytes: 216,
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await analyzeSubtitleListening(1, { force: true });
    await updateDifficultyMastery(10, true);
    await fetchDifficultyExamples(10, { autoGenerate: true });
    await regenerateDifficultyExamples(10);
    await verifySentenceAudio({
      cacheKey: 'k1',
      targetPhrase: 'would you',
      simulatedPronunciation: 'woul-dja',
    });
    await fetchTTSCacheStats();
    await clearTTSCache();

    expect(mockFetch).toHaveBeenCalledTimes(7);
  });
});
