import React from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  CATEGORY_BADGE_STYLES,
  formatLinkedPronunciation,
  formatPhoneticCategoryLabel,
} from '../../lib/phoneticHighlighter.js';
import type {
  AccentCode,
  ListeningDifficultyRecord,
  ListeningExampleRecord,
  PlaybackSpeedPreset,
} from '../../types/listening.js';
import {
  SentenceAudioRow,
  type SentenceMetadata,
} from './SentenceAudioRow.js';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DifficultyDetailCardProps {
  difficulty: ListeningDifficultyRecord;
  explanationLang: 'zh' | 'en';
  blindListen: boolean;
  examples: ListeningExampleRecord[];
  exampleStatus: 'idle' | 'loading' | 'ready' | 'error';
  exampleError?: string;
  onToggleMastery: (id: number, isMastered: boolean) => void;
  onRegenerateExamples: (difficultyId: number) => void;
  activeSentenceKey: string | null;
  activeAccent: AccentCode | null;
  audioStatus: 'idle' | 'loading' | 'playing' | 'error';
  defaultAccent: AccentCode;
  defaultSpeed: PlaybackSpeedPreset;
  metadataByKey: Record<string, SentenceMetadata>;
  verifyingKey: string | null;
  onPlay: (params: {
    sentenceKey: string;
    text: string;
    accent: AccentCode;
    targetPhrase: string;
    simulatedPronunciation: string;
  }) => void;
  onStop: () => void;
  onCompareAccents: (params: {
    sentenceKey: string;
    text: string;
    targetPhrase: string;
    simulatedPronunciation: string;
  }) => void;
  onVerify: (params: {
    sentenceKey: string;
    targetPhrase: string;
    simulatedPronunciation: string;
  }) => void;
}

export const DifficultyDetailCard: React.FC<DifficultyDetailCardProps> = ({
  difficulty,
  explanationLang,
  blindListen,
  examples,
  exampleStatus,
  exampleError,
  onToggleMastery,
  onRegenerateExamples,
  activeSentenceKey,
  activeAccent,
  audioStatus,
  defaultAccent,
  defaultSpeed,
  metadataByKey,
  verifyingKey,
  onPlay,
  onStop,
  onCompareAccents,
  onVerify,
}) => {
  const linkedPronunciation = formatLinkedPronunciation(
    difficulty.simulated_pronunciation,
    ' ‿ '
  );

  const origSentenceKey = `orig-${difficulty.id}`;
  const origText = difficulty.tts_sentence || difficulty.original_sentence;
  const origTarget = difficulty.spoken_phrase || difficulty.phrase;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ── Header Card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E7E5E4] shadow-xs space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border',
                  CATEGORY_BADGE_STYLES[difficulty.category]
                )}
              >
                {formatPhoneticCategoryLabel(difficulty.category)}
              </span>
              <span className="text-xs font-semibold uppercase text-[#78716C] bg-[#F5F5F4] px-2 py-0.5 rounded">
                Priority: {difficulty.difficulty_level}
              </span>
              {difficulty.cue_start_time && (
                <span className="text-xs font-mono text-[#78716C] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {difficulty.cue_start_time.split(',')[0]}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-3">
              <h2
                className={cn(
                  'text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1917]',
                  blindListen && 'blur-sm hover:blur-none active:blur-none transition-all'
                )}
              >
                {difficulty.phrase}
              </h2>
              <span className="text-base sm:text-lg font-mono font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Sounds like: &ldquo;{linkedPronunciation || difficulty.simulated_pronunciation}&rdquo;
              </span>
            </div>
          </div>

          {/* Mastered Button */}
          <button
            type="button"
            onClick={() => onToggleMastery(difficulty.id, !difficulty.is_mastered)}
            className={cn(
              'min-h-[44px] sm:min-h-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border transition-all shrink-0',
              difficulty.is_mastered
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-white text-[#78716C] border-[#E7E5E4] hover:border-black'
            )}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{difficulty.is_mastered ? 'Mastered' : 'Mark Mastered'}</span>
          </button>
        </div>
      </div>

      {/* ── Section 1: Original Movie Line ─────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#A8A29E] px-2">
          Original Subtitle Context
        </h3>
        <SentenceAudioRow
          key={origSentenceKey}
          sentenceKey={origSentenceKey}
          sentence={difficulty.original_sentence}
          ttsSentence={origText}
          targetPhrase={origTarget}
          simulatedPronunciation={difficulty.simulated_pronunciation}
          isOriginal={true}
          phoneticNote={
            explanationLang === 'zh'
              ? difficulty.explanation_zh
              : difficulty.explanation_en
          }
          subtitleErrorNote={
            difficulty.is_subtitle_error
              ? difficulty.subtitle_error_note
              : undefined
          }
          spokenPhrase={
            difficulty.is_subtitle_error
              ? difficulty.spoken_phrase
              : undefined
          }
          blindListen={blindListen}
          activeSentenceKey={activeSentenceKey}
          activeAccent={activeAccent}
          audioStatus={audioStatus}
          defaultAccent={defaultAccent}
          defaultSpeed={defaultSpeed}
          metadata={metadataByKey[origSentenceKey]}
          verifying={verifyingKey === origSentenceKey}
          onPlay={onPlay}
          onStop={onStop}
          onCompareAccents={onCompareAccents}
          onVerify={onVerify}
        />
      </div>

      {/* ── Section 2: B1 Practice Examples ─────────────────────────────── */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-[#E7E5E4] shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-[#1C1917]">
                Everyday B1 Drill Sentences (2–3)
              </h3>
            </div>
            <p className="text-xs text-[#78716C] mt-0.5">
              Practice recognizing this exact sound reduction in familiar daily conversations.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onRegenerateExamples(difficulty.id)}
            disabled={exampleStatus === 'loading'}
            className="min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border border-[#E7E5E4] hover:border-black transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={cn(
                'w-3.5 h-3.5',
                exampleStatus === 'loading' && 'animate-spin'
              )}
            />
            <span>Regenerate Examples</span>
          </button>
        </div>

        {exampleStatus === 'loading' ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-sm text-[#78716C]">
            <Loader2 className="w-5 h-5 animate-spin text-black" />
            <span>Generating B1-level spoken examples...</span>
          </div>
        ) : exampleError ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700">
            {exampleError}
          </div>
        ) : examples.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#78716C]">
            No examples generated yet. Click &ldquo;Regenerate Examples&rdquo; to create practice sentences.
          </div>
        ) : (
          <div className="space-y-3">
            {examples.map((ex, idx) => {
              const exSentenceKey = `ex-${ex.id}`;
              const exText = ex.tts_sentence || ex.sentence;
              const note = explanationLang === 'zh' ? ex.phonetic_note_zh : ex.phonetic_note_en;

              return (
                <SentenceAudioRow
                  key={ex.id}
                  sentenceKey={exSentenceKey}
                  sentence={ex.sentence}
                  ttsSentence={exText}
                  targetPhrase={ex.target_phrase_in_sentence}
                  simulatedPronunciation={ex.simulated_pronunciation}
                  isOriginal={false}
                  index={idx}
                  phoneticNote={note}
                  blindListen={blindListen}
                  activeSentenceKey={activeSentenceKey}
                  activeAccent={activeAccent}
                  audioStatus={audioStatus}
                  defaultAccent={defaultAccent}
                  defaultSpeed={defaultSpeed}
                  metadata={metadataByKey[exSentenceKey]}
                  verifying={verifyingKey === exSentenceKey}
                  onPlay={onPlay}
                  onStop={onStop}
                  onCompareAccents={onCompareAccents}
                  onVerify={onVerify}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
