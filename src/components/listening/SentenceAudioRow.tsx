import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Headphones,
  Loader2,
  Play,
  Square,
  Volume2,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { highlightTargetPhrase } from '../../lib/phoneticHighlighter.js';
import type {
  AccentCode,
  AudioVerificationStatus,
  PlaybackSpeedPreset,
} from '../../types/listening.js';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ACCENT_PILLS: { code: AccentCode; label: string; name: string }[] = [
  { code: 'uk', label: 'UK', name: 'British (UK)' },
  { code: 'us', label: 'US', name: 'American (US)' },
  { code: 'au', label: 'AU', name: 'Australian (AU)' },
  { code: 'nz', label: 'NZ', name: 'New Zealand (NZ)' },
  { code: 'in', label: 'IN', name: 'Indian (IN)' },
];

export interface SentenceMetadata {
  isApproximate?: boolean;
  approximateReason?: string;
  verificationStatus?: AudioVerificationStatus;
}

export interface SentenceAudioRowProps {
  sentenceKey: string;
  sentence: string;
  ttsSentence?: string;
  targetPhrase: string;
  simulatedPronunciation: string;
  isOriginal?: boolean;
  index?: number;
  phoneticNote?: string;
  subtitleErrorNote?: string;
  spokenPhrase?: string;
  blindListen?: boolean;
  defaultRevealed?: boolean;
  activeSentenceKey: string | null;
  activeAccent: AccentCode | null;
  audioStatus: 'idle' | 'loading' | 'playing' | 'error';
  defaultAccent: AccentCode;
  defaultSpeed: PlaybackSpeedPreset;
  metadata?: SentenceMetadata;
  verifying?: boolean;
  onPlay: (params: {
    sentenceKey: string;
    text: string;
    accent: AccentCode;
    targetPhrase: string;
    simulatedPronunciation: string;
  }) => void;
  onStop: () => void;
  onCompareAccents?: (params: {
    sentenceKey: string;
    text: string;
    targetPhrase: string;
    simulatedPronunciation: string;
  }) => void;
  onVerify?: (params: {
    sentenceKey: string;
    targetPhrase: string;
    simulatedPronunciation: string;
  }) => void;
}

