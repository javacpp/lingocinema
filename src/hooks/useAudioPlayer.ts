import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ListeningApiError,
  synthesizeSentenceAudio,
  verifySentenceAudio,
} from '../api/listening.js';
import {
  PLAYBACK_SPEED_RATES,
  type AccentCode,
  type AudioVerificationStatus,
  type PhoneticCategory,
  type PlaybackSpeedPreset,
} from '../types/listening.js';

export type AudioPlaybackStatus = 'idle' | 'loading' | 'playing' | 'error';

export interface PlaySentenceOptions {
  sentenceKey: string;
  text: string;
  accent: AccentCode;
  speed: PlaybackSpeedPreset;
  category?: PhoneticCategory;
  targetPhrase?: string;
  simulatedPronunciation?: string;
  providerKey?: string;
}

export interface AudioClipMetadata {
  cacheKey: string;
  cacheHit: boolean;
  accent: AccentCode;
  voice: string;
  isApproximate: boolean;
  approximateReason: string;
  verificationStatus: AudioVerificationStatus;
  verificationNote?: string;
  dailyWarning: boolean;
}

export interface AudioPlayerError {
  sentenceKey: string;
  message: string;
  code?: string;
}

interface CachedBlobEntry {
  blobUrl: string;
  metadata: AudioClipMetadata;
}

