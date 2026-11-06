import { NewExtractedItem } from '../../db/interface.js';
import type {
  NewListeningDifficulty,
  NewListeningExample,
} from '../../src/types/listening.js';
import {
  parseAndRepairJsonArray,
  validateExampleBatch,
  validateListeningExtractResponse,
} from '../../src/lib/listeningValidator.js';
import {
  AudioVerificationInput,
  AudioVerificationResult,
  ExampleGenerationRequest,
  TextProvider,
} from './interface.js';
import {
  AUDIO_VERIFY_PROMPT,
  AUDIO_VERIFY_RESPONSE_SCHEMA,
  EXAMPLE_GEN_PROMPT,
  EXAMPLE_GEN_RESPONSE_SCHEMA,
  LISTENING_ANALYSIS_PROMPT,
  LISTENING_ANALYSIS_RESPONSE_SCHEMA,
} from './listeningPrompt.js';
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

function resolveThinkingLevel(level?: string): ThinkingLevel | undefined {
  if (!level) return undefined;
  const upper = level.trim().toUpperCase();
  if (upper === "" || upper === "DEFAULT" || upper === "NONE" || upper === "OFF") {
    return undefined;
  }
  if (upper in ThinkingLevel) {
    return ThinkingLevel[upper as keyof typeof ThinkingLevel];
  }
  return undefined;
}

export function estimateExtractionTarget(text: string): { durationMinutes: number; minTarget: number; maxTarget: number } {
  const metaMatch = text.match(/\[SUBTITLE CONTEXT: cues=(\d+)(?:, duration=([\d:,]+))?\]/);
  let durationMinutes = 0;
  if (metaMatch && metaMatch[2]) {
    const parts = metaMatch[2].split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10) || 0;
      const mins = parseInt(parts[1], 10) || 0;
      durationMinutes = hours * 60 + mins;
    }
  }

  if (durationMinutes === 0) {
    // Fallback: estimate runtime based on character length (~650-700 characters per minute)
    durationMinutes = Math.max(30, Math.round(text.length / 700));
  }

  // Scale: 80 to 100+ items per 45 minutes of content
  const factor = durationMinutes / 45;
  const minTarget = Math.max(80, Math.round(factor * 80));
  const maxTarget = Math.max(100, Math.round(factor * 100));

  return { durationMinutes, minTarget, maxTarget };
}

