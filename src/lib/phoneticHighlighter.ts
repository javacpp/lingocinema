import type { PhoneticCategory } from '../types/listening.js';

/**
 * Phonetic Token Highlighter & Ligature Formatter
 *
 * Provides utilities for:
 * 1. Splitting simulated pronunciations (e.g., 'woul-dja' -> ['woul', 'dja']) and formatting with
 *    phonetic ligatures ('woul ‿ dja').
 * 2. Case-insensitively segmenting sentences around target phrases for UI highlight rendering.
 * 3. Phonetic category metadata, badge styling classes, and display labels.
 */

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

export interface CategoryOption {
  key: PhoneticCategory | 'all';
  label: string;
}

export const LISTENING_CATEGORIES: CategoryOption[] = [
  { key: 'all', label: 'All' },
  { key: 'catenation', label: 'Catenation' },
  { key: 'assimilation', label: 'Assimilation' },
  { key: 'elision', label: 'Elision' },
  { key: 'weak_forms', label: 'Weak Forms' },
  { key: 'h_dropping', label: 'H-Drop' },
  { key: 'contractions', label: 'Contractions' },
  { key: 'confusion', label: 'Confusion Traps' },
];

export const CATEGORY_BADGE_STYLES: Record<PhoneticCategory, string> = {
  catenation: 'bg-blue-50 text-blue-700 border-blue-200',
  assimilation: 'bg-purple-50 text-purple-700 border-purple-200',
  elision: 'bg-amber-50 text-amber-700 border-amber-200',
  weak_forms: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  h_dropping: 'bg-rose-50 text-rose-700 border-rose-200',
  contractions: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  confusion: 'bg-orange-50 text-orange-700 border-orange-200',
};

export function formatPhoneticCategoryLabel(category: PhoneticCategory): string {
  const found = LISTENING_CATEGORIES.find((c) => c.key === category);
  return found ? found.label : category;
}

/**
 * Splits a hyphenated or punctuated simulated pronunciation string into individual syllable tokens.
 * Example: 'woul-dja' -> ['woul', 'dja']
 */
export function tokenizeSimulatedPronunciation(pronunciation: string): string[] {
  if (!pronunciation || !pronunciation.trim()) {
    return [];
  }

  // Split on hyphens, en-dashes, em-dashes, middle dots, slashes, or whitespace
  return pronunciation
    .split(/[-–—·/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Formats a simulated pronunciation string by joining syllables with a linking ligature symbol.
 * Default symbol: ' ‿ ' (undertie ligature).
 * Example: 'woul-dja' -> 'woul ‿ dja'
 */
export function formatLinkedPronunciation(
  pronunciation: string,
  separator = ' ‿ '
): string {
  const tokens = tokenizeSimulatedPronunciation(pronunciation);
  if (tokens.length === 0) {
    return '';
  }
  return tokens.join(separator);
}

/**
 * Splits a sentence around the first occurrence of a target phrase for highlighted rendering.
 * Matches case-insensitively while preserving the sentence's original casing.
 * If targetPhrase is not found or empty, returns a single non-matching segment.
 */
export function highlightTargetPhrase(
  sentence: string,
  targetPhrase: string
): HighlightSegment[] {
  if (!sentence) {
    return [];
  }

  const cleanTarget = targetPhrase ? targetPhrase.trim().replace(/^["']|["']$/g, '') : '';
  if (!cleanTarget) {
    return [{ text: sentence, isMatch: false }];
  }

  const lowerSentence = sentence.toLowerCase();
  const lowerTarget = cleanTarget.toLowerCase();
  const matchIndex = lowerSentence.indexOf(lowerTarget);

  if (matchIndex === -1) {
    return [{ text: sentence, isMatch: false }];
  }

  const before = sentence.slice(0, matchIndex);
  const match = sentence.slice(matchIndex, matchIndex + cleanTarget.length);
  const after = sentence.slice(matchIndex + cleanTarget.length);

  return [
    { text: before, isMatch: false },
    { text: match, isMatch: true },
    { text: after, isMatch: false },
  ];
}
