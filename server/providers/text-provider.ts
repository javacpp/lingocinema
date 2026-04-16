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

// ─── Simplified prompt for local/smaller models ─────────────────────────

const LOCAL_ANALYSIS_PROMPT = (rawText: string) => `You are a vocabulary extractor. Extract ALL interesting English words, idioms, slang, and phrases from the subtitle text below.

Rules:
- Output ONLY a JSON array, nothing else
- Extract at least 20 items, the more the better
- Skip only the most basic words (a, the, is, am, I, you, he, she, it, we, they)
- Include B1, B2, C1, C2 level words
- Include idioms, phrasal verbs, collocations, slang

JSON format for each item:
{"term":"solicitor","type":"word","meaning_en":"a lawyer","meaning_zh":"律师","phonetic":"/səˈlɪsɪtə/","part_of_speech":"noun","usage_scenarios_en":"legal context","usage_scenarios_zh":"法律场景","examples_en":"I need to see my solicitor.","examples_zh":"我需要去见我的律师。","synonyms":"lawyer, attorney","frequency":"Medium","level":"B2"}

Required keys: term, type, meaning_en, meaning_zh, phonetic, part_of_speech, usage_scenarios_en, usage_scenarios_zh, examples_en, examples_zh, synonyms, frequency, level
type must be one of: word, idiom, collocation, slang, grammar, phrasal verb
level must be one of: A1, A2, B1, B2, C1, C2

Subtitle text:
${rawText.slice(0, 6000)}`;

// ─── Fallback: extract objects one-by-one via brace counting ────────────

