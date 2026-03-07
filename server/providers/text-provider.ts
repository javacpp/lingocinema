import { GoogleGenAI, Type } from "@google/genai";

// Shape of a single extracted vocabulary/grammar item
export interface ExtractedItem {
  term: string;
  type: string;
  meaning_en: string;
  meaning_zh: string;
  phonetic?: string;
  part_of_speech?: string;
  usage_scenarios_en?: string;
  usage_scenarios_zh?: string;
  examples_en?: string;
  examples_zh?: string;
  synonyms?: string;
  frequency?: string;
  level?: string;
}

// Common interface for all text LLM providers
export interface TextProvider {
  readonly name: string;
  analyze(rawText: string): Promise<ExtractedItem[]>;
}

// ─── Shared prompt ──────────────────────────────────────────────────────

const ANALYSIS_PROMPT = (rawText: string) => `
Analyze the following movie subtitle text and extract ALL English words, idioms, collocations, slangs, and grammar points that a learner might want to study.

BE EXTREMELY EXHAUSTIVE. DO NOT SKIP:
- Words in ALL CAPS (e.g., "INHALES", "MUMBLES", "STAMMERS", "TOOTS") - these are often important for context. Label these as "stage direction" or "sound effect".
- Specialized or formal terms (e.g., "tetanus", "solicitor", "impersonating", "commandeered", "locomotive").
- Descriptive adjectives and adverbs (e.g., "bonneted", "artistically", "grisly").
- Multi-word phrases and collocations (e.g., "over the course of a year", "big-shot", "commandeered the biggest").
- Phrasal verbs and idioms.
- Any word that is NOT extremely basic (A1 level).

For each item, categorize it into a CEFR level (A1, A2, B1, B2, C1, C2).

For each item, provide:
1. Term (The exact word or phrase)
2. Type (word, idiom, collocation, slang, grammar, stage direction, sound effect)
3. Meaning in English
4. Meaning in Chinese
5. Phonetic symbols
6. Part of speech
7. Common usage scenarios (English & Chinese)
8. Example sentences (English & Chinese)
9. Synonyms
10. Frequency in daily life (e.g., Very High, High, Medium, Low)
11. CEFR Level (A1, A2, B1, B2, C1, C2)

You MUST respond with a JSON array. Each element is an object with these keys:
"term", "type", "meaning_en", "meaning_zh", "phonetic", "part_of_speech",
"usage_scenarios_en", "usage_scenarios_zh", "examples_en", "examples_zh",
"synonyms", "frequency", "level"

Text: ${rawText}
`;

// ─── Gemini Provider ────────────────────────────────────────────────────

export class GeminiTextProvider implements TextProvider {
  readonly name = "gemini";
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = "gemini-3-flash-preview") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(rawText: string): Promise<ExtractedItem[]> {
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
              type: { type: Type.STRING, description: "One of: word, idiom, collocation, slang, grammar, stage direction, sound effect" },
              meaning_en: { type: Type.STRING },
              meaning_zh: { type: Type.STRING },
              phonetic: { type: Type.STRING },
              part_of_speech: { type: Type.STRING },
              usage_scenarios_en: { type: Type.STRING },
              usage_scenarios_zh: { type: Type.STRING },
              examples_en: { type: Type.STRING },
              examples_zh: { type: Type.STRING },
              synonyms: { type: Type.STRING },
              frequency: { type: Type.STRING },
              level: { type: Type.STRING, description: "CEFR Level: A1, A2, B1, B2, C1, or C2" },
            },
            required: ["term", "type", "meaning_en", "meaning_zh", "level"],
          },
        },
      },
    });

    return JSON.parse(response.text || "[]");
  }
}

// ─── OpenAI-Compatible Provider (works with OpenAI, Ollama, etc.) ─────

export class OpenAICompatibleTextProvider implements TextProvider {
  readonly name: string;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(
    name: string,
    baseUrl: string,
    model: string,
    apiKey: string = "",
  ) {
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/+$/, ""); // strip trailing slash
    this.model = model;
    this.apiKey = apiKey;
  }

  async analyze(rawText: string): Promise<ExtractedItem[]> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "You are a language learning assistant. Always respond with valid JSON only. No markdown, no backticks, no explanations — just the JSON array.",
        },
        { role: "user", content: ANALYSIS_PROMPT(rawText) },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    };

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${this.name} API error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "[]";
    const parsed = JSON.parse(content);

    // Some models wrap the array in an object like { "items": [...] }
    if (Array.isArray(parsed)) return parsed;
    if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
    if (parsed.results && Array.isArray(parsed.results)) return parsed.results;

    // Try to find any array value in the response
    for (const val of Object.values(parsed)) {
      if (Array.isArray(val)) return val as ExtractedItem[];
    }
    return [];
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

export function createTextProvider(config: {
  provider: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
}): TextProvider {
  switch (config.provider) {
    case "gemini":
      if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY is required for Gemini provider");
      return new GeminiTextProvider(config.geminiApiKey, config.geminiModel);

    case "openai":
      return new OpenAICompatibleTextProvider(
        "openai",
        config.openaiBaseUrl || "https://api.openai.com",
        config.openaiModel || "gpt-4o",
        config.openaiApiKey || "",
      );

    case "ollama":
      return new OpenAICompatibleTextProvider(
        "ollama",
        config.ollamaBaseUrl || "http://localhost:11434",
        config.ollamaModel || "llama3",
        "", // Ollama doesn't need an API key
      );

    default:
      throw new Error(`Unknown text provider: ${config.provider}`);
  }
}
