export type Subtitle = {
  id: number;
  filename: string;
  created_at: string;
};

export type ExtractedItem = {
  id: number;
  subtitle_id: number;
  type: string;
  term: string;
  meaning_en: string;
  meaning_zh: string;
  phonetic: string;
  part_of_speech: string;
  usage_scenarios_en: string;
  usage_scenarios_zh: string;
  examples_en: string;
  examples_zh: string;
  synonyms: string;
  frequency: string;
  level: string;
};

export type ProviderConfig = {
  textProvider: string;
  ttsProvider: string;
  geminiTextModel: string;
  geminiThinkingLevel: string;
  geminiMaxOutputTokens: number;
  geminiTtsModel: string;
  openaiTextModel: string;
  openaiBaseUrl: string;
  openaiTtsModel: string;
  openaiTtsVoice: string;
  ollamaBaseUrl: string;
  ollamaTextModel: string;
  llamacppBaseUrl: string;
  llamacppTextModel: string;
  piperBinaryPath: string;
  piperModelPath: string;
  hasGeminiKey: boolean;
  hasOpenaiKey: boolean;
};

export * from './listening';