type PitchPreservingAudio = HTMLAudioElement & {
  preservesPitch?: boolean;
  mozPreservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

function applySpeedAndPitch(audio: HTMLAudioElement, speed: PlaybackSpeedPreset): void {
  const rate = PLAYBACK_SPEED_RATES[speed] ?? 1.0;
  const pitchAudio = audio as PitchPreservingAudio;
  pitchAudio.preservesPitch = true;
  pitchAudio.mozPreservesPitch = true;
  pitchAudio.webkitPreservesPitch = true;
  audio.playbackRate = rate;
  audio.defaultPlaybackRate = rate;
}

export function useAudioPlayer() {
  const [status, setStatus] = useState<AudioPlaybackStatus>('idle');
  const [activeSentenceKey, setActiveSentenceKey] = useState<string | null>(null);
  const [activeAccent, setActiveAccent] = useState<AccentCode | null>(null);
  const [loopEnabled, setLoopEnabled] = useState<boolean>(false);
  const [error, setError] = useState<AudioPlayerError | null>(null);
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null);
  const [metadataByKey, setMetadataByKey] = useState<Record<string, AudioClipMetadata>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const blobCacheRef = useRef<Map<string, CachedBlobEntry>>(new Map());
  const loopRef = useRef<boolean>(false);
  const currentSpeedRef = useRef<PlaybackSpeedPreset>('normal');
  const compareQueueRef = useRef<PlaySentenceOptions[]>([]);
  const playInternalRef = useRef<
    ((opts: PlaySentenceOptions, isFromQueue?: boolean) => Promise<void>) | null
  >(null);

  useEffect(() => {
    loopRef.current = loopEnabled;
  }, [loopEnabled]);

  useEffect(() => {
    const cacheMap = blobCacheRef.current;
    return () => {
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      for (const entry of cacheMap.values()) {
        URL.revokeObjectURL(entry.blobUrl);
      }
      cacheMap.clear();
    };
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    compareQueueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setStatus('idle');
    setActiveSentenceKey(null);
    setActiveAccent(null);
  }, []);

  const updateActiveSpeed = useCallback((speed: PlaybackSpeedPreset) => {
    currentSpeedRef.current = speed;
    if (audioRef.current) {
      applySpeedAndPitch(audioRef.current, speed);
    }
  }, []);

  const playInternal = useCallback(async (opts: PlaySentenceOptions, isFromQueue = false) => {
    if (!isFromQueue) {
      compareQueueRef.current = [];
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (audioRef.current) {
      audioRef.current.pause();
    }

    currentSpeedRef.current = opts.speed;
    setError(null);
    setActiveSentenceKey(opts.sentenceKey);
    setActiveAccent(opts.accent);
    setStatus('loading');

    const blobKey = `${opts.providerKey ?? 'default'}::${opts.accent}::${opts.category ?? 'general'}::${opts.text.trim().toLowerCase()}`;

    try {
      let cached = blobCacheRef.current.get(blobKey);

      if (!cached) {
        const res = await synthesizeSentenceAudio({
          text: opts.text,
          accent: opts.accent,
          speedMode: 'normal',
          category: opts.category,
          targetPhrase: opts.targetPhrase,
          simulatedPronunciation: opts.simulatedPronunciation,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const blobUrl = URL.createObjectURL(res.audioBlob);
        const metadata: AudioClipMetadata = {
          cacheKey: res.cacheKey,
          cacheHit: res.cacheHit,
          accent: res.accent,
          voice: res.voice,
          isApproximate: res.isApproximate,
          approximateReason: res.approximateReason,
          verificationStatus: res.verificationStatus,
          dailyWarning: res.dailyWarning,
        };
        cached = { blobUrl, metadata };
        blobCacheRef.current.set(blobKey, cached);
      } else {
        cached = {
          ...cached,
          metadata: { ...cached.metadata, cacheHit: true },
        };
      }

      const activeMetadata = cached.metadata;
      setMetadataByKey((prev) => ({
        ...prev,
        [opts.sentenceKey]: activeMetadata,
      }));

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.src = cached.blobUrl;
      audio.currentTime = 0;
      applySpeedAndPitch(audio, currentSpeedRef.current);

      audio.onended = () => {
        if (compareQueueRef.current.length > 0) {
          const next = compareQueueRef.current.shift()!;
          void playInternalRef.current?.(next, true);
          return;
        }
        if (loopRef.current && audioRef.current) {
          audioRef.current.currentTime = 0;
          applySpeedAndPitch(audioRef.current, currentSpeedRef.current);
          void audioRef.current.play();
          return;
        }
        setStatus('idle');
        setActiveSentenceKey(null);
        setActiveAccent(null);
      };

      audio.onerror = () => {
        setStatus('error');
        setError({
          sentenceKey: opts.sentenceKey,
          message: 'Browser failed to decode or play audio stream',
        });
      };

      await audio.play();
      if (!controller.signal.aborted) {
        setStatus('playing');
      }
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return;
      }
      const message = err instanceof Error ? err.message : 'Audio playback failed';
      const code = err instanceof ListeningApiError ? err.code : undefined;
      setStatus('error');
      setError({
        sentenceKey: opts.sentenceKey,
        message,
        code,
      });
    }
  }, []);

  useEffect(() => {
    playInternalRef.current = playInternal;
  }, [playInternal]);

  const play = useCallback(
    async (opts: PlaySentenceOptions) => {
      if (
        status === 'playing' &&
        activeSentenceKey === opts.sentenceKey &&
        activeAccent === opts.accent
      ) {
        stop();
        return;
      }
      await playInternal(opts, false);
    },
    [activeAccent, activeSentenceKey, playInternal, status, stop]
  );

  const playAccentSequence = useCallback(
    async (
      baseOpts: Omit<PlaySentenceOptions, 'accent'>,
      accents: AccentCode[] = ['uk', 'us', 'au']
    ) => {
      if (accents.length === 0) return;
      const [firstAccent, ...restAccents] = accents;
      compareQueueRef.current = restAccents.map((accent) => ({
        ...baseOpts,
        accent,
      }));
      await playInternal({ ...baseOpts, accent: firstAccent }, true);
    },
    [playInternal]
  );

  const verifyClip = useCallback(
    async (sentenceKey: string, targetPhrase: string, simulatedPronunciation: string) => {
      const meta = metadataByKey[sentenceKey];
      if (!meta?.cacheKey) return;
      setVerifyingKey(sentenceKey);
      try {
        const res = await verifySentenceAudio({
          cacheKey: meta.cacheKey,
          targetPhrase,
          simulatedPronunciation,
        });
        setMetadataByKey((prev) => {
          const existing = prev[sentenceKey];
          if (!existing) return prev;
          return {
            ...prev,
            [sentenceKey]: {
              ...existing,
              verificationStatus: res.verificationStatus,
              verificationNote: res.verificationNote,
            },
          };
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Audio verification failed';
        setError({ sentenceKey, message });
      } finally {
        setVerifyingKey(null);
      }
    },
    [metadataByKey]
  );

  const clearBlobCache = useCallback(() => {
    for (const entry of blobCacheRef.current.values()) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    blobCacheRef.current.clear();
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
    if (status === 'error') {
      setStatus('idle');
    }
  }, [status]);

  return {
    status,
    activeSentenceKey,
    activeAccent,
    loopEnabled,
    setLoopEnabled,
    error,
    dismissError,
    verifyingKey,
    metadataByKey,
    play,
    stop,
    updateActiveSpeed,
    playAccentSequence,
    verifyClip,
    clearBlobCache,
  };
}
