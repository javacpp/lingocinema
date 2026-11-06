import React from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  Repeat,
  Search,
  Sparkles,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  PLAYBACK_SPEED_RATES,
  type AccentCode,
  type PlaybackSpeedPreset,
} from '../../types/listening.js';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ListeningToolbarProps {
  defaultAccent: AccentCode;
  onAccentChange: (accent: AccentCode) => void;
  defaultSpeed: PlaybackSpeedPreset;
  onSpeedChange: (speed: PlaybackSpeedPreset) => void;
  loopEnabled: boolean;
  onToggleLoop: () => void;
  blindListen: boolean;
  onToggleBlindListen: () => void;
  explanationLang: 'zh' | 'en';
  onToggleExplanationLang: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  hideMastered: boolean;
  onToggleHideMastered: () => void;
  isAnalyzing: boolean;
  hasItems: boolean;
  onAnalyze: () => void;
}

const ACCENT_OPTIONS: { code: AccentCode; flag: string; label: string; name: string }[] = [
  { code: 'uk', flag: '🇬🇧', label: 'UK', name: 'British (UK)' },
  { code: 'us', flag: '🇺🇸', label: 'US', name: 'American (US)' },
  { code: 'au', flag: '🇦🇺', label: 'AU', name: 'Australian (AU)' },
  { code: 'nz', flag: '🇳🇿', label: 'NZ~', name: 'New Zealand (NZ - Approx)' },
  { code: 'in', flag: '🇮🇳', label: 'IN', name: 'Indian (IN)' },
];

const SPEED_OPTIONS: { preset: PlaybackSpeedPreset; icon: string; label: string }[] = [
  { preset: 'slow', icon: '🐢', label: `0.78x (${PLAYBACK_SPEED_RATES.slow}x)` },
  { preset: 'normal', icon: '▶', label: '1.0x (Normal)' },
  { preset: 'fast', icon: '⚡', label: `1.22x (${PLAYBACK_SPEED_RATES.fast}x)` },
];

export const ListeningToolbar: React.FC<ListeningToolbarProps> = ({
  defaultAccent,
  onAccentChange,
  defaultSpeed,
  onSpeedChange,
  loopEnabled,
  onToggleLoop,
  blindListen,
  onToggleBlindListen,
  explanationLang,
  onToggleExplanationLang,
  searchTerm,
  onSearchChange,
  hideMastered,
  onToggleHideMastered,
  isAnalyzing,
  hasItems,
  onAnalyze,
}) => {
  return (
    <div className="border-b border-[#E7E5E4] bg-white px-4 sm:px-8 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Accent, Speed & Learning Aid Toggles */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Global Accent Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider hidden sm:inline">
              Accent:
            </span>
            <div className="flex bg-[#F5F5F4] p-0.5 rounded-lg gap-0.5">
              {ACCENT_OPTIONS.map((acc) => (
                <button
                  key={acc.code}
                  type="button"
                  onClick={() => onAccentChange(acc.code)}
                  title={acc.name}
                  className={cn(
                    'min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-2.5 py-1.5 sm:py-1 rounded text-xs font-bold transition-all flex items-center justify-center gap-1',
                    defaultAccent === acc.code
                      ? 'bg-black text-white shadow-xs'
                      : 'text-[#78716C] hover:text-black'
                  )}
                >
                  <span className="text-xs">{acc.flag}</span>
                  <span>{acc.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-[#E7E5E4] hidden md:block" />

          {/* Global Speed Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-[#A8A29E] uppercase tracking-wider hidden sm:inline">
              Speed:
            </span>
            <div className="flex bg-[#F5F5F4] p-0.5 rounded-lg gap-0.5">
              {SPEED_OPTIONS.map((sp) => (
                <button
                  key={sp.preset}
                  type="button"
                  onClick={() => onSpeedChange(sp.preset)}
                  className={cn(
                    'min-h-[44px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 rounded text-xs font-bold transition-all flex items-center justify-center gap-1',
                    defaultSpeed === sp.preset
                      ? 'bg-black text-white shadow-xs'
                      : 'text-[#78716C] hover:text-black'
                  )}
                >
                  <span>{sp.icon}</span>
                  <span>{sp.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-4 w-px bg-[#E7E5E4] hidden lg:block" />

          {/* Loop, Blind Listen & Explanation Lang Toggles */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleLoop}
              title={loopEnabled ? 'Looping enabled' : 'Click to enable looping'}
              className={cn(
                'min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold border transition-all',
                loopEnabled
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-[#78716C] border-[#E7E5E4] hover:border-black/30'
              )}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>Loop</span>
            </button>

            <button
              type="button"
              onClick={onToggleBlindListen}
              title={blindListen ? 'Blind listen active (text blurred)' : 'Click to hide text and test your ears'}
              className={cn(
                'min-h-[44px] sm:min-h-0 flex items-center gap-1.5 px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold border transition-all',
                blindListen
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-[#78716C] border-[#E7E5E4] hover:border-black/30'
              )}
            >
              {blindListen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>Blind Listen</span>
            </button>

            <button
              type="button"
              onClick={onToggleExplanationLang}
              className="min-h-[44px] sm:min-h-0 px-3 py-1.5 sm:py-1 rounded-lg text-xs font-bold border border-[#E7E5E4] bg-white text-[#1C1917] hover:border-black/30 transition-all"
            >
              {explanationLang === 'zh' ? 'Explain: 中文' : 'Explain: EN'}
            </button>
          </div>
        </div>

        {/* Search, Filter Mastered & Analyze CTA */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A8A29E]" />
            <input
              type="text"
              placeholder="Search listening traps..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="min-h-[44px] sm:min-h-0 pl-9 pr-4 py-1.5 bg-[#F5F5F4] border-none rounded-full text-sm w-44 sm:w-56 focus:ring-2 focus:ring-black/5 transition-all text-[#1C1917]"
            />
          </div>

          <button
            type="button"
            onClick={onToggleHideMastered}
            className={cn(
              'min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
              hideMastered
                ? 'bg-black text-white border-black'
                : 'bg-white text-[#78716C] border-[#E7E5E4] hover:border-black/30'
            )}
          >
            {hideMastered ? 'Showing Unmastered' : 'Hide Mastered'}
          </button>

          <button
            type="button"
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="min-h-[44px] sm:min-h-0 flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{hasItems ? 'Re-analyze Traps' : 'Extract Listening Traps'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
