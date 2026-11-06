import {
  DifficultyPriority,
  LISTENING_SCHEMA_VERSION,
  NewListeningDifficulty,
  NewListeningExample,
  PhoneticCategory,
} from '../types/listening.js';

export interface ValidatedDifficultyItem extends NewListeningDifficulty {
  schema_version: number;
  normalized_phrase: string;
}

export interface ListeningDifficultyTarget {
  category: PhoneticCategory;
  phrase: string;
  spoken_phrase?: string;
  spokenPhrase?: string;
  simulated_pronunciation?: string;
  simulatedPronunciation?: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  items: T;
  errors: string[];
  feedback: string;
}

const VALID_CATEGORIES = new Set<PhoneticCategory>([
  'catenation',
  'assimilation',
  'elision',
  'weak_forms',
  'h_dropping',
  'contractions',
  'confusion',
]);

const VALID_PRIORITIES = new Set<DifficultyPriority>(['high', 'medium', 'core']);

function isPhoneticCategory(value: unknown): value is PhoneticCategory {
  return typeof value === 'string' && VALID_CATEGORIES.has(value as PhoneticCategory);
}

function isDifficultyPriority(value: unknown): value is DifficultyPriority {
  return typeof value === 'string' && VALID_PRIORITIES.has(value as DifficultyPriority);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes a phrase into its canonical deduplication key (lowercase, trimmed, single spaces).
 */
export function normalizePhraseKey(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Strips bracketed/parenthetical stage directions (`[muffled]`, `(sighs)`), HTML/ASS tags,
 * leading ellipses, and collapses whitespace.
 */
export function stripStageDirections(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\\[^}]*\}/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.{2,}\s*/, '')
    .trim();
}

function extractIndividualObjects(text: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === '{') {
      let depth = 0;
      const start = i;
      let inString = false;
      let escape = false;
      let closedAt = -1;

      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (ch === '{') depth += 1;
        if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            const candidate = text.slice(start, j + 1);
            try {
              const parsed: unknown = JSON.parse(candidate);
              if (isRecord(parsed)) {
                results.push(parsed);
              }
            } catch {
              // Skip malformed object fragment
            }
            closedAt = j + 1;
            break;
          }
        }
      }

      i = closedAt !== -1 ? closedAt : text.length;
    } else {
      i += 1;
    }
  }

  return results;
}

function unwrapArrayPayload(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isRecord(parsed)) {
    for (const val of Object.values(parsed)) {
      if (Array.isArray(val)) {
        return val;
      }
    }
    return [parsed];
  }
  return [];
}

/**
 * Multi-stage JSON array parser and truncation repair engine:
 * 1. Strips `<think>...</think>` reasoning blocks and markdown code fences.
 * 2. Attempts direct `JSON.parse`.
 * 3. Recovers truncated JSON arrays by closing at the last complete `}`.
 * 4. Falls back to brace-depth object extraction.
 */
export function parseAndRepairJsonArray(rawText: string): unknown[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  let cleaned = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const firstBracket = cleaned.indexOf('[');
  const firstBrace = cleaned.indexOf('{');

  let jsonStart = -1;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket <= firstBrace)) {
    jsonStart = firstBracket;
  } else if (firstBrace !== -1) {
    jsonStart = firstBrace;
  }

  if (jsonStart > 0) {
    cleaned = cleaned.slice(jsonStart);
  }

  try {
    const direct: unknown = JSON.parse(cleaned);
    return unwrapArrayPayload(direct);
  } catch {
    // Stage 2: Truncation repair at last closing brace
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace !== -1) {
      let repaired = cleaned.slice(0, lastBrace + 1).replace(/,\s*$/, '');
      if (!repaired.startsWith('[')) {
        repaired = '[' + repaired;
      }
      if (!repaired.endsWith(']')) {
        repaired += ']';
      }
      try {
        const recovered: unknown = JSON.parse(repaired);
        const unwrapped = unwrapArrayPayload(recovered);
        if (unwrapped.length > 0) {
          return unwrapped;
        }
      } catch {
        // Fall through to Stage 3
      }
    }

    // Stage 3: Brace-depth object extraction
    return extractIndividualObjects(cleaned);
  }
}

