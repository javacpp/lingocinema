import { NewExtractedItem } from '../../db/interface.js';
import { TextProvider } from './interface.js';
import { GoogleGenAI, Type } from "@google/genai";

const ANALYSIS_PROMPT = (rawText: string) => `
Role: You are an expert English linguist, advanced ESL/EFL instructor, and pronunciation coach. Your target student is a non-native English speaker (specifically a native Chinese speaker) currently at a B1-B2 CEFR level, aiming to reach C1-C2.

Objective: Analyze the provided movie/TV show subtitle text transcript. Extract a comprehensive list of advanced vocabulary, idioms, expressions, phrasal verbs, collocations, and stage directions/sound effects that are valuable for language learners.

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
3. Meaning in English
4. Meaning in Chinese (natural, accurate translation)
5. Phonetic symbols (IPA)
6. Part of speech
7. Common usage scenarios in English
8. Common usage scenarios in Chinese (e.g., 母语者日常口语, 职场与专业语境, 文学与剧本描述)
9. Example sentences in English
10. Example sentences in Chinese
11. Synonyms
12. Frequency (Tier 1, Tier 2, Tier 3, or Tier 4)
13. CEFR Level (B1, B2, C1, or C2)

You MUST respond with a JSON array. Each element is an object with these keys:
"term", "type", "meaning_en", "meaning_zh", "phonetic", "part_of_speech",
"usage_scenarios_en", "usage_scenarios_zh", "examples_en", "examples_zh",
"synonyms", "frequency", "level"

Text:
${rawText}
`;

export class GeminiTextProvider implements TextProvider {
  readonly name = "gemini";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "gemini-3-flash-preview") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(rawText: string): Promise<NewExtractedItem[]> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: ANALYSIS_PROMPT(rawText),
      config: {
        responseMimeType: "application/json",
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

    try {
      const parsed = JSON.parse(response.text || "[]");
      return Array.isArray(parsed) ? (parsed as NewExtractedItem[]) : [];
    } catch {
      throw new Error("AI returned unparseable response");
    }
  }
}