function extractIndividualObjects(text: string): any[] {
  const results: any[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{') {
      let depth = 0;
      let start = i;
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
            const obj = JSON.parse(candidate);
            if (obj && typeof obj === 'object' && obj.term) {
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

    // Use the simplified prompt for local providers, full prompt for cloud APIs
    const isLocalProvider = this.name === "llamacpp" || this.name === "ollama";
    const prompt = isLocalProvider ? LOCAL_ANALYSIS_PROMPT(rawText) : ANALYSIS_PROMPT(rawText);

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: isLocalProvider
            ? "You are a JSON API. You extract English vocabulary from text. You ONLY output valid JSON arrays. Never output explanations or markdown."
            : "You are a language learning assistant. Always respond with valid JSON only. No markdown, no backticks, no explanations — just the JSON array.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    };

    // Only add response_format for OpenAI (llama.cpp/ollama don't reliably support it)
    if (isLocalProvider) {
      // Give local models plenty of room to think AND generate output
      // Thinking models (Qwen3, DeepSeek-R1) need extra tokens for reasoning
      body.max_tokens = 16384;
    } else {
      body.response_format = { type: "json_object" };
    }

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

    // Debug: log the full response structure for troubleshooting
    const message = data.choices?.[0]?.message;
    console.log(`[TextProvider] Response keys: ${JSON.stringify(Object.keys(data))}`);
    console.log(`[TextProvider] Message keys: ${message ? JSON.stringify(Object.keys(message)) : 'no message'}`);
    console.log(`[TextProvider] Finish reason: ${data.choices?.[0]?.finish_reason}`);

    // Thinking models (Qwen3, DeepSeek-R1) put reasoning in 'reasoning_content'
    // and the actual JSON answer in 'content'. DO NOT use reasoning_content as
    // a fallback — it contains thinking text, not the answer.
    let content = message?.content ?? "";
    const finishReason = data.choices?.[0]?.finish_reason;

    if (!content && finishReason === 'length') {
      // Model ran out of tokens while still thinking — never produced the answer
      const hasReasoning = !!(message?.reasoning_content || message?.reasoning);
      if (hasReasoning) {
        console.error(`[TextProvider] Content is empty because the thinking model ran out of tokens.`);
        console.error(`[TextProvider] The model spent all its token budget on reasoning and never produced the JSON answer.`);
        console.error(`[TextProvider] Try increasing max_tokens or using a non-thinking model.`);
        throw new Error(
          'Thinking model ran out of tokens before producing output. ' +
          'Try a non-thinking model (e.g. qwen2.5) or increase the LLAMACPP_BASE_URL server context size.'
        );
      }
    }

    if (!content) {
      content = "[]";
      console.log(`[TextProvider] Content empty, using empty array`);
    }

    let cleanContent = content.trim();

    console.log(`[TextProvider] Raw content length: ${content.length}`);
    console.log(`[TextProvider] Raw content (first 500 chars): ${content.substring(0, 500)}`);

    // Step 0: Strip reasoning model artifacts (deepseek-r1 <think> blocks, etc.)
    cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // Also handle unclosed <think> tags (model may not finish the thinking block)
    cleanContent = cleanContent.replace(/<think>[\s\S]*/gi, '').trim();

    // Step 1: Extract JSON substring from any surrounding text/markdown
    const firstBracket = cleanContent.indexOf('[');
    const firstBrace = cleanContent.indexOf('{');

    // Start from whichever delimiter comes first
    let jsonStart = -1;
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket <= firstBrace)) {
      jsonStart = firstBracket;
    } else if (firstBrace !== -1) {
      jsonStart = firstBrace;
    }

    if (jsonStart > 0) {
      cleanContent = cleanContent.substring(jsonStart);
    }

    // Step 2: Try to parse directly; if that fails, repair truncated JSON
    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch {
      console.log("[TextProvider] Direct parse failed, attempting JSON repair...");

      // Find the last complete object by locating the last '}' that is followed
      // by valid JSON array continuation (comma or closing bracket)
      const lastBrace = cleanContent.lastIndexOf('}');
      if (lastBrace !== -1) {
        // Truncate at the last complete object and close the array
        let repaired = cleanContent.substring(0, lastBrace + 1);
        
        // Remove any trailing comma
        repaired = repaired.replace(/,\s*$/, '');
        
        // Ensure it's wrapped in an array
        if (!repaired.startsWith('[')) {
          repaired = '[' + repaired;
        }
        repaired += ']';

        try {
          parsed = JSON.parse(repaired);
          console.log(`[TextProvider] JSON repair successful`);
        } catch (err2: any) {
          console.log("[TextProvider] Repair failed, trying per-object regex extraction...");
          // Last resort: extract individual JSON objects with regex
          parsed = extractIndividualObjects(cleanContent);
          if (parsed.length === 0) {
            console.error("[TextProvider] All parse methods failed");
            throw new Error(`Failed to parse AI response as JSON. ${err2.message}`);
          }
          console.log(`[TextProvider] Regex extraction found ${parsed.length} objects`);
        }
      } else {
        throw new Error("No valid JSON objects found in AI response");
      }
    }

    console.log(`[TextProvider] Parsed type: ${Array.isArray(parsed) ? 'array' : typeof parsed}, isArray: ${Array.isArray(parsed)}`);

    // Step 3: Extract items array from various response shapes
    let rawItems: any[] = [];
    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if (parsed && typeof parsed === 'object') {
      console.log(`[TextProvider] Object keys: ${Object.keys(parsed).join(', ')}`);
      // Look for any array value that contains objects
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val) && val.length > 0) {
          rawItems = val;
          break;
        }
      }
    }

    // Step 4: Unwrap tuple format — some models return ["term", {object}] instead of {object}
    const items: any[] = rawItems.map((item: any) => {
      if (Array.isArray(item) && item.length >= 2 && typeof item[1] === 'object') {
        return item[1]; // Extract the object from the tuple
      }
      if (Array.isArray(item) && item.length === 1 && typeof item[0] === 'object') {
        return item[0];
      }
      return item;
    }).filter((item: any) => typeof item === 'object' && item !== null);

    console.log(`[TextProvider] Items found: ${items.length}`);
    if (items.length > 0) {
      console.log(`[TextProvider] First item keys: ${Object.keys(items[0]).join(', ')}`);
      console.log(`[TextProvider] First item:`, JSON.stringify(items[0]).substring(0, 300));
    }

    // Sanitize and guarantee structure to prevent React crashes
    const sanitized: ExtractedItem[] = items
      .filter((item: any) => typeof item === 'object' && item !== null && item.term)
      .map((item: any) => ({
        term: String(item.term || ""),
        type: String(item.type || "word"),
        meaning_en: String(item.meaning_en || ""),
        meaning_zh: String(item.meaning_zh || ""),
        phonetic: String(item.phonetic || ""),
        part_of_speech: String(item.part_of_speech || ""),
        usage_scenarios_en: String(item.usage_scenarios_en || ""),
        usage_scenarios_zh: String(item.usage_scenarios_zh || ""),
        examples_en: String(item.examples_en || ""),
        examples_zh: String(item.examples_zh || ""),
        synonyms: String(item.synonyms || ""),
        frequency: String(item.frequency || "Medium"),
        level: String(item.level || "B1"),
      }));

    console.log(`[TextProvider] Sanitized items: ${sanitized.length}`);

    return sanitized;
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
  llamacppBaseUrl?: string;
  llamacppModel?: string;
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

    case "llamacpp":
      return new OpenAICompatibleTextProvider(
        "llamacpp",
        config.llamacppBaseUrl || "http://localhost:8080",
        config.llamacppModel || "default",
        "", // llama.cpp doesn't need an API key
      );

    default:
      throw new Error(`Unknown text provider: ${config.provider}`);
  }
}