function coerceArrayInput(raw: unknown): unknown[] {
  if (typeof raw === 'string') {
    return parseAndRepairJsonArray(raw);
  }
  return unwrapArrayPayload(raw);
}

/**
 * Runtime schema validator and deduplicator for Part 2 Listening Difficulty items.
 * Deduplicates by `(category, normalized_phrase)` (first occurrence wins).
 */
export function validateListeningExtractResponse(raw: unknown): ValidatedDifficultyItem[] {
  const candidates = coerceArrayInput(raw);
  const results: ValidatedDifficultyItem[] = [];
  const seenKeys = new Set<string>();

  for (const item of candidates) {
    if (!isRecord(item)) continue;

    const categoryRaw = typeof item.category === 'string' ? item.category.trim().toLowerCase() : '';
    if (!isPhoneticCategory(categoryRaw)) continue;

    const phrase = typeof item.phrase === 'string' ? item.phrase.trim() : '';
    if (!phrase) continue;

    const normalizedPhrase = normalizePhraseKey(phrase);
    const dedupKey = `${categoryRaw}::${normalizedPhrase}`;
    if (seenKeys.has(dedupKey)) continue;

    const spokenPhraseRaw =
      typeof item.spoken_phrase === 'string' && item.spoken_phrase.trim().length > 0
        ? item.spoken_phrase.trim()
        : phrase;
    const spokenPhrase = stripStageDirections(spokenPhraseRaw) || phrase;

    const simulatedPronunciation =
      typeof item.simulated_pronunciation === 'string' &&
      item.simulated_pronunciation.trim().length > 0
        ? item.simulated_pronunciation.trim()
        : spokenPhrase;

    const originalSentence =
      typeof item.original_sentence === 'string' && item.original_sentence.trim().length > 0
        ? item.original_sentence.trim()
        : phrase;

    const ttsSentenceRaw =
      typeof item.tts_sentence === 'string' && item.tts_sentence.trim().length > 0
        ? item.tts_sentence.trim()
        : originalSentence;
    const ttsSentence = stripStageDirections(ttsSentenceRaw) || spokenPhrase;

    const cueIndex =
      typeof item.cue_index === 'number' && Number.isFinite(item.cue_index)
        ? Math.trunc(item.cue_index)
        : null;

    const cueStartTime =
      typeof item.cue_start_time === 'string' && item.cue_start_time.trim().length > 0
        ? item.cue_start_time.trim()
        : null;

    const cueEndTime =
      typeof item.cue_end_time === 'string' && item.cue_end_time.trim().length > 0
        ? item.cue_end_time.trim()
        : null;

    const explanationZh = typeof item.explanation_zh === 'string' ? item.explanation_zh.trim() : '';
    const explanationEn = typeof item.explanation_en === 'string' ? item.explanation_en.trim() : '';

    const difficultyRaw =
      typeof item.difficulty_level === 'string' ? item.difficulty_level.trim().toLowerCase() : '';
    const difficultyLevel: DifficultyPriority = isDifficultyPriority(difficultyRaw)
      ? difficultyRaw
      : 'medium';

    const isSubtitleError = Boolean(item.is_subtitle_error);
    const subtitleErrorNote =
      typeof item.subtitle_error_note === 'string' ? item.subtitle_error_note.trim() : '';

    seenKeys.add(dedupKey);
    results.push({
      schema_version: LISTENING_SCHEMA_VERSION,
      category: categoryRaw,
      phrase,
      normalized_phrase: normalizedPhrase,
      spoken_phrase: spokenPhrase,
      simulated_pronunciation: simulatedPronunciation,
      original_sentence: originalSentence,
      tts_sentence: ttsSentence,
      cue_index: cueIndex,
      cue_start_time: cueStartTime,
      cue_end_time: cueEndTime,
      explanation_zh: explanationZh,
      explanation_en: explanationEn,
      difficulty_level: difficultyLevel,
      is_subtitle_error: isSubtitleError,
      subtitle_error_note: subtitleErrorNote,
    });
  }

  return results;
}

