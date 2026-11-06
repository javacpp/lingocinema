import { Type, type Schema } from '@google/genai';
import type { AudioVerificationInput, ExampleGenerationRequest } from './interface.js';

export function LISTENING_ANALYSIS_PROMPT(formattedCuesText: string): string {
  return `You are an expert English phonetics coach for native Mandarin Chinese learners (current level B1-B2, targeting C1-C2).
Analyze the numbered subtitle cues below and extract a comprehensive list of authentic spoken English LISTENING DIFFICULTIES (Phonetic Traps).

Look specifically for these 7 phonetic categories:
1. "catenation": Consonant-Vowel Linking (e.g., "in and out" -> "i-nan-dout", "an apple" -> "a-napple")
2. "assimilation": Assimilation & Yod-coalescence (e.g., /t/+/j/ or /d/+/j/ in "did you" -> "di-dja", "would you" -> "woul-dja", "got you" -> "got-cha")
3. "elision": Elision & Consonant Cluster Simplification (e.g., dropping medial /t/ or /d/ in "next step" -> "nex-step", "best man" -> "bes-man", "first date" -> "firs-date")
4. "weak_forms": Weak Forms & Perfect Modal Reductions (e.g., "could have" -> "could-a", "might have" -> "migh-ta", "would have" -> "would-a", unstressed "to/for/of")
5. "h_dropping": H-dropping in Pronouns/Auxiliaries (e.g., "tell him" -> "tell 'im", "ask her" -> "ask 'er", "what did he" -> "what-d-ee")
6. "contractions": Colloquial Spoken Contractions (e.g., "going to" -> "gonna", "supposed to" -> "supposta", "have to" -> "hafta", "want to" -> "wanna", "out of" -> "outta")
7. "confusion": Phonemic & Visual Confusion / Subtitle Mishearing Traps (e.g., minimal pairs in context like "gun" vs "gum", homophones like "Tic Tacs" vs "tick tacks", or subtitle transcription errors like "Magma Cara" when the speaker meant "Magna Carta")

CRITICAL RULES:
- Coverage: Extract 25 to 60 high-value listening traps spread evenly across the entire transcript duration.
- Stage Directions: Strip non-spoken tags like "[muffled]", "[sighs]", "(groans)" from \`tts_sentence\` and \`spoken_phrase\` so a TTS engine will only speak natural dialogue.
- Subtitle Errors (Category 7): If the subtitle text contains a transcription error or malapropism (e.g., "Magma Cara"), set \`is_subtitle_error: true\`, keep the raw subtitle text in \`phrase\` and \`original_sentence\`, put the intended spoken words in \`spoken_phrase\` and \`tts_sentence\`, and explain the trap in \`subtitle_error_note\`.
- Cue Linking: Each input line starts with \`[#<cue_index> <start_time> -> <end_time>]\`. Copy the exact integer \`cue_index\`, \`cue_start_time\`, and \`cue_end_time\` where the sentence appears.
- Output ONLY a valid JSON array matching the schema below. No markdown fences, no commentary.

JSON Schema per array element:
{
  "category": "catenation" | "assimilation" | "elision" | "weak_forms" | "h_dropping" | "contractions" | "confusion",
  "phrase": "exact target phrase from subtitle",
  "spoken_phrase": "clean spoken phrase for TTS (corrected if subtitle error)",
  "simulated_pronunciation": "hyphenated fast-speech respelling, e.g. 'woul-dja' or 'nex-step'",
  "original_sentence": "full sentence from the subtitle cue",
  "tts_sentence": "full sentence cleaned for TTS (no [stage directions])",
  "cue_index": 124,
  "cue_start_time": "00:05:12,400",
  "cue_end_time": "00:05:15,200",
  "explanation_zh": "Concise Chinese explanation of why this sound changes and why Chinese listeners miss it",
  "explanation_en": "Concise English phonetic explanation",
  "difficulty_level": "high" | "medium" | "core",
  "is_subtitle_error": false,
  "subtitle_error_note": ""
}

Subtitle Cues:
${formattedCuesText}`;
}

