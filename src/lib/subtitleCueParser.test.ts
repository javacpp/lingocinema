import { describe, expect, it } from 'vitest';
import { SAMPLE_SRT, SAMPLE_VTT } from '../test/fakes.js';
import { GOLDEN_PART2_ITEMS } from '../test/fixtures/listeningDifficulties.fixture.js';
import {
  formatCuesForListeningPrompt,
  parseSubtitleCues,
  resolveCueLink,
} from './subtitleCueParser.js';

describe('subtitleCueParser', () => {
  describe('parseSubtitleCues', () => {
    it('parses standard .srt content into indexed cues with normalized timestamps and cleanText', () => {
      const cues = parseSubtitleCues(SAMPLE_SRT);

      expect(cues).toHaveLength(7);
      expect(cues[0]).toEqual({
        cueIndex: 12,
        startTime: '00:01:14,200',
        endTime: '00:01:17,050',
        rawText: "It's nothing. It's easy. It is in and out.",
        cleanText: "It's nothing. It's easy. It is in and out.",
      });

      // Cue 78 has [muffled] stage direction and leading ellipsis
      expect(cues[2]).toEqual({
        cueIndex: 78,
        startTime: '00:08:19,000',
        endTime: '00:08:22,400',
        rawText: '[muffled] ...maybe a good next step is to take your jacket off.',
        cleanText: 'maybe a good next step is to take your jacket off.',
      });
    });

    it('parses .vtt content with WEBVTT header and dot-millisecond timestamps', () => {
      const cues = parseSubtitleCues(SAMPLE_VTT);

      expect(cues).toHaveLength(7);
      expect(cues[0]).toEqual({
        cueIndex: 12,
        startTime: '00:01:14,200',
        endTime: '00:01:17,050',
        rawText: "It's nothing. It's easy. It is in and out.",
        cleanText: "It's nothing. It's easy. It is in and out.",
      });
      expect(cues[6]).toEqual({
        cueIndex: 210,
        startTime: '00:24:11,000',
        endTime: '00:24:14,500',
        rawText: 'It was signed like the Magma Cara in 1215.',
        cleanText: 'It was signed like the Magma Cara in 1215.',
      });
    });

    it('parses unnumbered .vtt cues with cue settings and HTML tags', () => {
      const vttWithoutCueNumbers = `WEBVTT
Kind: captions
Language: en

00:00:05.100 --> 00:00:07.800 align:start position:10%
<i>Did you</i> see that?

00:00:09.000 --> 00:00:11.250
(sighs) I could have told him.
`;
      const cues = parseSubtitleCues(vttWithoutCueNumbers);

      expect(cues).toHaveLength(2);
      expect(cues[0]).toEqual({
        cueIndex: 1,
        startTime: '00:00:05,100',
        endTime: '00:00:07,800',
        rawText: '<i>Did you</i> see that?',
        cleanText: 'Did you see that?',
      });
      expect(cues[1]).toEqual({
        cueIndex: 2,
        startTime: '00:00:09,000',
        endTime: '00:00:11,250',
        rawText: '(sighs) I could have told him.',
        cleanText: 'I could have told him.',
      });
    });

    it('falls back to plain text lines with cueIndex: null when content has no timestamps', () => {
      const plainTranscript = `
It's nothing. It's easy. It is in and out.
[muffled] ...maybe a good next step is to take your jacket off.
`;
      const cues = parseSubtitleCues(plainTranscript);

      expect(cues).toHaveLength(2);
      expect(cues[0]).toEqual({
        cueIndex: null,
        startTime: null,
        endTime: null,
        rawText: "It's nothing. It's easy. It is in and out.",
        cleanText: "It's nothing. It's easy. It is in and out.",
      });
      expect(cues[1]).toEqual({
        cueIndex: null,
        startTime: null,
        endTime: null,
        rawText: '[muffled] ...maybe a good next step is to take your jacket off.',
        cleanText: 'maybe a good next step is to take your jacket off.',
      });
    });

    it('returns an empty array for empty or whitespace-only input', () => {
      expect(parseSubtitleCues('')).toEqual([]);
      expect(parseSubtitleCues('   \n\t  ')).toEqual([]);
    });
  });

  describe('formatCuesForListeningPrompt', () => {
    it('formats timestamped cues as [#index startTime -> endTime] text lines', () => {
      const cues = parseSubtitleCues(SAMPLE_SRT);
      const formatted = formatCuesForListeningPrompt(cues);
      const lines = formatted.split('\n');

      expect(lines).toHaveLength(7);
      expect(lines[0]).toBe(
        "[#12 00:01:14,200 -> 00:01:17,050] It's nothing. It's easy. It is in and out."
      );
      expect(lines[1]).toBe('[#45 00:04:02,100 -> 00:04:04,500] Would you have come if he did?');
      expect(lines[2]).toBe(
        '[#78 00:08:19,000 -> 00:08:22,400] [muffled] ...maybe a good next step is to take your jacket off.'
      );
    });

    it('formats plain text fallback cues without bracketed timestamp prefix', () => {
      const cues = parseSubtitleCues('First line of dialogue.\nSecond line of dialogue.');
      const formatted = formatCuesForListeningPrompt(cues);

      expect(formatted).toBe('First line of dialogue.\nSecond line of dialogue.');
    });
  });

  describe('resolveCueLink', () => {
    const cues = parseSubtitleCues(SAMPLE_SRT);

    it('resolves exact cue_index when sentence overlaps with that cue', () => {
      for (const item of GOLDEN_PART2_ITEMS) {
        const link = resolveCueLink(cues, item.cue_index ?? undefined, item.original_sentence);
        expect(link).toEqual({
          cueIndex: item.cue_index,
          startTime: item.cue_start_time,
          endTime: item.cue_end_time,
        });
      }
    });

    it('recovers the correct cue via fuzzy substring/token match when LLM returns a shifted cue_index', () => {
      // Cue 45 is "Would you have come if he did?", but LLM reports cue_index 46 or 12
      const shiftedToNonExistent = resolveCueLink(cues, 46, 'Would you have come if he did?');
      expect(shiftedToNonExistent).toEqual({
        cueIndex: 45,
        startTime: '00:04:02,100',
        endTime: '00:04:04,500',
      });

      const shiftedToWrongCue = resolveCueLink(cues, 12, 'Would you have come if he did?');
      expect(shiftedToWrongCue).toEqual({
        cueIndex: 45,
        startTime: '00:04:02,100',
        endTime: '00:04:04,500',
      });
    });

    it('recovers the correct cue when candidateIdx is undefined or null', () => {
      const fromUndefined = resolveCueLink(
        cues,
        undefined,
        'maybe a good next step is to take your jacket off.'
      );
      expect(fromUndefined).toEqual({
        cueIndex: 78,
        startTime: '00:08:19,000',
        endTime: '00:08:22,400',
      });

      // Fuzzy token match when sentence has corrected typo ("Magna Carta" vs "Magma Cara")
      const fromTypoCorrected = resolveCueLink(
        cues,
        undefined,
        'It was signed like the Magna Carta in 1215.'
      );
      expect(fromTypoCorrected).toEqual({
        cueIndex: 210,
        startTime: '00:24:11,000',
        endTime: '00:24:14,500',
      });
    });

    it('returns null fields when sentence does not match any cue and candidateIdx is invalid', () => {
      const result = resolveCueLink(
        cues,
        999,
        'Completely unrelated sentence not present in this subtitle.'
      );
      expect(result).toEqual({
        cueIndex: null,
        startTime: null,
        endTime: null,
      });
    });

    it('returns null fields for plain text fallback cues', () => {
      const plainCues = parseSubtitleCues('Would you have come if he did?');
      const result = resolveCueLink(plainCues, undefined, 'Would you have come if he did?');
      expect(result).toEqual({
        cueIndex: null,
        startTime: null,
        endTime: null,
      });
    });
  });
});