function matchesCategoryPhenomenon(
  category: PhoneticCategory,
  targetPhraseInSentence: string,
  expectedSpokenPhrase: string,
  expectedRawPhrase: string
): boolean {
  const normCandidate = normalizePhraseKey(targetPhraseInSentence);
  const normSpoken = normalizePhraseKey(expectedSpokenPhrase);
  const normRaw = normalizePhraseKey(expectedRawPhrase);

  if (!normCandidate) return false;

  // Direct phrase match always satisfies the phenomenon check
  if (
    (normSpoken && normCandidate.includes(normSpoken)) ||
    (normRaw && normCandidate.includes(normRaw))
  ) {
    return true;
  }

  const words = normCandidate.split(/\s+/).filter(Boolean);

  switch (category) {
    case 'catenation':
      // At least 2 words where a consonant-ending (or silent-e consonant) word links into a vowel-starting word
      return words.length >= 2 && /\b\w*[b-df-hj-np-tv-z]e?\s+[aeiou]\w*\b/i.test(normCandidate);

    case 'assimilation':
      // Yod-coalescence (/t,d,s,z/ + y) or nasal/labial assimilation across >= 2 words
      return (
        words.length >= 2 &&
        (/\b\w+[tdsz]\s+y\w*\b/i.test(normCandidate) ||
          /\b\w+[ndtk]\s+[pbmkgyshj]\w*\b/i.test(normCandidate))
      );

    case 'elision':
      // At least 2 words where first ends in alveolar/stop (/t/, /d/, /k/, /p/) and next begins with consonant
      return words.length >= 2 && /\b\w+[tdkpb]\s+[b-df-hj-np-tv-z]\w*\b/i.test(normCandidate);

    case 'weak_forms':
      return (
        words.length >= 2 &&
        (/\b(would|could|should|might|must)\s+have\b/i.test(normCandidate) ||
          /\b(to|for|of|from|at|as|and|but|can|have|has|had|was|were|are|do|does|you|your|them|us|that|than)\b/i.test(
            normCandidate
          ))
      );

    case 'h_dropping':
      // Unstressed pronoun/auxiliary with initial /h/ following another word
      return (
        words.length >= 2 && /\b\w+\s+(him|her|he|his|have|has|had|them)\b/i.test(normCandidate)
      );

    case 'contractions':
      return /\b(going\s+to|want\s+to|got\s+to|have\s+got\s+to|have\s+to|has\s+to|had\s+to|ought\s+to|supposed\s+to|used\s+to|out\s+of|kind\s+of|sort\s+of|lot\s+of|lots\s+of|give\s+me|let\s+me|don['’]?t\s+know|what\s+are\s+you|what\s+do\s+you|gonna|wanna|gotta|hafta|oughta|supposta|usta|outta|kinda|sorta|gimme|lemme|dunno|whatcha)\b/i.test(
        normCandidate
      );

    case 'confusion':
      return normCandidate.length > 0;
  }
}

function checkB1Complexity(sentence: string): string | null {
  if (/\[[^\]]+\]/.test(sentence)) {
    return `Sentence "${sentence}" contains bracketed stage directions; use clean spoken dialogue only.`;
  }

  const words = sentence
    .replace(/[^a-zA-Z0-9'’\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['’-]+|['’-]+$/g, ''))
    .filter((w) => w.length > 0);

  if (words.length < 4 || words.length > 25) {
    return `Sentence "${sentence}" has ${words.length} words; keep example sentences between 4 and 25 words.`;
  }

  const totalLetters = words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z]/g, '').length, 0);
  const avgWordLength = totalLetters / words.length;

  const overlyComplexWords = words.filter((w) => {
    const alphaOnly = w.replace(/[^a-zA-Z]/g, '');
    return alphaOnly.length >= 13;
  });

  if (avgWordLength > 6.2 || overlyComplexWords.length > 0) {
    const offending = overlyComplexWords.length > 0 ? ` (${overlyComplexWords.join(', ')})` : '';
    return `Sentence "${sentence}" exceeds CEFR B1 vocabulary complexity${offending} (avg word length ${avgWordLength.toFixed(1)} > 6.2). Use simple everyday A2/B1 words.`;
  }

  return null;
}

