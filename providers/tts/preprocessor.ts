import type {
  AccentCode,
  AudioVerificationStatus,
  PhoneticCategory,
} from '../../src/types/listening.js';
import type { ResolvedVoiceProfile } from './registry.js';

export interface TTSPrepareInput {
  text: string;
  category?: PhoneticCategory;
  targetPhrase?: string;
  simulatedPronunciation?: string;
  speedMode?: 'normal' | 'slow_native' | 'fast_native';
}

export interface PreparedTTSPayload {
  spokenText: string;
  normalizedTextForCache: string;
  instructions?: string;
  accent: AccentCode;
  voice: string;
  provider: string;
  model: string;
  speedMode: 'normal' | 'slow_native' | 'fast_native';
  speedMultiplier?: number;
  category: PhoneticCategory | 'general';
  isApproximate: boolean;
  approximateReason?: string;
  verificationStatus: AudioVerificationStatus;
}

const ACCENT_PERSONA_TEMPLATES: Record<AccentCode, string> = {
  uk: 'Speak in an authentic modern British English (Received Pronunciation / Southern UK) accent.',
  us: 'Speak in a natural General American English accent.',
  au: 'Speak in a natural Australian English (en-AU) accent.',
  nz: 'Speak in a natural New Zealand English (en-NZ) accent with authentic Kiwi vowel shifts.',
  in: 'Speak in a natural educated Indian English (en-IN) accent.',
};

const CATEGORY_DESCRIPTIONS: Record<PhoneticCategory, string> = {
  catenation: 'consonant-to-vowel linking across word boundaries',
  assimilation: 'yod-coalescence and consonant assimilation',
  elision: 'consonant cluster elision dropping medial /t/ or /d/',
  weak_forms: 'unstressed weak-form vowel reduction to schwa',
  h_dropping: 'unstressed pronoun h-dropping linked to the preceding word',
  contractions: 'natural rapid colloquial contraction',
  confusion: 'clear natural conversational phrasing',
};

interface OrthographicRule {
  pattern: RegExp;
  replacement: string;
}

const ORTHOGRAPHIC_REDUCTION_RULES: OrthographicRule[] = [
  { pattern: /\bhave got to\b/gi, replacement: 'gotta' },
  { pattern: /\bgoing to\b/gi, replacement: 'gonna' },
  { pattern: /\bwant to\b/gi, replacement: 'wanna' },
  { pattern: /\bgot to\b/gi, replacement: 'gotta' },
  { pattern: /\bhave to\b/gi, replacement: 'hafta' },
  { pattern: /\bought to\b/gi, replacement: 'oughta' },
  { pattern: /\bcould have\b/gi, replacement: "could've" },
  { pattern: /\bwould have\b/gi, replacement: "would've" },
  { pattern: /\bshould have\b/gi, replacement: "should've" },
  { pattern: /\bmight have\b/gi, replacement: "might've" },
  { pattern: /\bmust have\b/gi, replacement: "must've" },
  { pattern: /\btell him\b/gi, replacement: "tell 'im" },
  { pattern: /\btell her\b/gi, replacement: "tell 'er" },
  { pattern: /\bask him\b/gi, replacement: "ask 'im" },
  { pattern: /\bask her\b/gi, replacement: "ask 'er" },
  { pattern: /\bknows him\b/gi, replacement: "knows 'im" },
  { pattern: /\bsaw him\b/gi, replacement: "saw 'im" },
];

/**
 * Strips bracketed/parenthetical stage directions (`[muffled]`, `(sighs)`), HTML/ASS tags,
 * leading ellipses, and normalizes whitespace.
 */
export function stripTTSStageDirections(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{\\[^}]*\}/g, ' ')
    .replace(/\[(?:muffled|sighs|groans|laughs|music|applause|clears throat|[^\]]{1,25})\]/gi, ' ')
    .replace(/\((?:sighs|groans|laughs|[^)]{1,25})\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.{2,}\s*/, '')
    .trim();
}

function preserveInitialCase(matched: string, replacement: string): string {
  if (!matched || !replacement) return replacement;
  const firstChar = matched[0];
  if (firstChar >= 'A' && firstChar <= 'Z') {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Applies conservative orthographic reductions for non-instructable TTS models (`tts-1` and `piper`).
 */
export function applyOrthographicReductions(text: string): string {
  let result = text;
  for (const rule of ORTHOGRAPHIC_REDUCTION_RULES) {
    result = result.replace(rule.pattern, (match) => preserveInitialCase(match, rule.replacement));
  }
  return result;
}

function buildDirectorInstructions(req: TTSPrepareInput, profile: ResolvedVoiceProfile): string {
  const parts: string[] = [ACCENT_PERSONA_TEMPLATES[profile.accent] ?? ACCENT_PERSONA_TEMPLATES.us];

  const categoryDesc = req.category ? CATEGORY_DESCRIPTIONS[req.category] : undefined;

  if (req.targetPhrase && req.simulatedPronunciation) {
    const suffix = categoryDesc ? ` (${categoryDesc})` : '';
    parts.push(
      `Deliver this line as casual, brisk, everyday conversational speech—do NOT over-enunciate word boundaries. Naturally link and reduce '${req.targetPhrase}' so it sounds like '${req.simulatedPronunciation}'${suffix}.`
    );
  } else if (categoryDesc) {
    parts.push(
      `Deliver this line as casual, brisk, everyday conversational speech—do NOT over-enunciate word boundaries (${categoryDesc}).`
    );
  } else {
    parts.push('Deliver this line as natural, everyday conversational speech.');
  }

  if (req.speedMode === 'slow_native') {
    parts.push('Speak at a slightly slower, clear study pace while keeping natural linking.');
  } else if (req.speedMode === 'fast_native') {
    parts.push('Speak at a brisk, rapid conversational pace.');
  }

  return parts.join(' ');
}

/**
 * Prepares the text, style instructions, speed parameters, and provenance flags
 * for a TTS synthesis call given the resolved voice profile.
 */
export function prepareTTSSynthesisPayload(
  req: TTSPrepareInput,
  profile: ResolvedVoiceProfile
): PreparedTTSPayload {
  const cleanedText = stripTTSStageDirections(req.text);
  const speedMode = req.speedMode ?? 'normal';
  const speedMultiplier =
    speedMode === 'slow_native' ? 0.78 : speedMode === 'fast_native' ? 1.22 : undefined;
  const category = req.category ?? 'general';

  if (profile.supportsInstructions) {
    const instructions = buildDirectorInstructions(req, profile);
    return {
      spokenText: cleanedText,
      normalizedTextForCache: cleanedText.toLowerCase().replace(/\s+/g, ' ').trim(),
      instructions,
      accent: profile.accent,
      voice: profile.voice,
      provider: profile.provider,
      model: profile.model,
      speedMode,
      speedMultiplier,
      category,
      isApproximate: profile.isApproximate,
      approximateReason: profile.approximateReason,
      verificationStatus: 'instructed_unverified',
    };
  }

  const reducedText = applyOrthographicReductions(cleanedText);
  return {
    spokenText: reducedText,
    normalizedTextForCache: reducedText.toLowerCase().replace(/\s+/g, ' ').trim(),
    instructions: undefined,
    accent: profile.accent,
    voice: profile.voice,
    provider: profile.provider,
    model: profile.model,
    speedMode,
    speedMultiplier,
    category,
    isApproximate: profile.isApproximate,
    approximateReason: profile.approximateReason,
    verificationStatus: 'orthographic_approx',
  };
}
