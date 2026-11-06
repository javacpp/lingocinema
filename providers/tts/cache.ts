import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { IDatabase } from '../../db/interface.js';
import {
  TTS_PIPELINE_VERSION,
  type AccentCode,
  type AudioVerificationStatus,
  type PhoneticCategory,
  type TTSCacheEntryRecord,
  type TTSCacheStats,
} from '../../src/types/listening.js';
import type { TTSProvider, TTSSynthesisOutput } from './interface.js';

export interface CacheKeyInput {
  pipelineVersion?: number;
  provider: string;
  model: string;
  voice: string;
  accent: AccentCode;
  speedMode?: 'normal' | 'slow_native' | 'fast_native';
  category?: string;
  normalizedTtsText: string;
  instructionHash?: string;
  instructions?: string;
}

export interface SynthesizeRequest {
  provider: TTSProvider;
  providerName?: string;
  spokenText: string;
  normalizedTextForCache?: string;
  accent: AccentCode;
  voice: string;
  model: string;
  speedMode?: 'normal' | 'slow_native' | 'fast_native';
  speedMultiplier?: number;
  category?: PhoneticCategory | 'general';
  instructions?: string;
  targetPhrase?: string;
  simulatedPronunciation?: string;
  isApproximate?: boolean;
  approximateReason?: string;
  verificationStatus?: AudioVerificationStatus;
}

export interface CachedAudioResult {
  cacheKey: string;
  cacheHit: boolean;
  wavBuffer: Buffer;
  accent: AccentCode;
  provider: string;
  model: string;
  voice: string;
  speedMode: 'normal' | 'slow_native' | 'fast_native';
  isApproximate: boolean;
  approximateReason?: string;
  verificationStatus: AudioVerificationStatus;
  verificationNote: string;
  todaySynthesizedCount: number;
  dailyWarning: boolean;
}

export interface AudioCacheServiceOptions {
  db: IDatabase;
  cacheDir?: string;
  maxCacheBytes?: number;
  dailyWarnLimit?: number;
  retryBaseDelayMs?: number;
  maxRetries?: number;
  now?: () => Date;
}

const CACHE_KEY_REGEX = /^[a-f0-9]{64}$/;
const SAFE_RELATIVE_WAV_REGEX = /^[a-f0-9]{64}\.wav$/;

export function computeInstructionHash(instructions?: string): string {
  const trimmed = instructions?.trim();
  if (!trimmed) return 'none';
  return crypto.createHash('sha256').update(trimmed, 'utf-8').digest('hex').slice(0, 12);
}

/**
 * Computes a deterministic 64-char SHA-256 hex key from the canonical synthesis tuple
 * (Design Section 4.4).
 */
