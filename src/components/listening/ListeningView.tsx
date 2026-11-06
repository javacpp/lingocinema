import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Headphones,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAudioPlayer } from '../../hooks/useAudioPlayer.js';
import { useListeningDifficulties } from '../../hooks/useListeningDifficulties.js';
import {
  CATEGORY_BADGE_STYLES,
  formatLinkedPronunciation,
  formatPhoneticCategoryLabel,
} from '../../lib/phoneticHighlighter.js';
import type {
  AccentCode,
  PlaybackSpeedPreset,
} from '../../types/listening.js';
import { CategoryFilterBar } from './CategoryFilterBar.js';
import { DifficultyDetailCard } from './DifficultyDetailCard.js';
import { ListeningToolbar } from './ListeningToolbar.js';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ListeningViewProps {
  subtitleId: number;
  subtitleFilename?: string;
  providerKey?: string;
}

export const ListeningView: React.FC<ListeningViewProps> = ({ subtitleId, providerKey }) => {
  const {
    items,
    filteredItems,
    countsByCategory,
    selectedCategory,
    setSelectedCategory,
    searchTerm,
    setSearchTerm,
    hideMastered,
    setHideMastered,
    selectedDifficulty,
    setSelectedDifficultyId,
    isLoadingList,
    isAnalyzing,
    listError,
    examplesByDifficultyId,
    exampleStatusById,
    exampleErrorById,
    defaultAccent,
    setDefaultAccent,
    defaultSpeed,
    setDefaultSpeed,
    explanationLang,
    setExplanationLang,
    blindListen,
    setBlindListen,
    analyzeDifficulties,
    regenerateExamples,
    toggleMastery,
  } = useListeningDifficulties(subtitleId);

  const {
    status: audioStatus,
    activeSentenceKey,
    activeAccent,
    loopEnabled,
    setLoopEnabled,
    error: audioError,
    dismissError,
    verifyingKey,
    metadataByKey,
    play,
    stop,
    updateActiveSpeed,
    playAccentSequence,
    verifyClip,
  } = useAudioPlayer();

  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const handleSpeedSelect = (speed: PlaybackSpeedPreset) => {
    setDefaultSpeed(speed);
    updateActiveSpeed(speed);
  };

  const handlePlay = (params: {
    sentenceKey: string;
    text: string;
    accent: AccentCode;
    targetPhrase: string;
    simulatedPronunciation: string;
  }) => {
    void play({
      sentenceKey: params.sentenceKey,
      text: params.text,
      accent: params.accent,
      speed: defaultSpeed,
      category: selectedDifficulty?.category,
      targetPhrase: params.targetPhrase,
      simulatedPronunciation: params.simulatedPronunciation,
      providerKey,
    });
  };

  const handleCompareAccents = (params: {
    sentenceKey: string;
    text: string;
    targetPhrase: string;
    simulatedPronunciation: string;
  }) => {
    void playAccentSequence(
      {
        sentenceKey: params.sentenceKey,
        text: params.text,
        speed: defaultSpeed,
        category: selectedDifficulty?.category,
        targetPhrase: params.targetPhrase,
        simulatedPronunciation: params.simulatedPronunciation,
        providerKey,
      },
      ['uk', 'us', 'au']
    );
  };

  const handleVerify = (params: {
    sentenceKey: string;
    targetPhrase: string;
    simulatedPronunciation: string;
  }) => {
    void verifyClip(
      params.sentenceKey,
      params.targetPhrase,
      params.simulatedPronunciation
    );
  };

  const handleSelectDifficulty = (id: number) => {
    setSelectedDifficultyId(id);
    setMobileDetailOpen(true);
  };

  const selectedExamples = selectedDifficulty
    ? (examplesByDifficultyId[selectedDifficulty.id] ?? [])
    : [];
  const selectedExampleStatus = selectedDifficulty
    ? (exampleStatusById[selectedDifficulty.id] ?? 'idle')
    : 'idle';
  const selectedExampleError = selectedDifficulty
    ? exampleErrorById[selectedDifficulty.id]
    : undefined;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F5F5F4]">
      {/* ── Sticky Audio & Filter Control Toolbar ── */}
      <ListeningToolbar
        defaultAccent={defaultAccent}
        onAccentChange={setDefaultAccent}
        defaultSpeed={defaultSpeed}
        onSpeedChange={handleSpeedSelect}
        loopEnabled={loopEnabled}
        onToggleLoop={() => setLoopEnabled(!loopEnabled)}
        blindListen={blindListen}
        onToggleBlindListen={() => setBlindListen(!blindListen)}
        explanationLang={explanationLang}
        onToggleExplanationLang={() =>
          setExplanationLang(explanationLang === 'zh' ? 'en' : 'zh')
        }
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        hideMastered={hideMastered}
        onToggleHideMastered={() => setHideMastered(!hideMastered)}
        isAnalyzing={isAnalyzing}
        hasItems={items.length > 0}
        onAnalyze={() => void analyzeDifficulties(true)}
      />

      {/* ── Category Filter Pills Bar ── */}
      <CategoryFilterBar
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        countsByCategory={countsByCategory}
        totalCount={items.length}
      />

      {/* ── Error Banner ── */}
      {(listError || audioError) && (
        <div className="bg-red-50 border-b border-red-200 px-4 sm:px-8 py-2.5 flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{listError ?? audioError?.message}</span>
          </div>
          {audioError && (
            <button
              type="button"
              onClick={dismissError}
              className="font-bold underline hover:text-red-900"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* ── Content View ── */}
      {isLoadingList ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-[#78716C]">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-black" />
          <p className="text-sm font-medium">Loading listening difficulties...</p>
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center">
          <div className="w-16 h-16 bg-white rounded-2xl border border-[#E7E5E4] flex items-center justify-center mb-4 shadow-xs">
            <Headphones className="w-8 h-8 text-black" />
          </div>
          <h3 className="text-lg font-bold mb-2">No Listening Traps Extracted Yet</h3>
          <p className="text-sm text-[#78716C] max-w-md mb-6 leading-relaxed">
            Extract authentic connected speech phenomena (catenation, assimilation,
            elision, weak forms, H-dropping, contractions, and subtitle mishearing traps)
            with 5-accent interactive audio drill sentences.
          </p>
          <button
            type="button"
            onClick={() => void analyzeDifficulties(true)}
            disabled={isAnalyzing}
            className="min-h-[44px] flex items-center gap-2 bg-black text-white px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-zinc-800 transition-all disabled:opacity-50 shadow-xs"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{isAnalyzing ? 'Analyzing Connected Speech...' : 'Extract Listening Traps Now'}</span>
          </button>
        </div>
      ) : (
        /* Master-Detail Split Container */
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Difficulty List */}
          <div
            className={cn(
              'w-full md:w-80 lg:w-96 border-r border-[#E7E5E4] bg-white overflow-y-auto divide-y divide-[#E7E5E4]',
              mobileDetailOpen ? 'hidden md:block' : 'block'
            )}
          >
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#78716C]">
                No listening traps match your current filters.
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedDifficulty?.id === item.id;
                const formattedSim = formatLinkedPronunciation(
                  item.simulated_pronunciation,
                  ' ‿ '
                );

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectDifficulty(item.id)}
                    className={cn(
                      'min-h-[44px] w-full text-left p-4 sm:p-5 transition-all hover:bg-[#F5F5F4]/70',
                      isSelected && 'bg-[#F5F5F4] md:border-l-4 md:border-l-black'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border',
                          CATEGORY_BADGE_STYLES[item.category]
                        )}
                      >
                        {formatPhoneticCategoryLabel(item.category)}
                      </span>
                      <div className="flex items-center gap-2">
                        {item.cue_start_time && (
                          <span className="text-[11px] font-mono text-[#78716C] flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {item.cue_start_time.split(',')[0]}
                          </span>
                        )}
                        {item.is_mastered && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-baseline gap-2 mb-1">
                      <span
                        className={cn(
                          'text-base font-bold text-[#1C1917]',
                          blindListen && 'blur-xs select-none'
                        )}
                      >
                        {item.phrase}
                      </span>
                      <span className="text-xs font-mono text-emerald-700 font-semibold">
                        → &ldquo;{formattedSim || item.simulated_pronunciation}&rdquo;
                      </span>
                    </div>

                    <p
                      className={cn(
                        'text-xs text-[#78716C] line-clamp-2',
                        blindListen && 'blur-xs select-none'
                      )}
                    >
                      {item.original_sentence}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Column: Selected Detail Card & Audio Drills */}
          <div
            className={cn(
              'flex-1 overflow-y-auto p-4 sm:p-8',
              mobileDetailOpen ? 'block' : 'hidden md:block'
            )}
          >
            {/* Mobile Back Button */}
            <div className="md:hidden mb-4">
              <button
                type="button"
                onClick={() => setMobileDetailOpen(false)}
                className="min-h-[44px] flex items-center gap-2 text-xs font-bold text-[#78716C] hover:text-black bg-white px-4 py-2 rounded-full border border-[#E7E5E4]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Listening Traps</span>
              </button>
            </div>

            {selectedDifficulty ? (
              <DifficultyDetailCard
                difficulty={selectedDifficulty}
                explanationLang={explanationLang}
                blindListen={blindListen}
                examples={selectedExamples}
                exampleStatus={selectedExampleStatus}
                exampleError={selectedExampleError}
                onToggleMastery={toggleMastery}
                onRegenerateExamples={regenerateExamples}
                activeSentenceKey={activeSentenceKey}
                activeAccent={activeAccent}
                audioStatus={audioStatus}
                defaultAccent={defaultAccent}
                defaultSpeed={defaultSpeed}
                metadataByKey={metadataByKey}
                verifyingKey={verifyingKey}
                onPlay={handlePlay}
                onStop={stop}
                onCompareAccents={handleCompareAccents}
                onVerify={handleVerify}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-[#78716C]">
                Select a listening trap from the list to view phonetic explanations and audio drills.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
