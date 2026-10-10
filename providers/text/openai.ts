import { NewExtractedItem } from '../../db/interface.js';
import { TextProvider } from './interface.js';

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

const ANALYSIS_PROMPT = (rawText: string) => `
Analyze the following movie subtitle text and extract ALL English words, idioms, collocations, slangs, and grammar points that a learner might want to study.

... (Prompt content from original)

You MUST respond with a JSON array. Each element is an object with these keys:
"term", "type", "meaning_en", "meaning_zh", "phonetic", "part_of_speech",
"usage_scenarios_en", "usage_scenarios_zh", "examples_en", "examples_zh",
"synonyms", "frequency", "level"

Text: ${rawText}
`;

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

  async analyze(rawText: string): Promise<NewExtractedItem[]> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

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

    if (isLocalProvider) {
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
    let content = data.choices?.[0]?.message?.content ?? "";

    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    content = content.replace(/<think>[\s\S]*/gi, '').trim();

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

    let parsed;
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
        throw new Error("No valid JSON objects found in AI response");
      }
    }

    let rawItems: unknown[] = [];
    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if (parsed && typeof parsed === 'object') {
      for (const val of Object.values(parsed)) {
        if (Array.isArray(val) && val.length > 0) {
          rawItems = val;
          break;
        }
      }
    }

    const items: Record<string, unknown>[] = rawItems.map((item: unknown) => {
      if (Array.isArray(item) && item.length >= 2 && typeof item[1] === 'object' && item[1] !== null) return item[1] as Record<string, unknown>;
      if (Array.isArray(item) && item.length === 1 && typeof item[0] === 'object' && item[0] !== null) return item[0] as Record<string, unknown>;
      if (typeof item === 'object' && item !== null) return item as Record<string, unknown>;
      return null;
    }).filter((item): item is Record<string, unknown> => item !== null);

    return items
      .filter((item) => typeof item['term'] === 'string' && item['term'].trim().length > 0)
      .map((item) => ({
        term: String(item['term'] || ""),
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
        frequency: String(item['frequency'] || "Medium"),
        level: String(item['level'] || "B1"),
      }));
  }
}
