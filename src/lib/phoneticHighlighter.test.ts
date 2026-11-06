import { describe, expect, it } from 'vitest';
import {
  formatLinkedPronunciation,
  highlightTargetPhrase,
  tokenizeSimulatedPronunciation,
} from './phoneticHighlighter.js';

describe('phoneticHighlighter', () => {
  describe('tokenizeSimulatedPronunciation', () => {
    it('splits hyphenated syllables into tokens', () => {
      expect(tokenizeSimulatedPronunciation('woul-dja')).toEqual(['woul', 'dja']);
      expect(tokenizeSimulatedPronunciation('i-nan-dout')).toEqual(['i', 'nan', 'dout']);
      expect(tokenizeSimulatedPronunciation('nex-step')).toEqual(['nex', 'step']);
    });

    it('handles extra hyphens, spaces, and empty strings gracefully', () => {
      expect(tokenizeSimulatedPronunciation('  woul - dja  ')).toEqual(['woul', 'dja']);
      expect(tokenizeSimulatedPronunciation('--tell--im--')).toEqual(['tell', 'im']);
      expect(tokenizeSimulatedPronunciation('')).toEqual([]);
    });

    it('splits tokens separated by slashes or dots if present', () => {
      expect(tokenizeSimulatedPronunciation('gonna/gunna')).toEqual(['gonna', 'gunna']);
      expect(tokenizeSimulatedPronunciation('woul·dja')).toEqual(['woul', 'dja']);
    });
  });

  describe('formatLinkedPronunciation', () => {
    it('formats hyphenated pronunciation with linking ligature symbol', () => {
      expect(formatLinkedPronunciation('woul-dja')).toBe('woul ‿ dja');
      expect(formatLinkedPronunciation('i-nan-dout')).toBe('i ‿ nan ‿ dout');
    });

    it('allows custom ligature separator', () => {
      expect(formatLinkedPronunciation('woul-dja', '·')).toBe('woul·dja');
      expect(formatLinkedPronunciation('woul-dja', '-')).toBe('woul-dja');
    });

    it('returns single token as-is without extra separator', () => {
      expect(formatLinkedPronunciation('gonna')).toBe('gonna');
      expect(formatLinkedPronunciation('')).toBe('');
    });
  });

  describe('highlightTargetPhrase', () => {
    it('splits sentence around target phrase for highlighting', () => {
      const segments = highlightTargetPhrase('Why would you do that?', 'would you');
      expect(segments).toEqual([
        { text: 'Why ', isMatch: false },
        { text: 'would you', isMatch: true },
        { text: ' do that?', isMatch: false },
      ]);
    });

    it('matches target phrase case-insensitively while preserving original case', () => {
      const segments = highlightTargetPhrase('Would you please listen?', 'would you');
      expect(segments).toEqual([
        { text: '', isMatch: false },
        { text: 'Would you', isMatch: true },
        { text: ' please listen?', isMatch: false },
      ]);
    });

    it('returns entire sentence as non-match when target phrase is not found', () => {
      const segments = highlightTargetPhrase('Hello world', 'goodbye');
      expect(segments).toEqual([{ text: 'Hello world', isMatch: false }]);
    });

    it('returns entire sentence as non-match when target phrase is empty', () => {
      const segments = highlightTargetPhrase('Hello world', '');
      expect(segments).toEqual([{ text: 'Hello world', isMatch: false }]);
    });

    it('strips surrounding quotes in target phrase when matching', () => {
      const segments = highlightTargetPhrase('He said in and out quickly.', '"in and out"');
      expect(segments).toEqual([
        { text: 'He said ', isMatch: false },
        { text: 'in and out', isMatch: true },
        { text: ' quickly.', isMatch: false },
      ]);
    });

    it('handles target phrase at the very end of sentence', () => {
      const segments = highlightTargetPhrase('I will tell him', 'tell him');
      expect(segments).toEqual([
        { text: 'I will ', isMatch: false },
        { text: 'tell him', isMatch: true },
        { text: '', isMatch: false },
      ]);
    });
  });
});