export function computeTTSCacheKey(input: CacheKeyInput): string {
  const normalizedTtsText = input.normalizedTtsText.toLowerCase().replace(/\s+/g, ' ').trim();
  const instructionHash = input.instructionHash ?? computeInstructionHash(input.instructions);
  const canonicalTuple = {
    pipelineVersion: input.pipelineVersion ?? TTS_PIPELINE_VERSION,
    provider: input.provider.trim().toLowerCase(),
    model: input.model.trim(),
    voice: input.voice.trim(),
    accent: input.accent,
    speedMode: input.speedMode ?? 'normal',
    category: input.category ?? 'general',
    normalizedTtsText,
    instructionHash,
  };

  return crypto.createHash('sha256').update(JSON.stringify(canonicalTuple), 'utf-8').digest('hex');
}

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (candidate.status === 429 || candidate.statusCode === 429 || candidate.code === 429) {
    return true;
  }
  if (
    typeof candidate.message === 'string' &&
    /\b429\b|rate[\s_-]*limit/i.test(candidate.message)
  ) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AudioCacheService {
  private readonly db: IDatabase;
  private readonly cacheDir: string;
  private readonly maxCacheBytes: number;
  private readonly dailyWarnLimit: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetries: number;
  private readonly now: () => Date;

  constructor(options: AudioCacheServiceOptions) {
    this.db = options.db;
    this.cacheDir =
      options.cacheDir ??
      (process.env.TTS_CACHE_DIR
        ? path.resolve(process.env.TTS_CACHE_DIR)
        : path.resolve(process.cwd(), '.cache/tts'));
    const envMaxMb = Number(process.env.TTS_CACHE_MAX_MB || 200);
    this.maxCacheBytes = options.maxCacheBytes ?? envMaxMb * 1024 * 1024;
    const envWarnLimit = Number(process.env.TTS_DAILY_WARN_LIMIT || 200);
    this.dailyWarnLimit = options.dailyWarnLimit ?? envWarnLimit;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 800;
    this.maxRetries = options.maxRetries ?? 1;
    this.now = options.now ?? (() => new Date());
  }

  private getTodayUtcString(): string {
    return this.now().toISOString().slice(0, 10);
  }

  private resolveSafeDiskPath(relativeFilePath: string): string {
    if (!SAFE_RELATIVE_WAV_REGEX.test(relativeFilePath)) {
      throw new Error(`Unsafe TTS cache file path rejected: ${relativeFilePath}`);
    }
    const resolvedDir = path.resolve(this.cacheDir);
    const fullPath = path.resolve(resolvedDir, relativeFilePath);
    if (!fullPath.startsWith(resolvedDir + path.sep)) {
      throw new Error('TTS cache path traversal detected');
    }
    return fullPath;
  }

  async getOrSynthesizeAudio(req: SynthesizeRequest): Promise<CachedAudioResult> {
    const providerName = (req.providerName ?? req.provider.name).trim().toLowerCase();
    const speedMode = req.speedMode ?? 'normal';
    const category = req.category ?? 'general';
    const normalizedTextForCache = (req.normalizedTextForCache ?? req.spokenText)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    const cacheKey = computeTTSCacheKey({
      pipelineVersion: TTS_PIPELINE_VERSION,
      provider: providerName,
      model: req.model,
      voice: req.voice,
      accent: req.accent,
      speedMode,
      category,
      normalizedTtsText: normalizedTextForCache,
      instructions: req.instructions,
    });

    const dateUtc = this.getTodayUtcString();
    const existing = this.db.getTTSCacheEntry(cacheKey);

    if (existing) {
      try {
        const diskPath = this.resolveSafeDiskPath(existing.file_path);
        const wavBuffer = await fs.readFile(diskPath);
        this.db.touchTTSCacheEntry(cacheKey);
        const daily = this.db.getDailyTTSUsage(dateUtc);
        return {
          cacheKey,
          cacheHit: true,
          wavBuffer,
          accent: existing.accent,
          provider: existing.provider,
          model: existing.model,
          voice: existing.voice,
          speedMode: existing.speed_mode,
          isApproximate: existing.is_approximate,
          approximateReason: req.approximateReason,
          verificationStatus: existing.verification_status,
          verificationNote: existing.verification_note,
          todaySynthesizedCount: daily.synthesizedCount,
          dailyWarning: daily.synthesizedCount >= this.dailyWarnLimit,
        };
      } catch {
        // Disk file missing or unreadable; remove stale metadata row and re-synthesize
        this.db.deleteTTSCacheEntries([cacheKey]);
      }
    }

    const synthesisOutput = await this.synthesizeWithRetry(req, providerName);
    const wavBuffer = synthesisOutput.wavBuffer;
    const relativeFilePath = `${cacheKey}.wav`;
    const diskPath = this.resolveSafeDiskPath(relativeFilePath);

    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(diskPath, wavBuffer);

    const textHash = crypto
      .createHash('sha256')
      .update(normalizedTextForCache, 'utf-8')
      .digest('hex');
    const isApproximate = req.isApproximate ?? synthesisOutput.isApproximate;
    const verificationStatus = req.verificationStatus ?? synthesisOutput.verificationStatus;

    this.db.upsertTTSCacheEntry({
      cache_key: cacheKey,
      file_path: relativeFilePath,
      byte_size: wavBuffer.byteLength,
      text_hash: textHash,
      accent: req.accent,
      provider: providerName,
      model: req.model,
      voice: synthesisOutput.voiceUsed || req.voice,
      speed_mode: speedMode,
      pipeline_version: TTS_PIPELINE_VERSION,
      is_approximate: isApproximate,
      verification_status: verificationStatus,
      verification_note: '',
    });

    await this.evictLeastRecentlyUsedIfNeeded(cacheKey);

    const daily = this.db.incrementDailyTTSUsage(dateUtc, wavBuffer.byteLength);

    return {
      cacheKey,
      cacheHit: false,
      wavBuffer,
      accent: req.accent,
      provider: providerName,
      model: req.model,
      voice: synthesisOutput.voiceUsed || req.voice,
      speedMode,
      isApproximate,
      approximateReason: req.approximateReason ?? synthesisOutput.approximateReason,
      verificationStatus,
      verificationNote: '',
      todaySynthesizedCount: daily.synthesizedCount,
      dailyWarning: daily.synthesizedCount >= this.dailyWarnLimit,
    };
  }

  async readCachedAudio(
    cacheKey: string
  ): Promise<{ wavBuffer: Buffer; entry: TTSCacheEntryRecord } | undefined> {
    if (!CACHE_KEY_REGEX.test(cacheKey)) {
      return undefined;
    }
    const entry = this.db.getTTSCacheEntry(cacheKey);
    if (!entry) return undefined;

    try {
      const diskPath = this.resolveSafeDiskPath(entry.file_path);
      const wavBuffer = await fs.readFile(diskPath);
      this.db.touchTTSCacheEntry(cacheKey);
      return { wavBuffer, entry };
    } catch {
      this.db.deleteTTSCacheEntries([cacheKey]);
      return undefined;
    }
  }

  getCacheStats(): TTSCacheStats {
    const totals = this.db.getTTSCacheTotalBytes();
    const daily = this.db.getDailyTTSUsage(this.getTodayUtcString());
    return {
      entryCount: totals.entryCount,
      totalBytes: totals.totalBytes,
      maxBytes: this.maxCacheBytes,
      todaySynthesizedCount: daily.synthesizedCount,
      dailyWarnLimit: this.dailyWarnLimit,
    };
  }

  async clearCache(): Promise<{ deletedFiles: number; freedBytes: number }> {
    const removedEntries = this.db.clearAllTTSCacheEntries();
    let deletedFiles = 0;
    let freedBytes = 0;

    for (const entry of removedEntries) {
      freedBytes += entry.byte_size;
      try {
        const diskPath = this.resolveSafeDiskPath(entry.file_path);
        await fs.rm(diskPath, { force: true });
        deletedFiles += 1;
      } catch {
        // Ignore already-deleted files
      }
    }

    return { deletedFiles, freedBytes };
  }

  private async synthesizeWithRetry(
    req: SynthesizeRequest,
    providerName: string
  ): Promise<TTSSynthesisOutput> {
    let attempt = 0;
    while (true) {
      try {
        return await this.synthesizeOnce(req, providerName);
      } catch (err) {
        if (attempt < this.maxRetries && isRateLimitError(err)) {
          attempt += 1;
          const jitter = Math.floor(
            Math.random() * Math.max(1, Math.round(this.retryBaseDelayMs * 0.25))
          );
          await sleep(this.retryBaseDelayMs + jitter);
          continue;
        }
        throw err;
      }
    }
  }

  private async synthesizeOnce(
    req: SynthesizeRequest,
    providerName: string
  ): Promise<TTSSynthesisOutput> {
    if (typeof req.provider.synthesizeAdvanced === 'function') {
      return req.provider.synthesizeAdvanced(req.spokenText, {
        accent: req.accent,
        voiceName: req.voice,
        instructions: req.instructions,
        speedMultiplier: req.speedMultiplier,
        phoneticCategory: req.category === 'general' ? undefined : req.category,
        targetPhrase: req.targetPhrase,
        simulatedPronunciation: req.simulatedPronunciation,
      });
    }

    const legacyVoice = req.accent === 'uk' ? 'british' : 'american';
    const wavBuffer = await req.provider.synthesize(req.spokenText, legacyVoice);
    return {
      wavBuffer,
      provider: providerName,
      model: req.model,
      voiceUsed: req.voice,
      accent: req.accent,
      isApproximate: req.isApproximate ?? false,
      approximateReason: req.approximateReason,
      verificationStatus:
        req.verificationStatus ??
        (req.instructions ? 'instructed_unverified' : 'orthographic_approx'),
    };
  }

  private async evictLeastRecentlyUsedIfNeeded(protectedCacheKey: string): Promise<void> {
    while (this.db.getTTSCacheTotalBytes().totalBytes > this.maxCacheBytes) {
      const oldestBatch = this.db.listLeastRecentlyUsedTTSCacheEntries(10);
      const candidates = oldestBatch.filter((e) => e.cache_key !== protectedCacheKey);
      if (candidates.length === 0) {
        break;
      }

      const toEvict = candidates[0];
      this.db.deleteTTSCacheEntries([toEvict.cache_key]);
      try {
        const diskPath = this.resolveSafeDiskPath(toEvict.file_path);
        await fs.rm(diskPath, { force: true });
      } catch {
        // Ignore missing file on disk
      }
    }
  }
}