export function EXAMPLE_GEN_PROMPT(req: ExampleGenerationRequest): string {
  const explanationRule = req.explanationEn || req.explanationZh || '';
  const feedbackSection = req.validationFeedback
    ? `\n\nPREVIOUS ATTEMPT FAILED VALIDATION — FIX THESE ISSUES:\n${req.validationFeedback}`
    : '';

  return `You are an English phonetics curriculum writer. Generate exactly 3 natural, everyday spoken English example sentences that demonstrate the EXACT SAME phonetic phenomenon as the target item below.

Target Item:
- Category: ${req.category}
- Target Phrase: "${req.spokenPhrase}" (Fast-speech sound: "${req.simulatedPronunciation}")
- Original Context: "${req.originalSentence}"
- Phonetic Rule: ${explanationRule}

STRICT QUALITY REQUIREMENTS:
1. PHENOMENON MATCH: Every example sentence MUST contain either the exact phrase "${req.spokenPhrase}" OR an identical phonological boundary from the same category (${req.category}) that triggers the exact same fast-speech reduction.
2. VOCABULARY LEVEL <= CEFR B1: Every single word in the sentence must be common, everyday A1-B1 conversational vocabulary (e.g., home, work, food, travel, friends). Do NOT use rare, academic, or C1/C2 vocabulary—the learner's only challenge must be hearing the phonetic linking/reduction.
3. SPOKEN NATURALNESS: Sentences must sound like authentic casual dialogue (8 to 16 words long), never stiff textbook prose.
4. Output ONLY a JSON array of 3 objects matching this exact schema:
[
  {
    "sentence": "Full conversational sentence (A2/B1 vocabulary only).",
    "tts_sentence": "Same sentence cleaned for TTS synthesis.",
    "target_phrase_in_sentence": "Exact substring inside \`sentence\` that undergoes the reduction",
    "simulated_pronunciation": "Hyphenated fast-speech respelling of \`target_phrase_in_sentence\`",
    "phonetic_note_zh": "One short Chinese note explaining the sound change in this sentence",
    "phonetic_note_en": "One short English note explaining the sound change in this sentence",
    "lexile_level": "B1"
  }
]${feedbackSection}`;
}

export function AUDIO_VERIFY_PROMPT(input: AudioVerificationInput): string {
  return `Listen carefully to the attached English audio clip.
Target phrase expected: "${input.targetPhrase}"
Expected connected-speech reduction / respelling: "${input.simulatedPronunciation}"

Determine whether the speaker in the audio naturally links or reduces "${input.targetPhrase}" towards "${input.simulatedPronunciation}" in connected speech, rather than robotically pausing between words.
Respond ONLY with a valid JSON object matching this schema:
{
  "heardPhrase": "what the phrase sounds like in the clip",
  "exhibitsReduction": true,
  "confidence": "high" | "medium" | "low",
  "note": "Brief 1-sentence phonetic observation"
}`;
}

export const LISTENING_ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description:
          'One of: catenation, assimilation, elision, weak_forms, h_dropping, contractions, confusion',
      },
      phrase: { type: Type.STRING },
      spoken_phrase: { type: Type.STRING },
      simulated_pronunciation: { type: Type.STRING },
      original_sentence: { type: Type.STRING },
      tts_sentence: { type: Type.STRING },
      cue_index: { type: Type.INTEGER, nullable: true },
      cue_start_time: { type: Type.STRING, nullable: true },
      cue_end_time: { type: Type.STRING, nullable: true },
      explanation_zh: { type: Type.STRING },
      explanation_en: { type: Type.STRING },
      difficulty_level: {
        type: Type.STRING,
        description: 'One of: high, medium, core',
      },
      is_subtitle_error: { type: Type.BOOLEAN },
      subtitle_error_note: { type: Type.STRING },
    },
    required: [
      'category',
      'phrase',
      'spoken_phrase',
      'simulated_pronunciation',
      'original_sentence',
      'tts_sentence',
      'explanation_zh',
      'explanation_en',
      'difficulty_level',
      'is_subtitle_error',
    ],
  },
};

export const EXAMPLE_GEN_RESPONSE_SCHEMA: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      sentence: { type: Type.STRING },
      tts_sentence: { type: Type.STRING },
      target_phrase_in_sentence: { type: Type.STRING },
      simulated_pronunciation: { type: Type.STRING },
      phonetic_note_zh: { type: Type.STRING },
      phonetic_note_en: { type: Type.STRING },
      lexile_level: {
        type: Type.STRING,
        description: 'A2 or B1',
      },
    },
    required: [
      'sentence',
      'tts_sentence',
      'target_phrase_in_sentence',
      'simulated_pronunciation',
      'phonetic_note_zh',
      'phonetic_note_en',
      'lexile_level',
    ],
  },
};

export const AUDIO_VERIFY_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    heardPhrase: { type: Type.STRING },
    exhibitsReduction: { type: Type.BOOLEAN },
    confidence: {
      type: Type.STRING,
      description: 'high, medium, or low',
    },
    note: { type: Type.STRING },
  },
  required: ['heardPhrase', 'exhibitsReduction', 'confidence', 'note'],
};
