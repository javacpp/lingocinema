import SrtParser from 'srt-parser-2';

export interface SubtitleCue {
  cueIndex: number | null;
  startTime: string | null;
  endTime: string | null;
  rawText: string;
  cleanText: string;
}

export interface CueLinkResult {
  cueIndex: number | null;
  startTime: string | null;
  endTime: string | null;
}

const TIMESTAMP_LINE_REGEX =
  /^\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{1,3})(?:\s+.*)?$/;

function normalizeTimestampToken(token: string): string {
  const withComma = token.trim().replace('.', ',');
  const colonCount = (withComma.match(/:/g) ?? []).length;
  return colonCount === 1 ? `00:${withComma}` : withComma;
}

/**
 * Cleans subtitle markup (HTML/VTT tags, ASS override tags), stage directions ([muffled], (sighs)),
 * leading ellipses, and collapses whitespace into a single line.
 */
export function cleanSubtitleText(rawText: string): string {
  return rawText
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\\[^}]*\}/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.{2,}\s*/, '')
    .trim();
}

/**
 * Pre-normalizes both .srt and .vtt input (including unnumbered VTT cues and VTT cue settings)
 * into canonical numbered SRT blocks for `srt-parser-2`.
 */
function normalizeForSrtParser(content: string): string {
  const lines = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const outLines: string[] = [];
  let autoIndex = 1;

  for (const line of lines) {
    const match = line.match(TIMESTAMP_LINE_REGEX);
    if (match) {
      const startNorm = normalizeTimestampToken(match[1]);
      const endNorm = normalizeTimestampToken(match[2]);
      const prevLine = outLines.length > 0 ? outLines[outLines.length - 1].trim() : '';

      if (/^\d+$/.test(prevLine)) {
        const explicitId = parseInt(prevLine, 10);
        outLines[outLines.length - 1] = String(explicitId);
        autoIndex = Math.max(autoIndex, explicitId + 1);
      } else {
        if (prevLine !== '') {
          outLines.push('');
        }
        outLines.push(String(autoIndex));
        autoIndex += 1;
      }

      outLines.push(`${startNorm} --> ${endNorm}`);
    } else {
      outLines.push(line);
    }
  }

  return outLines.join('\n');
}

/**
 * Parses .srt, .vtt, or plain transcript text into indexed cues.
 */
export function parseSubtitleCues(content: string): SubtitleCue[] {
  if (!content || !content.trim()) {
    return [];
  }

  const parser = new SrtParser();
  const normalized = normalizeForSrtParser(content);
  const parsed = parser.fromSrt(normalized);

  if (parsed.length > 0) {
    return parsed.map((item, idx) => {
      const parsedId = parseInt(item.id, 10);
      const cueIndex = Number.isNaN(parsedId) ? idx + 1 : parsedId;
      const rawText = item.text.replace(/\s*\n\s*/g, ' ').trim();
      return {
        cueIndex,
        startTime: item.startTime,
        endTime: item.endTime,
        rawText,
        cleanText: cleanSubtitleText(rawText),
      };
    });
  }

  // Fallback for plain text transcripts without timestamps
  const plainLines = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^WEBVTT\b/i.test(line));

  return plainLines.map((rawText) => ({
    cueIndex: null,
    startTime: null,
    endTime: null,
    rawText,
    cleanText: cleanSubtitleText(rawText),
  }));
}

/**
 * Formats parsed subtitle cues into compact `[#index startTime -> endTime] text` lines
 * for the Part 2 Listening Difficulties LLM prompt.
 */
export function formatCuesForListeningPrompt(cues: SubtitleCue[]): string {
  return cues
    .map((cue) => {
      if (cue.cueIndex !== null && cue.startTime && cue.endTime) {
        return `[#${cue.cueIndex} ${cue.startTime} -> ${cue.endTime}] ${cue.rawText}`;
      }
      if (cue.cueIndex !== null && cue.startTime) {
        return `[#${cue.cueIndex} ${cue.startTime}] ${cue.rawText}`;
      }
      return cue.rawText;
    })
    .join('\n');
}

function normalizeForMatch(text: string): string {
  return cleanSubtitleText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalizedText: string): string[] {
  if (!normalizedText) return [];
  return normalizedText.split(' ').filter((token) => token.length > 0);
}

function computeSimilarityScore(
  normSentence: string,
  sentenceTokens: string[],
  cue: SubtitleCue
): number {
  const normCue = normalizeForMatch(cue.cleanText || cue.rawText);
  if (!normSentence || !normCue) return 0;

  if (normCue === normSentence) {
    return 1.0;
  }
  if (normCue.includes(normSentence) || normSentence.includes(normCue)) {
    return 0.9;
  }

  const cueTokens = tokenize(normCue);
  if (sentenceTokens.length === 0 || cueTokens.length === 0) {
    return 0;
  }

  const cueTokenSet = new Set(cueTokens);
  let sharedCount = 0;
  for (const token of sentenceTokens) {
    if (cueTokenSet.has(token)) {
      sharedCount += 1;
    }
  }

  const minLen = Math.min(sentenceTokens.length, cueTokens.length);
  return sharedCount / minLen;
}

/**
 * Resolves and verifies a cue's index and timestamps given a candidate index and/or extracted sentence.
 * Falls back to fuzzy substring/token matching when the LLM shifts or omits `cue_index`.
 */
export function resolveCueLink(
  cues: SubtitleCue[],
  candidateIdx?: number | null,
  sentence?: string
): CueLinkResult {
  const emptyResult: CueLinkResult = {
    cueIndex: null,
    startTime: null,
    endTime: null,
  };

  if (cues.length === 0) {
    return emptyResult;
  }

  const normSentence = sentence ? normalizeForMatch(sentence) : '';
  const sentenceTokens = tokenize(normSentence);

  // 1. Check exact candidateIdx match first
  if (candidateIdx !== undefined && candidateIdx !== null) {
    const exactCue = cues.find((c) => c.cueIndex === candidateIdx);
    if (exactCue && exactCue.cueIndex !== null) {
      if (!normSentence) {
        return {
          cueIndex: exactCue.cueIndex,
          startTime: exactCue.startTime,
          endTime: exactCue.endTime,
        };
      }
      const score = computeSimilarityScore(normSentence, sentenceTokens, exactCue);
      if (score >= 0.45) {
        return {
          cueIndex: exactCue.cueIndex,
          startTime: exactCue.startTime,
          endTime: exactCue.endTime,
        };
      }
    }
  }

  // 2. Fuzzy substring & token overlap search across all timestamped cues
  if (normSentence) {
    let bestCue: SubtitleCue | null = null;
    let bestScore = 0;

    for (const cue of cues) {
      if (cue.cueIndex === null) continue;

      const baseScore = computeSimilarityScore(normSentence, sentenceTokens, cue);
      if (baseScore < 0.45) continue;

      const proximityBonus =
        candidateIdx !== undefined && candidateIdx !== null
          ? 0.02 / (1 + Math.abs(cue.cueIndex - candidateIdx))
          : 0;
      const totalScore = baseScore + proximityBonus;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestCue = cue;
      }
    }

    if (bestCue) {
      return {
        cueIndex: bestCue.cueIndex,
        startTime: bestCue.startTime,
        endTime: bestCue.endTime,
      };
    }
  }

  return emptyResult;
}