export const SentenceAudioRow: React.FC<SentenceAudioRowProps> = ({
  sentenceKey,
  sentence,
  ttsSentence,
  targetPhrase,
  simulatedPronunciation,
  isOriginal = false,
  index,
  phoneticNote,
  subtitleErrorNote,
  spokenPhrase,
  blindListen = false,
  defaultRevealed = false,
  activeSentenceKey,
  activeAccent,
  audioStatus,
  defaultAccent,
  metadata,
  verifying = false,
  onPlay,
  onStop,
  onCompareAccents,
  onVerify,
}) => {
  const [prevSentenceKey, setPrevSentenceKey] = useState(sentenceKey);
  const [isRevealed, setIsRevealed] = useState(defaultRevealed);
  const [showApproxTooltip, setShowApproxTooltip] = useState(false);

  if (prevSentenceKey !== sentenceKey) {
    setPrevSentenceKey(sentenceKey);
    setIsRevealed(defaultRevealed);
  }

  const textToSpeak = ttsSentence || sentence;
  const isThisPlaying = audioStatus === 'playing' && activeSentenceKey === sentenceKey;
  const isThisLoading = audioStatus === 'loading' && activeSentenceKey === sentenceKey;

  const segments = highlightTargetPhrase(sentence, targetPhrase);

  const handlePrimaryClick = () => {
    if (isThisPlaying || isThisLoading) {
      onStop();
    } else {
      onPlay({
        sentenceKey,
        text: textToSpeak,
        accent: defaultAccent,
        targetPhrase,
        simulatedPronunciation,
      });
    }
  };

  const handleAccentClick = (accent: AccentCode) => {
    onPlay({
      sentenceKey,
      text: textToSpeak,
      accent,
      targetPhrase,
      simulatedPronunciation,
    });
  };

  const handleCompareClick = () => {
    if (onCompareAccents) {
      onCompareAccents({
        sentenceKey,
        text: textToSpeak,
        targetPhrase,
        simulatedPronunciation,
      });
    }
  };

  const handleVerifyClick = () => {
    if (onVerify) {
      onVerify({
        sentenceKey,
        targetPhrase,
        simulatedPronunciation,
      });
    }
  };

  return (
    <div
      className={cn(
        'rounded-2xl transition-all border',
        isOriginal
          ? 'bg-white p-5 border-[#E7E5E4] shadow-xs'
          : 'bg-[#F5F5F4] p-4 border-transparent hover:border-[#E7E5E4]'
      )}
    >
      {/* Header & Subtitle/Index Label + Reveal Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
        <div className="flex items-center gap-2">
          {index !== undefined && (
            <span className="text-xs font-bold font-mono text-[#78716C] bg-white px-2 py-0.5 rounded-full border border-[#E7E5E4]">
              #{index + 1}
            </span>
          )}
          {isOriginal ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#A8A29E]">
              Original Movie Line
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#78716C]">
              Everyday Practice Sentence
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Compare All Button (UK -> US -> AU) */}
          {onCompareAccents && (
            <button
              type="button"
              onClick={handleCompareClick}
              className="min-h-[44px] sm:min-h-0 text-xs font-bold text-[#78716C] hover:text-black flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-black/5 transition-all"
              title="Sequentially compare UK, US, and AU speech back-to-back"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Compare</span>
              <span>UK → US → AU</span>
            </button>
          )}

          {/* Reveal / Hide Text & Explanation Button */}
          <button
            type="button"
            onClick={() => setIsRevealed(!isRevealed)}
            className={cn(
              'min-h-[44px] sm:min-h-0 text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all shadow-2xs',
              isRevealed
                ? 'bg-white text-[#78716C] border-[#E7E5E4] hover:text-black hover:border-black/30'
                : 'bg-black text-white border-black hover:bg-zinc-800'
            )}
            title={isRevealed ? 'Hide sentence text and explanation' : 'Show sentence text and explanation'}
          >
            {isRevealed ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Hide Text & Explanation</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Show Text & Explanation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Middle Section: Hidden Placeholder or Revealed Text & Explanation */}
      {!isRevealed ? (
        <div
          onClick={() => setIsRevealed(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setIsRevealed(true);
            }
          }}
          className="group cursor-pointer my-2 p-3.5 rounded-xl border border-dashed border-[#D6D3D1] bg-[#F5F5F4]/60 hover:bg-[#F5F5F4] hover:border-[#A8A29E] transition-all flex items-center justify-between gap-3 select-none"
        >
          <div className="flex items-center gap-2.5 text-xs text-[#78716C]">
            <Headphones className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Text & explanation hidden for listening practice. Listen first, or click to reveal.</span>
          </div>
          <span className="text-xs font-bold text-black flex items-center gap-1 group-hover:text-emerald-700 underline shrink-0">
            <Eye className="w-3.5 h-3.5" />
            <span>Reveal</span>
          </span>
        </div>
      ) : (
        <div className="my-2 space-y-2.5">
          {/* Subtitle Error Trap Banner if applicable */}
          {subtitleErrorNote && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                {spokenPhrase && (
                  <span className="font-bold text-amber-950 block mb-0.5">
                    Subtitle Trap / Likely Spoken Words: &ldquo;{spokenPhrase}&rdquo;
                  </span>
                )}
                <p className="leading-relaxed">{subtitleErrorNote}</p>
              </div>
            </div>
          )}

          {/* Sentence with bold/amber target highlight */}
          <p
            className={cn(
              'text-base sm:text-lg leading-relaxed text-[#1C1917]',
              blindListen && 'blur-sm select-none hover:blur-none active:blur-none transition-all'
            )}
          >
            &ldquo;
            {segments.map((seg, i) =>
              seg.isMatch ? (
                <mark
                  key={i}
                  className="bg-amber-100 text-amber-950 font-bold px-1 rounded mx-0.5 border-b-2 border-amber-400"
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              )
            )}
            &rdquo;
          </p>

          {/* Phonetic Explanation Box */}
          {phoneticNote && (
            <div className="p-3 bg-[#F5F5F4] rounded-xl text-xs sm:text-sm text-[#1C1917] leading-relaxed border border-[#E7E5E4]/80">
              <span className="font-bold text-[#78716C] block text-[10px] uppercase tracking-wider mb-0.5">
                Phonetic Explanation
              </span>
              <p>{phoneticNote}</p>
            </div>
          )}
        </div>
      )}

      {/* Controls: Primary Play, Accent Pills, Provenance & Verification */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E7E5E4]/60">
        <div className="flex flex-wrap items-center gap-2">
          {/* 1-Tap Primary Play/Stop */}
          <button
            type="button"
            onClick={handlePrimaryClick}
            aria-label={isThisPlaying ? 'Stop playback' : `Play with ${defaultAccent.toUpperCase()}`}
            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center gap-2 bg-black text-white px-4 py-2 sm:py-1.5 rounded-full text-xs font-bold hover:bg-zinc-800 transition-all shadow-xs"
          >
            {isThisLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isThisPlaying ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>
              {isThisPlaying
                ? 'Stop'
                : `Play (${defaultAccent.toUpperCase()})`}
            </span>
          </button>

          {/* Inline Quick Accent Pills (UK US AU NZ IN) */}
          <div className="flex items-center gap-1 bg-white/80 p-0.5 rounded-full border border-[#E7E5E4]">
            {ACCENT_PILLS.map((acc) => {
              const isPlayingAccent =
                isThisPlaying && activeAccent === acc.code;
              return (
                <button
                  key={acc.code}
                  type="button"
                  onClick={() => handleAccentClick(acc.code)}
                  title={`Play in ${acc.name}`}
                  className={cn(
                    'min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-2.5 py-1 sm:py-0.5 rounded-full text-[11px] font-bold transition-all flex items-center justify-center',
                    isPlayingAccent
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-[#78716C] hover:text-black hover:bg-black/5'
                  )}
                >
                  {acc.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Provenance Metadata & Multimodal Verification */}
        {metadata && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {/* Approximate Accent Warning Pill */}
            {metadata.isApproximate && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowApproxTooltip(!showApproxTooltip)}
                  className="min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold flex items-center gap-1"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>Approx. Accent</span>
                </button>
                {showApproxTooltip && metadata.approximateReason && (
                  <div className="absolute right-0 bottom-full mb-1 w-56 p-2 bg-black text-white text-[10px] rounded-lg shadow-lg z-10 leading-snug">
                    {metadata.approximateReason}
                  </div>
                )}
              </div>
            )}

            {/* Verification Status Pill */}
            {metadata.verificationStatus === 'verified' ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Verified Reduction</span>
              </span>
            ) : metadata.verificationStatus === 'failed_check' ? (
              <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-600" />
                <span>Reduction Unclear</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-white text-[#78716C] border border-[#E7E5E4] font-mono text-[10px]">
                AI Speech
              </span>
            )}

            {/* Verify Audio Button */}
            {onVerify && metadata.verificationStatus !== 'verified' && (
              <button
                type="button"
                disabled={verifying}
                onClick={handleVerifyClick}
                className="min-h-[44px] sm:min-h-0 text-[#78716C] hover:text-black font-semibold underline disabled:opacity-50 flex items-center gap-1"
                title="Use Gemini Audio AI to verify that the reduction actually occurred in the audio"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Verify Audio</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
