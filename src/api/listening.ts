import type {
  AccentCode,
  AudioVerificationStatus,
  ListeningDifficultyRecord,
  ListeningExampleRecord,
  PhoneticCategory,
  TTSCacheStats,
} from '../types/listening.js';

export class ListeningApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ListeningApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ListeningListResponse {
  subtitleId: number;
  countsByCategory: Record<PhoneticCategory, number>;
  items: ListeningDifficultyRecord[];
}

export interface AnalyzeListeningResponse {
  subtitleId: number;
  itemCount: number;
  items: ListeningDifficultyRecord[];
}

export interface ExamplesResponse {
  difficultyId: number;
  examples: ListeningExampleRecord[];
  generatedNow?: boolean;
}

export interface SynthesizeAudioRequest {
  text: string;
  accent: AccentCode;
  speedMode?: 'normal' | 'slow_native' | 'fast_native';
  category?: PhoneticCategory;
  targetPhrase?: string;
  simulatedPronunciation?: string;
  signal?: AbortSignal;
}

export interface SynthesizeAudioResponse {
  audioBlob: Blob;
  cacheHit: boolean;
  cacheKey: string;
  accent: AccentCode;
  voice: string;
  isApproximate: boolean;
  approximateReason: string;
  verificationStatus: AudioVerificationStatus;
  dailyWarning: boolean;
}

export interface VerifyAudioResponse {
  cacheKey: string;
  verificationStatus: AudioVerificationStatus;
  verificationNote: string;
}

async function parseErrorResponse(
  res: Response,
  fallbackMessage: string
): Promise<ListeningApiError> {
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    const message = typeof body.error === 'string' && body.error ? body.error : fallbackMessage;
    const code = typeof body.code === 'string' ? body.code : undefined;
    return new ListeningApiError(message, res.status, code);
  } catch {
    return new ListeningApiError(fallbackMessage, res.status);
  }
}

async function unwrapJsonData<T>(res: Response, fallbackError: string): Promise<T> {
  if (!res.ok) {
    throw await parseErrorResponse(res, fallbackError);
  }
  const envelope = (await res.json()) as { data: T };
  return envelope.data;
}

export async function fetchListeningDifficulties(
  subtitleId: number,
  options?: { category?: PhoneticCategory; includeMastered?: boolean }
): Promise<ListeningListResponse> {
  const params = new URLSearchParams();
  if (options?.category) {
    params.set('category', options.category);
  }
  if (options?.includeMastered !== undefined) {
    params.set('includeMastered', String(options.includeMastered));
  }
  const queryString = params.toString();
  const url = `/api/listening/${subtitleId}${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url);
  return unwrapJsonData<ListeningListResponse>(res, 'Failed to fetch listening difficulties');
}

export async function analyzeSubtitleListening(
  subtitleId: number,
  options?: { force?: boolean }
): Promise<AnalyzeListeningResponse> {
  const res = await fetch(`/api/listening/${subtitleId}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force: options?.force ?? true }),
  });
  return unwrapJsonData<AnalyzeListeningResponse>(res, 'Failed to analyze listening difficulties');
}

export async function updateDifficultyMastery(
  id: number,
  isMastered: boolean
): Promise<{ id: number; isMastered: boolean }> {
  const res = await fetch(`/api/listening/item/${id}/mastery`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isMastered }),
  });
  return unwrapJsonData<{ id: number; isMastered: boolean }>(
    res,
    'Failed to update mastery status'
  );
}

export async function fetchDifficultyExamples(
  id: number,
  options?: { autoGenerate?: boolean }
): Promise<ExamplesResponse> {
  const autoGen = options?.autoGenerate ?? true;
  const res = await fetch(`/api/listening/item/${id}/examples?autoGenerate=${String(autoGen)}`);
  return unwrapJsonData<ExamplesResponse>(res, 'Failed to fetch example sentences');
}

export async function regenerateDifficultyExamples(id: number): Promise<ExamplesResponse> {
  const res = await fetch(`/api/listening/item/${id}/examples/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return unwrapJsonData<ExamplesResponse>(res, 'Failed to regenerate example sentences');
}

export async function synthesizeSentenceAudio(
  req: SynthesizeAudioRequest
): Promise<SynthesizeAudioResponse> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: req.text,
      accent: req.accent,
      speedMode: req.speedMode ?? 'normal',
      category: req.category,
      targetPhrase: req.targetPhrase,
      simulatedPronunciation: req.simulatedPronunciation,
    }),
    signal: req.signal,
  });

  if (!res.ok) {
    throw await parseErrorResponse(res, 'TTS synthesis failed');
  }

  const audioBlob = await res.blob();
  const headers = res.headers;
  const cacheHit = headers?.get('X-TTS-Cache') === 'HIT';
  const cacheKey = headers?.get('X-TTS-Cache-Key') ?? '';
  const accentHeader = (headers?.get('X-TTS-Accent') ?? req.accent) as AccentCode;
  const voice = headers?.get('X-TTS-Voice') ?? '';
  const isApproximate = headers?.get('X-TTS-Approximate') === 'true';
  const approximateReason = headers?.get('X-TTS-Approximate-Reason') ?? '';
  const verificationStatus = (headers?.get('X-TTS-Verification') ??
    'instructed_unverified') as AudioVerificationStatus;
  const dailyWarning = headers?.get('X-TTS-Daily-Warning') === 'true';

  return {
    audioBlob,
    cacheHit,
    cacheKey,
    accent: accentHeader,
    voice,
    isApproximate,
    approximateReason,
    verificationStatus,
    dailyWarning,
  };
}

export async function verifySentenceAudio(req: {
  cacheKey: string;
  targetPhrase: string;
  simulatedPronunciation: string;
}): Promise<VerifyAudioResponse> {
  const res = await fetch('/api/tts/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return unwrapJsonData<VerifyAudioResponse>(res, 'Failed to verify audio');
}

export async function fetchTTSCacheStats(): Promise<TTSCacheStats> {
  const res = await fetch('/api/tts/cache/stats');
  return unwrapJsonData<TTSCacheStats>(res, 'Failed to fetch TTS cache stats');
}

export async function clearTTSCache(): Promise<{ deletedFiles: number; freedBytes: number }> {
  const res = await fetch('/api/tts/cache', { method: 'DELETE' });
  return unwrapJsonData<{ deletedFiles: number; freedBytes: number }>(
    res,
    'Failed to clear TTS cache'
  );
}