/**
 * Deterministically validates a batch of generated B1 example sentences against:
 * 1. Substring integrity (`target_phrase_in_sentence` inside `sentence`)
 * 2. Phonetic phenomenon match for `target.category`
 * 3. CEFR B1 sentence length and lexical complexity guard
 */
export function validateExampleBatch(
  raw: unknown,
  target: ListeningDifficultyTarget
): ValidationResult<NewListeningExample[]> {
  const candidates = coerceArrayInput(raw);
  const validItems: NewListeningExample[] = [];
  const errors: string[] = [];

  const expectedSpoken = target.spoken_phrase ?? target.spokenPhrase ?? target.phrase;
  const expectedRaw = target.phrase;

  candidates.forEach((candidate, idx) => {
    const label = `Example #${idx + 1}`;
    if (!isRecord(candidate)) {
      errors.push(`${label}: Item is not a valid JSON object.`);
      return;
    }

    const sentence = typeof candidate.sentence === 'string' ? candidate.sentence.trim() : '';
    const targetPhraseInSentence =
      typeof candidate.target_phrase_in_sentence === 'string'
        ? candidate.target_phrase_in_sentence.trim()
        : '';

    if (!sentence || !targetPhraseInSentence) {
      errors.push(`${label}: Missing "sentence" or "target_phrase_in_sentence".`);
      return;
    }

    // Check 1: Substring integrity
    if (!sentence.toLowerCase().includes(targetPhraseInSentence.toLowerCase())) {
      errors.push(
        `${label} ("${sentence}"): target_phrase_in_sentence "${targetPhraseInSentence}" does not appear in sentence (expected target "${expectedSpoken}").`
      );
      return;
    }

    // Check 2: Phonetic phenomenon match
    if (
      !matchesCategoryPhenomenon(
        target.category,
        targetPhraseInSentence,
        expectedSpoken,
        expectedRaw
      )
    ) {
      errors.push(
        `${label} ("${sentence}"): target_phrase_in_sentence "${targetPhraseInSentence}" does not demonstrate the "${target.category}" phenomenon or target phrase "${expectedSpoken}".`
      );
      return;
    }

    // Check 3: B1 complexity guard
    const b1Error = checkB1Complexity(sentence);
    if (b1Error) {
      errors.push(`${label}: ${b1Error}`);
      return;
    }

    const ttsSentenceRaw =
      typeof candidate.tts_sentence === 'string' && candidate.tts_sentence.trim().length > 0
        ? candidate.tts_sentence.trim()
        : sentence;
    const ttsSentence = stripStageDirections(ttsSentenceRaw) || sentence;

    const simulatedPronunciation =
      typeof candidate.simulated_pronunciation === 'string' &&
      candidate.simulated_pronunciation.trim().length > 0
        ? candidate.simulated_pronunciation.trim()
        : (target.simulated_pronunciation ??
          target.simulatedPronunciation ??
          targetPhraseInSentence);

    const phoneticNoteZh =
      typeof candidate.phonetic_note_zh === 'string' ? candidate.phonetic_note_zh.trim() : '';
    const phoneticNoteEn =
      typeof candidate.phonetic_note_en === 'string' ? candidate.phonetic_note_en.trim() : '';
    const lexileLevel: 'A2' | 'B1' = candidate.lexile_level === 'A2' ? 'A2' : 'B1';

    validItems.push({
      sentence,
      tts_sentence: ttsSentence,
      target_phrase_in_sentence: targetPhraseInSentence,
      simulated_pronunciation: simulatedPronunciation,
      phonetic_note_zh: phoneticNoteZh,
      phonetic_note_en: phoneticNoteEn,
      lexile_level: lexileLevel,
      is_validated: true,
    });
  });

  if (validItems.length < 2 && errors.length === 0) {
    errors.push(
      `Expected at least 2 valid B1 example sentences for "${expectedSpoken}" (${target.category}), but received ${validItems.length}.`
    );
  }

  const valid = validItems.length >= 2 && errors.length === 0;
  const feedback = errors.length > 0 ? errors.join(' ') : '';

  return {
    valid,
    items: validItems,
    errors,
    feedback,
  };
}