const ANALYSIS_PROMPT = (rawText: string) => {
  const { durationMinutes, minTarget, maxTarget } = estimateExtractionTarget(rawText);

  return `
Role: You are an expert English linguist, advanced ESL/EFL instructor, and pronunciation coach. Your target student is a non-native English speaker (specifically a native Chinese speaker) currently at a B1-B2 CEFR level, aiming to reach C1-C2.

Objective: Analyze the provided movie/TV show subtitle text transcript. Extract a comprehensive, exhaustive list of advanced vocabulary, idioms, expressions, phrasal verbs, collocations, and stage directions/sound effects that are valuable for language learners.

CRITICAL EXTRACTION DIRECTIVES (QUANTITY & EXHAUSTIVENESS):
1. CHRONOLOGICAL SCANNING: Scan the text chronologically from the first dialogue line to the very end of the transcript. Extract items in the exact order they appear in the dialogue.
2. DYNAMIC EXTRACTION VOLUME SCALED TO RUNTIME / LENGTH:
   The quantity of extracted items MUST be proportional to the length and running time of the movie or show:
   - For a standard ~45-minute TV episode (approx. 700–1,000 cues or ~30,000 characters): You MUST extract between 80 and 100+ qualifying items.
   - For a feature-length ~90 to 120-minute movie (approx. 1,500–2,500 cues or ~70,000–100,000 characters): You MUST extract between 160 and 220+ qualifying items.
   - Current transcript estimate: ~${durationMinutes} minutes duration. Your extraction target for this transcript is at least ${minTarget} to ${maxTarget}+ items.
   - UNIFORM DENSITY & ANTI-SAMPLING: STRICTLY DO NOT stop after 20 or 30 words. DO NOT return a small sample. Maintain consistent extraction density across the entire duration—do NOT downsample or lose momentum in the second half of the movie or show.
3. CONCISE FIELD DESCRIPTIONS: To ensure all extracted items fit cleanly in the JSON response, keep definitions and examples concise:
   - "meaning_en" & "meaning_zh": 1 brief, precise definition or phrase.
   - "usage_scenarios_en" & "usage_scenarios_zh": Brief scenario tag (e.g., "Daily British spoken conversation" / "母语者日常口语").
   - "examples_en" & "examples_zh": 1 concise illustrative sentence.

Criteria for Vocabulary Selection:
- Level: Target CEFR B1 to C2 vocabulary, or words expected of a high school graduate in English-speaking countries (US, UK, NZ, AU, CA).
- Filtering: STRICTLY IGNORE basic/simple words already mastered by B1/B2 learners (A1-A2 words). Focus exclusively on advanced words, idioms, phrasal verbs, collocations, and slang that are highly authentic in daily life, workplace, or entertainment, but are typically unfamiliar or tricky for Chinese learners.
- Stage Directions & Audio Cues: Include words from stage directions or background audio cues (e.g., [muffled], [squeal], [stammers], words in ALL CAPS) and explicitly label them as "stage direction" or "sound effect".
- Specialized Terms & Expressions: Include formal/professional terms, descriptive adjectives and adverbs, multi-word collocations, and phrasal verbs.

Ranking by Importance & Frequency:
Categorize each item's frequency/importance tier:
- Tier 1: Core High-Frequency Idioms & Expressions (Crucial for authentic daily spoken English)
- Tier 2: High-Frequency Advanced Vocabulary (Enhances fluency, reading comprehension, and richness of expression)
- Tier 3: Professional, Academic & Specific Context Words (Workplace, legal, medical, technical terms, etc.)
- Tier 4: Literary, Obscure, and Stage Directions/Background Audio

For each item, provide:
1. Term (The exact word or phrase)
2. Type (word, idiom, collocation, slang, phrasal verb, stage direction, sound effect)
3. Meaning in English (concise)
4. Meaning in Chinese (natural, accurate, concise translation)
5. Phonetic symbols (IPA)
6. Part of speech
7. Common usage scenarios in English
8. Common usage scenarios in Chinese
9. Example sentences in English (1 concise sentence)
10. Example sentences in Chinese (1 concise sentence)
11. Synonyms
12. Frequency (Tier 1, Tier 2, Tier 3, or Tier 4)
13. CEFR Level (B1, B2, C1, or C2)

You MUST respond with a JSON array containing ALL extracted items. Each element is an object with these keys:
"term", "type", "meaning_en", "meaning_zh", "phonetic", "part_of_speech",
"usage_scenarios_en", "usage_scenarios_zh", "examples_en", "examples_zh",
"synonyms", "frequency", "level"

Text:
${rawText}
`;
};

function extractIndividualObjects(text: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      let depth = 0;
      const start = i;
      let inString = false;
      let escape = false;
      for (let j = i; j < text.length; j++) {
        const ch = text[j];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) {
          const candidate = text.substring(start, j + 1);
          try {
            const obj = JSON.parse(candidate) as Record<string, unknown>;
            if (obj && typeof obj === 'object' && obj['term']) {
              results.push(obj);
            }
          } catch { /* skip malformed object */ }
          i = j + 1;
          break;
        }}
        if (j === text.length - 1) { i = j + 1; }
      }
    } else {
      i++;
    }
  }
  return results;
}

export class GeminiTextProvider implements TextProvider {
  readonly name = "gemini";
  private apiKey: string;
  private model: string;
  private thinkingLevel?: string;
  private maxOutputTokens?: number;

  constructor(
    apiKey: string,
    model: string = "gemini-3.8-flash",
    thinkingLevel?: string,
    maxOutputTokens?: number
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.thinkingLevel = thinkingLevel;
    this.maxOutputTokens = maxOutputTokens || 32768;
  }

