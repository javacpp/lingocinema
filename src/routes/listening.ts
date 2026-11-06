import { Router, type Request, type Response } from 'express';
import type { IDatabase } from '../../db/interface.js';
import type { TextProvider } from '../../providers/text/interface.js';
import { AudioCacheService, isRateLimitError } from '../../providers/tts/cache.js';
import type { TTSProvider } from '../../providers/tts/interface.js';
import { prepareTTSSynthesisPayload } from '../../providers/tts/preprocessor.js';
import {
  normalizeAccentInput,
  resolveAccentVoice,
  type TTSRegistryConfig,
} from '../../providers/tts/registry.js';
import {
  validateExampleBatch,
  validateListeningExtractResponse,
} from '../lib/listeningValidator.js';
import {
  formatCuesForListeningPrompt,
  parseSubtitleCues,
  resolveCueLink,
} from '../lib/subtitleCueParser.js';
import type {
  ListeningDifficultyRecord,
  ListeningExampleRecord,
  NewListeningDifficulty,
  PhoneticCategory,
} from '../types/listening.js';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'SUBTITLE_NOT_FOUND'
  | 'LLM_PARSE_FAILED'
  | 'EXAMPLE_VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'OFFLINE_MODEL_MISSING'
  | 'PROVIDER_ERROR';

export interface ListeningRouterDependencies {
  db: IDatabase;
  getTextProvider: () => TextProvider | null;
  getTTSProvider: () => TTSProvider | null;
  getConfig: () => TTSRegistryConfig;
  audioCache: AudioCacheService;
}

const VALID_CATEGORIES = new Set<PhoneticCategory>([
  'catenation',
  'assimilation',
  'elision',
  'weak_forms',
  'h_dropping',
  'contractions',
  'confusion',
]);

const VALID_SPEED_MODES = new Set<'normal' | 'slow_native' | 'fast_native'>([
  'normal',
  'slow_native',
  'fast_native',
]);

const RECOGNIZED_ACCENT_INPUTS = new Set<string>([
  'uk',
  'gb',
  'british',
  'en-gb',
  'en_gb',
  'us',
  'american',
  'en-us',
  'en_us',
  'au',
  'australian',
  'en-au',
  'en_au',
  'nz',
  'new zealand',
  'kiwi',
  'en-nz',
  'en_nz',
  'in',
  'indian',
  'en-in',
  'en_in',
]);

function parsePositiveId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function sendError(res: Response, status: number, error: string, code: ApiErrorCode): void {
  res.status(status).json({ error, code });
}

function isOfflineModelError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { code?: unknown; message?: unknown };
  if (candidate.code === 'ENOENT') return true;
  if (
    typeof candidate.message === 'string' &&
    /PIPER_MODEL_PATH|piper|onnx|ENOENT/i.test(candidate.message)
  ) {
    return true;
  }
  return false;
}

function computeCountsByCategory(
  items: ListeningDifficultyRecord[]
): Record<PhoneticCategory, number> {
  const counts: Record<PhoneticCategory, number> = {
    catenation: 0,
    assimilation: 0,
    elision: 0,
    weak_forms: 0,
    h_dropping: 0,
    contractions: 0,
    confusion: 0,
  };
  for (const item of items) {
    if (item.category in counts) {
      counts[item.category] += 1;
    }
  }
  return counts;
}

export function createListeningRouter(deps: ListeningRouterDependencies): Router {
  const router = Router();
  const { db, getTextProvider, getTTSProvider, getConfig, audioCache } = deps;

  async function generateAndPersistExamples(
    difficultyId: number,
    difficulty: ListeningDifficultyRecord
  ): Promise<
    | { ok: true; examples: ListeningExampleRecord[] }
    | { ok: false; status: number; error: string; code: ApiErrorCode }
  > {
    const textProvider = getTextProvider();
    if (!textProvider || typeof textProvider.generateListeningExamples !== 'function') {
      return {
        ok: false,
        status: 500,
        error: 'Active text provider does not support example generation',
        code: 'PROVIDER_ERROR',
      };
    }

    const baseReq = {
      category: difficulty.category,
      phrase: difficulty.phrase,
      spokenPhrase: difficulty.spoken_phrase,
      simulatedPronunciation: difficulty.simulated_pronunciation,
      originalSentence: difficulty.original_sentence,
      explanationZh: difficulty.explanation_zh,
      explanationEn: difficulty.explanation_en,
    };

    const firstRaw = await textProvider.generateListeningExamples(baseReq);
    let validation = validateExampleBatch(firstRaw, difficulty);

    if (!validation.valid) {
      const retryRaw = await textProvider.generateListeningExamples({
        ...baseReq,
        validationFeedback: validation.feedback,
      });
      const retryValidation = validateExampleBatch(retryRaw, difficulty);
      if (retryValidation.items.length >= validation.items.length) {
        validation = retryValidation;
      }
    }

    if (validation.items.length === 0) {
      return {
        ok: false,
        status: 422,
        error: 'Generated examples failed B1 and phonetic phenomenon validation',
        code: 'EXAMPLE_VALIDATION_FAILED',
      };
    }

    const saved = db.replaceListeningExamples(difficultyId, validation.items);
    return { ok: true, examples: saved };
  }

  // 1. GET /api/listening/:subtitleId
  router.get('/api/listening/:subtitleId', (req: Request, res: Response) => {
    try {
      const subtitleId = parsePositiveId(req.params.subtitleId);
      if (subtitleId === null) {
        sendError(res, 400, 'Valid positive integer subtitleId is required', 'VALIDATION_ERROR');
        return;
      }

      const categoryParam =
        typeof req.query.category === 'string'
          ? req.query.category.trim().toLowerCase()
          : undefined;
      if (categoryParam && !VALID_CATEGORIES.has(categoryParam as PhoneticCategory)) {
        sendError(res, 400, `Invalid phonetic category: ${categoryParam}`, 'VALIDATION_ERROR');
        return;
      }

      const subtitle = db.getSubtitleById(subtitleId);
      if (!subtitle) {
        sendError(res, 404, 'Subtitle not found', 'SUBTITLE_NOT_FOUND');
        return;
      }

      const includeMastered = req.query.includeMastered !== 'false';
      const allItemsForCounts = db.getListeningDifficultiesBySubtitleId(subtitleId, {
        includeMastered,
      });
      const countsByCategory = computeCountsByCategory(allItemsForCounts);

      const items = categoryParam
        ? allItemsForCounts.filter((i) => i.category === (categoryParam as PhoneticCategory))
        : allItemsForCounts;

      res.json({
        data: {
          subtitleId,
          countsByCategory,
          items,
        },
      });
    } catch (err) {
      console.error('[listening] GET /api/listening/:subtitleId failed:', err);
      sendError(res, 500, 'Failed to fetch listening difficulties', 'PROVIDER_ERROR');
    }
  });

  // 2. POST /api/listening/:subtitleId/analyze
  router.post('/api/listening/:subtitleId/analyze', async (req: Request, res: Response) => {
    try {
      const subtitleId = parsePositiveId(req.params.subtitleId);
      if (subtitleId === null) {
        sendError(res, 400, 'Valid positive integer subtitleId is required', 'VALIDATION_ERROR');
        return;
      }

      const subtitle = db.getSubtitleById(subtitleId);
      if (!subtitle) {
        sendError(res, 404, 'Subtitle not found', 'SUBTITLE_NOT_FOUND');
        return;
      }

      const body = (req.body ?? {}) as { force?: unknown };
      if (body.force === false) {
        const existing = db.getListeningDifficultiesBySubtitleId(subtitleId);
        if (existing.length > 0) {
          res.json({
            data: {
              subtitleId,
              itemCount: existing.length,
              items: existing,
            },
          });
          return;
        }
      }

      const textProvider = getTextProvider();
      if (!textProvider || typeof textProvider.analyzeListening !== 'function') {
        sendError(
          res,
          500,
          'Active text provider does not support listening analysis',
          'PROVIDER_ERROR'
        );
        return;
      }

      const cues = parseSubtitleCues(subtitle.content);
      const formattedPromptText = formatCuesForListeningPrompt(cues);

      const rawExtracted = await textProvider.analyzeListening(formattedPromptText);
      const validated = validateListeningExtractResponse(rawExtracted);

      const resolvedItems: NewListeningDifficulty[] = validated.map((item) => {
        const resolvedCue = resolveCueLink(cues, item.cue_index, item.original_sentence);
        return {
          ...item,
          cue_index: resolvedCue.cueIndex ?? item.cue_index,
          cue_start_time: resolvedCue.startTime ?? item.cue_start_time,
          cue_end_time: resolvedCue.endTime ?? item.cue_end_time,
        };
      });

      const persisted = db.replaceListeningDifficulties(subtitleId, resolvedItems);
      res.json({
        data: {
          subtitleId,
          itemCount: persisted.length,
          items: persisted,
        },
      });
    } catch (err) {
      console.error('[listening] POST /api/listening/:subtitleId/analyze failed:', err);
      if (isRateLimitError(err)) {
        sendError(
          res,
          429,
          'Rate limit exceeded while analyzing listening difficulties',
          'RATE_LIMITED'
        );
        return;
      }
      if (err instanceof Error && /unparseable|JSON/i.test(err.message)) {
        sendError(res, 500, 'AI returned unparseable response', 'LLM_PARSE_FAILED');
        return;
      }
      sendError(res, 500, 'Failed to analyze listening difficulties', 'PROVIDER_ERROR');
    }
  });

  // 3. PATCH /api/listening/item/:id/mastery
  router.patch('/api/listening/item/:id/mastery', (req: Request, res: Response) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (id === null) {
        sendError(res, 400, 'Valid positive integer item id is required', 'VALIDATION_ERROR');
        return;
      }

      const body = (req.body ?? {}) as { isMastered?: unknown };
      if (typeof body.isMastered !== 'boolean') {
        sendError(res, 400, 'isMastered boolean is required', 'VALIDATION_ERROR');
        return;
      }

      const updated = db.updateListeningDifficultyMastery(id, body.isMastered);
      if (!updated) {
        sendError(res, 404, 'Listening difficulty item not found', 'SUBTITLE_NOT_FOUND');
        return;
      }

      res.json({
        data: {
          id,
          isMastered: body.isMastered,
        },
      });
    } catch (err) {
      console.error('[listening] PATCH /api/listening/item/:id/mastery failed:', err);
      sendError(res, 500, 'Failed to update mastery status', 'PROVIDER_ERROR');
    }
  });

  // 4. GET /api/listening/item/:id/examples
  router.get('/api/listening/item/:id/examples', async (req: Request, res: Response) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (id === null) {
        sendError(res, 400, 'Valid positive integer item id is required', 'VALIDATION_ERROR');
        return;
      }

      const difficulty = db.getListeningDifficultyById(id);
      if (!difficulty) {
        sendError(res, 404, 'Listening difficulty item not found', 'SUBTITLE_NOT_FOUND');
        return;
      }

      const existing = db.getListeningExamplesByDifficultyId(id);
      const autoGenerate = req.query.autoGenerate !== 'false';

      if (existing.length > 0 || !autoGenerate) {
        res.json({
          data: {
            difficultyId: id,
            examples: existing,
            generatedNow: false,
          },
        });
        return;
      }

      const outcome = await generateAndPersistExamples(id, difficulty);
      if (outcome.ok === false) {
        sendError(res, outcome.status, outcome.error, outcome.code);
        return;
      }

      res.json({
        data: {
          difficultyId: id,
          examples: outcome.examples,
          generatedNow: true,
        },
      });
    } catch (err) {
      console.error('[listening] GET /api/listening/item/:id/examples failed:', err);
      if (isRateLimitError(err)) {
        sendError(res, 429, 'Rate limit exceeded while generating examples', 'RATE_LIMITED');
        return;
      }
      sendError(res, 500, 'Failed to fetch or generate examples', 'PROVIDER_ERROR');
    }
  });

  // 5. POST /api/listening/item/:id/examples/regenerate
  router.post(
    '/api/listening/item/:id/examples/regenerate',
    async (req: Request, res: Response) => {
      try {
        const id = parsePositiveId(req.params.id);
        if (id === null) {
          sendError(res, 400, 'Valid positive integer item id is required', 'VALIDATION_ERROR');
          return;
        }

        const difficulty = db.getListeningDifficultyById(id);
        if (!difficulty) {
          sendError(res, 404, 'Listening difficulty item not found', 'SUBTITLE_NOT_FOUND');
          return;
        }

        const outcome = await generateAndPersistExamples(id, difficulty);
        if (outcome.ok === false) {
          sendError(res, outcome.status, outcome.error, outcome.code);
          return;
        }

        res.json({
          data: {
            difficultyId: id,
            examples: outcome.examples,
          },
        });
      } catch (err) {
        console.error('[listening] POST /api/listening/item/:id/examples/regenerate failed:', err);
        if (isRateLimitError(err)) {
          sendError(res, 429, 'Rate limit exceeded while regenerating examples', 'RATE_LIMITED');
          return;
        }
        sendError(res, 500, 'Failed to regenerate examples', 'PROVIDER_ERROR');
      }
    }
  );

  // 6. POST /api/tts (Backwards-compatible + 5-accent cached synthesis)
  router.post('/api/tts', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        text?: unknown;
        voice?: unknown;
        accent?: unknown;
        speedMode?: unknown;
        category?: unknown;
        targetPhrase?: unknown;
        simulatedPronunciation?: unknown;
      };

      if (typeof body.text !== 'string' || !body.text.trim()) {
        sendError(res, 400, 'text is required', 'VALIDATION_ERROR');
        return;
      }

      if (body.accent !== undefined && body.accent !== null) {
        if (
          typeof body.accent !== 'string' ||
          !RECOGNIZED_ACCENT_INPUTS.has(body.accent.trim().toLowerCase())
        ) {
          sendError(res, 400, 'Invalid accent code', 'VALIDATION_ERROR');
          return;
        }
      }

      let speedMode: 'normal' | 'slow_native' | 'fast_native' = 'normal';
      if (body.speedMode !== undefined && body.speedMode !== null) {
        if (
          typeof body.speedMode !== 'string' ||
          !VALID_SPEED_MODES.has(body.speedMode as 'normal' | 'slow_native' | 'fast_native')
        ) {
          sendError(res, 400, 'Invalid speedMode', 'VALIDATION_ERROR');
          return;
        }
        speedMode = body.speedMode as 'normal' | 'slow_native' | 'fast_native';
      }

      let category: PhoneticCategory | undefined;
      if (body.category !== undefined && body.category !== null) {
        if (
          typeof body.category !== 'string' ||
          !VALID_CATEGORIES.has(body.category as PhoneticCategory)
        ) {
          sendError(res, 400, 'Invalid phonetic category', 'VALIDATION_ERROR');
          return;
        }
        category = body.category as PhoneticCategory;
      }

      const ttsProvider = getTTSProvider();
      if (!ttsProvider) {
        sendError(res, 500, 'TTS provider not initialized', 'PROVIDER_ERROR');
        return;
      }

      const rawAccentOrVoice =
        typeof body.accent === 'string'
          ? body.accent
          : typeof body.voice === 'string'
            ? body.voice
            : 'american';
      const accent = normalizeAccentInput(rawAccentOrVoice);
      const profile = resolveAccentVoice(getConfig(), accent);

      const targetPhrase = typeof body.targetPhrase === 'string' ? body.targetPhrase : undefined;
      const simulatedPronunciation =
        typeof body.simulatedPronunciation === 'string' ? body.simulatedPronunciation : undefined;

      const prepared = prepareTTSSynthesisPayload(
        {
          text: body.text,
          category,
          targetPhrase,
          simulatedPronunciation,
          speedMode,
        },
        profile
      );

      const result = await audioCache.getOrSynthesizeAudio({
        provider: ttsProvider,
        providerName: profile.provider,
        spokenText: prepared.spokenText,
        normalizedTextForCache: prepared.normalizedTextForCache,
        accent: prepared.accent,
        voice: prepared.voice,
        model: prepared.model,
        speedMode: prepared.speedMode,
        speedMultiplier: prepared.speedMultiplier,
        category: prepared.category,
        instructions: prepared.instructions,
        targetPhrase,
        simulatedPronunciation,
        isApproximate: prepared.isApproximate,
        approximateReason: prepared.approximateReason,
        verificationStatus: prepared.verificationStatus,
      });

      res.set({
        'Content-Type': 'audio/wav',
        'Content-Length': String(result.wavBuffer.length),
        'X-TTS-Cache': result.cacheHit ? 'HIT' : 'MISS',
        'X-TTS-Cache-Key': result.cacheKey,
        'X-TTS-Accent': result.accent,
        'X-TTS-Voice': result.voice,
        'X-TTS-Approximate': String(result.isApproximate),
        'X-TTS-Approximate-Reason': result.approximateReason ?? '',
        'X-TTS-Verification': result.verificationStatus,
        'X-TTS-Daily-Warning': String(result.dailyWarning),
      });
      res.send(result.wavBuffer);
    } catch (err) {
      console.error('[tts-cache] POST /api/tts failed:', err);
      if (isRateLimitError(err)) {
        sendError(res, 429, 'TTS rate limit exceeded', 'RATE_LIMITED');
        return;
      }
      if (isOfflineModelError(err)) {
        sendError(res, 503, 'Offline TTS model or binary is missing', 'OFFLINE_MODEL_MISSING');
        return;
      }
      sendError(res, 500, 'TTS synthesis failed', 'PROVIDER_ERROR');
    }
  });

  // 7. POST /api/tts/verify
  router.post('/api/tts/verify', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        cacheKey?: unknown;
        targetPhrase?: unknown;
        simulatedPronunciation?: unknown;
      };

      if (
        typeof body.cacheKey !== 'string' ||
        !body.cacheKey.trim() ||
        typeof body.targetPhrase !== 'string' ||
        !body.targetPhrase.trim() ||
        typeof body.simulatedPronunciation !== 'string' ||
        !body.simulatedPronunciation.trim()
      ) {
        sendError(
          res,
          400,
          'cacheKey, targetPhrase, and simulatedPronunciation are required',
          'VALIDATION_ERROR'
        );
        return;
      }

      const cached = await audioCache.readCachedAudio(body.cacheKey.trim());
      if (!cached) {
        sendError(res, 404, 'Cached audio entry not found', 'SUBTITLE_NOT_FOUND');
        return;
      }

      const textProvider = getTextProvider();
      if (textProvider && typeof textProvider.verifyConnectedSpeechAudio === 'function') {
        const verification = await textProvider.verifyConnectedSpeechAudio(cached.wavBuffer, {
          targetPhrase: body.targetPhrase.trim(),
          simulatedPronunciation: body.simulatedPronunciation.trim(),
        });
        db.updateTTSCacheVerification(
          cached.entry.cache_key,
          verification.status,
          verification.note
        );
        res.json({
          data: {
            cacheKey: cached.entry.cache_key,
            verificationStatus: verification.status,
            verificationNote: verification.note,
          },
        });
        return;
      }

      res.json({
        data: {
          cacheKey: cached.entry.cache_key,
          verificationStatus: cached.entry.verification_status,
          verificationNote:
            cached.entry.verification_note ||
            'Audio verification is not supported by the active text provider',
        },
      });
    } catch (err) {
      console.error('[tts-cache] POST /api/tts/verify failed:', err);
      if (isRateLimitError(err)) {
        sendError(res, 429, 'Rate limit exceeded during audio verification', 'RATE_LIMITED');
        return;
      }
      sendError(res, 500, 'Audio verification failed', 'PROVIDER_ERROR');
    }
  });

  // 8. GET /api/tts/cache/stats
  router.get('/api/tts/cache/stats', (_req: Request, res: Response) => {
    try {
      res.json({ data: audioCache.getCacheStats() });
    } catch (err) {
      console.error('[tts-cache] GET /api/tts/cache/stats failed:', err);
      sendError(res, 500, 'Failed to fetch TTS cache stats', 'PROVIDER_ERROR');
    }
  });

  // 9. DELETE /api/tts/cache
  router.delete('/api/tts/cache', async (_req: Request, res: Response) => {
    try {
      const result = await audioCache.clearCache();
      res.json({ data: result });
    } catch (err) {
      console.error('[tts-cache] DELETE /api/tts/cache failed:', err);
      sendError(res, 500, 'Failed to clear TTS cache', 'PROVIDER_ERROR');
    }
  });

  return router;
}