  async analyze(rawText: string): Promise<NewExtractedItem[]> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const resolvedLevel = resolveThinkingLevel(this.thinkingLevel);
    const response = await ai.models.generateContent({
      model: this.model,
      contents: ANALYSIS_PROMPT(rawText),
      config: {
        responseMimeType: "application/json",
        ...(this.maxOutputTokens ? { maxOutputTokens: this.maxOutputTokens } : {}),
        ...(resolvedLevel ? { thinkingConfig: { thinkingLevel: resolvedLevel } } : {}),
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              type: { type: Type.STRING, description: "One of: word, idiom, collocation, slang, phrasal verb, stage direction, sound effect" },
              meaning_en: { type: Type.STRING },
              meaning_zh: { type: Type.STRING },
              phonetic: { type: Type.STRING },
              part_of_speech: { type: Type.STRING },
              usage_scenarios_en: { type: Type.STRING },
              usage_scenarios_zh: { type: Type.STRING },
              examples_en: { type: Type.STRING },
              examples_zh: { type: Type.STRING },
              synonyms: { type: Type.STRING },
              frequency: { type: Type.STRING, description: "Tier 1, Tier 2, Tier 3, or Tier 4" },
              level: { type: Type.STRING, description: "CEFR Level: B1, B2, C1, or C2" },
            },
            required: ["term", "type", "meaning_en", "meaning_zh", "level"],
          },
        },
      },
    });

    let content = response.text || "";

    // 1. Strip reasoning blocks or thoughts if present in text
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    content = content.replace(/<think>[\s\S]*/gi, '').trim();

    // 2. Strip markdown fences if wrapped in ```json ... ```
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // 3. Locate start of JSON array or object
    const firstBracket = content.indexOf('[');
    const firstBrace = content.indexOf('{');

    let jsonStart = -1;
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket <= firstBrace)) {
      jsonStart = firstBracket;
    } else if (firstBrace !== -1) {
      jsonStart = firstBrace;
    }

    if (jsonStart > 0) {
      content = content.substring(jsonStart);
    }

    // 4. Try parsing with truncate repair and fallback object extraction
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const lastBrace = content.lastIndexOf('}');
      if (lastBrace !== -1) {
        let repaired = content.substring(0, lastBrace + 1).replace(/,\s*$/, '');
        if (!repaired.startsWith('[')) repaired = '[' + repaired;
        repaired += ']';

        try {
          parsed = JSON.parse(repaired);
        } catch {
          parsed = extractIndividualObjects(content);
        }
      } else {
        parsed = extractIndividualObjects(content);
      }
    }

    // 5. Extract raw items from array or wrapper object
    let rawItems: unknown[] = [];
    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if (parsed && typeof parsed === 'object' && parsed !== null) {
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val) && val.length > 0) {
          rawItems = val;
          break;
        }
      }
    }

    if (rawItems.length === 0) {
      rawItems = extractIndividualObjects(content);
    }

    // 6. Map and sanitize each item
    const items: Record<string, unknown>[] = rawItems.map((item: unknown) => {
      if (Array.isArray(item) && item.length >= 2 && typeof item[1] === 'object' && item[1] !== null) {
        return item[1] as Record<string, unknown>;
      }
      if (Array.isArray(item) && item.length === 1 && typeof item[0] === 'object' && item[0] !== null) {
        return item[0] as Record<string, unknown>;
      }
      if (typeof item === 'object' && item !== null) {
        return item as Record<string, unknown>;
      }
      return null;
    }).filter((item): item is Record<string, unknown> => item !== null);

    const validItems: NewExtractedItem[] = items
      .filter((item) => typeof item['term'] === 'string' && item['term'].trim().length > 0)
      .map((item) => ({
        term: String(item['term'] || "").trim(),
        type: String(item['type'] || "word"),
        meaning_en: String(item['meaning_en'] || ""),
        meaning_zh: String(item['meaning_zh'] || ""),
        phonetic: String(item['phonetic'] || ""),
        part_of_speech: String(item['part_of_speech'] || ""),
        usage_scenarios_en: String(item['usage_scenarios_en'] || ""),
        usage_scenarios_zh: String(item['usage_scenarios_zh'] || ""),
        examples_en: String(item['examples_en'] || ""),
        examples_zh: String(item['examples_zh'] || ""),
        synonyms: String(item['synonyms'] || ""),
        frequency: String(item['frequency'] || "Tier 2"),
        level: String(item['level'] || "B1"),
      }));

    if (validItems.length === 0) {
      console.error("AI returned unparseable content. Preview:", content.slice(0, 500));
      throw new Error("AI returned unparseable response");
    }

    return validItems;
  }

  async analyzeListening(formattedCuesText: string): Promise<NewListeningDifficulty[]> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const resolvedLevel = resolveThinkingLevel(this.thinkingLevel);
    const response = await ai.models.generateContent({
      model: this.model,
      contents: LISTENING_ANALYSIS_PROMPT(formattedCuesText),
      config: {
        responseMimeType: "application/json",
        ...(this.maxOutputTokens ? { maxOutputTokens: this.maxOutputTokens } : {}),
        ...(resolvedLevel ? { thinkingConfig: { thinkingLevel: resolvedLevel } } : {}),
        responseSchema: LISTENING_ANALYSIS_RESPONSE_SCHEMA,
      },
    });

    const content = response.text || "";
    const parsedArray = parseAndRepairJsonArray(content);
    const validated = validateListeningExtractResponse(parsedArray);

    if (validated.length === 0) {
      console.error("AI returned unparseable listening content. Preview:", content.slice(0, 500));
      throw new Error("AI returned unparseable response");
    }

    return validated;
  }

  async generateListeningExamples(req: ExampleGenerationRequest): Promise<NewListeningExample[]> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const resolvedLevel = resolveThinkingLevel(this.thinkingLevel);

    const invokeOnce = async (currentReq: ExampleGenerationRequest): Promise<unknown[]> => {
      const response = await ai.models.generateContent({
        model: this.model,
        contents: EXAMPLE_GEN_PROMPT(currentReq),
        config: {
          responseMimeType: "application/json",
          ...(this.maxOutputTokens ? { maxOutputTokens: this.maxOutputTokens } : {}),
          ...(resolvedLevel ? { thinkingConfig: { thinkingLevel: resolvedLevel } } : {}),
          responseSchema: EXAMPLE_GEN_RESPONSE_SCHEMA,
        },
      });
      return parseAndRepairJsonArray(response.text || "");
    };

    const target = {
      category: req.category,
      phrase: req.phrase,
      spokenPhrase: req.spokenPhrase,
      simulatedPronunciation: req.simulatedPronunciation,
    };

    const firstRaw = await invokeOnce(req);
    const firstValidation = validateExampleBatch(firstRaw, target);
    if (firstValidation.valid || req.validationFeedback) {
      return firstValidation.items;
    }

    const retryRaw = await invokeOnce({
      ...req,
      validationFeedback: firstValidation.feedback,
    });
    const retryValidation = validateExampleBatch(retryRaw, target);
    if (retryValidation.items.length >= firstValidation.items.length) {
      return retryValidation.items;
    }
    return firstValidation.items;
  }

  async verifyConnectedSpeechAudio(
    wavBuffer: Buffer,
    input: AudioVerificationInput
  ): Promise<AudioVerificationResult> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: [
        {
          inlineData: {
            mimeType: "audio/wav",
            data: wavBuffer.toString("base64"),
          },
        },
        {
          text: AUDIO_VERIFY_PROMPT(input),
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: AUDIO_VERIFY_RESPONSE_SCHEMA,
      },
    });

    const rawText = (response.text || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim();

    try {
      const parsed = JSON.parse(rawText) as {
        heardPhrase?: unknown;
        exhibitsReduction?: unknown;
        confidence?: unknown;
        note?: unknown;
      };
      const exhibitsReduction = Boolean(parsed.exhibitsReduction);
      const note =
        typeof parsed.note === "string" && parsed.note.trim().length > 0
          ? parsed.note.trim()
          : exhibitsReduction
            ? `Verified reduction (${String(parsed.heardPhrase || input.simulatedPronunciation)})`
            : "Reduction not clearly detected in audio clip.";
      return {
        status: exhibitsReduction ? "verified" : "failed_check",
        note,
      };
    } catch {
      return {
        status: "failed_check",
        note: "Could not parse audio verification response from model.",
      };
    }
  }
}
